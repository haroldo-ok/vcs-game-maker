'use strict';

// Fits a DPC+ sound card to a recording (a drum hit, a blip, a voice clip), for the Sound tab's "Import sample".
//
// The DPC+ sound chip can not play a recording: a voice loops a 32 sample waveform at a pitch, once a scanline. What can be done is to
// find the card that sounds the most like the recording: the 32 bars of the waveform, its pitch (and a sweep of it), the volume and the
// volume envelope. The fit plays a candidate card in a small simulation of the chip (the same stairs of 4 bit samples at one read a
// scanline, the volume of each frame, the pitch of each frame) and compares it with the recording frame by frame, by how much energy
// each of 20 pitch bands holds. The comparison is in absolute terms, so the loudness of every frame counts as well as the tone, and a
// high whine that the recording does not have is seen as a band that is too loud.
//
// The search starts from a guess made from the recording (one cycle of a tonal sound, a spectrum matched slice of a noisy one, an
// envelope that follows the loudness) and keeps every random change that matches better, until the time is up or the match stops
// improving. It runs in short slices so that the page stays responsive.

import {DPC_WAVE_LENGTH, DPC_WAVE_MAX, TIA_AUDCS, TIA_CLOCK_HZ, tiaChipPattern} from './dpc-sound';
import {CHIP_SETTING_KEYS} from './chip-settings';

// The chip is read once a scanline: 262 scanlines a frame, 60 frames a second.
export const CHIP_RATE = 15734;
const FRAME = 262;
const BAND_COUNT = 40;
const FIRST_BAND_HZ = 60;
const LAST_BAND_HZ = 7500;
// A card's length is counted in a byte.
export const MAX_SAMPLE_FRAMES = 255;

// What the Sound tab's envelope dropdowns allow (see blocks/soundfx.js): a value outside these is put back to the default when the tab
// opens. Stage lengths in frames, levels in percent.
export const ENVELOPE_ATTACK_RELEASE_FRAMES = [0, 2, 4, 8, 16, 32, 56, 64];
export const ENVELOPE_DECAY_SUSTAIN_FRAMES = [0, 2, 4, 8, 16, 32, 64];
export const ENVELOPE_LEVELS = [0, 25, 50, 75, 100];
// The sweep dropdowns and the largest step the tab keeps.
const SWEEP_STEPS = [1, 2, 3, 4, 6, 8];
const SWEEP_FRAME_COUNTS = [1, 2, 3, 4, 6, 8];
const MAX_NOISE_HZ = 500;
const MAX_TONE_HZ = 2000;
const MIN_HZ = 30;
// The notes of the piano the chip plays (key 1 to key 88), which a frequency envelope stays between.
const MIN_PITCH_HZ = 27.5;
const MAX_PITCH_HZ = 4186;
const MAX_PITCH_AMOUNT = 31;

const randomInt = (n) => Math.floor(Math.random() * n);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// The bands are single frequencies, spread evenly in pitch from 60 to 7500 Hz: close enough together that a loop of a few harmonics, which
// has gaps between them, reads as different from the even hiss of a noise.
const bandHz = (band) => FIRST_BAND_HZ * Math.pow(LAST_BAND_HZ / FIRST_BAND_HZ, band / (BAND_COUNT - 1));
// Goertzel's coefficient of each band's frequency (see bandEnergies).
const BAND_COEFFICIENT = Float64Array.from({length: BAND_COUNT}, (_, band) => 2 * Math.cos(2 * Math.PI * bandHz(band) / CHIP_RATE));
// The cosine and sine of each band's frequency at every sample of a frame, and what a constant frame reads (see buildWaveModel).
const BAND_COS = new Float64Array(BAND_COUNT * FRAME);
const BAND_SIN = new Float64Array(BAND_COUNT * FRAME);
const BAND_DC_RE = new Float64Array(BAND_COUNT);
const BAND_DC_IM = new Float64Array(BAND_COUNT);
for (let band = 0; band < BAND_COUNT; band++) {
  for (let i = 0; i < FRAME; i++) {
    BAND_COS[band * FRAME + i] = Math.cos(2 * Math.PI * bandHz(band) / CHIP_RATE * i);
    BAND_SIN[band * FRAME + i] = Math.sin(2 * Math.PI * bandHz(band) / CHIP_RATE * i);
    BAND_DC_RE[band] += BAND_COS[band * FRAME + i];
    BAND_DC_IM[band] -= BAND_SIN[band * FRAME + i];
  }
}
const centered = new Float64Array(FRAME);

// The recording as the chip's rate, a mono signal. samples is one channel (or the average of them) at sampleRate.
export const resampleToChipRate = (samples, sampleRate) => {
  const step = sampleRate / CHIP_RATE;
  const out = [];
  for (let at = 0; at + step <= samples.length; at += step) {
    const from = Math.floor(at);
    const to = Math.max(from + 1, Math.floor(at + step));
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i];
    out.push(sum / (to - from));
  }
  return Float64Array.from(out);
};

// How much energy a stretch of a frame holds in each of the bands (the mean taken off first).
const bandEnergies = (signal, offset) => {
  let mean = 0;
  for (let i = 0; i < FRAME; i++) {
    const value = signal[offset + i] || 0;
    centered[i] = value;
    mean += value;
  }
  mean /= FRAME;
  for (let i = 0; i < FRAME; i++) centered[i] -= mean;
  const energies = new Float64Array(BAND_COUNT);
  for (let band = 0; band < BAND_COUNT; band++) {
    // Goertzel's recurrence: the energy at the band's frequency with one multiply a sample.
    const coefficient = BAND_COEFFICIENT[band];
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < FRAME; i++) {
      const s0 = centered[i] + coefficient * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    energies[band] = s1 * s1 + s2 * s2 - coefficient * s1 * s2;
  }
  return energies;
};

// The volume of each frame of a card with an envelope (the same curve the Sound tab and the ROM use: see buildEnvelopeCurve in
// utils/envelope.js, with no looping sustain).
export const envelopeVolumes = ({attack, decay, sustainLength, release, decayEnd, releaseStart}, peak, frames) => {
  const decayEndVolume = Math.round(peak * decayEnd / 100);
  const releaseStartVolume = Math.round(peak * releaseStart / 100);
  const sustainStart = attack + decay;
  const releaseFrom = sustainStart + sustainLength;
  const end = releaseFrom + release;
  const out = [];
  for (let i = 0; i < frames; i++) {
    if (i < attack) out.push(attack === 0 ? peak : Math.round(peak * (i + 1) / attack));
    else if (i < sustainStart) out.push(decay === 0 ? decayEndVolume : Math.round(peak - (peak - decayEndVolume) * (i - attack + 1) / decay));
    else if (i < releaseFrom) {
      out.push(sustainLength === 0 ? decayEndVolume :
        Math.round(decayEndVolume + (releaseStartVolume - decayEndVolume) * (i - sustainStart + 1) / sustainLength));
    } else if (i < end) out.push(release === 0 ? 0 : Math.max(0, Math.round(releaseStartVolume - releaseStartVolume * (i - releaseFrom + 1) / release)));
    else out.push(0);
  }
  return out;
};

