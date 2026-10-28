// Package speakjet is a clean room emulation of the SpeakJet speech and sound
// synthesizer used in the AtariVox.
//
// It is written from the SpeakJet User's Manual (Magnevation, revision 1.1,
// 2004) and from general phonetics. No other SpeakJet implementation was
// consulted.
//
// The manual documents the chip's synthesizer but not the MSA "sound
// component database" that drives it, so the package is in two parts:
//
// Synthesizer (synth.go). Follows the manual's description of the 5-channel
// synthesizer: oscillators 1 to 3 (0 to 3999Hz, volume 0 to 31) summed in a
// mixer limited to 63; oscillators 4 and 5 with a shared distortion control
// that spreads white noise around their frequency; a sixth oscillator that
// envelopes the others (saw, sine, triangle or square); a master volume of 0
// to 127; output at 8192 samples per second through a 2-pole low pass filter.
// Choices not in the manual: oscillators 1 to 3 are sines whose phase restarts
// at each envelope period (so they ring like formants excited by a glottal
// pulse), and distortion is applied as random frequency modulation.
//
// MSA (msa.go, tables.go). The allophone, control and sound effect behaviour.
// Durations, control ranges and defaults, pause behaviour, the 64 byte buffer
// and the Buffer Half Full status are from the manual. The oscillator settings
// for each allophone are derived from published formant measurements of
// English speech, not from the chip. The sound effects other than DTMF are
// not described by the manual beyond their names and lengths, and are
// approximations.
package speakjet
