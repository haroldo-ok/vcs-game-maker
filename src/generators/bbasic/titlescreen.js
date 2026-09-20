'use strict';

import {TITLE_SCREEN_KERNEL_TYPES, MAX_KERNEL_COPIES_PER_TYPE,
  processTitleScreenStorageDefaults} from '../../blocks/titlescreen';
import {useTitleScreenStorage, usePlayerAnimationsStorage,
  useConfigurationStorage} from '../../hooks/project';
import {processPlayerAnimationsStorageDefaults} from './sprites';
import {resolveScoreDigitBytes} from '../../utils/score-font';

// Packs one pixel row (an array of 0/1 values, PixelEditor.vue's own
// format) into one byte per 8-pixel-wide column block, left pixel = high
// bit - matches the sample data shipped in the kernel's own *_image.asm
// files (e.g. "BYTE %11101110" reading left-to-right as drawn).
const packRowToBytes = (row, blockCount) => {
  const bytes = [];
  for (let b = 0; b < blockCount; b++) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (row[b * 8 + bit]) byte |= (1 << (7 - bit));
    }
    bytes.push(byte);
  }
  return bytes;
};

const toBinaryByte = (n) => `%${(n & 0xff).toString(2).padStart(8, '0')}`;
const toHexByte = (n) => `$${(n & 0xff).toString(16).padStart(2, '0')}`;

// One card's own image data block, in the exact format the Titlescreen
// Kernel's own *_image.asm files use (see public/bb19/titlescreen/ - this
// mirrors 48x1_N_image.asm/48x2_N_image.asm/96x2_N_image.asm exactly,
// generated instead of hand-edited). window defaults to the full image
// height (the whole image shown, no scrolling) unless the card has its own
// scrollWindow set smaller - see card.scrollWindow's own comment in
// blocks/titlescreen.js for the runtime scroll-index byte this also
// declares in that case (bmp_${key}_index, read directly by the kernel's
// own per-copy asm via "ifconst").
const buildCardDataAsm = (card, key, typeInfo) => {
  const {blockCount, doubleLine, hasRowColors} = typeInfo;
  const rows = card.pixels && card.pixels.length ? card.pixels : [new Array(typeInfo.width).fill(0)];
  const height = rows.length;
  const scrollWindow = Number(card.scrollWindow) || 0;
  const windowHeight = (scrollWindow > 0 && scrollWindow < height) ? scrollWindow : height;
  // The kernel reads each column-block's own bytes bottom-to-top (same
  // reasoning as the row-colors list just below) - without reversing here
  // too, the image drew upside down: pixel rows and row colors both come
  // from the SAME top-to-bottom UI data, so both need the identical
  // reversal to stay correctly paired AND right-side up.
  const blockRows = Array.from({length: blockCount}, () => []);
  [...rows].reverse().forEach((row) => {
    packRowToBytes(row, blockCount).forEach((byte, b) => blockRows[b].push(byte));
  });

  const lines = [
    `bmp_${key}_window = ${windowHeight}`,
    `bmp_${key}_height = ${height}`,
  ];

  // A real, writable RAM byte (not a compile-time constant, same reasoning
  // as titlescreencolor - see registerTitleScreenSubroutine's own comment)
  // - only declared when this card is actually scrolling (window smaller
  // than the full image), matching the per-copy kernel file's own
  // "ifconst bmp_TYPE_N_index" check, which skips the extra subtraction
  // entirely when a card never scrolls. Referenced directly by name (no
  // "dim" needed) from the "Set title screen scroll position" block's own
  // generator, the same way titlescreen_draw already references
  // titlescreencolor directly.
  if (windowHeight < height) {
    lines.push(
        `bmp_${key}_index`,
        '\t.byte 0',
    );
  }

  if (hasRowColors) {
    // The color list is read bottom-to-top by the kernel (see e.g.
    // 48x2_1_image.asm's own "in reverse order" comment) - reversed here
    // so the UI's own top-to-bottom row color list doesn't need to think
    // about that.
    lines.push(
        `   if >. != >[.+(bmp_${key}_height)]`,
        '      align 256',
        '   endif',
        ' BYTE 0 ; leave this here!',
        '',
        `bmp_${key}_colors`,
        ...[...(card.rowColors || [])].reverse().map((color) => `\tBYTE ${toHexByte(color)}`),
    );
  }

  if (!doubleLine) {
    // 48x1 only - a single fixed color for the whole image, no per-row list.
    lines.push(
        `bmp_${key}_color`,
        `\t.byte ${toHexByte(card.color || 0)}`,
    );
  }

  // Only the 48-wide kernels support a playfield background box behind the
  // image (see the kernel doc's own Example 5) - 96x2 has no PF1/PF2/
  // background fields at all.
  if (typeInfo.width === 48) {
    lines.push(
        `bmp_${key}_PF1`,
        `\tBYTE ${toBinaryByte(card.pf1 || 0)}`,
        `bmp_${key}_PF2`,
        `\tBYTE ${toBinaryByte(card.pf2 || 0)}`,
        `bmp_${key}_background`,
        `\tBYTE ${toHexByte(card.background || 0)}`,
    );
  }

  for (let b = 0; b < blockCount; b++) {
    lines.push(
        `   if >. != >[.+bmp_${key}_height]`,
        '\talign 256',
        '   endif',
        `bmp_${key}_${String(b).padStart(2, '0')}`,
        ...blockRows[b].map((byte) => `\tBYTE ${toBinaryByte(byte)}`),
        '',
    );
  }

  return lines.join('\n');
};

