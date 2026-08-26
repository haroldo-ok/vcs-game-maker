'use strict';

import {findSoundEffectById, processSoundEffectsStorageDefaults} from '../../blocks/soundfx';
import {useConfigurationStorage, useDimSoundFxPercentStorage, useDimSoundFxStorage,
  useSoundEffectsStorage} from '../../hooks/project';
import {buildEnvelopeCurve, clampEnvelopeStages} from '../../utils/envelope';

// The DIM toggle's default percentage, used until the user picks their own
// on the slider next to it.
export const DEFAULT_DIM_PERCENT = 25;

// AUDV is write-only hardware (the TIA has no way to read it back), so
// dimming can't be a per-frame runtime override the way muteAllAudio is
// (see generateMuteAudio in generators/bbasic.js) - it has to be baked into
// each sound effect's own AUDV value at compile time instead, here.
export const dimVolume = (audv, percent) =>
  Math.round(Number(audv) * (Number(percent) / 100));

// 15 is never a meaningful envelope-config INDEX (a project realistically
// only ever generates a handful of distinct envelope shapes - see
// registerEnvelopeConfig below - and a nibble's own range, 0-15, comfortably
// covers however many it grows to), so it doubles as the "this channel's
// current sound has no envelope" sentinel - seeing it lets the per-frame
// check (generateEnvelopeChecks) skip leaving AUDV alone for ordinary,
// non-enveloped sounds sharing the same channel. Exported so
// generators/bbasic/music.js's own envelope-change marker can use the exact
// same sentinel value for "envelope off" on a music channel.
export const NO_ENVELOPE_SENTINEL = 15;

// Whether ANY sound effect preset on the SoundFX tab has its envelope
// enabled - checked directly against the tab's own stored data, rather than
// a flag set as a side effect of visiting some block during code
// generation, since block visitation order can't be relied on to see an
// envelope-enabled preset's own block before a plain one that happens to
// share its channel (see the per-sound-effect call site below, which needs
// this same answer for EVERY soundfx_play block, envelope-enabled or not,
// regardless of which one Blockly happens to generate first). Exported so
// generators/bbasic.js's own init() can gate the per-channel envelope-stage
// dev vars on the exact same condition.
export const anySoundEffectHasEnvelope = () => {
  try {
    // Muted soundfx_play calls never write a nonzero AUDV in the first
    // place (see the early return below), so there's nothing left for the
    // envelope system to ever act on - false here removes its own dev vars
    // and per-frame check from the compiled ROM too, not just the sounds
    // themselves.
    const configurationStorage = useConfigurationStorage();
    if (((configurationStorage && configurationStorage.value) || {}).muteAllAudio) return false;
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());
    return data.soundEffects.some((soundEffect) => !!soundEffect.envelope);
  } catch (e) {
    return false;
  }
};

// Whether any Music-tab channel actually plays an envelope-enabled
// instrument note - reads this.projectMusic (set once in
// generators/bbasic.js's own init(), before any of the functions below ever
// run) rather than importing anything from generators/bbasic/music.js
// directly, specifically to avoid a circular module dependency between the
// two files (music.js already imports from this file).
const anyMusicChannelHasEnvelope = (generatorThis) => {
  const channelHasEnvelope = (generatorThis.projectMusic || {}).channelHasEnvelope || {};
  return Object.values(channelHasEnvelope).some(Boolean);
};

// Every DISTINCT (attack, decay, release, sustainPercent, peakVolume)
// envelope shape actually used anywhere in the project - one-shot sound
// effects (soundfx_play below) AND Music-tab notes (see
// generators/bbasic/music.js's own call site) both register into this same
// pool, so two different presets/notes that happen to resolve to the exact
// same clamped shape only ever cost ONE pair of data tables. Module-level
// (not Blockly.BBasic state) specifically so music.js's own note-flattening
// functions - which don't have Blockly in scope, several call layers away
// from anything that does - can register configs without threading it
// through every intermediate function signature. Reset per compile by
// resetEnvelopeConfigs, called from generators/bbasic.js's own init().
let envelopeConfigs = new Map();
export const resetEnvelopeConfigs = () => {
  envelopeConfigs = new Map();
};

