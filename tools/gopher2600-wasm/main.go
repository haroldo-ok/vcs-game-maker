// Command gopher2600-wasm embeds github.com/jetsetilly/gopher2600's emulation
// core (hardware/cartridgeloader/coprocessor - real DPC+/CDF ARM-coprocessor
// support included, no cgo anywhere in that path) as a WebAssembly module,
// exposing a small window.gopher2600 JS API: load a ROM, run it, read back
// video/audio, and drive front-panel switches + joystick input. This is the
// app's preview emulator, replacing Javatari (which has no DPC+ support at
// all).
package main

import (
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"runtime"
	"runtime/debug"
	"syscall/js"
	"unsafe"

	"github.com/jetsetilly/gopher2600/cartridgeloader"
	"github.com/jetsetilly/gopher2600/environment"
	"github.com/jetsetilly/gopher2600/hardware"
	"github.com/jetsetilly/gopher2600/hardware/peripherals/controllers"
	"github.com/jetsetilly/gopher2600/hardware/preferences"
	"github.com/jetsetilly/gopher2600/hardware/riot/ports"
	"github.com/jetsetilly/gopher2600/hardware/riot/ports/plugging"
	"github.com/jetsetilly/gopher2600/hardware/television"
	"github.com/jetsetilly/gopher2600/hardware/television/frameinfo"
	"github.com/jetsetilly/gopher2600/hardware/television/signal"
	"github.com/jetsetilly/gopher2600/hardware/television/specification"
	"github.com/jetsetilly/gopher2600/hardware/tia/audio"
	"github.com/jetsetilly/gopher2600/hardware/tia/audio/mix"
)

// canvasRenderer implements television.PixelRenderer, converting each
// finished frame to an RGBA byte buffer cropped to the actual visible
// picture (frameinfo.Current.Crop()), ready for canvas putImageData().
type canvasRenderer struct {
	frameInfo  frameinfo.Current
	sig        []signal.SignalAttributes
	prevSig    []signal.SignalAttributes
	crop       image.Rectangle
	rgba       []byte
	frameDone  bool

	// color table for the current TV standard, see render()
	lut      [256]uint32
	lutID    string
	lutValid bool
}

func (c *canvasRenderer) NewFrame(fi frameinfo.Current) error {
	c.frameInfo = fi
	c.prevSig = c.sig
	c.frameDone = true
	return nil
}

func (c *canvasRenderer) NewScanline(_ int) error { return nil }

func (c *canvasRenderer) SetPixels(sig []signal.SignalAttributes, last int) error {
	c.sig = sig[:last]
	return nil
}

func (c *canvasRenderer) Reset()              {}
func (c *canvasRenderer) EndRendering() error { return nil }

func (c *canvasRenderer) render() bool {
	sig := c.sig
	if len(sig) <= specification.ClksScanline {
		sig = c.prevSig
	}
	if sig == nil || c.frameInfo.Spec.ID == "" {
		return false
	}

	crop := c.frameInfo.Crop()
	if crop.Dx() <= 0 || crop.Dy() <= 0 {
		return false
	}
	if crop != c.crop {
		c.crop = crop
		c.rgba = make([]byte, crop.Dx()*crop.Dy()*4)
	}

	// Colors come from a 256-entry table built once per TV standard. SECAM colors depend on
	// the line above (see Spec.GetColorScreen), so it keeps the per-pixel call.
	if spec := c.frameInfo.Spec; spec.ID != c.lutID {
		c.lutID = spec.ID
		c.lutValid = spec.ID != "SECAM"
		if c.lutValid {
			for i := range c.lut {
				col := spec.GetColor(signal.ColorSignal(i))
				c.lut[i] = uint32(col.R) | uint32(col.G)<<8 | uint32(col.B)<<16 | 0xff000000
			}
		}
	}

	width := crop.Dx()
	black := c.lut[signal.ZeroBlack]
	for y := crop.Min.Y; y < crop.Max.Y; y++ {
		rowOff := (y - crop.Min.Y) * width * 4
		for x := crop.Min.X; x < crop.Max.X; x++ {
			i := y*specification.ClksScanline + x
			if i < 0 || i >= len(sig) {
				continue
			}

			var px uint32
			if c.lutValid {
				if sig[i].VBlank || sig[i].Index == signal.NoSignal {
					px = black
				} else {
					px = c.lut[sig[i].Color]
				}
			} else {
				var col color.RGBA
				if sig[i].VBlank || sig[i].Index == signal.NoSignal {
					col = c.frameInfo.Spec.GetColor(signal.ZeroBlack)
				} else {
					col = c.frameInfo.Spec.GetColorScreen(sig, i, specification.ClksScanline)
				}
				px = uint32(col.R) | uint32(col.G)<<8 | uint32(col.B)<<16 | 0xff000000
			}

			// Defensive bounds check, kept from before: an out-of-range slice write here
			// would be a fatal WASM trap rather than a recoverable Go panic.
			off := rowOff + (x-crop.Min.X)*4
			if off < 0 || off+3 >= len(c.rgba) {
				continue
			}
			binary.LittleEndian.PutUint32(c.rgba[off:], px)
		}
	}
	return true
}

