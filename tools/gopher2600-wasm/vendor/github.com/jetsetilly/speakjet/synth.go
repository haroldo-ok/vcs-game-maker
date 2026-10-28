package speakjet

import "math"

// SampleRate is the rate at which the synthesizer produces samples. From the
// manual: "The frequency is produced at a rate of 8192 samples per second"
const SampleRate = 8192

// limits of the synthesizer registers, from the manual
const (
	maxFrequency = 3999
	maxOscVolume = 31
	maxMixer1    = 63
	maxMaster    = 127
)

// envelope wave shapes, as selected by the first two bits of the envelope
// control register
type envelopeWave int

const (
	envSaw envelopeWave = iota
	envSine
	envTriangle
	envSquare
)

// frame is a set of synthesizer register values. the MSA sequencer moves the
// synthesizer from one frame to the next over time
type frame struct {
	// frequency and volume of oscillators 1 to 5
	freq [5]float64
	vol  [5]float64

	// distortion of oscillators 4 and 5 (0 to 255)
	distortion float64

	// frequency of the envelope oscillator. for speech this is the voicing
	// pitch
	pitch float64

	// envelope control: the wave shape, whether oscillators 1 to 3 are
	// enveloped and whether oscillators 4 and 5 are half enveloped
	wave    envelopeWave
	voiced  bool
	halfEnv bool
}

// lerp returns the frame part way between a and b. the envelope control
// settings are taken from b
func lerp(a, b frame, t float64) frame {
	r := b
	for i := range a.freq {
		r.freq[i] = a.freq[i] + (b.freq[i]-a.freq[i])*t
		r.vol[i] = a.vol[i] + (b.vol[i]-a.vol[i])*t
	}
	r.distortion = a.distortion + (b.distortion-a.distortion)*t
	r.pitch = a.pitch + (b.pitch-a.pitch)*t
	return r
}

// synth is the 5-channel synthesizer
type synth struct {
	// phase of oscillators 1 to 5 and of the envelope oscillator, in cycles
	phase    [5]float64
	envPhase float64

	// noise source for distortion (xorshift)
	noise uint32

	// 2-pole low pass output filter and dc blocker state
	x1, x2, y1, y2 float64
	dcIn, dcOut    float64
	b0, b1, b2     float64
	a1, a2         float64
}

func newSynth() *synth {
	s := &synth{noise: 0x2545f491}

	// butterworth low pass at 3400Hz, standing in for the "two pole" filter
	// the manual places after the PWM output
	const cutoff = 3400.0
	w := 2 * math.Pi * cutoff / SampleRate
	alpha := math.Sin(w) / math.Sqrt2
	cw := math.Cos(w)
	a0 := 1 + alpha
	s.b0 = (1 - cw) / 2 / a0
	s.b1 = (1 - cw) / a0
	s.b2 = (1 - cw) / 2 / a0
	s.a1 = -2 * cw / a0
	s.a2 = (1 - alpha) / a0

	return s
}

func (s *synth) random() float64 {
	s.noise ^= s.noise << 13
	s.noise ^= s.noise >> 17
	s.noise ^= s.noise << 5
	return float64(int32(s.noise)) / math.MaxInt32
}

// sample produces the next output sample, in the range -1 to 1. bend is the
// frequency multiplier from the Bend control and master is the master volume
// (0 to 127)
func (s *synth) sample(f frame, bend float64, master float64) float64 {
	// envelope oscillator
	env := 1.0
	if f.pitch > 0 {
		s.envPhase += f.pitch / SampleRate
		if s.envPhase >= 1 {
			s.envPhase -= math.Floor(s.envPhase)

			// restart the formant oscillators with each envelope period
			if f.voiced {
				s.phase[0] = 0
				s.phase[1] = 0
				s.phase[2] = 0
			}
		}
		p := s.envPhase
		switch f.wave {
		case envSaw:
			env = 1 - p
		case envSine:
			env = 0.5 + 0.5*math.Cos(2*math.Pi*p)
		case envTriangle:
			env = 1 - 2*math.Abs(p-0.5)
		case envSquare:
			if p >= 0.5 {
				env = 0
			}
		}
	} else if f.voiced {
		// a pitch of zero does not vocalise
		env = 0
	}

	// mixer 1: oscillators 1 to 3
	var mix1, total float64
	for i := range 3 {
		fr := math.Min(f.freq[i]*bend, maxFrequency)
		s.phase[i] += fr / SampleRate
		s.phase[i] -= math.Floor(s.phase[i])
		v := math.Min(f.vol[i], maxOscVolume)
		total += v
		mix1 += v * math.Sin(2*math.Pi*s.phase[i])
	}
	if total > maxMixer1 {
		mix1 *= maxMixer1 / total
	}
	if f.voiced {
		mix1 *= env
	}

	// mixer 2: oscillators 4 and 5, with distortion spreading noise around
	// the oscillator frequency
	var mix2 float64
	spread := f.distortion / 255 * 1.5
	for i := 3; i < 5; i++ {
		fr := math.Min(f.freq[i]*bend, maxFrequency)
		s.phase[i] += fr * (1 + spread*s.random()) / SampleRate
		s.phase[i] -= math.Floor(s.phase[i])
		mix2 += math.Min(f.vol[i], maxOscVolume) * math.Sin(2*math.Pi*s.phase[i])
	}
	if f.halfEnv {
		mix2 *= 0.5 + 0.5*env
	}

	// mixer 5: summation and master volume
	x := (mix1 + mix2) / (maxMixer1 + 2*maxOscVolume) * math.Min(master, maxMaster) / maxMaster

	// dc blocker
	y := x - s.dcIn + 0.995*s.dcOut
	s.dcIn = x
	s.dcOut = y

	// output filter
	out := s.b0*y + s.b1*s.x1 + s.b2*s.x2 - s.a1*s.y1 - s.a2*s.y2
	s.x2, s.x1 = s.x1, y
	s.y2, s.y1 = s.y1, out

	return out
}