// Builds (and registers, deduped - see registerEnvelopeConfig below) the
// small per-stage data tables one distinct envelope SHAPE needs.
// attack/decay/release here are already
// CLAMPED to fit within this specific play's own duration (see the caller),
// so the dedup key doesn't need duration in it at all: attack ramps
// 0->peakVolume and decay ramps peakVolume->sustainVolume regardless of how
// long the sustain stretch between them and the sound's own end turns out
// to be, and release ramps sustainVolume->0 over its own last `release`
// frames regardless of when release actually starts - none of the three
// stage SHAPES depend on the sound's total duration once attack+decay+
// release already fits inside it.
//
// Split into two small tables (rather than one table the size of the whole
// sound) since the flat Sustain stretch between them needs no storage at
// all - just "do nothing, AUDV already holds the right value" at runtime
// (see generateEnvelopeChecks below).
//
// Both tables are deliberately built REVERSED, indexed by a live COUNTDOWN
// value rather than by elapsed-frames-since-start, so the per-frame check
// never needs a runtime subtraction:
//   - attackDecayTable[k] for k=1..attackDecayLength holds the value at
//     elapsed frame (attackDecayLength-k) - a per-channel countdown var is
//     set to attackDecayLength when the sound starts and decremented every
//     frame, so it can index this table DIRECTLY every frame it's nonzero.
//   - releaseTable[remaining] for remaining=1..releaseLength holds the
//     value at however many frames are left before the sound ends - and
//     channnel{N}duration (see soundfx_play below) ALREADY IS that exact
//     countdown, so no new var is needed for release at all, just a compare
//     against releaseLength (a compile-time constant per config).
// Index 0 in both tables is unused padding (the countdown/remaining value
// that means "this stage is over", never actually read).
const buildEnvelopeConfigTables = ({attack, decay, release, sustainPercent, peakVolume}) => {
  const attackDecayLength = attack + decay;
  const releaseLength = release;
  const curve = buildEnvelopeCurve({
    attack, decay, sustainPercent, release, peakVolume,
    totalFrames: Math.max(1, attackDecayLength + releaseLength),
  });
  const attackDecayTable = attackDecayLength ?
    Array.from({length: attackDecayLength + 1}, (_, k) => k === 0 ? 0 : curve[attackDecayLength - k]) : null;
  const releaseTable = releaseLength ?
    Array.from({length: releaseLength + 1},
        (_, remaining) => remaining === 0 ? 0 : curve[attackDecayLength + releaseLength - remaining]) : null;
  return {attackDecayLength, releaseLength, attackDecayTable, releaseTable};
};

// Registers (deduped by exact clamped shape) one envelope config into the
// shared pool above, returning its project-wide index (0-based, packed into
// a nibble per channel - see soundfx_play below/generateEnvelopeChecks).
// Index 0-14 only - 15 is NO_ENVELOPE_SENTINEL, reserved - so a project
// mixing enough distinct (attack, decay, release, sustain, peakVolume)
// shapes across every Sound Effect AND Music instrument combined (Music
// notes register one PER DISTINCT VOLUME they're played at on a given
// instrument - see music.js's own eventsToPages - so this is far easier to
// hit than it ever was with Sound Effects alone) would otherwise silently
// wrap/collide in that shared nibble, corrupting playback for whichever
// sound loses the collision. Caught here instead, at compile time.
export const registerEnvelopeConfig = ({attack, decay, release, sustainPercent, peakVolume}) => {
  const key = `${attack}:${decay}:${release}:${sustainPercent}:${peakVolume}`;
  if (envelopeConfigs.has(key)) return envelopeConfigs.get(key).index;
  if (envelopeConfigs.size >= NO_ENVELOPE_SENTINEL) {
    throw new Error(`This project uses ${envelopeConfigs.size + 1} distinct envelope shapes (combinations of ` +
      'Attack/Decay/Sustain/Release and peak volume) across its Sound Effects and Music instruments combined, ' +
      `but only ${NO_ENVELOPE_SENTINEL} are supported at once - try using fewer distinct volumes on ` +
      'envelope-enabled Music instruments, or sharing the same envelope settings across more Sound Effects.');
  }
  const index = envelopeConfigs.size;
  envelopeConfigs.set(key,
      {index, key, ...buildEnvelopeConfigTables({attack, decay, release, sustainPercent, peakVolume})});
  return index;
};