// The frequency envelope: semitones above the pitch for each frame (null when the card has none). Its stages are shaped like the volume
// envelope's (see buildDpcPitchOffsets in utils/pitch-table.js, which rounds the amount times the level in the same way).
const pitchEnvelopeOffsets = (card, frames) => {
  if (!card.pitchAmount) return null;
  const levels = envelopeVolumes({attack: card.pitchAttack, decay: card.pitchDecay, sustainLength: card.pitchSustainLength,
    release: card.pitchRelease, decayEnd: card.pitchDecayEnd, releaseStart: card.pitchReleaseStart}, 15, frames);
  return levels.map((level) => Math.round(card.pitchAmount * level / 15));
};

// The pitch of each frame of a sound with a sweep (see buildDpcPitchOffsets in utils/pitch-table.js): from hz to the piano key
// endKey (a MIDI number), step semitones every `every` frames.
const pitchTrack = (card, frames) => {
  const out = [];
  const bends = pitchEnvelopeOffsets(card, frames);
  const startKey = Math.round(12 * Math.log2(card.hz / 440) + 69) - 20;
  const endKey = card.sweepEnd - 20;
  const span = Math.abs(endKey - startKey);
  const positions = Math.floor(span / card.sweepStep) + 1;
  for (let frame = 0; frame < frames; frame++) {
    let hz;
    if (!card.sweep || !card.sweepEnd || !span) {
      hz = card.hz;
    } else {
      const position = Math.min(Math.floor(frame / card.sweepFrames), positions - 1);
      hz = card.hz * Math.pow(2, Math.sign(endKey - startKey) * Math.min(span, position * card.sweepStep) / 12);
    }
    out.push(bends ? clamp(hz * Math.pow(2, bends[frame] / 12), MIN_PITCH_HZ, MAX_PITCH_HZ) : hz);
  }
  return out;
};

const expandBars = (bars) => Array.from({length: DPC_WAVE_LENGTH}, (_, i) => bars[Math.floor(i * bars.length / DPC_WAVE_LENGTH)]);

// What the chip would play: the waveform at the volume of each frame, one sample a scanline.
const renderCard = (card, frames) => {
  const volumes = envelopeVolumes(card, card.volume, frames);
  const track = pitchTrack(card, frames);
  const wave = expandBars(card.bars);
  const out = new Float64Array(frames * FRAME);
  let phase = 0;
  for (let frame = 0; frame < frames; frame++) {
    const volume = volumes[frame];
    const step = track[frame] / CHIP_RATE;
    for (let i = 0; i < FRAME; i++) {
      out[frame * FRAME + i] = Math.round(wave[Math.floor(phase * DPC_WAVE_LENGTH) % DPC_WAVE_LENGTH] * volume / DPC_WAVE_MAX);
      phase += step;
      if (phase >= 1) phase -= Math.floor(phase);
    }
  }
  return out;
};

// The divider (AUDF, 0 to 31) of each frame of a TIA sound: the sweep goes from audf to sweepEnd, sweepStep dividers every sweepFrames
// frames, and the frequency envelope adds its amount (a positive amount is a higher divider, so a lower pitch). See buildPitchTable in
// utils/pitch-table.js.
const tiaAudfTrack = (card, frames) => {
  const bends = pitchEnvelopeOffsets(card, frames);
  const span = Math.abs(card.sweepEnd - card.audf);
  const direction = card.sweepEnd >= card.audf ? 1 : -1;
  const positions = Math.floor(span / card.sweepStep) + 1;
  const out = [];
  for (let frame = 0; frame < frames; frame++) {
    let audf = card.audf;
    if (card.sweep && span) {
      const position = Math.min(Math.floor(frame / card.sweepFrames), positions - 1);
      audf += direction * Math.min(span, position * card.sweepStep);
    }
    if (bends) audf += bends[frame];
    out.push(clamp(Math.round(audf), 0, 31));
  }
  return out;
};

// What the TIA would play: its shift register stepped every AUDF + 1 ticks of its clock, at the volume of each frame. The register runs
// faster than the one sample a scanline that is compared, so each sample is the mean of a few of its steps (what the ear would hear).
const TIA_SUBSAMPLES = 4;
const renderTia = (card, frames) => {
  const {chips, slow} = tiaChipPattern(card.audc);
  const length = chips.length;
  const volumes = envelopeVolumes(card, card.volume, frames);
  const dividers = tiaAudfTrack(card, frames);
  const out = new Float64Array(frames * FRAME);
  const clock = TIA_CLOCK_HZ * (card.clockScale || 1) / (slow ? 3 : 1);
  let phase = 0;
  for (let frame = 0; frame < frames; frame++) {
    const volume = volumes[frame];
    const step = clock / (dividers[frame] + 1) / CHIP_RATE;
    for (let i = 0; i < FRAME; i++) {
      let sum = 0;
      for (let k = 0; k < TIA_SUBSAMPLES; k++) sum += chips[Math.floor(phase + step * k / TIA_SUBSAMPLES) % length];
      out[frame * FRAME + i] = sum / TIA_SUBSAMPLES * volume;
      phase += step;
      if (phase >= length) phase %= length;
    }
  }
  return out;
};

// The recording, ready to be compared with: its energy in every band of every frame.
export const prepareSample = (samples, sampleRate) => {
  let signal = resampleToChipRate(samples, sampleRate);
  // The silence at the end (below -60 dB) is not part of the sound.
  let peak = 0;
  for (let i = 0; i < signal.length; i++) peak = Math.max(peak, Math.abs(signal[i]));
  let end = signal.length;
  while (end > FRAME && Math.abs(signal[end - 1]) < peak * 0.001) end--;
  signal = signal.subarray(0, end);
  const frames = Math.max(1, Math.min(MAX_SAMPLE_FRAMES, Math.round(signal.length / FRAME)));
  const reference = [];
  let maxEnergy = 0;
  let total = 0;
  const rms = [];
  for (let frame = 0; frame < frames; frame++) {
    const energies = bandEnergies(signal, frame * FRAME);
    reference.push(energies);
    for (const value of energies) {
      maxEnergy = Math.max(maxEnergy, value);
      total += value;
    }
    let sum = 0;
    for (let i = 0; i < FRAME; i++) sum += Math.pow(signal[frame * FRAME + i] || 0, 2);
    rms.push(Math.sqrt(sum / FRAME));
  }
  const loudest = Math.max(...rms) || 1;
  return {
    signal, frames, reference, total, epsilon: maxEnergy * 1e-4,
    weights: reference.map((energies) => Array.from(energies, (value) => Math.sqrt(value / maxEnergy) + 0.12)),
    loudness: rms.map((value) => value / loudest),
    seconds: signal.length / CHIP_RATE,
  };
};

