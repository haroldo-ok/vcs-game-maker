//go:build js && wasm

// The SpeakJet speech chip (the AtariVox's synthesizer) as a small WebAssembly module, for the 6502.ts emulator, which has no
// AtariVox: the 6502.ts worker (tools/stellerator/atarivox.js) decodes the serial line, writes the commands here and plays what Render makes.
// It is the same synthesizer the gopher2600 build uses (the vendored speakjet module), so the speech sounds the same in both.
//
// Build: GOOS=js GOARCH=wasm go build -mod=vendor -ldflags="-s -w" -o ../../public/js/speakjet.wasm ./speakjet-wasm
package main

import (
	"syscall/js"
	"unsafe"

	"github.com/jetsetilly/speakjet"
)

// the volume gain, as in gopher2600's SpeakJet engine
const gain = 1.8

func main() {
	chip := speakjet.NewSpeakJet()
	chip.Gain = gain

	api := js.Global().Get("Object").New()

	// write(code, data) -> bool: a command into the chip's input buffer (false: the buffer was full and it was lost)
	api.Set("write", js.FuncOf(func(this js.Value, args []js.Value) any {
		return chip.Write(uint8(args[0].Int()), uint8(args[1].Int()))
	}))

	// bufferHalfFull() -> bool: the chip's Buffer Half Full status line
	api.Set("bufferHalfFull", js.FuncOf(func(this js.Value, args []js.Value) any {
		return chip.BufferHalfFull()
	}))

	// speaking() -> bool
	api.Set("speaking", js.FuncOf(func(this js.Value, args []js.Value) any {
		return chip.Speaking()
	}))

	api.Set("reset", js.FuncOf(func(this js.Value, args []js.Value) any {
		chip.Reset()
		return nil
	}))

	// render(count) -> Uint8Array of count float32 samples (8192 a second, -1 to 1), as bytes
	api.Set("render", js.FuncOf(func(this js.Value, args []js.Value) any {
		count := args[0].Int()
		buf := make([]float32, count)
		chip.Render(buf)
		out := js.Global().Get("Uint8Array").New(count * 4)
		if count > 0 {
			js.CopyBytesToJS(out, unsafe.Slice((*byte)(unsafe.Pointer(&buf[0])), count*4))
		}
		return out
	}))

	js.Global().Set("speakjetChip", api)
	select {}
}