// Every registered config's own {index, attackDecayLength, releaseLength}
// (plus its tables, unused by this accessor's own callers) - exported so
// generators/bbasic/music.js's own buildEnvelopeMarkerSubroutine can build a
// compile-time compare chain mapping a marker's own runtime INDEX to its
// attackDecayLength, entirely inline in the RELOCATABLE musicEngine bank.
// Deliberately NOT a ROM data table read (an earlier version of this tried
// a shared `_envelopeAdLen[index]` table instead): _envelopeAd{n}/
// _envelopeRel{n} are only ever read from generateEnvelopeChecks, which -
// like the tables themselves - is always pinned to bank 1, so that
// cross-reference is safe; musicEngine's own per-channel code, in
// contrast, can get RELOCATED to a different bank entirely (see
// generateMusicChecks' own comment on this), and a ROM data table is
// bank-specific - reading one from a bank it doesn't live in fails to
// assemble. A compile-time if-chain has no such restriction, since it
// costs no cross-bank data reference at all.
export const getEnvelopeConfigs = () => [...envelopeConfigs.values()];

export default (Blockly) => {
  Blockly.BBasic['soundfx_play'] = function(block) {
    const channel = block.getFieldValue('CHANNEL');
    const soundEffect = findSoundEffectById(block.getFieldValue('SOUNDFX'));
    if (!soundEffect) {
      return `rem Sound effect not found\n`;
    }

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // Omitted outright, same reasoning as simple_sound_set's own identical
    // guard in generators/bbasic/sound.js - AUDV is real, unbuffered TIA
    // hardware, so still generating this code and relying on
    // generateMuteAudio's later, per-frame "AUDV = 0" override alone would
    // let this sound's own nonzero write briefly, audibly reach the speaker
    // first. Never generating it at all has no such gap, and costs nothing
    // in the compiled ROM.
    if (config.muteAllAudio) return 'rem Sound muted\n';

    const {audc, audf, audv, duration, envelope, envelopeAttack, envelopeDecay, envelopeSustain,
      envelopeRelease} = soundEffect;
    // App-wide preference (see useDimSoundFxStorage's own comment), not part
    // of this project's own saved configuration.
    const effectiveAudv = useDimSoundFxStorage().value ?
      dimVolume(audv, useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value) : audv;

    // Every soundfx_play - envelope-enabled or not - has to (re)set its
    // channel's own envelope-config nibble (and its own attack/decay
    // countdown, right below) as long as an envelope is used ANYWHERE in
    // the project: this sound's channel might previously have been playing
    // an enveloped sound, and without this, this plain sound would inherit
    // that stale envelope config once its own duration counts down far
    // enough to match it.
    let envelopeLines = '';
    if (anySoundEffectHasEnvelope()) {
      Blockly.BBasic.usesDivMul = true;
      const stageVar = this.nameDB_.getName(
          `envelopeStage${channel}`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      if (envelope) {
        const {attack, decay, release} = clampEnvelopeStages({
          attack: envelopeAttack, decay: envelopeDecay, release: envelopeRelease, totalFrames: duration,
        });
        const configIndex = registerEnvelopeConfig({
          attack, decay, release, sustainPercent: envelopeSustain, peakVolume: effectiveAudv,
        });
        envelopeLines = (channel === '1' ?
          `envelopeConfig = (envelopeConfig & $0F) | ${configIndex * 16}\n` :
          `envelopeConfig = (envelopeConfig & $F0) | ${configIndex}\n`) +
          `${stageVar} = ${attack + decay}\n`;
      } else {
        envelopeLines = (channel === '1' ?
          `envelopeConfig = (envelopeConfig & $0F) | ${NO_ENVELOPE_SENTINEL * 16}\n` :
          `envelopeConfig = (envelopeConfig & $F0) | ${NO_ENVELOPE_SENTINEL}\n`) +
          `${stageVar} = 0\n`;
      }
    }

    // channnel0duration/channnel1duration are only conditionally reserved
    // now (see this.channelDurationUsed's own pre-scan in
    // generators/bbasic.js's init()) - resolved through nameDB_ here rather
    // than left as a literal identifier, same as every other conditionally-
    // reserved dev var, so this always agrees with whatever letter/var that
    // pre-scan actually reserved.
    const durationVar = Blockly.BBasic.nameDB_.getName(
        `channnel${channel}duration`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `AUDV${channel}=0\n` +
      `AUDC${channel}=${audc}\n` +
      `AUDF${channel}=${audf}\n` +
      `AUDV${channel}=${effectiveAudv}\n` +
      `${durationVar}=${duration}\n` +
      envelopeLines;
  };

  // Dim for the shared envelope-config byte (see anySoundEffectHasEnvelope
  // above) - only emitted when at least one SoundFX preset actually has its
  // envelope on. var47 is the last of the four "var" slots that are safe
  // regardless of Superchip (see generateCollisionBoxDims's old reasoning,
  // or generateTextMinikernelDims's - var0-43 is the standard kernel's own
  // playfield buffer, var44 is TextIndex) - it can double as TextDataPtr's
  // high byte when the Text Minikernel's score-bar integration is also on,
  // which this would collide with in that specific combination; there is no
  // further safe slot to fall back to within the same 4-byte margin.
  Blockly.BBasic.generateEnvelopeDims = function() {
    if (!anySoundEffectHasEnvelope() && !anyMusicChannelHasEnvelope(this)) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const comment = (config.showVariableComments ?? true) ?
      '  ; both channels\' own envelope-config index (see registerEnvelopeConfig), packed one nibble each' : '';
    return `\n dim envelopeConfig = var47${comment}`;
  };

  // Every distinct envelope config's own attack+decay/release data tables
  // (see registerEnvelopeConfig) - always bank 1 (same reasoning as
  // generateEnvelopeChecks below), spliced into bbasic.bb.hbs right
  // alongside the data tables Data-tab tables use.
  Blockly.BBasic.generateEnvelopeDataTables = function() {
    const configs = [...envelopeConfigs.values()];
    if (!configs.length) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const showVariableComments = config.showVariableComments ?? true;
    const tableFor = (name, values) => !values ? '' :
      ` data ${name}\n  ${values.join(', ')}\nend`;
    return configs.map(({index, attackDecayTable, releaseTable}) => {
      const comment = showVariableComments ?
        `\n rem ; envelope config ${index}: attack+decay / release curves` : '';
      return comment + '\n' +
        [tableFor(`_envelopeAd${index}`, attackDecayTable), tableFor(`_envelopeRel${index}`, releaseTable)]
            .filter(Boolean).join('\n\n');
    }).join('\n\n');
  };

  // Spliced into commongamelogic right after the existing per-frame sound
  // duration handling (see bbasic.bb.hbs) - channel 0's envelope-config
  // index lives in the low nibble, channel 1's in the high nibble (see
  // soundfx_play above). Always fixed in bank 1 (unlike musicEngine's own
  // per-channel checks - see generateMusicChecks' own comment on why a raw
  // "asm...end" block broke there once relocated), so there's no far-branch/
  // relocation risk to worry about here - every branch target below is only
  // a few instructions away regardless.
  //
  // Hand-written 6502, following generateSoundFadeChecks' own retired
  // dispatch shape (X register holds the unpacked index; a compare-chain
  // falls through to whichever config actually matches, same
  // "no compare needed for the last option" trick), generalized from "look
  // up one frame count" to "look up one config's own pair of tables, plus
  // its own attack+decay length and release length" per index. Each
  // channel's own attack/decay countdown (envelopeStage{N}) is read/
  // decremented directly - see buildEnvelopeConfigTables' own comment for
  // why this needs no runtime subtraction; release instead compares
  // channnel{N}duration (already exists) against each config's own
  // compile-time-constant releaseLength.
  Blockly.BBasic.generateEnvelopeChecks = function() {
    const configs = [...envelopeConfigs.values()];
    if (!configs.length) return '';
    const channel0 = this.nameDB_.getName('channnel0duration', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const channel1 = this.nameDB_.getName('channnel1duration', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const stage0 = this.nameDB_.getName('envelopeStage0', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const stage1 = this.nameDB_.getName('envelopeStage1', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const channelHasMusicEnvelope = (this.projectMusic || {}).channelHasEnvelope || {};

    // A channel's own remaining-frames-until-the-note-ends source is
    // channnel{N}duration while a Sound Effect owns it, but a Music note
    // (not a Sound Effect) playing on the same physical channel never
    // touches that var at all - it counts down its OWN timer instead (see
    // musicTimerVarName in generators/bbasic/music.js). The two are already
    // mutually exclusive on one channel (see soundfx_play's own
    // suppressibleWrite gating in music.js), so picking whichever is
    // actually nonzero right now is enough - computed ONCE per channel
    // (into temp3), not once per config, so this costs a fixed handful of
    // bytes regardless of how many envelope configs exist. Channels whose
    // Music side never uses envelope skip this entirely and read
    // channnel{N}duration directly, same as before, at zero extra cost.
    const buildRemainingVar = (channel, durationVar) => {
      if (!channelHasMusicEnvelope[channel]) return {lines: [], remainingVar: durationVar};
      const musicTimerVar = this.nameDB_.getName(`_musicCh${channel}Timer`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const label = `_envelopeRemaining${channel}`;
      return {
        lines: [
          '       lda ' + durationVar,
          '       bne ' + label + '_isduration',
          '       lda ' + musicTimerVar,
          label + '_isduration',
          '       sta temp3',
        ],
        remainingVar: 'temp3',
      };
    };

    // One channel's own full dispatch: for every registered config, try it
    // against X (the unpacked index); the matching config's own block reads
    // its own attack/decay table (if this channel's own countdown is still
    // nonzero) and its own release table (if this channel's own remaining
    // duration/timer still falls within that config's own release window).
    const buildChannelDispatch = (tag, audvReg, remainingVar, stageVar) => {
      const lines = [];
      configs.forEach(({index, attackDecayLength, releaseLength}, i) => {
        const isLast = i === configs.length - 1;
        const label = `_envelope${tag}_cfg${index}`;
        if (!isLast) lines.push('       cpx #' + index, '       bne ' + label + '_skip');
        if (attackDecayLength) {
          lines.push(
              '       lda ' + stageVar,
              '       beq ' + label + '_ad_done',
              '       tay',
              '       lda _envelopeAd' + index + ',y',
              '       sta AUDV' + audvReg,
              '       dec ' + stageVar,
              label + '_ad_done',
          );
        }
        if (releaseLength) {
          lines.push(
              '       lda ' + remainingVar,
              '       cmp #' + (releaseLength + 1),
              '       bcs ' + label + '_rel_done',
              '       cmp #0',
              '       beq ' + label + '_rel_done',
              '       tay',
              '       lda _envelopeRel' + index + ',y',
              '       sta AUDV' + audvReg,
              label + '_rel_done',
          );
        }
        if (!isLast) {
          lines.push('       jmp _envelope' + tag + '_done', label + '_skip');
        }
      });
      lines.push('_envelope' + tag + '_done');
      return lines;
    };

    const remaining0 = buildRemainingVar('0', channel0);
    const remaining1 = buildRemainingVar('1', channel1);

    return [
      ' asm',
      '       lda envelopeConfig',
      '       and #$0F',
      '       cmp #' + NO_ENVELOPE_SENTINEL,
      '       beq _envelope0_done',
      ...remaining0.lines,
      '       lda envelopeConfig',
      '       and #$0F',
      '       tax',
      ...buildChannelDispatch('0', '0', remaining0.remainingVar, stage0),
      '       lda envelopeConfig',
      '       lsr',
      '       lsr',
      '       lsr',
      '       lsr',
      '       cmp #' + NO_ENVELOPE_SENTINEL,
      '       beq _envelope1_done',
      ...remaining1.lines,
      '       lda envelopeConfig',
      '       lsr',
      '       lsr',
      '       lsr',
      '       lsr',
      '       tax',
      ...buildChannelDispatch('1', '1', remaining1.remainingVar, stage1),
      'end',
    ].join('\n');
  };
};