// Resolves a "player" card's own player0Animation/player1Animation field
// (an index into the shared animation pool, same convention as
// sprite_player_animation_select's own dropdown - see blocks/sprites.js's
// own buildAnimationOptions) into the actual frame data the kernel's own
// player_kernel.asm needs. An unresolved/empty slot falls back to a single
// blank (all-zero) row - GRP0/GRP1 draw nothing for a zero byte regardless
// of position or color, so a slot nobody configured is always safe to leave
// wherever the game happens to have last positioned that player.
const resolvePlayerSlotFrames = (animationIndex) => {
  const blank = {height: 1, frames: [[new Array(8).fill(0)]], hasRowColors: false};
  if (animationIndex === undefined || animationIndex === null || animationIndex === '') return blank;
  const player = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage());
  const animation = player.animations[Number(animationIndex)];
  if (!animation || !animation.frames || !animation.frames.length) return blank;
  // The kernel indexes frames as one flat array, a fixed number of rows
  // apart (see the kernel doc's own "setting the index to 0, 10, 20..."
  // example) - that only works if every frame is the SAME height, so every
  // frame here is padded/truncated to the FIRST frame's own height rather
  // than keeping its own (an animation with mismatched frame heights, e.g.
  // "Resizing a frame's height" applied to only one frame, loses whatever
  // extra/short rows don't fit that first frame's shape).
  const height = (animation.frames[0].pixels && animation.frames[0].pixels.length) || 1;
  const hasRowColors = !!(animation.frames[0].rowColors && animation.frames[0].rowColors.length);
  const frames = animation.frames.map((frame) => {
    const rows = [];
    for (let i = 0; i < height; i++) {
      rows.push({
        pixels: (frame.pixels && frame.pixels[i]) || new Array(8).fill(0),
        color: hasRowColors ? ((frame.rowColors && frame.rowColors[i]) || 0) : undefined,
      });
    }
    return rows;
  });
  return {height, frames, hasRowColors};
};