// How far a card is from the recording (lower is closer). null when its envelope is not the recording's length (within a frame).
const mismatch = (prepared, card) => {
  const length = card.attack + card.decay + card.sustainLength + card.release;
  if (Math.abs(length - prepared.frames) > prepared.lengthSlack) return null;
  const frames = Math.max(prepared.frames, length);
  const played = card.tia ? renderTia(card, frames) : renderCard(card, frames);
  const energies = [];
  let total = 0;
  for (let frame = 0; frame < frames; frame++) {
    const e = bandEnergies(played, frame * FRAME);
    energies.push(e);
    for (const value of e) total += value;
  }
  const scale = total > 0 ? prepared.total / total : 1;
  let sum = 0;
  let weights = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let band = 0; band < BAND_COUNT; band++) {
      const wanted = frame < prepared.frames ? prepared.reference[frame][band] : 0;
      const weight = frame < prepared.frames ? prepared.weights[frame][band] : 0.12;
      const difference = Math.log(energies[frame][band] * scale + prepared.epsilon) - Math.log(wanted + prepared.epsilon);
      sum += weight * difference * difference;
      weights += weight;
    }
  }
  return sum / weights;
};

// The pitch (Hz) of the stretch of the recording at `offset`, or null when it has none that is clear: the lag at which the signal
// matches itself best (the first deep dip, so that an octave below is not taken).
const estimatePitch = (signal, offset, length) => {
  const minLag = Math.floor(CHIP_RATE / 1000);
  const maxLag = Math.floor(CHIP_RATE / 35);
  const half = Math.floor(length / 2);
  if (offset + half + maxLag >= signal.length + maxLag) return null;
  const dips = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let difference = 0;
    let size = 0;
    for (let i = 0; i < half; i += 2) {
      const a = signal[offset + i] || 0;
      const b = signal[offset + i + lag] || 0;
      difference += Math.abs(a - b);
      size += Math.abs(a) + Math.abs(b);
    }
    dips.push(size > 0 ? difference / size : 1);
  }
  const lowest = Math.min(...dips);
  if (lowest > 0.75) return null;
  for (let i = 1; i < dips.length - 1; i++) {
    if (dips[i] <= lowest * 1.5 + 0.04 && dips[i] <= dips[i - 1] && dips[i] <= dips[i + 1]) {
      return {hz: CHIP_RATE / (minLag + i), clarity: 1 - dips[i]};
    }
  }
  return null;
};

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Whether the recording is a tone with a pitch that moves (a tom, a kick, a blip) and, if so, where it starts and ends.
export const analysePitch = (prepared) => {
  const length = 1048;
  let readings = [];
  for (let frame = 0; frame < prepared.frames; frame++) {
    if (prepared.loudness[frame] < 0.12) continue;
    const reading = estimatePitch(prepared.signal, frame * FRAME, length);
    if (reading) readings.push({frame, loudness: prepared.loudness[frame], ...reading});
  }
  const audible = prepared.loudness.filter((value) => value >= 0.12).length;
  if (readings.length < 2 || readings.length < audible * 0.5) return null;
  // A reading an octave off (a lag of twice the period matched best) is left out: the pitch of a hit does not move that far.
  const reference = median(readings.slice(0, Math.max(2, Math.floor(readings.length / 3))).map((r) => r.hz));
  readings = readings.filter((r) => r.hz > reference * 0.62 && r.hz < reference * 1.6);
  if (readings.length < 2 || median(readings.map((r) => r.clarity)) < 0.5) return null;
  const early = readings.slice(0, Math.max(1, Math.min(3, Math.floor(readings.length / 4))));
  const loud = readings.filter((r) => r.loudness >= 0.2);
  const late = (loud.length >= 3 ? loud : readings).slice(Math.floor((loud.length >= 3 ? loud : readings).length / 2));
  return {
    startHz: median(early.map((r) => r.hz)), endHz: median(late.map((r) => r.hz)), startFrame: early[0].frame,
    readings,
  };
};

// One cycle of a tone (period samples long), starting at a rising zero crossing near `offset`, as 32 samples of 0 to 15.
const cycleOf = (signal, offset, period) => {
  let at = Math.max(0, Math.floor(offset));
  while (at < signal.length - 1 && !(signal[at] <= 0 && signal[at + 1] > 0)) at++;
  if (at >= signal.length - period - 2) at = Math.max(0, Math.floor(offset));
  const cycle = Array.from({length: DPC_WAVE_LENGTH}, (_, i) => {
    const t = at + period * i / DPC_WAVE_LENGTH;
    const k = Math.floor(t);
    const fraction = t - k;
    return (signal[k] || 0) * (1 - fraction) + (signal[k + 1] || 0) * fraction;
  });
  const low = Math.min(...cycle);
  const high = Math.max(...cycle);
  return cycle.map((value) => (high === low ? 7 : Math.round((value - low) / (high - low) * DPC_WAVE_MAX)));
};

// The envelopes that fit the recording's length with the stage lengths and levels the tab allows, the best few by how well their curve
// follows the loudness of the recording.
const envelopeCandidates = (prepared, count) => {
  const target = prepared.loudness;
  const frames = prepared.frames;
  const all = [];
  const lengths = [];
  ENVELOPE_ATTACK_RELEASE_FRAMES.forEach((attack) => ENVELOPE_DECAY_SUSTAIN_FRAMES.forEach((decay) =>
    ENVELOPE_DECAY_SUSTAIN_FRAMES.forEach((sustainLength) => ENVELOPE_ATTACK_RELEASE_FRAMES.forEach((release) => {
      const total = attack + decay + sustainLength + release;
      if (total >= 2 && total <= MAX_SAMPLE_FRAMES) lengths.push({attack, decay, sustainLength, release, total});
    }))));
  // The lengths closest to the recording's (every even total is within a frame of any length).
  const nearest = Math.min(...lengths.map((l) => Math.abs(l.total - frames)));
  const slack = Math.max(1, nearest);
  lengths.filter((l) => Math.abs(l.total - frames) <= slack).forEach((l) => {
    ENVELOPE_LEVELS.forEach((decayEnd) => ENVELOPE_LEVELS.forEach((releaseStart) => {
      if (releaseStart > decayEnd || (l.sustainLength === 0 && releaseStart !== decayEnd)) return;
      // The curve in unit levels (the rounding to the 16 volumes is left to the full comparison).
      let error = 0;
      const end = Math.max(frames, l.total);
      for (let i = 0; i < end; i++) {
        let level;
        if (i < l.attack) level = (i + 1) / l.attack;
        else if (i < l.attack + l.decay) level = 1 - (1 - decayEnd / 100) * (i - l.attack + 1) / l.decay;
        else if (i < l.attack + l.decay + l.sustainLength) {
          level = decayEnd / 100 - (decayEnd - releaseStart) / 100 * (i - l.attack - l.decay + 1) / l.sustainLength;
        } else if (i < l.total) level = releaseStart / 100 * (1 - (i - l.attack - l.decay - l.sustainLength + 1) / l.release);
        else level = 0;
        const wanted = i < frames ? target[i] : 0;
        error += (level - wanted) * (level - wanted);
      }
      all.push({...l, decayEnd, releaseStart, error});
    }));
  });
  all.sort((a, b) => a.error - b.error);
  return {candidates: all.slice(0, count), slack};
};

