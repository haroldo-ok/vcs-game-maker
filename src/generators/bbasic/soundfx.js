'use strict';

import {findSoundEffectById, processSoundEffectsStorageDefaults} from '../../blocks/soundfx';
import {useConfigurationStorage,
  useSoundEffectsStorage} from '../../hooks/project';
import {buildEnvelopeCurve, clampEnvelopeStages} from '../../utils/envelope';
import {fixedFreeVariable} from '../../utils/fixed-vars';

// The DIM toggle's default percentage, used until the user picks a value
// on the slider next to it.
export const DEFAULT_DIM_PERCENT = 25;

// A sound's volume at the DIM percentage. The Sound and Music tabs' previews use it; the
// emulator scales its output by the same percentage (public/index.html's
// playGopher2600AudioChunk), and the compiled ROM always keeps the full volume.
export const dimVolume = (audv, percent) =>
  Math.round(Number(audv) * (Number(percent) / 100));

// 15 is never a meaningful envelope-config INDEX (a project realistically
// only ever generates a handful of distinct envelope shapes - see
// registerEnvelopeConfig below - and a nibble's  range, 0-15, comfortably
// covers however many it grows to), so it doubles as the "this channel's
// current sound has no envelope" sentinel - seeing it lets the per-frame
// check (generateEnvelopeChecks) skip leaving AUDV alone for ordinary,
// non-enveloped sounds sharing the same channel. Exported so
// generators/bbasic/music.js's  envelope-change marker can use the exact
// same sentinel value for "envelope off" on a music channel.
export const NO_ENVELOPE_SENTINEL = 15;