// The "player" minikernel's own data block - see public/bb19/titlescreen/
// player_kernel.asm and the kernel doc's own "Example 5" for the format
// this mirrors (bmp_player_window/bmp_player_kernellines/bmp_playerN_height/
// bmp_playerN/bmp_color_playerN). Confirmed (not just inferred) that each
// frame's own rows need reversing, same as the bitmap kernels' own
// buildCardDataAsm: player0y counts DOWN once per scanline, and draw_players
// indexes bmp_playerN by that same decreasing value ("ldy player0y; lda
// (player0pointer),y"), so the LAST-stored row of a frame draws at the TOP
// of the sprite and the FIRST-stored row draws at the bottom - storing rows
// bottom-to-top is what makes the sprite render top-to-bottom on screen.
// Only each frame's OWN rows reverse, not the frame order itself - frame
// selection (bmp_playerN_index) just offsets to a different frame's own
// height-row block, which independently follows this same bottom-to-top
// convention.
const buildPlayerDataAsm = (card) => {
  const windowHeight = Math.max(1, Math.round(Number(card.windowHeight) || 50));
  const kernelLines = Number(card.kernelLines) === 2 ? 2 : 1;
  const lines = [
    `bmp_player_window = ${windowHeight}`,
    `bmp_player_kernellines = ${kernelLines}`,
  ];
  // Read back by the "Set title screen player sprite frame" block's own
  // generator (see titlescreen_player_frame_set below) - it needs each
  // player's own per-frame height (baked in at compile time here) to turn a
  // friendly, 0-based frame number into the raw byte offset bmp_playerN_
  // index actually expects.
  const heights = {};

  [0, 1].forEach((playerIndex) => {
    const animationIndex = playerIndex === 0 ? card.player0Animation : card.player1Animation;
    const rawFallbackColor = playerIndex === 0 ? card.player0Color : card.player1Color;
    const fallbackColor = rawFallbackColor != null ? rawFallbackColor : 0x0e;
    const {height, frames, hasRowColors} = resolvePlayerSlotFrames(animationIndex);
    heights[playerIndex] = height;
    lines.push(`bmp_player${playerIndex}_height = ${height}`, `bmp_player${playerIndex}`);
    frames.forEach((rows) => {
      [...rows].reverse().forEach((row) => lines.push(`\tBYTE ${toBinaryByte(packRowToBytes(row.pixels, 1)[0])}`));
    });
    lines.push('', `bmp_color_player${playerIndex}`);
    frames.forEach((rows) => {
      [...rows].reverse().forEach((row) =>
        lines.push(`\tBYTE ${toHexByte(hasRowColors ? row.color : fallbackColor)}`));
    });
    lines.push('');
  });

  return {code: lines.join('\n'), heights};
};

// The "score" minikernel's own digit table (miniscoretable, read directly
// by score_kernel.asm's own draw_score_display - see public/bb19/
// titlescreen/score_kernel.asm) - the same 10 digit shapes the Score tab's
// own currently-selected font uses (resolveScoreDigitBytes, same source
// buildScoreFontOverride/hooks/rom.js draws from for the STANDARD score
// kernel), not always the stock Default font. Squish/Squish Custom get
// padded back out to a full 8 rows per digit there too - this minikernel's
// own drawing routine always draws a fixed height, it has no equivalent of
// the standard kernel's own "fontstyle = SQUISH" row-shrinking trick, so a
// Squish font just renders at normal (non-shrunk) height here. Unlike the
// player minikernel, this card has no editable fields of its own: the
// digits it draws (the real "score" bB variable) and their color (the real
// "scorecolor" variable) are exactly the same ones the Score category's
// existing blocks already read/write.
const buildScoreDataAsm = () => {
  const config = useConfigurationStorage().value || {};
  const lines = ['miniscoretable'];
  resolveScoreDigitBytes(config.scoreFont).forEach((byte) => lines.push(`\t.byte ${byte}`));
  return lines.join('\n');
};