// Changes the frequency envelope of a card a little: its amount, or one of its stages or levels (the stages stay within the sound).
const bendFrequency = (card) => {
  const pick = (values) => values[randomInt(values.length)];
  const roll = Math.random();
  if (roll < 0.4) {
    card.pitchAmount = clamp(card.pitchAmount + (randomInt(2) ? 1 : -1) * (1 + randomInt(3)), -MAX_PITCH_AMOUNT, MAX_PITCH_AMOUNT);
  } else if (roll < 0.5) {
    card.pitchAmount = 0;
  } else if (roll < 0.62) {
    card.pitchAttack = pick(ENVELOPE_ATTACK_RELEASE_FRAMES);
  } else if (roll < 0.74) {
    card.pitchDecay = pick(ENVELOPE_DECAY_SUSTAIN_FRAMES);
  } else if (roll < 0.82) {
    card.pitchSustainLength = pick(ENVELOPE_DECAY_SUSTAIN_FRAMES);
  } else if (roll < 0.9) {
    card.pitchRelease = pick(ENVELOPE_ATTACK_RELEASE_FRAMES);
  } else if (roll < 0.95) {
    card.pitchDecayEnd = pick(ENVELOPE_LEVELS);
  } else {
    card.pitchReleaseStart = pick(ENVELOPE_LEVELS);
  }
  const total = card.pitchAttack + card.pitchDecay + card.pitchSustainLength + card.pitchRelease;
  if (total > card.attack + card.decay + card.sustainLength + card.release) card.pitchAmount = 0;
};

const nextSlice = () => new Promise((resolve) => setTimeout(resolve, 0));

// The words for how close a fit is, from its mismatch.
export const describeMismatch = (value) => (value <= 0.6 ? 'very close' : value <= 1.5 ? 'close' : value <= 3 ? 'rough' : 'loose');

// How loud each frame of a played sound is next to the loudest one, with the recording's, for the little graph of an import.
const loudnessCurves = (prepared, played) => {
  const frames = Math.floor(played.length / FRAME);
  const levels = [];
  for (let frame = 0; frame < frames; frame++) {
    let mean = 0;
    for (let i = 0; i < FRAME; i++) mean += played[frame * FRAME + i];
    mean /= FRAME;
    let sum = 0;
    for (let i = 0; i < FRAME; i++) sum += Math.pow(played[frame * FRAME + i] - mean, 2);
    levels.push(Math.sqrt(sum / FRAME));
  }
  const loudest = Math.max(...levels) || 1;
  const round = (value) => Math.round(value * 100) / 100;
  return {wanted: Array.from(prepared.loudness, round), played: levels.map((level) => round(level / loudest))};
};

// The waveform part of the search, much faster than playing the card every time. With the pitch, the volume and the envelope fixed, the
// energy that every band of every frame holds is made from the 32 samples of the waveform in a simple way: the frame's reading of
// a band is the sum, over the samples, of the sample's value times a number that only depends on when the sample is read in the frame.
// Those numbers are worked out once (buildWaveModel); then moving a bar changes the readings by a multiple of them, and the comparison is
// worked out from the readings. It leaves out the rounding of the volume to the chip's 16 steps, which the exact comparison (mismatch)
// counts, so the search ends with that.
const buildWaveModel = (prepared, card) => {
  const length = card.attack + card.decay + card.sustainLength + card.release;
  const frames = Math.max(prepared.frames, length);
  const volumes = envelopeVolumes(card, card.volume, frames);
  const track = pitchTrack(card, frames);
  const bands = BAND_COUNT;
  const size = DPC_WAVE_LENGTH;
  const re = new Float64Array(frames * bands * size);
  const im = new Float64Array(frames * bands * size);
  const counts = new Float64Array(size);
  const sampleBar = new Int32Array(FRAME);
  let phase = 0;
  for (let frame = 0; frame < frames; frame++) {
    counts.fill(0);
    const step = track[frame] / CHIP_RATE;
    for (let i = 0; i < FRAME; i++) {
      const bar = Math.floor(phase * size) % size;
      sampleBar[i] = bar;
      counts[bar]++;
      phase += step;
      if (phase >= 1) phase -= Math.floor(phase);
    }
    for (let band = 0; band < bands; band++) {
      const base = (frame * bands + band) * size;
      const offset = band * FRAME;
      for (let i = 0; i < FRAME; i++) {
        const bar = sampleBar[i];
        re[base + bar] += BAND_COS[offset + i];
        im[base + bar] -= BAND_SIN[offset + i];
      }
      // The mean of the frame is taken off before it is read: that is a multiple of the reading of a constant.
      for (let bar = 0; bar < size; bar++) {
        re[base + bar] -= counts[bar] * BAND_DC_RE[band] / FRAME;
        im[base + bar] -= counts[bar] * BAND_DC_IM[band] / FRAME;
      }
    }
  }
  const level = Float64Array.from(volumes, (volume) => volume / DPC_WAVE_MAX);
  const cells = frames * bands;
  const readingRe = new Float64Array(cells);
  const readingIm = new Float64Array(cells);
  const wantedLog = new Float64Array(cells);
  const weight = new Float64Array(cells);
  let weightSum = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let band = 0; band < bands; band++) {
      const cell = frame * bands + band;
      wantedLog[cell] = Math.log((frame < prepared.frames ? prepared.reference[frame][band] : 0) + prepared.epsilon);
      weight[cell] = frame < prepared.frames ? prepared.weights[frame][band] : 0.12;
      weightSum += weight[cell];
    }
  }
  const energy = new Float64Array(cells);
  return {
    // The readings for a waveform of 32 sample values.
    setWave(wave) {
      for (let frame = 0; frame < frames; frame++) {
        for (let band = 0; band < bands; band++) {
          const cell = frame * bands + band;
          const base = cell * size;
          let sumRe = 0;
          let sumIm = 0;
          for (let bar = 0; bar < size; bar++) {
            sumRe += wave[bar] * re[base + bar];
            sumIm += wave[bar] * im[base + bar];
          }
          readingRe[cell] = sumRe * level[frame];
          readingIm[cell] = sumIm * level[frame];
        }
      }
    },
    // Adds delta to the given samples of the waveform.
    moveBar(samples, delta) {
      for (const sample of samples) {
        for (let frame = 0; frame < frames; frame++) {
          const factor = level[frame] * delta;
          if (factor === 0) continue;
          for (let band = 0; band < bands; band++) {
            const cell = frame * bands + band;
            readingRe[cell] += factor * re[cell * size + sample];
            readingIm[cell] += factor * im[cell * size + sample];
          }
        }
      }
    },
    // How far the waveform is from the recording: the same measure as mismatch.
    cost() {
      let total = 0;
      for (let cell = 0; cell < cells; cell++) {
        const value = readingRe[cell] * readingRe[cell] + readingIm[cell] * readingIm[cell];
        energy[cell] = value;
        total += value;
      }
      const scale = total > 0 ? prepared.total / total : 1;
      let sum = 0;
      for (let cell = 0; cell < cells; cell++) {
        const difference = Math.log(energy[cell] * scale + prepared.epsilon) - wantedLog[cell];
        sum += weight[cell] * difference * difference;
      }
      return sum / weightSum;
    },
  };
};