// webAudioMixer implements television.RealtimeAudioMixer, buffering mono
// int16 samples (the same conversion the desktop sdlaudio/wavwriter mixers
// use) for the render loop to drain and hand to the browser's Web Audio API.
type webAudioMixer struct {
	freq int
	buf  []int16
}

func (m *webAudioMixer) SetSpec(spec specification.Spec) {
	m.freq = int(spec.HorizontalScanRate) * audio.SamplesPerScanline
}

func (m *webAudioMixer) SetAudio(sig []signal.AudioSignalAttributes) error {
	for _, s := range sig {
		m.buf = append(m.buf, mix.Mono(s.AudioChannel0, s.AudioChannel1))
	}
	return nil
}

func (m *webAudioMixer) EndMixing() error { return nil }
func (m *webAudioMixer) Reset()           { m.buf = m.buf[:0] }

func (m *webAudioMixer) drain() []int16 {
	out := m.buf
	m.buf = nil
	return out
}

// console owns one running (or powered-off) VCS instance and everything the
// JS API needs to drive it. powerOn recreates the VCS from scratch (real
// cold-boot semantics), so it - not a constructor - is where setup lives.
type console struct {
	tv       *television.Television
	prefs    *preferences.Preferences
	vcs      *hardware.VCS
	renderer *canvasRenderer
	mixer    *webAudioMixer

	lastRom     []byte
	tvSpec      string // "NTSC" | "PAL" | "PAL60" - see powerOn
	poweredOn   bool
	romAttached bool
	jamReported bool

	// audioBuf is reused every frame for the float32 conversion handed to JS.
	audioBuf []float32

	// frameCount paces the periodic runtime.GC() call in onAnimationFrame -
	// see that call's comment for why.
	frameCount uint64

	// keyMapping is the user-configurable keyboard->controller bindings (see
	// setKeyMapping below, called from App.vue whenever the Input Mapping
	// settings UI changes, and once after every powerOn since a fresh VCS
	// starts with no bindings at all). A slice, not a map keyed by code:
	// the same physical key can legitimately appear in both a "joystick"
	// and a "keypad" binding for the same port (e.g. default keypad keys
	// reuse the WASD block that's also Player 2's default joystick), since
	// a port is only ever ACTUALLY one or the other at a time (see
	// keypadModeByPort below) - keying by code alone would make the second
	// registration silently overwrite the first.
	keyMapping []keyBinding

	// keypadModeByPort tracks which ports currently have a Keypad
	// peripheral plugged in (set by setKeypadMode), so a keydown/keyup can
	// tell which of a key's possibly-multiple bindings (see keyMapping
	// above) is actually the live one for that port right now.
	keypadModeByPort map[plugging.PortID]bool
}