// Assigns every card, across EVERY screen, a physical kernel copy slot
// (type_N, e.g. "48x1_3") - the kernel ships exactly 8 pre-built copies of
// each bitmap type project-wide (see MAX_KERNEL_COPIES_PER_TYPE's own
// comment in blocks/titlescreen.js), a shared pool every screen draws from,
// not one pool per screen. Slots are assigned in screen order, then card
// order within each screen, independently per type - reordering
// screens/cards can change which slot a card resolves to, which is fine
// since every reference to it (layout line, data block, #ifconst guard) is
// regenerated together every compile, never stored.
const assignKernelSlots = (screens) => {
  const slotByType = {};
  const usedKernelKeys = new Set();
  const dataBlocks = [];
  // One entry per screen: {id, backgroundColor, layoutMacroName, layoutLines}.
  const screenPlans = [];
  // The "player" minikernel is a project-wide singleton (see
  // buildPlayerDataAsm's own comment/layoutmacros.asm's own "draw_player" -
  // there's only ever one draw_player_display routine and one set of
  // bmp_player0/bmp_player1 data, not a numbered pool like the bitmap
  // types) - true once the first "player" card is found, in screen order
  // then card order, matching MAX_KERNEL_COPIES_PER_TYPE's own overflow
  // convention below (any additional "player" card is silently ignored, not
  // an error - the UI's own canAddCardType already refuses to add a second
  // one).
  let hasPlayerCard = false;
  let playerHeights = null;
  // Same project-wide singleton reasoning as hasPlayerCard above, for the
  // "score" minikernel (draw_score_display, layoutmacros.asm's own
  // "draw_score" macro) - only one real "score" bB variable/display exists
  // regardless of how many cards might ask for it.
  let hasScoreCard = false;

  // Maps "screenId:cardId" (a card's own id is only unique within its
  // screen, not project-wide - see handleAddCard's own getMaxId) to its
  // resolved "type_slot" kernel key, e.g. "48x2_1" - read back by the "Set
  // title screen scroll position" block's own generator, which only knows
  // the screen+card the user picked from its own dropdown, not which
  // physical kernel copy that resolved to this build.
  const cardSlotsByRef = {};

  screens.forEach((screen) => {
    const layoutLines = [];
    (screen.cards || []).forEach((card) => {
      if (card.type === 'space') {
        const spaceLines = Math.max(1, Math.round(Number(card.lines) || 1));
        layoutLines.push(` draw_space ${spaceLines}`);
        return;
      }
      if (card.type === 'player') {
        if (hasPlayerCard) return;
        hasPlayerCard = true;
        layoutLines.push(' draw_player');
        const {code, heights} = buildPlayerDataAsm(card);
        dataBlocks.push(code);
        playerHeights = heights;
        cardSlotsByRef[`${screen.id}:${card.id}`] = 'player';
        return;
      }
      if (card.type === 'score') {
        if (hasScoreCard) return;
        hasScoreCard = true;
        layoutLines.push(' draw_score');
        dataBlocks.push(buildScoreDataAsm());
        cardSlotsByRef[`${screen.id}:${card.id}`] = 'score';
        return;
      }
      const typeInfo = TITLE_SCREEN_KERNEL_TYPES[card.type];
      if (!typeInfo) return;
      const slot = (slotByType[card.type] || 0) + 1;
      slotByType[card.type] = slot;
      // Silently dropped (not an error) - the UI's own handleAddCard already
      // refuses to add a card once the shared pool for that type is full,
      // this only guards against a hand-edited/imported project file
      // exceeding it.
      if (slot > MAX_KERNEL_COPIES_PER_TYPE) return;
      const key = `${card.type}_${slot}`;
      usedKernelKeys.add(key);
      layoutLines.push(` draw_${key}`);
      dataBlocks.push(buildCardDataAsm(card, key, typeInfo));
      cardSlotsByRef[`${screen.id}:${card.id}`] = key;
    });

    screenPlans.push({
      id: screen.id,
      backgroundColor: Number(screen.backgroundColor) || 0,
      layoutMacroName: `titlescreenlayout_${screen.id}`,
      layoutLines,
    });
  });

  return {usedKernelKeys, dataBlocks, screenPlans, cardSlotsByRef, hasPlayerCard, playerHeights, hasScoreCard};
};