// Fits a TIA sound (a type AUDC, a divider AUDF, a volume, an envelope, a sweep and a frequency envelope of the divider) to the prepared
// recording, by trying every type at every divider and then improving the best few. Takes the same options as fitSample (mode and bars
// do not apply). options.fixed holds card settings that stay as they are (the volume, the envelope, the shape of the sweep and the
// frequency envelope: a card for both chips shares them), as the card fields of this file (volume, attack, decay, sustainLength, release,
// decayEnd, releaseStart, sweep, sweepStep, sweepFrames, pitchAmount...). Resolves to {fields, mismatch, mode: 'tia', audc}.
export const fitTiaSample = async (prepared, options = {}) => {
  const {onProgress = () => {}, isCancelled = () => false} = options;
  const budgetMs = (options.seconds || clamp(2 + prepared.frames * 0.05, 3, 8)) * 1000 * (options.timeScale || 1);
  const started = performance.now();
  prepared.lengthSlack = 1;
  const {candidates, slack} = envelopeCandidates(prepared, 24);
  prepared.lengthSlack = slack;
  const first = candidates[0];
  const fixed = options.fixed || null;
  // Every type is tried: the measure tells a tone from a noise (it sees the gaps between the harmonics of a tone), so a hiss comes out as
  // a noise type and a pitched sound as a tone.
  const audcs = TIA_AUDCS;
  const base = {
    tia: true, audc: 4, audf: 10, volume: 15, clockScale: options.clockScale || 1,
    attack: first.attack, decay: first.decay, sustainLength: first.sustainLength, release: first.release,
    decayEnd: first.decayEnd, releaseStart: first.releaseStart,
    sweep: false, sweepEnd: 0, sweepStep: 1, sweepFrames: 1,
    pitchAmount: 0, pitchAttack: 0, pitchDecay: 8, pitchSustainLength: 0, pitchRelease: 0, pitchDecayEnd: 0, pitchReleaseStart: 0,
    ...(fixed || {}),
    ...(fixed && fixed.sweep ? {sweepEnd: 31} : {}),
  };
  let overall = null;
  let sliceStart = performance.now();
  const maybeYield = async () => {
    if (performance.now() - sliceStart > 25) {
      onProgress({fraction: Math.min(1, (performance.now() - started) / budgetMs), mismatch: overall ? overall.value : Infinity});
      await nextSlice();
      sliceStart = performance.now();
    }
  };

  // Every type at every divider, with the recording's envelope.
  const grid = [];
  for (const audc of audcs) {
    for (let audf = 0; audf < 32; audf++) {
      const card = {...base, audc, audf};
      const value = mismatch(prepared, card);
      if (value !== null) {
        grid.push({value, card});
        if (!overall || value < overall.value) overall = {value, card};
      }
      await maybeYield();
      if (isCancelled()) return null;
    }
  }
  if (!overall) overall = {value: Infinity, card: base};
  grid.sort((a, b) => a.value - b.value);
  const timeUp = () => performance.now() - started > budgetMs;
  const lengthOf = (c) => c.attack + c.decay + c.sustainLength + c.release;

  // The best of a list of cards, when it is better than the card there is. Resolves to whether it was.
  const improve = async (state, list) => {
    let top = null;
    for (const candidate of list) {
      if (lengthOf(candidate) > 0 && candidate.pitchAmount && candidate.pitchAttack + candidate.pitchDecay + candidate.pitchSustainLength +
        candidate.pitchRelease > lengthOf(candidate)) continue;
      const value = mismatch(prepared, candidate);
      if (value !== null && (!top || value < top.value)) top = {value, card: candidate};
      await maybeYield();
      if (isCancelled()) return false;
    }
    if (top && top.value < state.value - 1e-9) {
      state.value = top.value;
      state.card = top.card;
      if (top.value < overall.value) overall = {value: top.value, card: top.card};
      return true;
    }
    return false;
  };

  // One setting at a time, every choice of it tried and the best kept, round after round until a round finds nothing better.
  const refine = async (state) => {
    for (let round = 0; round < 8 && !timeUp(); round++) {
      let better = false;
      const at = () => state.card;
      // The type and the divider.
      const neighbours = [];
      for (const audc of audcs) {
        for (let step = -4; step <= 4; step++) neighbours.push({...at(), audc, audf: clamp(at().audf + step, 0, 31)});
      }
      better = await improve(state, neighbours) || better;
      if (!fixed) {
        better = await improve(state, Array.from({length: 12}, (_, i) => ({...at(), volume: 4 + i}))) || better;
        better = await improve(state, candidates.map((e) => ({...at(), attack: e.attack, decay: e.decay, sustainLength: e.sustainLength,
          release: e.release, decayEnd: e.decayEnd, releaseStart: e.releaseStart}))) || better;
      }
      // The sweep: its end, and (when the card is free to) how fast it goes.
      if (!fixed || fixed.sweep) {
        const ends = Array.from({length: 32}, (_, end) => ({...at(), sweep: true, sweepEnd: end}));
        better = await improve(state, at().sweep || fixed ? ends : ends.filter((c, end) => end % 3 === 0 || Math.abs(end - at().audf) <= 4)) || better;
      }
      if (!fixed) {
        const speeds = [];
        SWEEP_STEPS.forEach((step) => SWEEP_FRAME_COUNTS.forEach((every) => speeds.push({...at(), sweepStep: step, sweepFrames: every})));
        if (at().sweep) better = await improve(state, speeds) || better;
        better = await improve(state, [{...at(), sweep: false}]) || better;
        // The frequency envelope: how far it bends and how long it takes.
        const bends = [{...at(), pitchAmount: 0}];
        for (let amount = -16; amount <= 16; amount += 2) {
          if (!amount) continue;
          for (const decay of [2, 4, 8, 16, 32]) {
            bends.push({...at(), pitchAmount: amount, pitchAttack: 0, pitchDecay: decay, pitchSustainLength: 0, pitchRelease: 0,
              pitchDecayEnd: 0, pitchReleaseStart: 0});
          }
        }
        better = await improve(state, bends) || better;
      }
      if (!better) break;
    }
  };

  // The best few starts, each refined while there is time (the best one first).
  const used = new Set();
  const starts = [];
  for (const entry of grid) {
    const key = `${entry.card.audc}`;
    if (!used.has(key)) {
      used.add(key);
      starts.push(entry);
    }
    if (starts.length >= 4) break;
  }
  for (const start of starts) {
    if (timeUp() || isCancelled()) break;
    const state = {value: start.value, card: {...start.card}};
    await refine(state);
  }
  // What time is left goes to small random changes of the best card.
  let current = {value: overall.value, card: {...overall.card}};
  while (!timeUp()) {
    if (isCancelled()) return null;
    const candidate = {...current.card};
    const kind = Math.random();
    if (kind < 0.4) {
      candidate.audf = clamp(candidate.audf + (randomInt(2) ? 1 : -1) * (1 + randomInt(2)), 0, 31);
    } else if (kind < 0.5) {
      candidate.audc = audcs[randomInt(audcs.length)];
    } else if (fixed) {
      if (candidate.sweep) candidate.sweepEnd = randomInt(32);
    } else if (kind < 0.7) {
      candidate.volume = clamp(candidate.volume + randomInt(3) - 1, 4, 15);
    } else {
      bendFrequency(candidate);
    }
    const value = mismatch(prepared, candidate);
    if (value !== null && value < current.value - 1e-9) {
      current = {value, card: candidate};
      if (value < overall.value) overall = current;
    }
    await maybeYield();
  }

  onProgress({fraction: 1, mismatch: overall.value});
  const card = overall.card;
  const length = card.attack + card.decay + card.sustainLength + card.release;
  return {
    mismatch: overall.value,
    mode: 'tia',
    audc: card.audc,
    curve: loudnessCurves(prepared, renderTia(card, Math.max(prepared.frames, length))),
    fields: {
      audc: String(card.audc),
      audf: card.audf,
      audv: card.volume,
      duration: length,
      envelope: true,
      envelopeAttack: card.attack,
      envelopeDecay: card.decay,
      envelopeDecayEnd: card.decayEnd,
      envelopeSustain: card.decayEnd,
      envelopeSustainLength: card.sustainLength,
      envelopeReleaseStart: card.releaseStart,
      envelopeRelease: card.release,
      sweep: card.sweep,
      sweepEnd: card.sweep ? card.sweepEnd : 31,
      sweepStep: card.sweepStep,
      sweepFrames: card.sweepFrames,
      sweepRepeat: false,
      sweepWrap: false,
      pitchEnvelope: card.pitchAmount !== 0,
      pitchEnvelopeAmount: card.pitchAmount,
      pitchEnvelopeAttack: card.pitchAttack,
      pitchEnvelopeDecay: card.pitchDecay,
      pitchEnvelopeDecayEnd: card.pitchDecayEnd,
      pitchEnvelopeSustainLength: card.pitchSustainLength,
      pitchEnvelopeReleaseStart: card.pitchReleaseStart,
      pitchEnvelopeRelease: card.pitchRelease,
    },
  };
};

