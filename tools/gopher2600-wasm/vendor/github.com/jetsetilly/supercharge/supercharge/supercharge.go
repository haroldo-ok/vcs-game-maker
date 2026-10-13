package supercharge

import (
	"bytes"
	"fmt"
	"io"
	"math"
	"strings"
)

// values used during the generation of the wav file. values are the same as the
// default values used by the makewav program written by Bob Colbert
const (
	startToneSeconds  = 0.1
	headerToneSeconds = 0.5
	endToneSeconds    = 0.5

	// length of a single cycle for the three tones in bytes
	startToneCycle = 51
	zeroToneCycle  = 6
	oneToneCycle   = 10

	// volume of tones
	startToneVolume = 0.98
	zeroToneVolume  = 0.98
	oneToneVolume   = 0.98

	// sample rate of the wav file
	SampleRate = 44100.0
)

// generate a sine wave of the given length
func tone(w io.Writer, length int, volume float64) {
	m := 2 * math.Pi / float64(length)
	for i := range length {
		x := m * float64(i)
		y := (math.Sin(x)*volume + 1) * 128
		w.Write([]byte{byte(y)})
	}
}

// bitPacker writes bytes such that they are represented by tones. the tones are
// written to the io.Writer specified by the w field
type bitPacker struct {
	w              io.Writer
	hz             uint32
	zeroBit        bytes.Buffer
	oneBit         bytes.Buffer
	bytesPerSecond uint32
}

func newBitPacker(hz uint32, w io.Writer) bitPacker {
	pck := bitPacker{
		w:  w,
		hz: hz,
	}

	// prepare bytes for zero and one bits
	tone(&pck.zeroBit, zeroToneCycle, zeroToneVolume)
	tone(&pck.oneBit, oneToneCycle, oneToneVolume)

	// bytes per second
	pck.bytesPerSecond = pck.hz / (zeroToneCycle + oneToneCycle) / 4

	return pck
}

func (pck bitPacker) writeByte(b byte) {
	for range 8 {
		if b&0x80 == 0x80 {
			pck.w.Write(pck.oneBit.Bytes())
		} else {
			pck.w.Write(pck.zeroBit.Bytes())
		}
		b <<= 1
	}
}

func (pck bitPacker) writeByteDuration(b byte, duration float64) {
	ct := duration * float64(pck.bytesPerSecond)
	for i := 0; i < int(ct); i++ {
		pck.writeByte(b)
	}
}

// wav implements the io.Writer interface
type wav struct {
	format   uint16
	channels uint16
	hz       uint32
	depth    uint16

	data bytes.Buffer
}

func (wav *wav) Write(p []byte) (n int, err error) {
	n = 0
	for _, b := range p {
		for c := 0; c < int(wav.channels); c++ {
			n++
			wav.data.WriteByte(b)
		}
	}
	return n, nil
}

func (wav wav) Bytes() []byte {
	var w bytes.Buffer

	// prepare format sub-chunk
	var fmtSubChunk bytes.Buffer
	fmtSubChunk.Write([]byte{byte(wav.format), byte(wav.format >> 8)})
	fmtSubChunk.Write([]byte{byte(wav.channels), byte(wav.channels >> 8)})
	fmtSubChunk.Write([]byte{byte(wav.hz), byte(wav.hz >> 8), byte(wav.hz >> 16), byte(wav.hz >> 24)})
	fmtSubChunk.Write([]byte{byte(wav.hz), byte(wav.hz >> 8), byte(wav.hz >> 16), byte(wav.hz >> 24)})
	blockAlign := wav.channels & wav.depth
	fmtSubChunk.Write([]byte{byte(blockAlign), byte(blockAlign >> 8)})
	fmtSubChunk.Write([]byte{byte(wav.depth), byte(wav.depth >> 8)})

	// prepare wave chunk using format and data sub-chunks
	var waveChunk bytes.Buffer
	waveChunk.Write([]byte("WAVE"))
	waveChunk.Write([]byte("fmt "))
	l := fmtSubChunk.Len()
	waveChunk.Write([]byte{byte(l), byte(l >> 8), byte(l >> 16), byte(l >> 24)})
	waveChunk.Write(fmtSubChunk.Bytes())
	waveChunk.Write([]byte("data"))
	l = wav.data.Len()
	waveChunk.Write([]byte{byte(l), byte(l >> 8), byte(l >> 16), byte(l >> 24)})
	waveChunk.Write(wav.data.Bytes())

	// write RIFF header followed by wave chunk size and data
	w.Write([]byte("RIFF"))
	l = waveChunk.Len()
	w.Write([]byte{byte(l), byte(l >> 8), byte(l >> 16), byte(l >> 24)})
	w.Write(waveChunk.Bytes())

	return w.Bytes()
}