// Whether ANY sound effect preset on the SoundFX tab has its envelope
// enabled - checked directly against the tab's  stored data, rather than
// a flag set as a side effect of visiting some block during code
// generation, since block visitation order can't be relied on to see an
// envelope-enabled preset's  block before a plain one that happens to
// share its channel (see the per-sound-effect call site below, which needs
// this same answer for EVERY soundfx_play block, envelope-enabled or not,
// regardless of which one Blockly happens to generate first). Exported so
// generators/bbasic.js's  init() can gate the per-channel envelope-stage
// dev vars on the exact same condition.
export const anySoundEffectHasEnvelope = () => {
  try {
    // Muted soundfx_play calls never write a nonzero AUDV in the first
    // place (see the early return below), so there's nothing left for the
    // envelope system to ever act on - false here removes its  dev vars
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

// Same idea, but for one SPECIFIC channel - unlike anySoundEffectHasEnvelope
// above (deliberately "any preset, anywhere," since that's what decides
// whether the shared envelopeConfig byte/per-frame check/data tables need to
// exist in the ROM AT ALL), this is for generators/bbasic.js's
// envelopeStage0/envelopeStage1 reservation, which needs to know PER CHANNEL
// whether it's actually needed. CHANNEL is a fixed dropdown field on
// soundfx_play (not a runtime expression - see blocks/soundfx.js), so which
// channel each trigger targets is fully known at compile time, the same way
// resolveProjectMusic's  per-channel channelHasEnvelope already is for
// Music tracks - this only differs by also requiring the block to actually
// reference a preset with Envelope on, not just exist.
export const soundEffectChannelHasEnvelope = (workspace, channel) => {
  try {
    const configurationStorage = useConfigurationStorage();
    if (((configurationStorage && configurationStorage.value) || {}).muteAllAudio) return false;
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());
    return workspace.getAllBlocks(false).some((block) =>
      block.type === 'soundfx_play' && block.isEnabled() &&
      `${block.getFieldValue('CHANNEL')}` === `${channel}` &&
      data.soundEffects.some((soundEffect) =>
        `${soundEffect.id}` === `${block.getFieldValue('SOUNDFX')}` && !!soundEffect.envelope));
  } catch (e) {
    return false;
  }
};

// Whether any Music-tab channel actually plays an envelope-enabled
// instrument note - reads this.projectMusic (set once in
// generators/bbasic.js's  init(), before any of the functions below ever
// run) rather than importing anything from generators/bbasic/music.js
// directly, specifically to avoid a circular module dependency between the
// two files (music.js already imports from this file).
const anyMusicChannelHasEnvelope = (generatorThis) => {
  const channelHasEnvelope = (generatorThis.projectMusic || {}).channelHasEnvelope || {};
  return Object.values(channelHasEnvelope).some(Boolean);
};

// Every DISTINCT (attack, decay, release, decayEndPercent,
// releaseStartPercent, peakVolume) envelope shape actually used anywhere in
// the project - one-shot sound
// effects (soundfx_play below) AND Music-tab notes (see
// generators/bbasic/music.js's  call site) both register into this same
// pool, so two different presets/notes that happen to resolve to the exact
// same clamped shape only ever cost ONE pair of data tables. Module-level
// (not Blockly.BBasic state) specifically so music.js's  note-flattening
// functions - which don't have Blockly in scope, several call layers away
// from anything that does - can register configs without threading it
// through every intermediate function signature. Reset per compile by
// resetEnvelopeConfigs, called from generators/bbasic.js's  init().
let envelopeConfigs = new Map();
export const resetEnvelopeConfigs = () => {
  envelopeConfigs = new Map();
};

// Builds (and registers, deduped - see registerEnvelopeConfig below) the
// one data table one distinct envelope SHAPE needs. Unlike before
// `loopSustain` existed, attack/decay/sustainLength/release here are the
// RAW, unclamped values straight from the instrument preset, not already
// clamped to this specific play's duration - clamping now happens INSIDE
// this function (via clampEnvelopeStages/buildEnvelopeCurve, both passed
// the real totalFrames and loopSustain directly) rather than by the caller
// beforehand, so that buildEnvelopeCurve's Sustain-loop logic can still
// tell "the length the preset configured" apart from "the length Sustain
// actually got extended to" - a distinction a caller that pre-clamped
// before calling this would otherwise erase. The dedup key (see
// registerEnvelopeConfig below) includes totalFrames and loopSustain for
// exactly that reason - this function's result now genuinely depends on
// them, not just on the four stage shapes.
//
// A SINGLE combined table spanning attack+decay+sustain+release together
// (not split attack/decay vs. release the way this used to be, back when
// Sustain had no length and Release always ended exactly on the
// sound/note's last frame - that split let Release reuse
// channnel{N}duration directly as its countdown, needing no table
// entries for the Sustain gap at all). Now that Sustain has a real,
// independent length and Release starts right after it instead of at a
// fixed end point, there's no longer a "remaining time until the note ends"
// value that reliably marks Release's position - so this folds
// everything into ONE table read by ONE countdown instead, costing one real
// byte per Sustain frame it didn't used to need, in exchange for a simpler
// single-countdown runtime mechanism (see generateEnvelopeChecks below).
//
// Deliberately built REVERSED, indexed by a live COUNTDOWN value rather
// than by elapsed-frames-since-start, so the per-frame check never needs a
// runtime subtraction: table[k] for k=1..envelopeLength holds the value at
// elapsed frame (envelopeLength-k) - a per-channel countdown var is set to
// envelopeLength when the sound starts and decremented every frame, so it
// can index this table DIRECTLY every frame it's nonzero. Index 0 is unused
// padding (the countdown value that means "envelope is over", never
// actually read - AUDV just stays wherever the last real write left it,
// same "leave it alone" convention Sustain's gap already relied on).
const buildEnvelopeConfigTables = ({attack, decay, sustainLength, release, decayEndPercent, releaseStartPercent,
  peakVolume, totalFrames, loopSustain}) => {
  const {attack: a, decay: d, sustainLength: s, release: r} =
    clampEnvelopeStages({attack, decay, sustainLength, release, totalFrames, loopSustain});
  const envelopeLength = a + d + s + r;
  const curve = buildEnvelopeCurve({
    attack, decay, decayEndPercent, sustainLength, releaseStartPercent, release, peakVolume, totalFrames,
    loopSustain,
  });
  const envelopeTable = envelopeLength ?
    Array.from({length: envelopeLength + 1}, (_, k) => k === 0 ? 0 : curve[envelopeLength - k]) : null;
  return {envelopeLength, envelopeTable};
};

// Registers (deduped by exact clamped shape) one envelope config into the
// shared pool above, returning its project-wide index (0-based, packed into
// a nibble per channel - see soundfx_play below/generateEnvelopeChecks).
// Index 0-14 only - 15 is NO_ENVELOPE_SENTINEL, reserved - so a project
// mixing enough distinct (attack, decay, release, sustain, peakVolume)
// shapes across every Sound Effect AND Music instrument combined (Music
// notes register one PER DISTINCT VOLUME they're played at on a given
// instrument - see music.js's  eventsToPages - so this is far easier to
// hit than it ever was with Sound Effects alone) would otherwise silently
// wrap/collide in that shared nibble, corrupting playback for whichever
// sound loses the collision. Caught here instead, at compile time.
export const registerEnvelopeConfig = ({attack, decay, sustainLength, release, decayEndPercent, releaseStartPercent,
  peakVolume, totalFrames, loopSustain = false}) => {
  const key = `${attack}:${decay}:${sustainLength}:${release}:${decayEndPercent}:${releaseStartPercent}:` +
    `${peakVolume}:${totalFrames}:${loopSustain}`;
  if (envelopeConfigs.has(key)) return envelopeConfigs.get(key).index;
  if (envelopeConfigs.size >= NO_ENVELOPE_SENTINEL) {
    throw new Error(`This project uses ${envelopeConfigs.size + 1} distinct envelope shapes (combinations of ` +
      'Attack/Decay/Sustain/Release and peak volume) across its Sound Effects and Music instruments combined, ' +
      `but only ${NO_ENVELOPE_SENTINEL} are supported at once - try using fewer distinct volumes on ` +
      'envelope-enabled Music instruments, or sharing the same envelope settings across more Sound Effects.');
  }
  const index = envelopeConfigs.size;
  envelopeConfigs.set(key, {index, key, ...buildEnvelopeConfigTables({attack, decay, sustainLength, release,
    decayEndPercent, releaseStartPercent, peakVolume, totalFrames, loopSustain})});
  return index;
};

// Every registered config's {index, envelopeLength} (plus its table,
// unused by this accessor's  callers) - exported so generators/bbasic/
// music.js's  buildEnvelopeMarkerSubroutine can build a compile-time
// compare chain mapping a marker's  runtime INDEX to its envelopeLength,
// entirely inline in the RELOCATABLE musicEngine bank.
// Deliberately NOT a ROM data table read (an earlier version of this tried
// a shared `_envelopeAdLen[index]` table instead): _envelopeAd{n}/
// _envelopeRel{n} are only ever read from generateEnvelopeChecks, which -
// like the tables themselves - is always pinned to bank 1, so that
// cross-reference is safe; musicEngine's  per-channel code, in
// contrast, can get RELOCATED to a different bank entirely (see
// generateMusicChecks'  comment on this), and a ROM data table is
// bank-specific - reading one from a bank it doesn't live in fails to
// assemble. A compile-time if-chain has no such restriction, since it
// costs no cross-bank data reference at all.
export const getEnvelopeConfigs = () => [...envelopeConfigs.values()];

export default (Blockly) => {
  Blockly.BBasic['soundfx_play'] = function(block) {
    const channel = Blockly.BBasic.normalizeChannel(block.getFieldValue('CHANNEL'));
    // Channels 0 and 1 keep their envelope config in one byte (low and high nibble), channels 2 and 3 in another.
    const high = Number(channel) % 2 === 1;
    const configVar = Number(channel) < 2 ? 'envelopeConfig' : 'envelopeConfigB';
    const soundEffect = findSoundEffectById(block.getFieldValue('SOUNDFX'));
    if (!soundEffect) {
      return `rem Sound effect not found\n`;
    }

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // Omitted outright, same reasoning as simple_sound_set's  identical
    // guard in generators/bbasic/sound.js - AUDV is real, unbuffered TIA
    // hardware, so still generating this code and relying on
    // generateMuteAudio's later, per-frame "AUDV = 0" override alone would
    // let this sound's  nonzero write briefly, audibly reach the speaker
    // first. Never generating it at all has no such gap, and costs nothing
    // in the compiled ROM.
    if (config.muteAllAudio) return 'rem Sound muted\n';

    const {audc, audf, audv, duration, envelope, envelopeAttack, envelopeDecay, envelopeDecayEnd,
      envelopeReleaseStart, envelopeSustainLength, envelopeRelease} = soundEffect;
    // App-wide preference (see useDimSoundFxStorage's  comment), not part
    // of this project's  saved configuration.
    const effectiveAudv = audv;

    // Every soundfx_play - envelope-enabled or not - has to (re)set its
    // channel's  envelope-config nibble (and its  attack/decay
    // countdown, right below) as long as an envelope is used ANYWHERE in
    // the project: this sound's channel might previously have been playing
    // an enveloped sound, and without this, this plain sound would inherit
    // that stale envelope config once its  duration counts down far
    // enough to match it.
    let envelopeLines = '';
    // The per-channel envelope state (the stage countdown, and the check that
    // reads it every frame) only exists when generators/bbasic.js reserved it for
    // this channel, which needs a sound or music note on that channel that has an
    // envelope. A plain sound on a channel that has none, in a project where some
    // other preset has an envelope, has nothing to reset and must not write the
    // stage variable (it was never declared: "Unknown Mnemonic").
    const stageReserved = !!Blockly.BBasic[`envelopeStage${channel}Used`];
    if (anySoundEffectHasEnvelope() && stageReserved) {
      Blockly.BBasic.usesDivMul = true;
      // Blockly.BBasic.nameDB_, not this.nameDB_ - a block generator like
      // this one is invoked as "func.call(block, block)" by Blockly's
      // blockToCode (see node_modules/blockly/core/generator.js), so `this`
      // here is the BLOCK being visited, not the generator instance - it has
      // no nameDB_. durationVar just below already resolves
      // through the correct Blockly.BBasic.nameDB_ path; this one didn't,
      // a real reported crash ("Cannot read properties of undefined
      // (reading 'getName')") the moment a project actually had an
      // envelope-enabled Sound FX preset - the only case that reaches this
      // branch at all.
      const stageVar = Blockly.BBasic.nameDB_.getName(
          `envelopeStage${channel}`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      if (envelope) {
        // Still clamped here (not just left to registerEnvelopeConfig's
        // internal clamp) because this needs the resulting stage lengths
        // directly, for stageVar's countdown below - loopSustain omitted
        // (defaults false) since Sound Effects never loop Sustain to fill a
        // too-short Duration (see utils/envelope.js's comment on
        // clampEnvelopeStages), the same default registerEnvelopeConfig
        // itself uses, so both calls agree.
        const {attack, decay, sustainLength, release} = clampEnvelopeStages({
          attack: envelopeAttack, decay: envelopeDecay, sustainLength: envelopeSustainLength,
          release: envelopeRelease, totalFrames: duration,
        });
        // The RAW envelopeAttack/Decay/SustainLength/Release values (not
        // the clamped ones just above), plus totalFrames - not a redundant
        // repeat of the clamp above, since buildEnvelopeConfigTables needs
        // to do that clamp itself to tell "configured length" apart from
        // "extended length" (see its comment); passing already-clamped
        // values in would erase that distinction.
        const configIndex = registerEnvelopeConfig({
          attack: envelopeAttack, decay: envelopeDecay, sustainLength: envelopeSustainLength,
          release: envelopeRelease, decayEndPercent: envelopeDecayEnd, releaseStartPercent: envelopeReleaseStart,
          peakVolume: effectiveAudv, totalFrames: duration,
        });
        envelopeLines = (high ?
          `${configVar} = (${configVar} & $0F) | ${configIndex * 16}\n` :
          `${configVar} = (${configVar} & $F0) | ${configIndex}\n`) +
          `${stageVar} = ${attack + decay + sustainLength + release}\n`;
      } else {
        envelopeLines = (high ?
          `${configVar} = (${configVar} & $0F) | ${NO_ENVELOPE_SENTINEL * 16}\n` :
          `${configVar} = (${configVar} & $F0) | ${NO_ENVELOPE_SENTINEL}\n`) +
          `${stageVar} = 0\n`;
      }
    }

    // channnel0duration/channnel1duration are only conditionally reserved
    // now (see this.channelDurationUsed's  pre-scan in
    // generators/bbasic.js's init()) - resolved through nameDB_ here rather
    // than left as a literal identifier, same as every other conditionally-
    // reserved dev var, so this always agrees with whatever letter/var that
    // pre-scan actually reserved.
    const durationVar = Blockly.BBasic.nameDB_.getName(
        `channnel${channel}duration`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    // Under DPC+ the waveform and the pitch of the sound (see generators/bbasic/dpcplus-audio.js).
    // The chip's channels are played by the chip; channel 1 stays on the TIA with the sound's Standard type and frequency.
    const dpcPlan = Blockly.BBasic.dpcAudioPlan && Blockly.BBasic.dpcAudioPlan.isChannel(channel) ?
      Blockly.BBasic.dpcAudioPlan : null;
    return `AUDV${channel}=0\n` +
      `AUDC${channel}=${dpcPlan ? dpcPlan.waveIdForSound(soundEffect) : audc}\n` +
      `AUDF${channel}=${dpcPlan ? dpcPlan.pitchIdForSound(soundEffect) : audf}\n` +
      `AUDV${channel}=${effectiveAudv}\n` +
      `${durationVar}=${duration}\n` +
      envelopeLines;
  };

  // Dim for the shared envelope-config byte (see anySoundEffectHasEnvelope
  // above) - only emitted when at least one SoundFX preset actually has its
  // envelope on. var47 is the last of the four "var" slots that are safe
  // regardless of Superchip (see generateCollisionBoxDims's old reasoning,
  // or generateTextMinikernelDims's - var0-43 is the standard kernel's
  // playfield buffer, var44 is TextIndex) - it can double as TextDataPtr's
  // high byte when the Text Minikernel's score-bar integration is also on,
  // which this would collide with in that specific combination; there is no
  // further safe slot to fall back to within the same 4-byte margin.
  Blockly.BBasic.generateEnvelopeDims = function() {
    if (!anySoundEffectHasEnvelope() && !anyMusicChannelHasEnvelope(this)) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const comment = (config.showVariableComments ?? true) ?
      '  ; both channels\' envelope-config index (see registerEnvelopeConfig), packed one nibble each' : '';
    if (config.kernel === 'dpcplus') return '';
    return `\n dim envelopeConfig = ${fixedFreeVariable(config, 47)}${comment}`;
  };

  // Every distinct envelope config's single combined data table (see
  // registerEnvelopeConfig/buildEnvelopeConfigTables) - folded directly into
  // generateEnvelopeChecks' relocatable payload below (see that
  // function's  comment on why), not spliced separately into bbasic.bb.hbs's
  // fixed data-tables section the way Data-tab tables are - these are read
  // via absolute addressing ("lda _envelope0,y") from the check code itself,
  // so they have to physically travel wherever that code ends up, exactly
  // the same "data table follows its  relocatable code" reasoning
  // generateMusicChecks'  _envelopeAdLen table already establishes (see
  // its  comment in generators/bbasic/music.js).
  const buildEnvelopeDataTables = () => {
    const configs = [...envelopeConfigs.values()];
    if (!configs.length) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const showVariableComments = config.showVariableComments ?? true;
    return configs.map(({index, envelopeTable}) => {
      if (!envelopeTable) return '';
      const comment = showVariableComments ?
        `\n rem ; envelope config ${index}: attack+decay+sustain+release curve` : '';
      // 16 values to a line: batari Basic refuses a data line much longer than that ("Maximum line length exceeded in
      // data statement"), which a long Sustain made.
      const lines = [];
      for (let i = 0; i < envelopeTable.length; i += 16) lines.push(`  ${envelopeTable.slice(i, i + 16).join(', ')}`);
      return `${comment}\n data _envelope${index}\n${lines.join('\n')}\nend`;
    }).filter(Boolean).join('\n\n');
  };

  // Spliced into commongamelogic right after the existing per-frame sound
  // duration handling (see bbasic.bb.hbs) - channel 0's envelope-config
  // index lives in the low nibble, channel 1's in the high nibble (see
  // soundfx_play above). The per-frame TRIGGER here has to stay bank-1-fixed
  // (commongamelogic runs every frame via plain fallthrough, not goto/gosub,
  // so it can't itself move) - but the asm BODY below (plus its  data
  // tables, see buildEnvelopeDataTables above) is wrapped via
  // wrapRelocatableGraphics at the very end of this function, the exact same
  // "code + its  data table, one combined payload" pattern
  // generateMusicChecks/wrapRelocatableMusic already use for the music
  // engine - a goto-entry/return-bank1 trampoline replaces this whole block
  // in commongamelogic once it's actually relocated, same as any other
  // graphics/music unit. Every branch target inside this asm block is
  // private to it (confirmed directly: nothing anywhere else in this
  // codebase goto/gosub/jmps into any label it defines), so relocating the
  // whole thing as one contiguous unit is safe - only cross-unit jumps ever
  // needed the far-branch/trampoline treatment to begin with.
  //
  // Hand-written 6502, following generateSoundFadeChecks'  retired
  // dispatch shape (X register holds the unpacked index; a compare-chain
  // falls through to whichever config actually matches, same
  // "no compare needed for the last option" trick), generalized from "look
  // up one frame count" to "look up one config's combined table,
  // plus its  envelopeLength" per index. Each channel's envelope
  // countdown (envelopeStage{N}, now covering attack+decay+sustain+release
  // together, not just attack+decay - see buildEnvelopeConfigTables'
  // comment) is read/decremented directly, needing no runtime subtraction
  // and no separate release-timing mechanism at all - since Sustain used to
  // have no length and Release always ended exactly on the
  // sound/note's last frame, release used to be able to piggyback on
  // channnel{N}duration directly instead of needing its countdown; now
  // that Release starts right after an independently-lengthed Sustain
  // instead, that shortcut no longer applies, so this is simpler than it
  // used to be in a different way - one countdown, one table, no separate
  // release branch or remaining-duration lookup.
  Blockly.BBasic.generateEnvelopeChecks = function() {
    const configs = [...envelopeConfigs.values()];
    if (!configs.length) return '';
    // Lazy (not resolved up front) - resolveVar/nameDB_.getName allocates a
    // real letter the first time it's called, independent of whether
    // generators/bbasic.js's  reservation gate (envelopeStage0Used/
    // envelopeStage1Used) actually reserved it, so these can only be called
    // from inside each channel's  section below, guarded by that exact
    // same flag - same hazard/fix shape as buildTextScrollSetupLines'
    // comment in text-scroll.js.

    // One channel's  full dispatch: for every registered config, try it
    // against X (the unpacked index); the matching config's  block reads
    // its  combined table while this channel's  countdown is still
    // nonzero.
    const buildChannelDispatch = (tag, audvReg, stageVar) => {
      const lines = [];
      configs.forEach(({index, envelopeLength}, i) => {
        const isLast = i === configs.length - 1;
        const label = `_envelope${tag}_cfg${index}`;
        if (!isLast) lines.push('       cpx #' + index, '       bne ' + label + '_skip');
        if (envelopeLength) {
          lines.push(
              '       lda ' + stageVar,
              '       beq ' + label + '_done',
              '       tay',
              '       lda _envelope' + index + ',y',
              '       sta AUDV' + audvReg,
              '       dec ' + stageVar,
              label + '_done',
          );
        }
        if (!isLast) {
          lines.push('       jmp _envelope' + tag + '_done', label + '_skip');
        }
      });
      lines.push('_envelope' + tag + '_done');
      return lines;
    };

    // Each channel's  section (the runtime "is this channel's  nibble
    // actually a real config, or NO_ENVELOPE_SENTINEL" guard, plus its
    // dispatch) is only built at all - and so only ever resolves that
    // channel's  stage var - when generators/bbasic.js's  pre-scan
    // (envelopeStage0Used/envelopeStage1Used) found it genuinely needed;
    // omitted entirely otherwise, so a project using envelope on only one
    // channel never references (or reserves) the other channel's  var.
    // One channel's section. Channels 0 and 1 share envelopeConfig (low and high nibble) and channels 2 and 3 (the DPC+
    // chip's second and third voices) share envelopeConfigB.
    const channelSection = (channel) => {
      if (!this[`envelopeStage${channel}Used`]) return [];
      const high = channel % 2 === 1;
      const configVar = channel < 2 ? 'envelopeConfig' : 'envelopeConfigB';
      return [
        // X holds the unpacked nibble from here through buildChannelDispatch below - tax'd immediately (instead of
        // re-reading/re-masking the config a second time right before the dispatch).
        `       lda ${configVar}`,
        ...(high ? ['       lsr', '       lsr', '       lsr', '       lsr'] : ['       and #$0F']),
        '       tax',
        '       cpx #' + NO_ENVELOPE_SENTINEL,
        // A plain BEQ over the dispatch used to run out of range once a project registered enough configs ("Branch
        // out of range"): the inverted branch over a JMP has no such limit.
        `       bne _envelope${channel}_hasconfig`,
        `       jmp _envelope${channel}_done`,
        `_envelope${channel}_hasconfig`,
        ...buildChannelDispatch(`${channel}`, `${channel}`,
            this.nameDB_.getName(`envelopeStage${channel}`, Blockly.Names.DEVELOPER_VARIABLE_TYPE)),
      ];
    };

    const asmBlock = [
      ' asm',
      ...[0, 1, 2, 3].flatMap(channelSection),
      'end',
    ].join('\n');
    // One combined payload (code + its  data tables) wrapped as a single
    // relocatable unit - see this function's  top comment for why. Reuses
    // the graphics pool (not a new one, and not music's  separate pool -
    // this is a single small unit, not something that needs its
    // reserved bank the way music's  per-project engine does).
    const payload = [asmBlock, buildEnvelopeDataTables()].filter(Boolean).join('\n\n');
    return Blockly.BBasic.wrapRelocatableGraphics('soundfxEnvelopeChecks', payload);
  };
};