// keyBinding is one entry of console.keyMapping: JS KeyboardEvent.code ->
// which port/kind of control it drives. For Kind == "joystick", Control is
// one of "up"/"down"/"left"/"right"/"fire". For Kind == "keypad", Control
// is the single keypad rune ("1".."9", "*", "0", "#") controllers.Keypad's
// own HandleEvent expects (see that file's switch).
type keyBinding struct {
	Code    string
	Port    plugging.PortID
	Kind    string
	Control string
}

// defaultCropWidth/Height are the picture size a compiled game normally
// renders at (160x220 for the bB kernel), used while no ROM is running -
// before the first ROM loads and after clearRom - and until a real frame
// renders and sets the canvas's true size from frameinfo.Current.Crop(). A
// shorter size such as 192 rows showed the idle screen visibly wider than a
// running game. Without this, the
// canvas sits at the browser's default <canvas> size (300x150) - neither the
// right resolution nor the right aspect ratio - for the entire span between
// page load and the first ROM's first rendered frame.
const (
	defaultCropWidth  = 160
	defaultCropHeight = 220
)

func newConsole() *console {
	c := &console{keypadModeByPort: map[plugging.PortID]bool{}}
	c.resetCanvasSize()
	return c
}

// resetCanvasSize tells the page to put its canvas back at the idle size and
// blank it (this program runs in a web worker, with no canvas - see
// public/js/gopher2600-worker.js). The next rendered frame resizes it again.
func (c *console) resetCanvasSize() {
	js.Global().Call("g2kBlank", defaultCropWidth, defaultCropHeight)
}

// stepFrame runs one emulated video frame. The page's frame loop (see
// public/index.html) decides how many to run per display refresh so the
// console always runs at 60 frames per second, whatever the monitor's refresh
// rate; emit is false for a frame that is about to be replaced by a later one
// in the same refresh, so its picture is not built or sent. Audio is always
// sent, so no sound is lost.
func (c *console) stepFrame(emit bool) (result any) {
	defer func() {
		if r := recover(); r != nil {
			js.Global().Get("console").Call("error", fmt.Sprintf("PANIC in render loop: %v\n%s", r, debug.Stack()))
			result = nil
		}
	}()

	if !c.poweredOn || c.vcs == nil || !c.romAttached {
		return nil
	}

	// Forces a GC sweep roughly every 10 seconds (600 frames at 60fps),
	// rather than only whenever Go's runtime decides its own default
	// heuristics warrant one. This render loop runs continuously for as
	// long as the tab is open, allocating a fresh RGBA/audio buffer, JS
	// interop values, etc. every single frame - a real reported crash
	// ("memory access out of bounds" inside this exact function, only
	// after the emulator sat idle for a while with no interaction, so not
	// tied to any specific ROM behavior) is consistent with the WASM
	// linear memory growing to its ceiling from heap growth/fragmentation
	// outpacing collection, which a raw memory trap (not a recoverable Go
	// panic) can follow once a grow attempt the runtime assumed would
	// succeed doesn't. A periodic explicit sweep keeps live heap size
	// bounded instead of trusting Go's default GC pacing alone to keep up
	// with this loop's steady, continuous allocation rate.
	c.frameCount++
	if c.frameCount%600 == 0 {
		runtime.GC()
	}

	if c.vcs.CPU.Jammed {
		// A jammed CPU (a real, correctly-emulated 6507 "JAM"/illegal-opcode
		// hardware halt - see instructions.JAM) never recovers on its own;
		// without this check, Step() keeps "succeeding" every call without
		// ever advancing, silently spinning at the same PC forever while the
		// TIA/RIOT keep ticking on their own clock and still produce real
		// frame-complete signals - so the loop below would never surface an
		// error, just render whatever was on screen at the moment of the
		// jam, forever. Matches the real desktop frontend's Jammed check
		// in hardware/run.go ("emulation will run forever if we don't check
		// for this"). Reported once, not every frame.
		if !c.jamReported {
			c.jamReported = true
			js.Global().Get("console").Call("error", fmt.Sprintf(
				"gopher2600-wasm: CPU jammed (illegal opcode) at PC=$%04x %s - the compiled ROM's code "+
					"is corrupted at this address, most likely a bad jump/bank-switch target landing in "+
					"data instead of code. This is a real hardware halt condition, not an emulator bug.",
				c.vcs.CPU.PC.Address(), c.vcs.Mem.Cart.MappedBanks()))
		}
		return nil
	}

	c.renderer.frameDone = false
	steps := 0
	for !c.renderer.frameDone && steps < 200_000 {
		if err := c.vcs.Step(nil); err != nil {
			js.Global().Get("console").Call("error", "step error: "+err.Error())
			break
		}
		if c.vcs.CPU.Jammed {
			break
		}
		steps++
	}

	if emit && c.renderer.render() {
		// The picture is copied into a fresh typed array the page can take
		// over without copying again (it is transferred to the main thread).
		// TIA color clocks are not square pixels: a real 2600's visible picture
		// is shown roughly twice as wide as its raw clock count suggests, the
		// standard "double-wide" stretch every 2600 emulator applies to land on
		// a ~4:3 TV aspect; the page sets the canvas's CSS box to that.
		pixels := js.Global().Get("Uint8Array").New(len(c.renderer.rgba))
		js.CopyBytesToJS(pixels, c.renderer.rgba)
		js.Global().Call("g2kPostFrame", c.renderer.crop.Dx(), c.renderer.crop.Dy(), pixels)
	}

	if samples := c.mixer.drain(); len(samples) > 0 && c.mixer.freq > 0 {
		if cap(c.audioBuf) < len(samples) {
			c.audioBuf = make([]float32, len(samples))
		}
		floats := c.audioBuf[:len(samples)]
		for i, s := range samples {
			floats[i] = float32(s) / 32768.0
		}
		raw := unsafe.Slice((*byte)(unsafe.Pointer(&floats[0])), len(floats)*4)
		bytes := js.Global().Get("Uint8Array").New(len(raw))
		js.CopyBytesToJS(bytes, raw)
		js.Global().Call("g2kPostAudio", c.mixer.freq, bytes)
	}
	return nil
}

