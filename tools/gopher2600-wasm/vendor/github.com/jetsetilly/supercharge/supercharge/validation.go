package supercharge

import (
	"errors"
	"fmt"
)

var UnsupportedSize = errors.New("unsupported size")

// Validate indicates whether the ROM data is compatible with the supercharger. It
// returns nil if the validation check passes
func Validate(rom []byte) error {
	if len(rom) != 4096 {
		return fmt.Errorf("%w (%d)", UnsupportedSize, len(rom))
	}

	return nil
}