// Every internal label the driver body below defines gets an "@" prefix -
// required so Blockly.BBasic.normalizeIndents (applied to every
// Blockly.BBasic.subroutines entry via generateSubroutineBody) doesn't
// wreck the column-0-for-labels-vs-indented-for-mnemonics distinction DASM
// requires inside a raw "asm ... end" block - see generators/bbasic/
// input.js's buildKeypadPollAsm for the same trick, confirmed there
// directly against a real build ("Unknown Mnemonic" failures without it).
// Only the CLOSING "end" needs it too (not the opening "asm") - matching
// that same file's own established convention.
//
// Structure mirrors the original single-screen Titlescreen Kernel driver
// almost exactly (see the version history of this file/public/bb19/
// titlescreen/titlescreen_kernel.asm) - the only real difference is the
// runtime dispatch chain in the middle (choosing which screen's own
// titlescreenlayout_N macro and background color to use, based on
// selectedIdVarName, set by the "Draw title screen" block generator below
// right before its own "gosub"), so every screen can share ONE compiled
// copy of the vsync/vblank/overscan boilerplate and this ROM's one shared
// set of physical kernel copies instead of needing its own duplicate of
// each (which would either waste ROM repeating identical boilerplate per
// screen, or need every internal label renamed per screen and still fight
// the SAME per-copy kernel files - 48x1_X_kernel.asm's own position48 calls
// via plain same-bank "jsr" - being reachable from multiple different
// banks, which they can't be without their own bank-switch trampolines).
const buildDriverAsm = (selectedIdVarName, screenPlans, usedKernelKeys, hasPlayerCard, hasScoreCard) => {
  const lines = ['asm'];

  lines.push(
      '@title_eat_overscan',
      '\t;bB runs in overscan. Wait for the overscan to run out...',
      '\tclc',
      '\tlda INTIM',
      '\tbmi title_eat_overscan',
      '\tjmp title_do_vertical_sync',
      '',
      '@title_do_vertical_sync',
      '\tlda #2',
      '\tsta WSYNC ;one line with VSYNC',
      '\tsta VSYNC ;enable VSYNC',
      '\tsta WSYNC ;one line with VSYNC',
      '\tsta WSYNC ;one line with VSYNC',
      '\tlda #0',
      '\tsta WSYNC ;one line with VSYNC',
      '\tsta VSYNC ;turn off VSYNC',
      '',
      '\tifnconst vblank_time',
      '\tlda #42+128',
      '\telse',
      '\tlda #vblank_time+128',
      '\tendif',
      '\tsta TIM64T',
      '',
      '@titleframe = missile0x',
      '\tinc titleframe ; increment the frame counter',
      '',
      '\t#ifconst .title_vblank',
      '\tjsr .title_vblank',
      '\t#endif',
      '',
      '@title_vblank_loop',
      '\tlda INTIM',
      '\tbmi title_vblank_loop',
      '\tlda #0',
      '\tsta WSYNC',
      '\tsta VBLANK',
      '\tsta ENAM0',
      '\tsta ENABL',
      '',
      '@title_playfield',
      '\tlda #230',
      '\tsta TIM64T',
      '',
      '\tlda #1',
      '\tsta CTRLPF',
      '\tclc',
      '',
      '\tlda #0',
      '\tsta REFP0',
      '\tsta REFP1',
      '\tsta WSYNC',
  );

  // The one piece that varies per screen at RUNTIME (everything else here
  // is a fixed, compile-time-shared routine): which titlescreenlayout_N
  // macro to invoke and which background color to load, chosen by
  // comparing selectedIdVarName (set by the "Draw title screen" block,
  // right before its own gosub) against every screen this build actually
  // knows about. Falls through to the next screen's own check on a
  // mismatch; the LAST screen skips its own check and always matches, so a
  // stale/out-of-range id (shouldn't happen - the block's own dropdown can
  // only ever hold real screen ids) still draws something instead of
  // silently skipping the whole kernel.
  screenPlans.forEach((plan, index) => {
    const isLast = index === screenPlans.length - 1;
    if (!isLast) {
      lines.push(
          `\tlda ${selectedIdVarName}`,
          `\tcmp #${plan.id}`,
          `\tbne titlescreen_skip_${plan.id}`,
      );
    }
    lines.push(
        `\tlda #${toHexByte(plan.backgroundColor)}`,
        '\tsta titlescreencolor',
        '\tsta COLUBK',
        `\t${plan.layoutMacroName}`,
        '\tjmp title_playfield_done',
    );
    if (!isLast) lines.push(`@titlescreen_skip_${plan.id}`);
  });

  lines.push(
      '',
      '@title_playfield_done',
      '\tjmp PFWAIT ; kernel is done. Finish off the screen',
      '',
      '\tinclude "position48.asm"',
  );

  usedKernelKeys.forEach((key) => {
    lines.push(
        `\t#ifconst mk_${key}_on`,
        `\tinclude "${key}_kernel.asm"`,
        `\t#endif ;mk_${key}_on`,
        '',
    );
  });
  lines.push(
      '\t#ifconst mk_48x1_X_on',
      '\tinclude "48x1_X_kernel.asm"',
      '\t#endif ;mk_48x1_X_on',
      '',
      '\t#ifconst mk_48x2_X_on',
      '\tinclude "48x2_X_kernel.asm"',
      '\t#endif ;mk_48x2_X_on',
      '',
  );

  // Known directly from the JS-side card scan (hasPlayerCard), so this can
  // just be included/omitted outright rather than needing its own #ifconst
  // mk_player_on guard the way the numbered bitmap kernels do (their own
  // "used at all" state isn't known until layoutmacros.asm's own draw_TYPE_N
  // macro runs during assembly).
  if (hasPlayerCard) {
    lines.push('\tinclude "player_kernel.asm"', '');
  }
  if (hasScoreCard) {
    lines.push('\tinclude "score_kernel.asm"', '');
  }

  lines.push(
      '@PFWAIT',
      '\tlda INTIM',
      '\tbne PFWAIT',
      '\tsta WSYNC',
      '',
      '@OVERSCAN',
      '\tifnconst overscan_time',
      '\tlda #34+128',
      '\telse',
      '\tlda #overscan_time+128-5',
      '\tendif',
      '\tsta TIM64T',
      '',
      '\t;fix height variables we borrowed, so DPC doesn\'t crash on drawscreen...',
      '\tifconst player9height',
      '\tldy #8',
      '\tlda #0',
      '\tsta player0height',
      '@.playerheightfixloop',
      '\tsta player1height,y',
      '\tifconst _NUSIZ1',
      '\tsta _NUSIZ1,y',
      '\tendif',
      '\tdey',
      '\tbpl .playerheightfixloop',
      '\tendif',
      '',
      // Actually wait out the overscan timer set just above - without this,
      // the "overscan period" TIM64T was configured for never really
      // happens; whatever RETURN falls into (commongamelogic, then the next
      // loop iteration's own vsync) starts immediately, however many/few
      // cycles that happens to take, instead of a real fixed ~30-scanline
      // gap. Confirmed as a real bug (a visible stray scanline at the very
      // top of the title screen) - present in the original bundled kernel
      // file too (public/bb19/titlescreen/titlescreen_kernel.asm), not
      // something this rewrite introduced.
      '@OVERSCAN_WAIT',
      '\tlda INTIM',
      '\tbpl OVERSCAN_WAIT',
      '',
      '\tlda #%11000010',
      '\tsta WSYNC',
      '\tsta VBLANK',
      '\tRETURN',
      '',
      // A real, writable RAM byte (not baked as a compile-time constant) -
      // every per-copy kernel file (48x1_N_kernel.asm/48x2_N_kernel.asm)
      // reads this directly for its own COLUPF/PF1/PF2 defaults, not just
      // the COLUBK line above, so it has to exist as a real shared symbol
      // regardless of which screen is currently selected - confirmed as a
      // real build failure ("Unknown Mnemonic 'lda titlescreencolor'")
      // once this byte was removed under the assumption only this
      // driver's own COLUBK line needed it. Forward/backward references
      // both resolve fine within one DASM assembly pass, so this can sit
      // anywhere in the body - here, right before the per-card image data.
      '@titlescreencolor',
      '\t.byte 0',
      '',
      '\tinclude "titlescreen_data.asm"',
      '@end',
  );

  return lines.join('\n');
};