// powerOn performs a real cold boot: a fresh VCS, fresh TV, fresh
// preferences, matching real hardware powering up in an indeterminate/reset
// state rather than merely resuming whatever was running before. If a ROM
// was previously loaded it's re-attached (mirrors "cartridge stays inserted
// across a power cycle").
func (c *console) powerOn() error {
	// Pinned to ONE specific spec (c.tvSpec - set per ROM by loadRom, from the
	// project's TV standard option), never "AUTO". Every ROM this tool
	// produces is generated with a fixed "set tv" line (see
	// generators/bbasic.bb.hbs), so the app always knows exactly which spec
	// it is - there is nothing to actually detect. "AUTO" instead lets
	// gopher2600 reclassify the TV spec on the fly from observed frame
	// timing - confirmed directly as the cause of a real reported bug
	// (screen goes solid black, audio keeps playing, looks like a lockup but
	// isn't one): a single frame that runs long enough to overrun the
	// compiled ROM's kernel timing budget (the actual trigger - a heavy
	// collision check only running on the one frame a hardware collision
	// fires) is enough for the auto-detector to reclassify the signal as a
	// different, longer-scanline spec - directly observed,
	// len(sig) jumping 59735->79799 and the same sampled pixel flipping
	// VBlank=false->true between frames, meaning the crop window
	// recalculated for the new (wrong) spec lands on blank scanlines from
	// then on. Pinning removes the reclassification machinery entirely,
	// rather than just reducing how often a slow frame manages to trigger it.
	spec := c.tvSpec
	if spec == "" {
		spec = "NTSC"
	}
	tv, err := television.NewTelevision(spec)
	if err != nil {
		return err
	}
	prefs, err := preferences.NewPreferences()
	if err != nil {
		return err
	}
	vcs, err := hardware.NewVCS(environment.MainEmulation, tv, nil, prefs)
	if err != nil {
		return err
	}

	renderer := &canvasRenderer{}
	// The television's built-in frame limiter makes every frame wait for a 1/60 s
	// timer tick, which pads each frame out to a full 16.7 ms however little work it
	// took (2.6 ms natively in a profile) and burns that time on this thread. The
	// page's frame loop (see public/js/gopher2600-worker.js) does the pacing instead.
	tv.SetFPSLimit(false)
	tv.AddPixelRenderer(renderer)
	mixer := &webAudioMixer{}
	tv.SetRealTimeAudioMixer(mixer)

	c.tv = tv
	c.prefs = prefs
	c.vcs = vcs
	c.renderer = renderer
	c.mixer = mixer
	c.poweredOn = true

	if c.lastRom != nil {
		if err := c.attachRom(c.lastRom); err != nil {
			return err
		}
	}

	return nil
}

