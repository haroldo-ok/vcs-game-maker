// palgen prints the palette gopher2600 draws for a solid color (one "rrggbb"
// per color index 0..127), for src/utils/palette.js's PAL_COLORS and
// EMULATOR_NTSC_COLORS - run natively, not as WASM:
//
//	go run -mod=vendor ./palgen PAL60
//	go run -mod=vendor ./palgen NTSC
package main

import (
	"fmt"
	"os"

	"github.com/jetsetilly/gopher2600/hardware/television"
	"github.com/jetsetilly/gopher2600/hardware/television/signal"
	"github.com/jetsetilly/gopher2600/hardware/television/specification"
)

func main() {
	id := "PAL60"
	if len(os.Args) > 1 {
		id = os.Args[1]
	}
	// Creating the television sets up the colour generator the way the app does.
	if _, err := television.NewTelevision(id); err != nil {
		panic(err)
	}
	spec := specification.SpecNTSC
	if id == "PAL60" {
		spec = specification.SpecPAL60
	}
	stride := specification.ClksScanline
	sig := make([]signal.SignalAttributes, stride*4)
	for i := 0; i < 128; i++ {
		for k := range sig {
			sig[k].Color = signal.ColorSignal(i << 1)
		}
		c := spec.GetColorScreen(sig, stride*2+5, stride)
		fmt.Printf("%02x%02x%02x\n", c.R, c.G, c.B)
	}
}