const TITLE_SCREEN_SUBROUTINE_NAME = '_titlescreen_system';

// Called from bbasic.js's own init(), right after reserveDevVar hands out
// selectedIdVarName - same timing/reasoning as generators/bbasic/input.js's
// registerKeypadPollSubroutine (see its own comment): this has to run
// before anything downstream reads Blockly.BBasic.subroutines back out, and
// the resolved var name it needs is already available at that point.
// Compiles EVERY screen currently in storage (not just ones some "Draw
// title screen" block happens to reference right now) - same "always
// compile every entry, not just referenced ones" convention Backgrounds/
// Player animations already use.
export const registerTitleScreenSubroutine = (Blockly, {selectedIdVarName}) => {
  const titleScreen = processTitleScreenStorageDefaults(useTitleScreenStorage());
  const {usedKernelKeys, dataBlocks, screenPlans, cardSlotsByRef, hasPlayerCard, playerHeights, hasScoreCard} =
    assignKernelSlots(titleScreen.screens);

  Blockly.BBasic.titleScreenUsedKernelKeys = usedKernelKeys;
  // Read back by the "Set title screen scroll position" block's own
  // generator (see titlescreen_scroll_set below) - it only knows the
  // screen+card the user picked, not which physical kernel copy that
  // resolved to this build.
  Blockly.BBasic.titleScreenCardSlots = cardSlotsByRef;
  // Read back by "Set title screen player sprite frame" (see
  // titlescreen_player_frame_set below) - null when no "player" card exists
  // anywhere in the project, matching titleScreenCardSlots' own "nothing to
  // reference yet" shape.
  Blockly.BBasic.titleScreenPlayerHeights = playerHeights;
  const asmFiles = {'titlescreen_data.asm': dataBlocks.join('\n\n')};
  screenPlans.forEach((plan) => {
    asmFiles[`titlescreen_layout_${plan.id}.asm`] =
      ` MAC ${plan.layoutMacroName}\n${plan.layoutLines.join('\n')}\n ENDM\n`;
  });
  Blockly.BBasic.titleScreenAsmFiles = asmFiles;

  Blockly.BBasic.subroutines[TITLE_SCREEN_SUBROUTINE_NAME] =
    ' asm\n' +
    ' include "layoutmacros.asm"\n' +
    ' include "dpcfix.asm"\n' +
    screenPlans.map((plan) => ` include "titlescreen_layout_${plan.id}.asm"\n`).join('') +
    '@end\n' +
    buildDriverAsm(selectedIdVarName, screenPlans, usedKernelKeys, hasPlayerCard, hasScoreCard);
};