func Convert(rom []byte, entry uint16, configByte uint8, progressSpeed uint16, w io.Writer) string {
	var msgs strings.Builder

	// write wav header
	wav := wav{
		format:   1,
		channels: 1,
		hz:       SampleRate,
		depth:    8,
	}

	// 1) comments in quotation marks are from the sctech.txt document
	// 2) double asterisks are used to additional commentary on the content of
	//    sctech.txt

	// "Supercharger tapes start with a lower frequency start tone, but it's
	// not used by the tape decoder"
	var start bytes.Buffer
	tone(&start, startToneCycle, startToneVolume)
	ct := startToneSeconds * SampleRate / startToneCycle
	for i := 0; i < int(ct); i++ {
		wav.Write(start.Bytes())
	}

	// everything written after the start tone is written by the bit packer. use
	// the wav instance as the io.Writer for the bit packer
	pck := newBitPacker(SampleRate, &wav)

	// "A pattern of alternating one's and zero's (byte value of $AA), with a
	// recommended minimum length of 256 bytes, allows the Supercharger to
	// determine the widths of one and zero bits
	//
	// After the $AA's, a byte of $00 follows.  This allows the Supercharger
	// to synchronize to the start of the byte stream no matter where in the
	// $AA header it started picking up bits"
	//
	// * this part of sctech.txt seems to be wrong. makewav prefers to use 0x55
	// and 0x54 for this part of the data
	pck.writeByteDuration(0x55, headerToneSeconds)
	pck.writeByte(0x54)

	// "An 8 byte header packet follows [...]
	//
	// The header indicates the starting point of execution, how many packets
	// of game data, the bank switching configuration for the game, how
	// quickly to scroll inward the blue progress bars, and a checksum"
	// Its format is:
	// - Low order byte of the address to start executing the game's startup code
	// - High order byte of same
	// - Bank configuration as noted below
	// - Block count (number of 256 byte program data packets)
	// - Checksum: computed like game data checksums.  Sum of whole header is $55.
	// - Multiload index #.  Set to 0 for first or only load of the game.
	//   Each new multiload game was assigned new numbers sequentially so that
	//   no other multiload stage from another game would be accidentally
	//   loaded
	// - (Low, high) 16 bit speed value for progress bars.  $224 is perfect
	//   for a 6K game image.  $16D is right for 4K, and $00B6 is right for 2K
	//   game images"

	addressLow := byte(entry)
	addressHigh := byte(entry >> 8)
	blockCount := byte(len(rom) / 256)
	multiload := byte(0)
	progressSpeedLow := byte(progressSpeed)
	progressSpeedHigh := byte(progressSpeed >> 8)

	// calculate checksum
	checksum := 0x55 - addressLow - addressHigh - configByte - blockCount - multiload - progressSpeedLow - progressSpeedHigh

	fmt.Fprintf(&msgs, "\taddress: %02x%02x\n", addressHigh, addressLow)
	fmt.Fprintf(&msgs, "\tbank config: %02x\n", configByte)
	fmt.Fprintf(&msgs, "\tblock count: %02x\n", blockCount)
	fmt.Fprintf(&msgs, "\tmultiload: %02x\n", multiload)
	fmt.Fprintf(&msgs, "\tload speed: %02x%02x\n", progressSpeedHigh, progressSpeedLow)
	fmt.Fprintf(&msgs, "\tchecksum: %02x\n", checksum)

	pck.writeByte(addressLow)
	pck.writeByte(addressHigh)
	pck.writeByte(configByte)
	pck.writeByte(blockCount)
	pck.writeByte(checksum)
	pck.writeByte(multiload)
	pck.writeByte(progressSpeedLow)
	pck.writeByte(progressSpeedHigh)

	// "The game data
	// -------------
	// For each 256 bytes of data in the game, a packet is written consisting
	// of a block number that encodes the address page offset * 4 plus the
	// bank number, and a checksum that encompasses all 256 bytes of data plus
	// the block number as written to tape.  The data then follows in normal
	// linear fashion, all 256 bytes being written.

	// The checksum is calculated by adding all checksummed data, ignoring
	// carries or overflows.  The value [$55 minus the sum], again ignoring
	// carries and underflows, is the checksum to write to tape.  Hence, the
	// sum of the whole data packet including the checksum byte itself will
	// be $55"
	for block := range blockCount {
		page := (block * 4) + 1
		if page > 0x1f {
			page -= 0x1f
		}

		// checksum
		checksum := byte(0x55)
		checksum -= byte(page)
		s := int(block) * 256
		for _, b := range rom[s : s+256] {
			checksum -= b
		}
		fmt.Fprintf(&msgs, "\tblock %d: checksum %02x\n", block, checksum)

		// write block number
		pck.writeByte(page)

		// write checksum
		pck.writeByte(checksum)

		// write block data
		s = int(block) * 256
		for _, b := range rom[s : s+256] {
			pck.writeByte(b)
		}
	}

	// "It's recommended you write a byte of 0's and some silence after the
	// last data packet in order to avoid glitching the audio system of your
	// tape deck and ruining the last data packet while recording"
	pck.writeByteDuration(0x00, endToneSeconds)

	// write wav bytes
	w.Write(wav.Bytes())

	return msgs.String()
}