func (c *console) powerOff() {
	c.poweredOn = false
	c.vcs = nil
	c.romAttached = false
	c.resetCanvasSize()
}

// clearRom removes the loaded ROM and blanks the screen, leaving the console
// powered on with no cartridge running - the next loadRom starts it again.
func (c *console) clearRom() {
	c.lastRom = nil
	c.romAttached = false
	c.jamReported = false
	if c.mixer != nil {
		c.mixer.Reset()
	}
	c.resetCanvasSize()
}

func (c *console) attachRom(romData []byte) error {
	c.lastRom = romData
	if c.vcs == nil {
		return nil
	}
	loader, err := cartridgeloader.NewLoaderFromData("rom", romData, "AUTO", "AUTO", nil, c.tv)
	if err != nil {
		return err
	}
	if err := c.vcs.AttachCartridge(loader, nil); err != nil {
		return err
	}
	c.romAttached = true
	c.jamReported = false
	return nil
}

func portFromString(s string) plugging.PortID {
	if s == "right" {
		return plugging.PortRight
	}
	return plugging.PortLeft
}

func (c *console) setKeypadMode(port plugging.PortID, enabled bool) error {
	c.keypadModeByPort[port] = enabled
	if c.vcs == nil {
		return nil
	}
	if enabled {
		return c.vcs.RIOT.Ports.Plug(port, controllers.NewKeypad)
	}
	return c.vcs.RIOT.Ports.Plug(port, controllers.NewStick)
}

func (c *console) input(port plugging.PortID, ev ports.Event, data ports.EventData) {
	if c.vcs == nil {
		return
	}
	_, _ = c.vcs.Input.HandleInputEvent(ports.InputEvent{Port: port, Ev: ev, D: data})
}

// findKeyBinding returns the keyMapping entry (see console.keyMapping's own
// comment) for code that's actually live right now - i.e. whose Kind
// ("joystick" vs "keypad") matches whatever peripheral is currently plugged
// into its Port, per keypadModeByPort. A code can appear in the mapping
// under both kinds for the same port at once (default bindings do exactly
// that - see App.vue's DEFAULT_KEY_MAPPING); only one of them is ever live
// for a given port at a time, so this never has to pick between two equally
// "correct" matches.
func (c *console) findKeyBinding(code string) (keyBinding, bool) {
	for _, b := range c.keyMapping {
		if b.Code != code {
			continue
		}
		if (b.Kind == "keypad") != c.keypadModeByPort[b.Port] {
			continue
		}
		return b, true
	}
	return keyBinding{}, false
}

// joystickEvent maps a keyBinding's Control ("up"/"down"/"left"/"right"/
// "fire") to the ports.Event it drives.
func joystickEvent(control string) (ports.Event, bool) {
	switch control {
	case "up":
		return ports.Up, true
	case "down":
		return ports.Down, true
	case "left":
		return ports.Left, true
	case "right":
		return ports.Right, true
	case "fire":
		return ports.Fire, true
	}
	return "", false
}