export default (Blockly) => {
  Blockly.BBasic['titlescreen_draw'] = function(block) {
    const screenId = block.getFieldValue('SCREEN');
    const selectedIdVarName = Blockly.BBasic.titleScreenSelectedIdVarName;
    // Only unset if no "Draw title screen" block exists anywhere on the
    // workspace at all (see bbasic.js's own titleScreenDrawUsed pre-scan) -
    // can't happen for a block that's actually being generated right now,
    // but guards against a stray leftover reference during, e.g., a
    // mid-refactor state.
    if (!selectedIdVarName || !screenId) return 'rem No title screen selected\n';
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(TITLE_SCREEN_SUBROUTINE_NAME));
    return `${selectedIdVarName} = ${screenId}\n gosub ${TITLE_SCREEN_SUBROUTINE_NAME}${suffix}\n`;
  };

  Blockly.BBasic['titlescreen_scroll_set'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const key = Blockly.BBasic.titleScreenCardSlots && Blockly.BBasic.titleScreenCardSlots[ref];
    // Falls back to a no-op rem, same as titlescreen_draw's own "no
    // selection" guard above - a project with no scrolling graphics
    // configured yet (or one whose scrolling was since turned back off)
    // shouldn't fail the whole build over a dropdown with nothing valid in
    // it.
    if (!key) return 'rem No scrolling title screen graphic selected\n';
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    // bmp_${key}_index is a raw asm byte (see buildCardDataAsm's own
    // comment), referenced directly by name - no "dim" needed, the same way
    // titlescreen_draw already references titlescreencolor directly.
    return `bmp_${key}_index = ${value}\n`;
  };

  Blockly.BBasic['titlescreen_player_frame_set'] = function(block) {
    const playerIndex = block.getFieldValue('PLAYER');
    const heights = Blockly.BBasic.titleScreenPlayerHeights;
    const height = heights && heights[playerIndex];
    // No "player" card configured anywhere in the project yet - same no-op
    // rem fallback as titlescreen_scroll_set's own "nothing to reference"
    // guard above.
    if (!height) return 'rem No title screen player sprite configured\n';
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
    // bmp_playerN_index is a raw byte offset into the flattened frame array
    // (see resolvePlayerSlotFrames' own comment), height rows apart per
    // frame - height is known here at compile time (baked into the title
    // screen's own data block above), so the multiply happens in the
    // generated source itself (a variable times a compile-time constant),
    // not at runtime in JS, letting VALUE be any expression (a literal,
    // variable, or computed frame number).
    return `bmp_player${playerIndex}_index = ${value} * ${height}\n`;
  };
};
