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

// The chip is read once a scanline: 262 scanlines a frame, 60 frames a second.
export const CHIP_RATE = 15734;
const FRAME = 262;
const BAND_COUNT = 20;
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
// The types of the TIA that are noise (see presetForAudc in utils/dpc-sound.js).
const TIA_NOISE_AUDCS = [3, 7, 8, 9, 15];

const randomInt = (n) => Math.floor(Math.random() * n);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Goertzel's coefficient of each band's frequency (see bandEnergies).
const BAND_COEFFICIENT = Float64Array.from({length: BAND_COUNT}, (_, band) => {
  const hz = FIRST_BAND_HZ * Math.pow(LAST_BAND_HZ / FIRST_BAND_HZ, band / (BAND_COUNT - 1));
  return 2 * Math.cos(2 * Math.PI * hz / CHIP_RATE);
});
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
  const clock = TIA_CLOCK_HZ / (slow ? 3 : 1);
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

// Fits a TIA sound (a type AUDC, a divider AUDF, a volume, an envelope, a sweep and a frequency envelope of the divider) to the prepared
// recording, by trying every type at every divider and then improving the best few. Takes the same options as fitSample (mode and bars
// do not apply). options.fixed holds card settings that stay as they are (the volume, the envelope, the shape of the sweep and the
// frequency envelope: a card for both chips shares them), as the card fields of this file (volume, attack, decay, sustainLength, release,
// decayEnd, releaseStart, sweep, sweepStep, sweepFrames, pitchAmount...). Resolves to {fields, mismatch, mode: 'tia', audc}.
export const fitTiaSample = async (prepared, options = {}) => {
  const {onProgress = () => {}, isCancelled = () => false} = options;
  const budgetMs = (options.seconds || clamp(3 + prepared.frames * 0.1, 4, 15)) * 1000 * (options.timeScale || 1);
  const started = performance.now();
  prepared.lengthSlack = 1;
  const {candidates, slack} = envelopeCandidates(prepared, 24);
  prepared.lengthSlack = slack;
  const first = candidates[0];
  const fixed = options.fixed || null;
  // A sound with no clear pitch (a snare, a cymbal, a hat) is made with a noise type of the TIA: the others are tones, and they sound
  // like one however the band energies line up.
  const wantedMode = options.mode || 'auto';
  const analysis = wantedMode === 'noise' ? null : analysePitch(prepared);
  const noisy = options.noisy !== undefined ? options.noisy :
    wantedMode === 'noise' || (wantedMode !== 'tone' && !(analysis && analysis.startHz <= 600));
  const audcs = noisy ? TIA_AUDCS.filter((audc) => TIA_NOISE_AUDCS.includes(audc)) : TIA_AUDCS;
  const base = {
    tia: true, audc: 4, audf: 10, volume: 15,
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
  // The best few, each improved by small random changes for an equal share of the time left.
  const starts = grid.slice(0, 4);
  const share = Math.max(300, (budgetMs - (performance.now() - started)) / Math.max(1, starts.length));
  for (const start of starts) {
    let current = {...start.card};
    let currentValue = start.value;
    const until = performance.now() + share;
    while (performance.now() < until) {
      if (isCancelled()) return null;
      const candidate = {...current};
      const kind = Math.random();
      if (kind < 0.3) {
        candidate.audf = clamp(candidate.audf + (randomInt(2) ? 1 : -1) * (1 + randomInt(3)), 0, 31);
      } else if (kind < 0.4) {
        candidate.audc = audcs[randomInt(audcs.length)];
      } else if (fixed) {
        // Only the sweep's end is the card's to choose here.
        if (candidate.sweep) candidate.sweepEnd = randomInt(32);
        else candidate.audf = clamp(candidate.audf + randomInt(3) - 1, 0, 31);
      } else if (kind < 0.5) {
        candidate.volume = clamp(candidate.volume + randomInt(3) - 1, 4, 15);
      } else if (kind < 0.6) {
        const e = candidates[randomInt(candidates.length)];
        Object.assign(candidate, {attack: e.attack, decay: e.decay, sustainLength: e.sustainLength, release: e.release,
          decayEnd: e.decayEnd, releaseStart: e.releaseStart});
      } else if (kind < 0.8) {
        candidate.sweep = true;
        if (Math.random() < 0.4) candidate.sweepEnd = randomInt(32);
        else if (Math.random() < 0.5) candidate.sweepStep = SWEEP_STEPS[randomInt(SWEEP_STEPS.length)];
        else candidate.sweepFrames = SWEEP_FRAME_COUNTS[randomInt(SWEEP_FRAME_COUNTS.length)];
        if (Math.random() < 0.1) candidate.sweep = false;
      } else {
        bendFrequency(candidate);
      }
      const value = mismatch(prepared, candidate);
      if (value !== null && value < currentValue - 1e-9) {
        current = candidate;
        currentValue = value;
        if (value < overall.value) overall = {value, card: candidate};
      }
      await maybeYield();
    }
  }

  onProgress({fraction: 1, mismatch: overall.value});
  const card = overall.card;
  const length = card.attack + card.decay + card.sustainLength + card.release;
  return {
    mismatch: overall.value,
    mode: 'tia',
    audc: card.audc,
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

// Fits a card to the prepared recording.
//   options.mode: 'auto' (decided from the recording), 'tone' or 'noise'
//   options.bars: how many bars the waveform is drawn with: 24 or 32
//   options.seconds: the most time to spend (the search stops sooner when the match stops improving); options.timeScale multiplies it
//   options.onProgress({fraction, mismatch}), options.isCancelled(): checked between slices
// Resolves to {fields, mismatch, mode}: the fields to put on a sound card (see the Sound tab).
export const fitSample = async (prepared, options = {}) => {
  const {mode: wantedMode = 'auto', bars: barCount = 32, onProgress = () => {}, isCancelled = () => false} = options;
  const budgetMs = (options.seconds || clamp(3 + prepared.frames * 0.1, 4, 15)) * 1000 * (options.timeScale || 1);
  const started = performance.now();
  const analysis = wantedMode === 'noise' ? null : analysePitch(prepared);
  // A pitch above what a loop of 32 samples can play (it would be read more than once a sample) is better made as a noise.
  const tone = wantedMode === 'tone' ? !!analysis : !!analysis && wantedMode !== 'noise' && analysis.startHz <= 600;
  prepared.lengthSlack = 1;

  // The envelope: the lengths nearest the recording's (the search below picks among the best few by the full comparison).
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
  const bendFits = (c) => !c.pitchAmount ||
    c.pitchAttack + c.pitchDecay + c.pitchSustainLength + c.pitchRelease <= c.attack + c.decay + c.sustainLength + c.release;
  const allowed = (c) => bendFits(c) && c.hz >= limits.minHz && c.hz <= (tone ? MAX_TONE_HZ : limits.maxHz) &&
    (!tone || !c.sweep || (c.sweepEnd >= limits.minEnd && c.sweepEnd <= limits.maxEnd && c.sweepEnd >= 21 && c.sweepEnd <= 108));
  const evaluate = (c) => (allowed(c) ? mismatch(prepared, c) : null);

  let best = evaluate(card);
  if (best === null) best = Infinity;
  let sliceStart = performance.now();
  const maybeYield = async () => {
    if (performance.now() - sliceStart > 25) {
      onProgress({fraction: Math.min(1, (performance.now() - started) / budgetMs), mismatch: best});
      await nextSlice();
      sliceStart = performance.now();
    }
  };
  const timeUp = () => performance.now() - started > budgetMs;
  const tryCard = (candidate) => {
    const value = evaluate(candidate);
    if (value !== null && value < best - 1e-9) {
      best = value;
      Object.assign(card, candidate, {bars: candidate.bars.slice()});
      return true;
    }
    return false;
  };

  // The best of the envelopes that fit.
  for (const candidate of candidates) {
    tryCard({...card, bars: card.bars, attack: candidate.attack, decay: candidate.decay, sustainLength: candidate.sustainLength,
      release: candidate.release, decayEnd: candidate.decayEnd, releaseStart: candidate.releaseStart});
    await maybeYield();
  }
  // A noisy sound has no pitch to start from: its loop sounds different at every pitch, so each pitch gets a separate short fit.
  if (!tone) {
    let top = {value: best, card: {...card, bars: card.bars.slice()}};
    for (const hz of [160, 220, 300, 380, 440, 490]) {
      const trial = {...card, hz, bars: card.bars.slice()};
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < trial.bars.length; i++) {
          for (const delta of [-4, -2, -1, 1, 2, 4]) {
            const v = trial.bars[i] + delta;
            if (v < 0 || v > DPC_WAVE_MAX) continue;
            const old = trial.bars[i];
            trial.bars[i] = v;
            const value = evaluate(trial);
            if (value !== null && value < (trial.value === undefined ? Infinity : trial.value)) trial.value = value;
            else trial.bars[i] = old;
          }
          await maybeYield();
          if (isCancelled()) return null;
        }
      }
      if (trial.value !== undefined && trial.value < top.value) top = {value: trial.value, card: {...trial, bars: trial.bars.slice()}};
    }
    Object.assign(card, top.card, {bars: top.card.bars.slice()});
    best = top.value;
  }


  // A frequency envelope bends the pitch over the sound: a few shapes are tried, and the search below changes the best of them.
  const length0 = card.attack + card.decay + card.sustainLength + card.release;
  for (const amount of [-24, -12, -7, -4, 4, 7, 12, 24]) {
    for (const stages of [[0, 8, 0, 0], [0, 16, 0, 0], [0, 32, 0, 0], [0, 0, 0, 16], [0, 0, 0, 32]]) {
      const [pitchAttack, pitchDecay, pitchSustainLength, pitchRelease] = stages;
      if (pitchAttack + pitchDecay + pitchSustainLength + pitchRelease > length0) continue;
      tryCard({...card, bars: card.bars, pitchAmount: amount, pitchAttack, pitchDecay, pitchSustainLength, pitchRelease,
        pitchDecayEnd: 0, pitchReleaseStart: 0});
      await maybeYield();
    }
  }

  // The random search: a few bars at a time, the pitch, the volume, a sweep setting or the envelope.
  let lastGain = performance.now();
  let lastBest = best;
  const minimumMs = 800;
  while (!timeUp()) {
    if (isCancelled()) return null;
    const candidate = {...card, bars: card.bars.slice()};
    const kind = Math.random();
    if (kind < 0.8) {
      const changes = 1 + randomInt(3);
      for (let j = 0; j < changes; j++) {
        const i = randomInt(candidate.bars.length);
        candidate.bars[i] = clamp(candidate.bars[i] + randomInt(7) - 3, 0, DPC_WAVE_MAX);
      }
    } else if (kind < 0.88) {
      candidate.hz = clamp(Math.round(candidate.hz * (0.97 + Math.random() * 0.06) * 100) / 100, MIN_HZ, tone ? MAX_TONE_HZ : MAX_NOISE_HZ);
    } else if (kind < 0.93) {
      candidate.volume = clamp(candidate.volume + randomInt(3) - 1, 4, 15);
    } else if (kind < 0.93) {
      const e = candidates[randomInt(candidates.length)];
      Object.assign(candidate, {attack: e.attack, decay: e.decay, sustainLength: e.sustainLength, release: e.release,
        decayEnd: e.decayEnd, releaseStart: e.releaseStart});
    } else if (kind < 0.97 || !candidate.sweep) {
      bendFrequency(candidate);
    } else {
      if (Math.random() < 0.5) candidate.sweepEnd += randomInt(3) - 1;
      else {
        candidate.sweepStep = SWEEP_STEPS[randomInt(SWEEP_STEPS.length)];
        candidate.sweepFrames = SWEEP_FRAME_COUNTS[randomInt(SWEEP_FRAME_COUNTS.length)];
      }
    }
    if (tryCard(candidate) && best < lastBest * 0.995) {
      lastBest = best;
      lastGain = performance.now();
    }
    await maybeYield();
    // Stop early when nothing better has turned up for a while.
    const sinceStart = performance.now() - started;
    if (sinceStart > minimumMs && performance.now() - lastGain > Math.max(2500, sinceStart * 0.5)) break;
  }

  onProgress({fraction: 1, mismatch: best});
  const length = card.attack + card.decay + card.sustainLength + card.release;
  const wave = expandBars(card.bars);
  return {
    mismatch: best,
    mode: tone ? 'tone' : 'noise',
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
};

// The card settings the TIA sound of a card for both chips shares with its DPC+ sound (see fitTiaSample's options.fixed).
const sharedSettings = (fields) => ({
  volume: fields.audv, attack: fields.envelopeAttack, decay: fields.envelopeDecay, sustainLength: fields.envelopeSustainLength,
  release: fields.envelopeRelease, decayEnd: fields.envelopeDecayEnd, releaseStart: fields.envelopeReleaseStart,
  sweep: !!fields.sweep, sweepStep: fields.sweepStep, sweepFrames: fields.sweepFrames,
  pitchAmount: fields.pitchEnvelope ? fields.pitchEnvelopeAmount : 0, pitchAttack: fields.pitchEnvelopeAttack, pitchDecay: fields.pitchEnvelopeDecay,
  pitchSustainLength: fields.pitchEnvelopeSustainLength, pitchRelease: fields.pitchEnvelopeRelease,
  pitchDecayEnd: fields.pitchEnvelopeDecayEnd, pitchReleaseStart: fields.pitchEnvelopeReleaseStart,
});

// Fits a card for both chips: the DPC+ sound first, then the TIA sound, which shares its volume, envelope and the steps of its sweep.
// Resolves to {fields, mismatch (the worse of the two), dpcMismatch, tiaMismatch, mode: 'both', audc}, or null when cancelled.
export const fitBoth = async (prepared, options = {}) => {
  const {onProgress = () => {}} = options;
  const half = (from) => ({...options, onProgress: ({fraction}) => onProgress({fraction: from + fraction / 2})});
  const dpc = await fitSample(prepared, half(0));
  if (!dpc) return null;
  const tia = await fitTiaSample(prepared, {...half(0.5), fixed: sharedSettings(dpc.fields), noisy: dpc.mode === 'noise'});
  if (!tia) return null;
  return {
    mode: 'both', mismatch: Math.max(dpc.mismatch, tia.mismatch), dpcMismatch: dpc.mismatch, tiaMismatch: tia.mismatch, audc: tia.audc,
    fields: {...dpc.fields, audc: tia.fields.audc, audf: tia.fields.audf, ...(dpc.fields.sweep ? {sweepEnd: tia.fields.sweepEnd} : {})},
  };
};