// A waveform whose harmonics (multiples of hz) have the recording's average level at their frequency: where the search for a noisy sound
// starts, much nearer than random bars. The phases are random: the best of several tries by the given comparison is kept.
const spectralStart = (prepared, hz, count, trial, evaluate) => {
  const mean = Array.from({length: BAND_COUNT}, (_, band) => {
    let sum = 0;
    for (let frame = 0; frame < prepared.frames; frame++) sum += prepared.reference[frame][band];
    return Math.sqrt(sum / prepared.frames);
  });
  const amplitudeAt = (frequency) => {
    if (frequency <= bandHz(0)) return mean[0];
    if (frequency >= bandHz(BAND_COUNT - 1)) return mean[BAND_COUNT - 1];
    let band = 0;
    while (bandHz(band + 1) < frequency) band++;
    const t = Math.log(frequency / bandHz(band)) / Math.log(bandHz(band + 1) / bandHz(band));
    return mean[band] * (1 - t) + mean[band + 1] * t;
  };
  const harmonics = Math.floor(count / 2);
  const amplitudes = Array.from({length: harmonics}, (_, k) => amplitudeAt((k + 1) * hz));
  let bestBars = trial.bars;
  let bestValue = Infinity;
  for (let attempt = 0; attempt < 8; attempt++) {
    const wave = new Float64Array(count);
    for (let k = 0; k < harmonics; k++) {
      const phase = Math.random() * 2 * Math.PI;
      for (let i = 0; i < count; i++) wave[i] += amplitudes[k] * Math.cos(2 * Math.PI * (k + 1) * i / count + phase);
    }
    const peak = Math.max(...wave.map(Math.abs)) || 1;
    const bars = Array.from(wave, (v) => clamp(Math.round(7.5 + 7.5 * v / peak), 0, DPC_WAVE_MAX));
    const value = evaluate({...trial, bars});
    if (value !== null && value < bestValue) {
      bestValue = value;
      bestBars = bars;
    }
  }
  return bestBars;
};

