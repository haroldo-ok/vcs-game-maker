//go:build !js

// Runs a ROM natively with an AtariVox in the right port and reports what the program sent it: the bytes the SpeakJet chip received
// (the bytes of a phrase, see src/utils/speakjet.js) and how many audio samples the chip made. Used to check the Speech blocks' code:
//
//	go run -mod=vendor ./atarivox-test speech.bin [frames]
package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/jetsetilly/gopher2600/cartridgeloader"
	"github.com/jetsetilly/gopher2600/environment"
	"github.com/jetsetilly/gopher2600/hardware"
	"github.com/jetsetilly/gopher2600/hardware/peripherals/atarivox"
	"github.com/jetsetilly/gopher2600/hardware/preferences"
	"github.com/jetsetilly/gopher2600/hardware/riot/ports/plugging"
	"github.com/jetsetilly/gopher2600/hardware/television"
	"github.com/jetsetilly/gopher2600/hardware/television/frameinfo"
	"github.com/jetsetilly/gopher2600/hardware/television/signal"
	"github.com/jetsetilly/gopher2600/hardware/television/specification"
)

type renderer struct{ frameDone bool }

func (r *renderer) NewFrame(fi frameinfo.Current) error { r.frameDone = true; return nil }
func (r *renderer) NewScanline(_ int) error             { return nil }
func (r *renderer) SetPixels(sig []signal.SignalAttributes, last int) error {
	return nil
}
func (r *renderer) Reset()              {}
func (r *renderer) EndRendering() error { return nil }

type mixer struct {
	auxSamples, auxNonZero int
}

func (m *mixer) SetSpec(spec specification.Spec)                    {}
func (m *mixer) SetAudio(sig []signal.AudioSignalAttributes) error { return nil }
func (m *mixer) EndMixing() error                                  { return nil }
func (m *mixer) Reset()                                            {}
func (m *mixer) OpenAuxAudio(sampleRate int, bufferLen int) error  { return nil }
func (m *mixer) CloseAuxAudio() error                              { return nil }
func (m *mixer) SetAuxAudio(samples []float32, rate int) error {
	m.auxSamples += len(samples)
	for _, s := range samples {
		if s > 0.001 || s < -0.001 {
			m.auxNonZero++
		}
	}
	return nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: atarivox-test <rom> [frames]")
		os.Exit(2)
	}
	frames := 900
	if len(os.Args) > 2 {
		frames, _ = strconv.Atoi(os.Args[2])
	}
	rom, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	tv, err := television.NewTelevision("NTSC")
	if err != nil {
		panic(err)
	}
	tv.SetFPSLimit(false)
	prefs, err := preferences.NewPreferences()
	if err != nil {
		panic(err)
	}
	vcs, err := hardware.NewVCS(environment.MainEmulation, tv, nil, prefs)
	if err != nil {
		panic(err)
	}
	rd := &renderer{}
	tv.AddPixelRenderer(rd)
	mx := &mixer{}
	tv.SetRealTimeAudioMixer(mx)
	loader, err := cartridgeloader.NewLoaderFromData("rom", rom, "AUTO", "AUTO", nil, tv)
	if err != nil {
		panic(err)
	}
	if err := vcs.AttachCartridge(loader, nil); err != nil {
		panic(err)
	}
	// (attaching a cartridge puts the default controllers back, so the AtariVox is plugged in after it)
	if err := vcs.RIOT.Ports.Plug(plugging.PortRight, atarivox.NewAtariVox); err != nil {
		panic(err)
	}
	for f := 0; f < frames; f++ {
		rd.frameDone = false
		for !rd.frameDone && !vcs.CPU.Jammed {
			vcs.Step(nil)
		}
		if f%100 == 99 {
			fmt.Printf("frame %d: sent %v memory %v aux samples %d (non zero %d)\n", f+1, stream(vcs), memory(vcs), mx.auxSamples, mx.auxNonZero)
		}
	}
}

func memory(vcs *hardware.VCS) []uint8 {
	if p, ok := vcs.RIOT.Ports.RightPlayer.(*atarivox.AtariVox); ok && p.SaveKey != nil && p.SaveKey.EEPROM != nil {
		return append([]uint8(nil), p.SaveKey.EEPROM.Data[:8]...)
	}
	return nil
}

func stream(vcs *hardware.VCS) []uint8 {
	if p, ok := vcs.RIOT.Ports.RightPlayer.(*atarivox.AtariVox); ok {
		return append([]uint8(nil), p.SpeakJetStream...)
	}
	return nil
}