// joystickEventData builds the EventData for a joystick control on press
// (down=true) or release (down=false).
//
// ports.DataStickTrue/DataStickFalse (set/clear ONE axis bit), not
// DataStickSet (set the axis AND clear every other bit on the stick) - the
// ports package's doc comment on EventDataStick is explicit about this
// distinction: DataStickSet is for D-Pad-style devices that always report
// their FULL current state every event, while a keyboard (which only ever
// reports ONE key changing at a time) needs the true/false form so pressing
// a second direction doesn't clear whatever direction is already held.
// Confirmed as a real reported bug ("quickly changing directions... the
// player doesn't move"): with DataStickSet, holding Up then also pressing
// Right REPLACED Up's bit with only Right's, silently dropping the
// still-held Up the instant a second key came down.
func joystickEventData(control string, down bool) ports.EventData {
	if control == "fire" {
		return down
	}
	if down {
		return ports.DataStickTrue
	}
	return ports.DataStickFalse
}

// safeFunc wraps a JS-invoked Go callback with panic recovery. Without this,
// an unrecovered panic in ANY js.FuncOf callback (keyboard events, the
// exposed API) fatally terminates the entire WASM instance - unlike
// onAnimationFrame's recover(), which only protects the render loop
// itself, every other callback registered below had none at all until this.
// A dead instance's JS object reference survives (window.gopher2600 is still
// truthy), but every subsequent call into it throws "Go program has already
// exited" - which, left unguarded on the JS caller's side, previously broke
// unrelated ROM builds for the rest of the page's lifetime (see
// hooks/rom.js's try/catch around gopher2600 calls for the other half of
// this fix).
func safeFunc(name string, fn func(this js.Value, args []js.Value) any) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) (result any) {
		defer func() {
			if r := recover(); r != nil {
				js.Global().Get("console").Call("error",
					fmt.Sprintf("PANIC in gopher2600-wasm %s: %v\n%s", name, r, debug.Stack()))
				result = nil
			}
		}()
		return fn(this, args)
	})
}