// Fits a card to the prepared recording.
//   options.mode: 'auto' (decided from the recording), 'tone' or 'noise'
//   options.bars: how many bars the waveform is drawn with: 24 or 32
//   options.seconds: the most time to spend (the search stops sooner when the match stops improving); options.timeScale multiplies it
//   options.onProgress({fraction, mismatch}), options.isCancelled(): checked between slices
// Resolves to {fields, mismatch, mode}: the fields to put on a sound card (see the Sound tab).
export const fitSample = async (prepared, options = {}) => {
  const {mode: wantedMode = 'auto', bars: barCount = 32, onProgress = () => {}, isCancelled = () => false} = options;
  const budgetMs = (options.seconds || clamp(2 + prepared.frames * 0.05, 3, 8)) * 1000 * (options.timeScale || 1);
  const started = performance.now();
  const analysis = wantedMode === 'noise' ? null : analysePitch(prepared);
  // A pitch above what a loop of 32 samples can play (it would be read more than once a sample) is better made as a noise.
  const tone = wantedMode === 'tone' ? !!analysis : !!analysis && wantedMode !== 'noise' && analysis.startHz <= 600;
  prepared.lengthSlack = 1;

  // The envelope: the lengths nearest the recording's (the search below changes it to the other of the best few when that matches better).
  const {candidates, slack} = envelopeCandidates(prepared, 24);
  prepared.lengthSlack = slack;
  const first = candidates[0];

  const card = {
    hz: 300, volume: 15, bars: Array.from({length: barCount}, () => randomInt(16)),
    attack: first.attack, decay: first.decay, sustainLength: first.sustainLength, release: first.release,
    decayEnd: first.decayEnd, releaseStart: first.releaseStart,
    sweep: false, sweepEnd: 0, sweepStep: 1, sweepFrames: 1,
    pitchAmount: 0, pitchAttack: 0, pitchDecay: 8, pitchSustainLength: 0, pitchRelease: 0, pitchDecayEnd: 0, pitchReleaseStart: 0,
  };
  let limits = {minHz: MIN_HZ, maxHz: MAX_NOISE_HZ, minEnd: 0, maxEnd: 0};
  if (tone) {
    // A tone: one cycle of it for the waveform and its pitch, going from where it starts to where it settles.
    card.hz = clamp(Math.round(analysis.startHz * 100) / 100, MIN_HZ, MAX_TONE_HZ);
    const bodyFrame = Math.min(prepared.frames - 1, analysis.startFrame + 2);
    const cycle = cycleOf(prepared.signal, bodyFrame * FRAME, CHIP_RATE / analysis.startHz);
    card.bars = barCount === 32 ? cycle : Array.from({length: barCount}, (_, i) => {
      const group = cycle.filter((_, sample) => Math.floor(sample * barCount / DPC_WAVE_LENGTH) === i);
      return Math.round(group.reduce((a, b) => a + b, 0) / group.length);
    });
    const startKey = Math.round(12 * Math.log2(card.hz / 440) + 69);
    const endKey = Math.round(12 * Math.log2(analysis.endHz / 440) + 69);
    limits = {minHz: card.hz * 0.88, maxHz: card.hz * 1.12, minEnd: endKey - 1, maxEnd: endKey + 1};
    if (endKey !== startKey && endKey >= 21 && endKey <= 108) {
      card.sweep = true;
      card.sweepEnd = endKey;
      let best = null;
      SWEEP_STEPS.forEach((step) => SWEEP_FRAME_COUNTS.forEach((every) => {
        const trial = {...card, sweepStep: step, sweepFrames: every};
        const track = pitchTrack(trial, prepared.frames);
        const error = analysis.readings.reduce((sum, r) => sum + Math.pow(Math.log2(track[r.frame] / r.hz), 2), 0);
        if (!best || error < best.error) best = {error, step, every};
      }));
      card.sweepStep = best.step;
      card.sweepFrames = best.every;
    } else {
      limits.minEnd = 0;
      limits.maxEnd = 0;
    }
  }
  const lengthOf = (c) => c.attack + c.decay + c.sustainLength + c.release;
  const bendFits = (c) => !c.pitchAmount || c.pitchAttack + c.pitchDecay + c.pitchSustainLength + c.pitchRelease <= lengthOf(c);
  const allowed = (c) => bendFits(c) && Math.abs(lengthOf(c) - prepared.frames) <= prepared.lengthSlack && c.hz >= limits.minHz &&
    c.hz <= (tone ? MAX_TONE_HZ : limits.maxHz) &&
    (!tone || !c.sweep || (c.sweepEnd >= limits.minEnd && c.sweepEnd <= limits.maxEnd && c.sweepEnd >= 21 && c.sweepEnd <= 108));
  // The exact comparison (the chip's 4 bit volume steps and all), and the quick one of the waveform's bars (see buildWaveModel).
  const evaluate = (c) => (allowed(c) ? mismatch(prepared, c) : null);
  const groups = Array.from({length: barCount}, (_, bar) => Array.from({length: DPC_WAVE_LENGTH}, (_, i) => i)
      .filter((i) => Math.floor(i * barCount / DPC_WAVE_LENGTH) === bar));
  const modelOf = (c) => {
    const model = buildWaveModel(prepared, c);
    model.setWave(expandBars(c.bars));
    return model;
  };

  let best = Infinity;
  let sliceStart = performance.now();
  const maybeYield = async () => {
    if (performance.now() - sliceStart > 25) {
      onProgress({fraction: Math.min(1, (performance.now() - started) / budgetMs), mismatch: best});
      await nextSlice();
      sliceStart = performance.now();
    }
  };
  const timeUp = () => performance.now() - started > budgetMs;

  // Each bar moved up or down while that matches better, a pass at a time (the bars in a different order every time).
  const settle = async (model, bars, passes) => {
    let current = model.cost();
    for (let pass = 0; pass < passes; pass++) {
      let improved = false;
      const order = bars.map((_, i) => i).sort(() => Math.random() - 0.5);
      for (const bar of order) {
        for (const delta of [-4, -2, -1, 1, 2, 4]) {
          const value = clamp(bars[bar] + delta, 0, DPC_WAVE_MAX);
          if (value === bars[bar]) continue;
          model.moveBar(groups[bar], value - bars[bar]);
          const cost = model.cost();
          if (cost < current - 1e-9) {
            current = cost;
            bars[bar] = value;
            improved = true;
          } else {
            model.moveBar(groups[bar], bars[bar] - value);
          }
        }
        await maybeYield();
        if (isCancelled()) return current;
      }
      if (!improved) break;
    }
    return current;
  };

  // A noisy sound has no pitch to start from: its loop sounds different at every pitch, so each pitch gets a separate fit.
  if (!tone) {
    let top = null;
    for (const hz of [120, 160, 220, 300, 380, 440, 490]) {
      const trial = {...card, hz, bars: card.bars.slice()};
      trial.bars = spectralStart(prepared, hz, trial.bars.length, trial, (c) => (allowed(c) ? mismatch(prepared, c) : null));
      const model = modelOf(trial);
      const cost = await settle(model, trial.bars, 3);
      if (isCancelled()) return null;
      if (!top || cost < top.cost) top = {cost, card: trial};
    }
    Object.assign(card, top.card, {bars: top.card.bars.slice()});
  } else {
    // A tone starts from the cycle of the recording.
    await settle(modelOf(card), card.bars, 3);
  }
  let model = modelOf(card);
  best = model.cost();

  // A frequency envelope bends the pitch over the sound: a few shapes are tried, and the search below changes the best of them.
  const length0 = lengthOf(card);
  for (const amount of [-24, -12, -7, -4, 4, 7, 12, 24]) {
    for (const stages of [[0, 8, 0, 0], [0, 16, 0, 0], [0, 32, 0, 0], [0, 0, 0, 16], [0, 0, 0, 32]]) {
      const [pitchAttack, pitchDecay, pitchSustainLength, pitchRelease] = stages;
      if (pitchAttack + pitchDecay + pitchSustainLength + pitchRelease > length0) continue;
      const trial = {...card, bars: card.bars.slice(), pitchAmount: amount, pitchAttack, pitchDecay, pitchSustainLength, pitchRelease,
        pitchDecayEnd: 0, pitchReleaseStart: 0};
      if (!allowed(trial)) continue;
      const trialModel = modelOf(trial);
      const cost = await settle(trialModel, trial.bars, 1);
      if (cost < best - 1e-9) {
        Object.assign(card, trial);
        model = trialModel;
        best = cost;
      }
      if (isCancelled()) return null;
    }
  }

  // The search: the bars changed at random and settled again, or the pitch, the volume, the envelope, the frequency envelope or the
  // sweep changed and the bars settled again for it.
  let lastGain = performance.now();
  let lastBest = best;
  const minimumMs = 1000;
  while (!timeUp()) {
    if (isCancelled()) return null;
    if (Math.random() < 0.45) {
      const bars = card.bars.slice();
      const changes = 1 + randomInt(4);
      for (let j = 0; j < changes; j++) {
        const bar = randomInt(bars.length);
        const value = clamp(bars[bar] + randomInt(9) - 4, 0, DPC_WAVE_MAX);
        model.moveBar(groups[bar], value - bars[bar]);
        bars[bar] = value;
      }
      const cost = await settle(model, bars, 1);
      if (cost < best - 1e-9) {
        card.bars = bars;
        best = cost;
      } else {
        model.setWave(expandBars(card.bars));
      }
    } else {
      const candidate = {...card, bars: card.bars.slice()};
      const kind = Math.random();
      if (kind < 0.35) {
        candidate.hz = clamp(Math.round(candidate.hz * (0.96 + Math.random() * 0.08) * 100) / 100, MIN_HZ, tone ? MAX_TONE_HZ : MAX_NOISE_HZ);
      } else if (kind < 0.5) {
        candidate.volume = clamp(candidate.volume + randomInt(3) - 1, 4, 15);
      } else if (kind < 0.7) {
        const e = candidates[randomInt(candidates.length)];
        Object.assign(candidate, {attack: e.attack, decay: e.decay, sustainLength: e.sustainLength, release: e.release,
          decayEnd: e.decayEnd, releaseStart: e.releaseStart});
      } else if (kind < 0.88 || !candidate.sweep) {
        bendFrequency(candidate);
      } else if (Math.random() < 0.5) {
        candidate.sweepEnd += randomInt(3) - 1;
      } else {
        candidate.sweepStep = SWEEP_STEPS[randomInt(SWEEP_STEPS.length)];
        candidate.sweepFrames = SWEEP_FRAME_COUNTS[randomInt(SWEEP_FRAME_COUNTS.length)];
      }
      if (allowed(candidate)) {
        const candidateModel = modelOf(candidate);
        // Only a change that is not far off is worth settling the bars for.
        if (candidateModel.cost() < best * 1.6) {
          const cost = await settle(candidateModel, candidate.bars, 2);
          if (cost < best - 1e-9) {
            Object.assign(card, candidate);
            model = candidateModel;
            best = cost;
          }
        }
      }
      await maybeYield();
    }
    if (best < lastBest * 0.997) {
      lastBest = best;
      lastGain = performance.now();
    }
    // Stop early when nothing better has turned up for a while.
    const sinceStart = performance.now() - started;
    if (sinceStart > minimumMs && performance.now() - lastGain > Math.max(1500, sinceStart * 0.4)) break;
  }

  // The bars one last time against the exact comparison, which counts the chip's volume steps.
  best = evaluate(card);
  if (best === null) best = Infinity;
  const polishUntil = performance.now() + Math.min(1200, budgetMs * 0.2);
  while (performance.now() < polishUntil) {
    if (isCancelled()) return null;
    const candidate = {...card, bars: card.bars.slice()};
    const changes = 1 + randomInt(2);
    for (let j = 0; j < changes; j++) {
      const bar = randomInt(candidate.bars.length);
      candidate.bars[bar] = clamp(candidate.bars[bar] + randomInt(5) - 2, 0, DPC_WAVE_MAX);
    }
    const value = evaluate(candidate);
    if (value !== null && value < best - 1e-9) {
      best = value;
      card.bars = candidate.bars;
    }
    await maybeYield();
  }

  onProgress({fraction: 1, mismatch: best});
  const length = lengthOf(card);
  const wave = expandBars(card.bars);
  const result = {
    mismatch: best,
    mode: tone ? 'tone' : 'noise',
    curve: loudnessCurves(prepared, renderCard(card, Math.max(prepared.frames, length))),
    fields: {
      dpcShape: 'custom',
      dpcWave: wave,
      dpcWaveBars: card.bars.length,
      dpcFrequency: Math.round(card.hz * 100) / 100,
      dpcSweepMatch: false,
      audc: tone ? '4' : '8',
      audf: 4,
      audv: card.volume,
      duration: length,
      envelope: true,
      envelopeAttack: card.attack,
      envelopeDecay: card.decay,
      envelopeDecayEnd: card.decayEnd,
      envelopeSustain: card.decayEnd,
      envelopeSustainLength: card.sustainLength,
      envelopeReleaseStart: card.releaseStart,
      envelopeRelease: card.release,
      pitchEnvelope: card.pitchAmount !== 0,
      pitchEnvelopeAmount: card.pitchAmount,
      pitchEnvelopeAttack: card.pitchAttack,
      pitchEnvelopeDecay: card.pitchDecay,
      pitchEnvelopeDecayEnd: card.pitchDecayEnd,
      pitchEnvelopeSustainLength: card.pitchSustainLength,
      pitchEnvelopeReleaseStart: card.pitchReleaseStart,
      pitchEnvelopeRelease: card.pitchRelease,
      sweep: card.sweep,
      dpcSweepEnd: card.sweep ? card.sweepEnd : 0,
      sweepStep: card.sweepStep,
      sweepFrames: card.sweepFrames,
    },
  };
  // The chip's settings are also kept apart (see utils/chip-settings.js), so a card made for the chip alone has them where the chip reads them.
  result.fields.arm = {};
  CHIP_SETTING_KEYS.forEach((key) => {
    if (result.fields[key] !== undefined) result.fields.arm[key] = result.fields[key];
  });
  return result;
};

