//go:build !js

// Regenerates ../default.pgo, the CPU profile Go uses for profile-guided optimization of the WASM
// build (see ../README.md). Runs the same frame loop as ../main.go - step a frame, convert it to
// RGBA, mix the audio - natively, for each ROM given, under pprof:
//
//	go run -mod=vendor ./pgo-profile default.pgo some-game.bin another-game.bin
package main

import (
	"encoding/binary"
	"fmt"
	"image/color"
	"hash/fnv"
	"image"
	"os"
	"runtime/pprof"
	"time"

	"github.com/jetsetilly/gopher2600/cartridgeloader"
	"github.com/jetsetilly/gopher2600/environment"
	"github.com/jetsetilly/gopher2600/hardware"
	"github.com/jetsetilly/gopher2600/hardware/preferences"
	"github.com/jetsetilly/gopher2600/hardware/riot/ports"
	"github.com/jetsetilly/gopher2600/hardware/riot/ports/plugging"
	"github.com/jetsetilly/gopher2600/hardware/television"
	"github.com/jetsetilly/gopher2600/hardware/television/frameinfo"
	"github.com/jetsetilly/gopher2600/hardware/television/signal"
	"github.com/jetsetilly/gopher2600/hardware/television/specification"
	"github.com/jetsetilly/gopher2600/hardware/tia/audio/mix"
)

const framesPerRom = 2500

var renderTotal time.Duration
var skipped, drawn int

type renderer struct {
	fi        frameinfo.Current
	sig, prev []signal.SignalAttributes
	rgba      []byte
	crop      image.Rectangle
	frameDone bool

	lut      [256]uint32
	lutID    string
	lutValid bool
}

func (c *renderer) NewFrame(fi frameinfo.Current) error {
	c.fi = fi
	c.prev = c.sig
	c.frameDone = true
	return nil
}
func (c *renderer) NewScanline(_ int) error { return nil }
func (c *renderer) SetPixels(sig []signal.SignalAttributes, last int) error {
	c.sig = sig[:last]
	return nil
}
func (c *renderer) Reset()              {}
func (c *renderer) EndRendering() error { return nil }

func (c *renderer) render() {
	sig := c.sig
	if len(sig) <= specification.ClksScanline {
		sig = c.prev
	}
	if sig == nil || c.fi.Spec.ID == "" {
		skipped++
		return
	}
	drawn++
	crop := c.fi.Crop()
	if crop != c.crop {
		c.crop = crop
		c.rgba = make([]byte, crop.Dx()*crop.Dy()*4)
	}
	// Colors come from a 256-entry table built once per TV standard. SECAM colors depend on
	// the line above (see Spec.GetColorScreen), so it keeps the per-pixel call.
	if spec := c.fi.Spec; spec.ID != c.lutID {
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
					col = c.fi.Spec.GetColor(signal.ZeroBlack)
				} else {
					col = c.fi.Spec.GetColorScreen(sig, i, specification.ClksScanline)
				}
				px = uint32(col.R) | uint32(col.G)<<8 | uint32(col.B)<<16 | 0xff000000
			}
			off := rowOff + (x-crop.Min.X)*4
			binary.LittleEndian.PutUint32(c.rgba[off:], px)
		}
	}
}

type mixer struct{ buf []int16 }

func (m *mixer) SetSpec(spec specification.Spec) {}
func (m *mixer) SetAudio(sig []signal.AudioSignalAttributes) error {
	for _, s := range sig {
		m.buf = append(m.buf, mix.Mono(s.AudioChannel0, s.AudioChannel1))
	}
	return nil
}
func (m *mixer) EndMixing() error { return nil }
func (m *mixer) Reset()           { m.buf = m.buf[:0] }

func run(path string) (time.Duration, error) {
	romData, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	tv, err := television.NewTelevision("NTSC")
	if err != nil {
		return 0, err
	}
	tv.SetFPSLimit(false)
	prefs, err := preferences.NewPreferences()
	if err != nil {
		return 0, err
	}
	vcs, err := hardware.NewVCS(environment.MainEmulation, tv, nil, prefs)
	if err != nil {
		return 0, err
	}
	rd := &renderer{}
	tv.AddPixelRenderer(rd)
	mx := &mixer{}
	tv.SetRealTimeAudioMixer(mx)
	loader, err := cartridgeloader.NewLoaderFromData("rom", romData, "AUTO", "AUTO", nil, tv)
	if err != nil {
		return 0, err
	}
	if err := vcs.AttachCartridge(loader, nil); err != nil {
		return 0, err
	}
	// Plays the game: presses fire early to start it, then holds a random direction and taps
	// fire now and then, so the profile covers gameplay and not just a title screen.
	seed := uint32(12345)
	random := func() uint32 {
		seed = seed*1664525 + 1013904223
		return seed >> 16
	}
	press := func(ev ports.Event, data ports.EventData) {
		vcs.Input.HandleInputEvent(ports.InputEvent{Port: plugging.PortLeft, Ev: ev, D: data})
	}
	held := ports.Event("")
	hasher := fnv.New64a()
	start := time.Now()
	for f := 0; f < framesPerRom; f++ {
		switch {
		case f == 90 || f == 200:
			press(ports.Fire, true)
		case f == 96 || f == 206:
			press(ports.Fire, false)
		case f > 300 && f%25 == 0:
			if held != "" {
				press(held, ports.DataStickFalse)
				held = ""
			}
			switch random() % 4 {
			case 0:
				held = ports.Left
			case 1:
				held = ports.Right
			case 2:
				press(ports.Fire, true)
			case 3:
				press(ports.Fire, false)
			}
			if held != "" {
				press(held, ports.DataStickTrue)
			}
		}
		rd.frameDone = false
		for !rd.frameDone && !vcs.CPU.Jammed {
			vcs.Step(nil)
		}
		t0 := time.Now()
		rd.render()
		renderTotal += time.Since(t0)
		hasher.Write(rd.rgba)
		for _, v := range mx.buf {
			hasher.Write([]byte{byte(v), byte(v >> 8)})
		}
		mx.buf = mx.buf[:0]
	}
	fmt.Printf("frame hash %x\n", hasher.Sum64())
	return time.Since(start) / framesPerRom, nil
}

func main() {
	if len(os.Args) < 3 {
		fmt.Println("usage: pgo-profile <output profile> <rom> [<rom>...]")
		os.Exit(2)
	}
	out, err := os.Create(os.Args[1])
	if err != nil {
		panic(err)
	}
	if err := pprof.StartCPUProfile(out); err != nil {
		panic(err)
	}
	for _, path := range os.Args[2:] {
		perFrame, err := run(path)
		fmt.Println(path, perFrame, "render/frame", renderTotal/framesPerRom, err)
		fmt.Println("drawn", drawn, "skipped", skipped)
		renderTotal = 0
	}
	pprof.StopCPUProfile()
	out.Close()
}