func main() {
	c := newConsole()
	if err := c.powerOn(); err != nil {
		js.Global().Get("console").Call("error", "gopher2600-wasm: power-on failed: "+err.Error())
		return
	}

	api := js.Global().Get("Object").New()

	// stepFrame(emit) runs one emulated frame - called by the worker's frame loop.
	api.Set("stepFrame", safeFunc("stepFrame", func(this js.Value, args []js.Value) any {
		c.stepFrame(len(args) == 0 || args[0].Truthy())
		return nil
	}))

	// keyEvent(code, down) handles a keyboard press or release forwarded by the
	// page. The page has already skipped text fields and auto-repeat (see
	// public/index.html); stick.go's HandleEvent toggles the axis bit for
	// DataStickTrue, so only real press edges may arrive here.
	api.Set("keyEvent", safeFunc("keyEvent", func(this js.Value, args []js.Value) any {
		binding, ok := c.findKeyBinding(args[0].String())
		if !ok {
			return nil
		}
		down := args[1].Bool()
		if binding.Kind == "keypad" {
			if down {
				c.input(binding.Port, ports.KeypadDown, rune(binding.Control[0]))
			} else {
				c.input(binding.Port, ports.KeypadUp, nil)
			}
		} else if ev, ok := joystickEvent(binding.Control); ok {
			c.input(binding.Port, ev, joystickEventData(binding.Control, down))
		}
		return nil
	}))

	api.Set("loadRom", safeFunc("loadRom", func(this js.Value, args []js.Value) any {
		jsBytes := args[0]
		romData := make([]byte, jsBytes.Get("length").Int())
		js.CopyBytesToGo(romData, jsBytes)
		// Optional second argument: the television spec the ROM was built
		// for ("NTSC", "PAL" or "PAL60" - the project's TV standard option).
		// A different spec than the running console's needs a fresh
		// television, so it takes a power-cycle (powerOn re-attaches
		// lastRom, set here first).
		spec := "NTSC"
		if len(args) > 1 && args[1].Type() == js.TypeString {
			spec = args[1].String()
		}
		if spec != c.tvSpec && !(c.tvSpec == "" && spec == "NTSC") {
			c.tvSpec = spec
			if c.poweredOn {
				c.lastRom = romData
				if err := c.powerOn(); err != nil {
					js.Global().Get("console").Call("error", "gopher2600-wasm: loadRom failed: "+err.Error())
				}
				return nil
			}
		}
		if err := c.attachRom(romData); err != nil {
			js.Global().Get("console").Call("error", "gopher2600-wasm: loadRom failed: "+err.Error())
		}
		return nil
	}))

	api.Set("powerOn", safeFunc("powerOn", func(this js.Value, args []js.Value) any {
		if err := c.powerOn(); err != nil {
			js.Global().Get("console").Call("error", "gopher2600-wasm: powerOn failed: "+err.Error())
		}
		return nil
	}))

	api.Set("clearRom", safeFunc("clearRom", func(this js.Value, args []js.Value) any {
		c.clearRom()
		return nil
	}))

	api.Set("powerOff", safeFunc("powerOff", func(this js.Value, args []js.Value) any {
		c.powerOff()
		return nil
	}))

	api.Set("pressReset", safeFunc("pressReset", func(this js.Value, args []js.Value) any {
		c.input(plugging.PortPanel, ports.PanelReset, true)
		return nil
	}))
	api.Set("releaseReset", safeFunc("releaseReset", func(this js.Value, args []js.Value) any {
		c.input(plugging.PortPanel, ports.PanelReset, false)
		return nil
	}))
	api.Set("pressSelect", safeFunc("pressSelect", func(this js.Value, args []js.Value) any {
		c.input(plugging.PortPanel, ports.PanelSelect, true)
		return nil
	}))
	api.Set("releaseSelect", safeFunc("releaseSelect", func(this js.Value, args []js.Value) any {
		c.input(plugging.PortPanel, ports.PanelSelect, false)
		return nil
	}))

	api.Set("setColorMode", safeFunc("setColorMode", func(this js.Value, args []js.Value) any {
		c.input(plugging.PortPanel, ports.PanelSetColor, args[0].Bool())
		return nil
	}))
	api.Set("setDifficulty", safeFunc("setDifficulty", func(this js.Value, args []js.Value) any {
		pro := args[1].Bool()
		if args[0].String() == "right" {
			c.input(plugging.PortPanel, ports.PanelSetPlayer1Pro, pro)
		} else {
			c.input(plugging.PortPanel, ports.PanelSetPlayer0Pro, pro)
		}
		return nil
	}))

	api.Set("setKeypadMode", safeFunc("setKeypadMode", func(this js.Value, args []js.Value) any {
		port := portFromString(args[0].String())
		if err := c.setKeypadMode(port, args[1].Bool()); err != nil {
			js.Global().Get("console").Call("error", "gopher2600-wasm: setKeypadMode failed: "+err.Error())
		}
		return nil
	}))

	// setKeyMapping replaces the whole keyboard->controller mapping wholesale
	// (see console.keyMapping's comment). Called from App.vue on mount
	// (a fresh VCS/newConsole starts with an empty mapping - see
	// console.keyMapping's comment) and again every time the Input
	// Mapping settings UI changes a binding. args[0] is a JS array of
	// {code, port, kind, control} objects - the single source of truth for
	// the actual default bindings lives in App.vue's own
	// DEFAULT_KEY_MAPPING, not here, so there's only one place that needs
	// updating if a default ever changes.
	api.Set("setKeyMapping", safeFunc("setKeyMapping", func(this js.Value, args []js.Value) any {
		arr := args[0]
		length := arr.Get("length").Int()
		mapping := make([]keyBinding, 0, length)
		for i := 0; i < length; i++ {
			item := arr.Index(i)
			mapping = append(mapping, keyBinding{
				Code:    item.Get("code").String(),
				Port:    portFromString(item.Get("port").String()),
				Kind:    item.Get("kind").String(),
				Control: item.Get("control").String(),
			})
		}
		c.keyMapping = mapping
		return nil
	}))

	js.Global().Set("gopher2600", api)
	js.Global().Get("console").Call("log", "gopher2600-wasm ready")
	js.Global().Call("g2kReady")

	select {} // keep the wasm program alive
}