// Fits a card for both chips: a DPC+ sound and a TIA sound, each with a volume, envelope and sweep that are separate. The card keeps the TIA's in
// its fields (as every card does) and the chip's in "arm" (see utils/chip-settings.js), next to the chip's waveform and pitch.
// Resolves to {fields, mismatch (the worse of the two), dpcMismatch, tiaMismatch, mode: 'both', audc}, or null when cancelled.
export const fitBoth = async (prepared, options = {}) => {
  const {onProgress = () => {}} = options;
  const half = (from) => ({...options, onProgress: ({fraction}) => onProgress({fraction: from + fraction / 2})});
  const dpc = await fitSample(prepared, half(0));
  if (!dpc) return null;
  const tia = await fitTiaSample(prepared, half(0.5));
  if (!tia) return null;
  const arm = {};
  CHIP_SETTING_KEYS.forEach((key) => {
    if (dpc.fields[key] !== undefined) arm[key] = dpc.fields[key];
  });
  return {
    mode: 'both', mismatch: Math.max(dpc.mismatch, tia.mismatch), dpcMismatch: dpc.mismatch, tiaMismatch: tia.mismatch, audc: tia.audc,
    curve: {...dpc.curve, tiaPlayed: tia.curve.played},
    fields: {...dpc.fields, ...tia.fields, arm},
  };
};
