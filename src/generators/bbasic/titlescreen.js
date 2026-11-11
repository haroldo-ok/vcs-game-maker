'use strict';

import {isPxe} from '../../utils/pxe';
import {packTitleData} from '../../utils/title-data-pack';
import {titlePlayerSizeCode} from '../../utils/title-player-size';
import {MAX_KERNEL_COPIES_PER_TYPE,
  processTitleScreenStorageDefaults, processTitleScreenStorageForBuild, isCardAnimated, cardFrameHeight, resolveScrollStarts,
  titleCardFrameCounterVarName, titleCardScrollOffsetVarName, titleCardWindowVarName,
  titleCardIndexVarName, titleCardColorIndexVarName, titleCardColorPageVarName, padTitleCardFrames, titleCardColorSplit,
  titleCardUniformAllowed, isUniformColorList,
  titleCardColorVarName, TITLE_BG_COLOR_VAR_NAME, titleCardBoxColorVarName, titleCardBoxPf1VarName,
  titleCardBoxPf2VarName, titlePlayerIndexVarName, titlePlayerFrameVarName, titleFrameBox, titleCardFadeTargetVarName, titleCardFadeTimerVarName,
  titleCardFadePaceVarName, titleCardTypeInfo, titleFrameBallLines, titleCardHasBall, titleCardBallPlaces, titleCardBallXVarName,
} from '../../blocks/titlescreen';
import {useTitleScreenStorage, usePlayerAnimationsStorage,
  useConfigurationStorage, appendCompileLog} from '../../hooks/project';
import {processPlayerAnimationsStorageDefaults, ctrlpfShadowVarName} from './sprites';
import {clampFrameDuration} from '../../utils/duration';
import {flagPoolVar, flagPoolBit} from './flag-pool';
import {resolveScoreDigitBytes} from '../../utils/score-font';
import {tvColorByte} from '../../utils/palette';

// Packs one pixel row (an array of 0/1 values, PixelEditor.vue's
// format) into one byte per 8-pixel-wide column block, left pixel = high
// bit - matches the sample data shipped in the kernel's *_image.asm
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
// A color byte (the editors' NTSC palette) as it goes into the ROM - see tvColorByte.
const toColorHexByte = (n) => toHexByte(tvColorByte(n & 0xff));

// One card's  image data block, in the exact format the Titlescreen
// Kernel's *_image.asm files use (see public/bb19/titlescreen/ - this
// mirrors 48x1_N_image.asm/48x2_N_image.asm/96x2_N_image.asm exactly,
// generated instead of hand-edited), extended to stack every one of the
// card's animation frames (see cardFrameHeight/isCardAnimated's
// comment in blocks/titlescreen.js) into one tall image, frame 0's rows
// first - the exact same "flatten every frame into one tall table, height
// rows apart per frame" approach buildPlayerDataAsm below already uses for
// the "player" minikernel's animation frames, just applied to a real
// bitmap card's pixel/row-color data instead of GRP0/GRP1 bytes. window
// defaults to one frame's height (the whole current frame shown, no
// scrolling) unless the card has its scrollWindow set smaller - see
// card.scrollWindow's  comment in blocks/titlescreen.js for the runtime
// scroll-offset byte this also declares in that case (bmp_${key}_index,
// read directly by the kernel's per-copy asm via "ifconst").
const buildCardDataAsm = (card, key, typeInfo, ref, Blockly, pageColor) => {
  const {blockCount, doubleLine, hasRowColors} = typeInfo;
  const padded = padTitleCardFrames(card, typeInfo);
  const {frames, frameHeight} = padded;
  // A faded multicolor graphic uses the row colors of its first frame for every frame (the fade has one set of steps).
  const fadePlan = (Blockly.BBasic.titleRowFadePlans || {})[ref];
  // A graphic with the ball (see titleFrameBallLines) has three tables beside its picture, a byte for each row in the order of the picture's
  // rows (ENABL, CTRLPF and HMBL): a frame's picture is stored again for other ball rows.
  const hasBall = titleCardHasBall(card);
  const noBall = Array.from({length: frameHeight}, () => ({en: 0, w: 1, hm: 0}));
  const withBall = (list) => list.map((frame, index) => ({...frame,
    ballRows: hasBall ? ((titleFrameBallLines(frames[index], frameHeight) || {}).rows || noBall) : null}));
  const paddedFrames = withBall(fadePlan ? padded.paddedFrames.map((frame) => ({...frame, colorRows: padded.paddedFrames[0].colorRows})) :
    padded.paddedFrames);
  const ballKey = (frame) => (frame.ballRows ? '|' + JSON.stringify(frame.ballRows.map((row) => [row.en, row.w, row.hm])) : '');
  // Frames are all the first frame's height (padTitleCardFrames pads or cuts them); the dedup pass right below
  // compares frames by exactly what would be written to ROM.
  // Animation frames are frequently repeated (a held pose, a blank/off
  // frame reused between "on" frames, a bounce that revisits an earlier
  // frame) - an identical frame (same pixels, and same row colors for
  // types that have them) is written to ROM only once; every logical
  // frame number that repeats it is pointed at that same physical copy
  // instead via frameOffsets below (see generateTitleScreenAnimationChecks'
  // use of it), rather than storing the exact same bytes again for
  // each repeat. Purely a ROM-size optimization - the kernel has no idea
  // some frame numbers alias to the same physical rows, it just draws
  // whichever bmp_${key}_index it's handed.
  const colorSplit = titleCardColorSplit(card, ref);
  // A card that repeats a picture under different colors stores each picture once and each color list once
  // (see titleCardColorSplit); the others store a frame whole.
  const uniquePictures = [];
  const uniqueColors = [];
  const uniqueFrames = [];
  const slotFor = (list, contentKey, frame) => {
    let physicalSlot = list.findIndex((existing) => existing.contentKey === contentKey);
    if (physicalSlot === -1) {
      physicalSlot = list.length;
      list.push({...frame, contentKey});
    }
    return physicalSlot * frameHeight;
  };
  const frameOffsets = paddedFrames.map((frame) => colorSplit ?
    slotFor(uniquePictures, JSON.stringify(frame.pixelRows) + ballKey(frame), frame) :
    slotFor(uniqueFrames, JSON.stringify(frame.pixelRows) + '|' + JSON.stringify(frame.colorRows) + ballKey(frame), frame));
  // With more color lists than fit in the first 256 rows ('page'), the lists are stacked a page at a time as
  // many as fit: a list is found by its page number and its offset within that page.
  const colorsPerPage = colorSplit === 'page' ? Math.max(1, Math.floor(255 / frameHeight)) : 0;
  const colorSlots = colorSplit ?
    paddedFrames.map((frame) => slotFor(uniqueColors, JSON.stringify(frame.colorRows), frame) / frameHeight) : null;
  // The lists of the fade's steps come after the lists of the graphic: step n is found n lists down.
  if (fadePlan) fadePlan.lists.forEach((rowsOfStep, index) => uniqueColors.push({colorRows: rowsOfStep, contentKey: `fade${index}`}));
  // A list of one color for every row is one byte (the color with bit 0 set) when the title screen is compact (see titleCardUniformAllowed): the
  // lists then differ in size, and a frame's offset is the bytes of the lists before it.
  const uniformLists = titleCardUniformAllowed(card, ref) && colorSplit === 'offset';
  const colorListSize = (list) => (uniformLists && isUniformColorList(list.colorRows) ? 1 : frameHeight);
  const colorStarts = [];
  uniqueColors.reduce((start, list, index) => {
    colorStarts[index] = start;
    return start + colorListSize(list);
  }, 0);
  if (uniformLists && uniqueColors.some((list) => isUniformColorList(list.colorRows))) Blockly.BBasic.titleUniformUsed = true;
  const colorOffsets = colorSlots ?
    colorSlots.map((slot) => (uniformLists ? colorStarts[slot] : (colorSplit === 'page' ? slot % colorsPerPage : slot) * frameHeight)) : null;
  const colorPages = colorSplit === 'page' ? colorSlots.map((slot) => Math.floor(slot / colorsPerPage)) : null;
  const pictureFrames = colorSplit ? uniquePictures : uniqueFrames;
  // The frame offsets are stored in one byte, so a frame can't start past row 255.
  if (Math.max(...frameOffsets, ...(colorOffsets || [0])) > 255) {
    throw new Error(`A ${typeInfo.width}x${typeInfo.doubleLine ? 2 : 1} title screen graphic has too many different ` +
      `frames: its ${frameHeight} rows per frame would need a frame to start past row 255. Use shorter frames or ` +
      'fewer different frames (the page ' + ref.split(':')[0] + ' graphic with id ' + ref.split(':')[1] + ').');
  }
  const rows = pictureFrames.flatMap((frame) => frame.pixelRows);
  const height = rows.length;
  const scrollWindow = Number(card.scrollWindow) || 0;
  const windowHeight = (scrollWindow > 0 && scrollWindow < frameHeight) ? scrollWindow : frameHeight;
  // A graphic with one frame and no scroll whose row colors are one color is also stored as one byte (see titleCardUniformAllowed).
  const singleUniform = titleCardUniformAllowed(card, ref) && !colorSplit && uniqueFrames.length === 1 &&
    isUniformColorList(uniqueFrames[0].colorRows) && !(windowHeight < frameHeight || frames.length > 1);
  if (singleUniform) Blockly.BBasic.titleUniformUsed = true;
  // The kernel reads each column-block's  bytes bottom-to-top (same
  // reasoning as the row-colors list just below) - without reversing here
  // too, the image drew upside down: pixel rows and row colors both come
  // from the SAME top-to-bottom UI data, so both need the identical
  // reversal to stay correctly paired AND right-side up.
  const blockRows = Array.from({length: blockCount}, () => []);
  [...rows].reverse().forEach((row) => {
    packRowToBytes(row, blockCount).forEach((byte, b) => blockRows[b].push(byte));
  });

  // A graphic with a window height block has the number of lines in a byte (see windowVarValue).
  const windowed = (Blockly.BBasic.titleWindowRefs || new Set()).has(ref) && windowHeight < frameHeight;
  const lines = [
    `bmp_${key}_window = ${windowed && typeInfo.width === 48 ? 1 : windowHeight}`,
    `bmp_${key}_height = ${height}`,
  ];
  if (windowed) {
    lines.push(`bmp_${key}_win = ${Blockly.BBasic.nameDB_.getName(titleCardWindowVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE)}`);
  }

  // bmp_${key}_index has to be a real, writable RAM byte - only declared
  // when this card actually needs one: either it's scrolling (window
  // smaller than one frame) or it's animated (more than one frame, always
  // needing an index to switch between them - see
  // generateTitleScreenAnimationChecks below) - matching the per-copy
  // kernel file's "ifconst bmp_TYPE_N_index" check, which skips the
  // extra subtraction entirely when a card never needs one at all.
  // An earlier version declared this as a raw ".byte 0" right here in the
  // card's image-data block - which put it in ROM (this whole block
  // assembles inside the "asm...@end" subroutine wrapper, wherever the
  // current bank's code lives), so every runtime write to it was a dead
  // store: the compiled instructions all looked correct (confirmed by
  // direct ROM byte inspection) but the stored value could never actually
  // change, and the card never visibly animated/scrolled. Aliasing it to a
  // real dev var's resolved RAM address (reserved via
  // titleCardIndexVarName - see its comment in blocks/titlescreen.js)
  // fixes that while keeping the exact symbol name the per-copy kernel
  // files already reference directly.
  // Was "windowHeight < height" - equivalent before frame dedup above
  // existed (height was always frameCount * frameHeight then, so more than
  // one frame always meant height > frameHeight >= windowHeight), but no
  // longer: a card with several logical frames that all happen to be
  // pixel-identical now dedups down to a single physical frame, making
  // height === frameHeight - the indirect check would then wrongly skip
  // aliasing bmp_${key}_index to a real dev var for a card
  // generateTitleScreenAnimationChecks still writes to every frame,
  // reintroducing the exact dead-store bug this alias exists to prevent
  // (see the comment above). Checking frames.length directly instead
  // keeps this correct regardless of how many of those frames end up
  // sharing physical storage.
  if (windowHeight < frameHeight || frames.length > 1) {
    const indexVar = Blockly.BBasic.nameDB_.getName(
        titleCardIndexVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    lines.push(`bmp_${key}_index = ${indexVar}`);
  }
  if (colorSplit) {
    // The row colors have a frame offset and table length separate from the picture's (see titleCardColorSplit).
    const colorIndexVar = Blockly.BBasic.nameDB_.getName(
        titleCardColorIndexVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    lines.push(`bmp_${key}_colorheight = ${colorSplit === 'page' ? colorsPerPage * frameHeight :
      uniqueColors.reduce((total, list) => total + colorListSize(list), 0)}`,
    `bmp_${key}_colorindex = ${colorIndexVar}`);
    if (colorSplit === 'page') {
      lines.push(`bmp_${key}_colorpage = ${Blockly.BBasic.nameDB_.getName(
          titleCardColorPageVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE)}`);
    }
  }

  if (hasRowColors) {
    // The color list is read bottom-to-top by the kernel (see e.g.
    // 48x2_1_image.asm's "in reverse order" comment) - reversed here
    // so the UI's  top-to-bottom row color list doesn't need to think
    // about that. Stacked the same frame-0-first order as the pixel rows
    // above, one frame's rowColors (padded/truncated to frameHeight,
    // same as pixels) right after the previous frame's.
    // Already padded/truncated and deduplicated - see uniqueFrames above.
    // A graphic whose color lists are exactly those stored for an earlier graphic (the same bytes in the same
    // layout) uses that table: its "colors" is another name for the earlier one.
    if (singleUniform) lines.push(`bmp_${key}_colorheight = 1`);
    const colorTables = Blockly.BBasic.titleColorTables || (Blockly.BBasic.titleColorTables = new Map());
    const colorSignature = JSON.stringify([colorSplit, colorsPerPage, frameHeight, uniformLists, singleUniform,
      (colorSplit ? uniqueColors : uniqueFrames).map((frame) => frame.colorRows)]);
    const colorOwner = colorTables.get(colorSignature);
    if (colorOwner) {
      lines.push(`bmp_${key}_colors = bmp_${colorOwner}_colors`);
    } else {
      colorTables.set(colorSignature, key);
      if (colorSplit === 'page') {
        // The lists are stacked as many to a page as fit, each page starting on a page boundary so the rows the
        // kernel reads never cross one; the kernel finds a list by the page's number and the list's offset within
        // it. A last page with fewer lists leaves its bottom empty (the lists sit at the top, as in the others).
        for (let first = 0, pageNumber = 0; first < uniqueColors.length; first += colorsPerPage, pageNumber++) {
          const pageLists = uniqueColors.slice(first, first + colorsPerPage);
          const stack = [...pageLists.flatMap((frame) => frame.colorRows)].reverse();
          const empty = new Array((colorsPerPage - pageLists.length) * frameHeight).fill(0);
          lines.push(
              '   align 256',
              ' BYTE 0 ; leave this here!',
              ...(pageNumber === 0 ? ['', `bmp_${key}_colors`] : ['']),
              ...[...empty, ...stack].map((color) => `\tBYTE ${toColorHexByte(color)}`),
          );
        }
      } else {
        // A list of one color is a single byte, the color with bit 0 set (the kernel takes that as "one color for every row"); the
        // other lists have even bytes only, as a color byte always is.
        const asEntries = (colorRows) => (isUniformColorList(colorRows) ? [{color: colorRows[0], one: true}] :
          colorRows.map((color) => ({color, one: false})));
        const rowColors = (colorSplit ? uniqueColors : uniqueFrames).flatMap((frame) =>
          ((uniformLists || singleUniform) && isUniformColorList(frame.colorRows) ? asEntries(frame.colorRows) :
            frame.colorRows.map((color) => ({color, one: false}))));
        lines.push(
            `   if >. != >[.+(bmp_${key}_${colorSplit || singleUniform ? 'colorheight' : 'height'})]`,
            '      align 256',
            '   endif',
            ' BYTE 0 ; leave this here!',
            '',
            `bmp_${key}_colors`,
            ...[...rowColors].reverse().map(({color, one}) => `\tBYTE ${one ? toHexByte(tvColorByte(color & 0xff) | 1) : toColorHexByte(color)}`),
        );
      }
    }
  }

  if (!doubleLine || typeInfo.singleColor) {
    // 48x1, and a single color 48x2 or 96x2 - a single fixed color for the whole card (every frame,
    // not per-frame - see cardFrameHeight's comment in
    // blocks/titlescreen.js for why), no per-row list.
    // (The kernel copy of a single color 48x2 or 96x2 reads that byte instead of a row color list: bmp_<key>_onecolor. A 48x2 one draws with
    // the loop that does not read row colors, pf48x2_U_loop in 48x2_X_kernel.asm.)
    if (typeInfo.singleColor) {
      lines.push(`bmp_${key}_onecolor = 1`);
      if (typeInfo.width === 48) Blockly.BBasic.titleUniformUsed = true;
    }
    if ((Blockly.BBasic.titleCardColorRefs || new Set()).has(ref)) {
      // A "Set title screen graphic color" block changes it: the kernel reads a RAM byte
      // instead of a ROM one, filled with the Title tab's color by Title screen start.
      const colorVar = Blockly.BBasic.nameDB_.getName(
          titleCardColorVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      lines.push(`bmp_${key}_color = ${colorVar}`);
    } else {
      lines.push(
          `bmp_${key}_color`,
          `\t.byte ${toColorHexByte(card.color || 0)}`,
      );
    }
  }

  // Only the 48-wide kernels support a playfield background box behind the
  // image (see the kernel doc's  Example 5) - 96x2 has no PF1/PF2/
  // background fields at all.
  const firstBox = titleFrameBox(card, card.frames && card.frames[0], pageColor);
  if (typeInfo.width === 48 && (Blockly.BBasic.titleBoxRefs || new Set()).has(ref)) {
    // A box block changes it while the title screen runs: RAM bytes, filled by Title screen start.
    const varName = (canonical) => Blockly.BBasic.nameDB_.getName(canonical, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    lines.push(
        `bmp_${key}_PF1 = ${varName(titleCardBoxPf1VarName(ref))}`,
        `bmp_${key}_PF2 = ${varName(titleCardBoxPf2VarName(ref))}`,
        `bmp_${key}_background = ${varName(titleCardBoxColorVarName(ref))}`,
    );
  } else if (typeInfo.width === 48) {
    // Unless the card has a box color, the row stays in the page's background color.
    const shared = (Blockly.BBasic.titleShareKeys || new Set()).has(key);
    // The numbers the shared setup of the 48x2 graphics puts in the table of the card (see 48x2_S_kernel.asm), as plain numbers
    // for the assembler: the bytes themselves are only stored when the card has a full setup.
    lines.push(
        `bmp_${key}_pf1c = ${firstBox.pf1 & 0xff}`,
        `bmp_${key}_pf2c = ${firstBox.pf2 & 0xff}`,
        `bmp_${key}_bgc = ${tvColorByte(firstBox.background & 0xff)}`,
    );
    if (!shared) {
      lines.push(
          `bmp_${key}_PF1`,
          `\tBYTE ${toBinaryByte(firstBox.pf1)}`,
          `bmp_${key}_PF2`,
          `\tBYTE ${toBinaryByte(firstBox.pf2)}`,
          `bmp_${key}_background`,
          `\tBYTE ${toColorHexByte(firstBox.background)}`,
      );
    }
  }

  // A graphic whose picture is exactly one stored for an earlier graphic (the same rows, the same height) reuses
  // those bytes: its tables are other names for the earlier ones, so only its row colors take ROM.
  const pictureTables = Blockly.BBasic.titlePictureTables || (Blockly.BBasic.titlePictureTables = new Map());
  const pictureSignature = JSON.stringify(blockRows);
  const pictureOwner = pictureTables.get(pictureSignature);
  if (pictureOwner) {
    for (let b = 0; b < blockCount; b++) {
      const name = String(b).padStart(2, '0');
      lines.push(`bmp_${key}_${name} = bmp_${pictureOwner}_${name}`);
    }
  } else {
    pictureTables.set(pictureSignature, key);
  }
  for (let b = 0; !pictureOwner && b < blockCount; b++) {
    lines.push(
        `   if >. != >[.+bmp_${key}_height]`,
        '\talign 256',
        '   endif',
        `bmp_${key}_${String(b).padStart(2, '0')}`,
        ...blockRows[b].map((byte) => `\tBYTE ${toBinaryByte(byte)}`),
        '',
    );
  }

  if (hasBall) {
    Blockly.BBasic.titleBallUsed = true;
    // (Read with (player0pointer),y in the loop, which takes a cycle more across a page: the table is kept in one.)
    lines.push(
        `   if >. != >[.+bmp_${key}_height]`,
        '\talign 256',
        '   endif',
        `bmp_${key}_ball`,
    );
    // (The three tables, each in one page: the loop reads them with absolute addresses and a cycle more across a page would move the picture.)
    [['ballen', 'en'], ['ballw', 'w'], ['ballhm', 'hm']].forEach(([name, field]) => lines.push(
        `   if >. != >[.+bmp_${key}_height]`,
        '\talign 256',
        '   endif',
        `bmp_${key}_${name}`,
        ...[...pictureFrames.flatMap((frame) => frame.ballRows)].reverse().map((row) => `\tBYTE ${row[field]}`),
        '',
    ));
    // The column it is placed at for the frame's top row: a RAM byte that the animation sets when its frames differ, else a byte in the ROM.
    const place = titleCardBallPlaces(card)[0];
    if ((Blockly.BBasic.titleBallVaryRefs || new Set()).has(ref)) {
      const varName = (canonical) => Blockly.BBasic.nameDB_.getName(canonical, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      lines.push(`bmp_${key}_ballx = ${varName(titleCardBallXVarName(ref))}`);
    } else {
      lines.push(`bmp_${key}_ballx`, `\t.byte ${titleBallXByte(place.x)}`);
    }
  }

  return {code: lines.join('\n'), frameHeight, frameCount: frames.length,
    frameDurations: frames.map((f) => clampFrameDuration(f.duration)), frameOffsets, colorOffsets, colorPages, colorSplit};
};

// The ball's x for the kernel's placing of it (draw_bmp_48x2_XB) from its column in the picture (0 to 47): the screen pixel of the picture's
// first column, less what the placing adds (measured in the emulator).
const TITLE_BALL_X_BIAS = 59;
// About the size of the ball's loop in a graphic's kernel copy (pf48x2_N_ball_loop) and its setup.
const TITLE_BALL_LOOP_BYTES = 330;
const titleBallXByte = (column) => Math.max(0, Math.min(159, TITLE_BALL_X_BIAS + column));


// The lines that put each scrolling graphic at its starting scroll position (where its window is in the Title tab): written last in "Title screen start", so the blocks
// there can still change it. An animated graphic keeps its scroll position in a separate byte that its frame is added to (see generateTitleScreenAnimationChecks).
export const titleScrollStartLines = (Blockly) => {
  const lines = [];
  resolveScrollStarts().forEach((start, ref) => {
    const key = Blockly.BBasic.titleScreenCardSlots && Blockly.BBasic.titleScreenCardSlots[ref];
    if (!key) return;
    const animated = Blockly.BBasic.titleScreenCardAnimations && Blockly.BBasic.titleScreenCardAnimations[ref];
    lines.push(animated || (Blockly.BBasic.titleWindowRefs || new Set()).has(ref) ?
      `${Blockly.BBasic.nameDB_.getName(titleCardScrollOffsetVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${start}` : `bmp_${key}_index = ${start}`);
  });
  return lines;
};

// The lines that put the Player 0 and Player 1 sprites where the Player card of a title screen says they start (its Start X and
// Start Y fields; one that is empty is left alone) and how wide they are drawn and how many copies (its Size; one copy is left alone). Run last
// in "Title screen start", so the card has the say over the blocks there.
export const titlePlayerCardStartLines = (card) => {
  const lines = [];
  [0, 1].forEach((player) => ['x', 'y'].forEach((axis) => {
    const value = card[`player${player}${axis.toUpperCase()}`];
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) return;
    lines.push(`player${player}${axis} = ${Math.max(0, Math.min(255, Math.round(Number(value))))}`);
  }));
  // The TIA draws a sprite in two or three copies, or stretched to 2x (NUSIZ 5) or 4x (NUSIZ 7); the other bits of the size byte (the flip bit, a flag of the title
  // screen loop, the pause bit) stay as they are.
  [0, 1].forEach((player) => {
    const code = titlePlayerSizeCode(card, player);
    if (!code) return;
    lines.push(`player${player}size = player${player}size & $F8`, `player${player}size = player${player}size | $0${code}`);
  });
  return lines;
};
// The pages that have a Player sprites card (one each: the first one of a page), in page order, as {screen, card}.
const titlePlayerPages = (screens) => screens.map((screen) => ({screen, card: (screen.cards || []).find((card) => card.type === 'player')}))
    .filter((page) => page.card);
export const titlePlayerStartLines = () => {
  const pages = titlePlayerPages(processTitleScreenStorageForBuild(useTitleScreenStorage()).screens);
  // (With a Player card on several pages, a page's card is put in force when the page is drawn: see titlescreen_draw.)
  return pages.length === 1 ? titlePlayerCardStartLines(pages[0].card) : [];
};
// Where the sprites of a Player card start when the card does not say: side by side and centered in the card's window (the vertical value
// counts scanlines from the window's bottom, so a sprite as tall as the window sits at its height).
const titlePlayerCenterLines = (card, heights) => {
  const windowHeight = Math.max(1, Math.round(Number(card.windowHeight) || 50));
  return [0, 1].flatMap((playerIndex) => {
    const spriteHeight = Math.min(heights[playerIndex], windowHeight);
    const y = spriteHeight + Math.floor((windowHeight - spriteHeight) / 2);
    return [`player${playerIndex}x = ${playerIndex === 0 ? 64 : 92}`, `player${playerIndex}y = ${y}`];
  });
};

// Resolves a "player" card's  player0Animation/player1Animation field
// (an index into the shared animation pool, same convention as
// sprite_player_animation_select's  dropdown - see blocks/sprites.js's
// buildAnimationOptions) into the actual frame data the kernel's
// player_kernel.asm needs. An unresolved/empty slot falls back to a single
// blank (all-zero) row - GRP0/GRP1 draw nothing for a zero byte regardless
// of position or color, so a slot nobody configured is always safe to leave
// wherever the game happens to have last positioned that player.
const resolvePlayerSlotFrames = (animationIndex) => {
  const blank = {height: 1, frames: [[{pixels: new Array(8).fill(0)}]], hasRowColors: false, durations: [1]};
  if (animationIndex === undefined || animationIndex === null || animationIndex === '') return blank;
  const player = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage());
  const animation = player.animations[Number(animationIndex)];
  if (!animation || !animation.frames || !animation.frames.length) return blank;
  // The kernel indexes frames as one flat array, a fixed number of rows
  // apart (see the kernel doc's "setting the index to 0, 10, 20..."
  // example) - that only works if every frame is the SAME height, so every
  // frame here is padded/truncated to the FIRST frame's  height rather
  // than keeping its (an animation with mismatched frame heights, e.g.
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
  return {height, frames, hasRowColors,
    durations: animation.frames.map((frame) => clampFrameDuration(frame.duration))};
};

// The Player sprites card's two players as the build sees them: the height of a frame, how many frames the
// chosen animation has and how long each lasts, or null for a project with no Player sprites card. An
// animation with several frames plays by itself (see generateTitlePlayerChecks).
// Each page can have a Player sprites card: pages lists them ({screenId, slots}), and the entries 0 and 1 are what the players need on any
// page (the most frames: the frame counter and the frame offset of a player are one byte each, used by the page that is drawn).
export const resolveTitlePlayerSlots = () => {
  const pages = titlePlayerPages(processTitleScreenStorageForBuild(useTitleScreenStorage()).screens).map(({screen, card}) => {
    const slots = {};
    [0, 1].forEach((playerIndex) => {
      const slot = resolvePlayerSlotFrames(playerIndex === 0 ? card.player0Animation : card.player1Animation);
      slots[playerIndex] = {height: slot.height, frameCount: slot.frames.length, durations: slot.durations};
    });
    return {screenId: screen.id, slots};
  });
  if (!pages.length) return null;
  const result = {pages};
  [0, 1].forEach((playerIndex) => {
    result[playerIndex] = {frameCount: Math.max(...pages.map((page) => page.slots[playerIndex].frameCount))};
  });
  return result;
};

// What the window byte of a graphic that a "Set title screen graphic window height" block works on holds for a window of `rows` lines: the kernel of a 48 wide
// graphic counts down to 0 (so rows less one) and the one of a 96x2 graphic compares with the number of lines. Such a graphic is made with "bmp_KEY_win" (the
// byte the kernel reads in place of the number of lines it is made with) and, for a 48 wide one, a window of 1 line in the tables of its pointers: the pointers
// are then worked out from the scroll position plus the window less one (see generateTitleScreenAnimationChecks).
const windowVarValue = (key, rows) => (key.startsWith('96x2') ? rows : rows - 1);

// The "player" minikernel's  data block - see public/bb19/titlescreen/
// player_kernel.asm and the kernel doc's "Example 5" for the format
// this mirrors (bmp_player_window/bmp_player_kernellines/bmp_playerN_height/
// bmp_playerN/bmp_color_playerN). Confirmed (not just inferred) that each
// frame's  rows need reversing, same as the bitmap kernels'
// buildCardDataAsm: player0y counts DOWN once per scanline, and draw_players
// indexes bmp_playerN by that same decreasing value ("ldy player0y; lda
// (player0pointer),y"), so the LAST-stored row of a frame draws at the TOP
// of the sprite and the FIRST-stored row draws at the bottom - storing rows
// bottom-to-top is what makes the sprite render top-to-bottom on screen.
// Only each frame's rows reverse, not the frame order itself - frame
// selection (bmp_playerN_index) just offsets to a different frame's
// height-row block, which independently follows this same bottom-to-top
// convention.
// Each page with a Player card has its data, named with the page's id, and a routine that sets the page's numbers for the kernel
// (draw_player_display_<page>) and goes on to the kernel's drawing (see player_kernel.asm).
const buildPlayerDataAsm = (card, Blockly, pageId) => {
  const windowHeight = Math.max(1, Math.round(Number(card.windowHeight) || 50));
  const kernelLines = Number(card.kernelLines) === 2 ? 2 : 1;
  const lines = [];
  const setup = [
    `draw_player_display_${pageId}`,
    `\tlda #(${windowHeight}+1)`,
    '\tsta temp1 ; our line count',
  ];
  const pointerLines = [];
  // Read back by the "Set title screen player sprite frame" block's
  // generator (see titlescreen_player_frame_set below) - it needs each
  // player's  per-frame height (baked in at compile time here) to turn a
  // friendly, 0-based frame number into the raw byte offset bmp_playerN_
  // index actually expects.
  const heights = {};

  [0, 1].forEach((playerIndex) => {
    const animationIndex = playerIndex === 0 ? card.player0Animation : card.player1Animation;
    const rawFallbackColor = playerIndex === 0 ? card.player0Color : card.player1Color;
    const fallbackColor = rawFallbackColor != null ? rawFallbackColor : 0x0e;
    const {height, frames, hasRowColors} = resolvePlayerSlotFrames(animationIndex);
    heights[playerIndex] = height;
    // The frame's address is the picture's plus the player's frame offset when it has one: a RAM byte that the
    // checks (or the "Set title screen player sprite frame" block) write.
    const indexVar = (Blockly.BBasic.titlePlayerIndexUsed || [])[playerIndex] ?
      Blockly.BBasic.nameDB_.getName(titlePlayerIndexVarName(playerIndex), Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
    const picture = `bmp_player${playerIndex}_${pageId}`;
    const colors = `bmp_color_player${playerIndex}_${pageId}`;
    setup.push(`\tlda #${height - 1}`, `\tsta player${playerIndex}height`);
    lines.push(picture);
    frames.forEach((rows) => {
      [...rows].reverse().forEach((row) => lines.push(`\tBYTE ${toBinaryByte(packRowToBytes(row.pixels, 1)[0])}`));
    });
    // The colors are stored once when every frame has the same ones (the kernel then does not move them by the frame).
    const colorsOf = (rows) => rows.map((row) => toColorHexByte(hasRowColors ? row.color : fallbackColor)).join(',');
    const sameColors = frames.length > 1 && frames.every((rows) => colorsOf(rows) === colorsOf(frames[0]));
    // (A player whose colors are the same in every frame has them once: they are not moved by the frame.)
    [[picture, `player${playerIndex}pointer`, true], [colors, `player${playerIndex}color`, !sameColors]].forEach(([table, pointer, moved]) => {
      const add = indexVar && moved;
      pointerLines.push(`\tlda #<${table}`, ...(add ? ['\tclc', `\tadc ${indexVar}`] : []), `\tsta ${pointer}`,
          `\tlda #>${table}`, ...(add ? ['\tadc #0'] : []), `\tsta ${pointer}+1`);
    });
    lines.push('', colors);
    (sameColors ? [frames[0]] : frames).forEach((rows) => {
      [...rows].reverse().forEach((row) =>
        lines.push(`\tBYTE ${toColorHexByte(hasRowColors ? row.color : fallbackColor)}`));
    });
    lines.push('');
  });
  // (A jump, not a call: see player_kernel.asm. The numbers set here are not touched by the positioning of the sprites there.)
  setup.push(...pointerLines, `\tjmp draw_player_go_k${kernelLines}`, '');

  return {code: [...setup, ...lines].join('\n'), heights, kernelLines};
};

// The "score" minikernel's  digit table (miniscoretable, read directly
// by score_kernel.asm's  draw_score_display - see public/bb19/
// titlescreen/score_kernel.asm) - the same 10 digit shapes the Score tab's
// currently-selected font uses (resolveScoreDigitBytes, same source
// buildScoreFontOverride/hooks/rom.js draws from for the STANDARD score
// kernel), not always the stock Default font. Squish/Squish Custom get
// padded back out to a full 8 rows per digit there too - this minikernel's
// drawing routine always draws a fixed height, it has no equivalent of
// the standard kernel's "fontstyle = SQUISH" row-shrinking trick, so a
// Squish font just renders at normal (non-shrunk) height here. Unlike the
// player minikernel, this card has no editable fields: the
// digits it draws (the real "score" bB variable) and their color (the real
// "scorecolor" variable) are exactly the same ones the Score category's
// existing blocks already read/write.
const buildScoreDataAsm = () => {
  const config = useConfigurationStorage().value || {};
  const lines = ['miniscoretable'];
  resolveScoreDigitBytes(config.scoreFont).forEach((byte) => lines.push(`\t.byte ${byte}`));
  return lines.join('\n');
};

// A rough lower bound on the ROM BYTES every title screen's graphics DATA
// needs, across every screen combined (registerTitleScreenSubroutine
// compiles every screen's cards into the ONE shared _titlescreen_system
// subroutine/bank, so this is a project-wide total, not per-screen) - NOT
// the same thing as the Title tab's "~85/170 rows" help text, which is
// a completely different, per-PAGE budget: how many TV scanlines the kernel
// takes to DRAW one page (a 48x2/96x2 row draws 2 scanlines, a 48x1 row
// draws 1, both capping out around 170 scanlines total - confirmed
// directly, 85*2 = 170*1), unaffected by how many frames an animated card
// has (only the CURRENTLY selected frame's rows ever get drawn) or how many
// OTHER pages exist (only one page's routine runs per actual frame
// rendered). This instead estimates ROM STORAGE: every DIFFERENT picture and every different row color list is a
// permanently-baked-in byte table (the kernel just changes which one it points at), so unlike the draw-time budget,
// more different frames or more pages add up here even though nothing about what's ever visible at once changes. A
// picture that repeats (a held frame, the same picture under other row colors, the same graphic on another page) is
// stored once, and so is a row color list that repeats (see buildCardDataAsm), and is counted once here. Deliberately a LOWER bound, not a byte-exact
// prediction - it counts each card/frame's pixel and row-color bytes
// (matching buildCardDataAsm/buildPlayerDataAsm/buildScoreDataAsm's real
// output exactly), but skips the 256-byte alignment padding a card's
// row-color table can need and the driver/kernel code itself (title_
// playfield/vblank/overscan boilerplate plus each used minikernel type's
// draw routine) - both real, but not knowable ahead of an actual compile,
// and both small next to what many animation frames add up to.
// Whether any page has a text card that names a Text tab entry.
export const titleScreensHaveTextCard = () => {
  const {screens} = processTitleScreenStorageForBuild(useTitleScreenStorage());
  return screens.some((screen) => (screen.cards || []).some((card) => card.type === 'text' && card.textId !== undefined && card.textId !== ''));
};

export const estimateTitleScreenGraphicsBytes = (storage) => {
  const {screens} = processTitleScreenStorageForBuild(storage);
  let bytes = 0;
  const countedPlayerPages = new Set();
  let countedScoreCard = false;
  const seenPictures = new Set();
  const seenColors = new Set();
  screens.forEach((screen) => {
    (screen.cards || []).forEach((card) => {
      const typeInfo = titleCardTypeInfo(card);
      if (typeInfo) {
        // As buildCardDataAsm stores it: a picture that repeats (in a held frame, under other row colors, or in another graphic)
        // and a row color list that repeats are in the ROM once.
        const {frameHeight, paddedFrames} = padTitleCardFrames(card, typeInfo);
        const split = titleCardColorSplit(card, `${screen.id}:${card.id}`);
        const distinct = (list) => [...new Set(list)];
        // A graphic whose rows are stored per frame (no row colors, or its colors not split off) keeps a frame once when its
        // picture and its row colors are the same; a split one keeps each picture once, and each row color list once.
        const stored = distinct(paddedFrames.map(({pixelRows, colorRows}) =>
          JSON.stringify(split || !typeInfo.hasRowColors ? [pixelRows] : [pixelRows, colorRows])));
        const pictures = distinct(paddedFrames.map(({pixelRows}) => JSON.stringify(pixelRows)));
        const pictureCount = split || !typeInfo.hasRowColors ? pictures.length : stored.length;
        const pictureSignature = JSON.stringify([typeInfo.blockCount, split ? 1 : 0, split || !typeInfo.hasRowColors ? pictures : stored]);
        if (!seenPictures.has(pictureSignature)) {
          seenPictures.add(pictureSignature);
          bytes += pictureCount * frameHeight * typeInfo.blockCount;
        }
        // (The ball's three tables, a byte each for each row stored, its column, and its loop in the kernel copy: see buildCardDataAsm.)
        if (titleCardHasBall(card)) bytes += 3 * pictureCount * frameHeight + 1 + TITLE_BALL_LOOP_BYTES;
        if (typeInfo.hasRowColors) {
          const colorLists = distinct(paddedFrames.map(({colorRows}) => JSON.stringify(colorRows)));
          const colorCount = split ? colorLists.length : stored.length;
          const colorSignature = JSON.stringify([split, frameHeight, split ? colorLists : stored]);
          if (!seenColors.has(colorSignature)) {
            seenColors.add(colorSignature);
            bytes += colorCount * frameHeight;
          }
        } else {
          bytes += 1;
        }
        return;
      }
      if (card.type === 'player' && !countedPlayerPages.has(screen.id)) {
        countedPlayerPages.add(screen.id);
        [0, 1].forEach((playerIndex) => {
          const animationIndex = playerIndex === 0 ? card.player0Animation : card.player1Animation;
          const {height, frames, hasRowColors} = resolvePlayerSlotFrames(animationIndex);
          // (The colors are stored once when they are the same in every frame: see buildPlayerDataAsm.)
          const colorsOf = (rows) => rows.map((row) => (hasRowColors ? row.color : 0)).join(',');
          const sameColors = frames.length > 1 && frames.every((rows) => colorsOf(rows) === colorsOf(frames[0]));
          bytes += frames.length * height + (sameColors ? height : frames.length * height);
        });
        return;
      }
      if (card.type === 'score' && !countedScoreCard) {
        countedScoreCard = true;
        const config = useConfigurationStorage().value || {};
        bytes += resolveScoreDigitBytes(config.scoreFont).length;
      }
    });
  });
  return bytes;
};

// Assigns every card, across EVERY screen, a physical kernel copy slot
// (type_N, e.g. "48x1_3") - the kernel ships exactly 8 pre-built copies of
// each bitmap type project-wide (see MAX_KERNEL_COPIES_PER_TYPE's
// comment in blocks/titlescreen.js), a shared pool every screen draws from,
// not one pool per screen. Slots are assigned in screen order, then card
// order within each screen, independently per type - reordering
// screens/cards can change which slot a card resolves to, which is fine
// since every reference to it (layout line, data block, #ifconst guard) is
// regenerated together every compile, never stored.
// A page number that is not the id of a page.
const titleNoPageId = (screens) => {
  const ids = new Set(screens.map((screen) => Number(screen.id)));
  let id = 0;
  while (ids.has(id)) id++;
  return id;
};
const assignKernelSlots = (screens, Blockly) => {
  // Lines Title screen start runs first: each runtime color back to the Title tab's color.
  Blockly.BBasic.titleScreenStartLines = [];
  const slotByType = {};
  const usedKernelKeys = new Set();
  const dataBlocks = [];
  // Which graphic stores each distinct picture (see buildCardDataAsm).
  // The 48x2 graphics that use the shared setup: the ones with a plain box (see 48x2_S_kernel.asm).
  Blockly.BBasic.titleShareKeys = new Set();
  Blockly.BBasic.titleUniformUsed = false;
  Blockly.BBasic.titleBallUsed = false;
  Blockly.BBasic.titlePictureTables = new Map();
  Blockly.BBasic.titleColorTables = new Map();
  // One entry per screen: {id, backgroundColor, layoutMacroName, layoutLines}.
  const screenPlans = [];
  // The "player" minikernel is a project-wide singleton (see
  // buildPlayerDataAsm's  comment/layoutmacros.asm's "draw_player" -
  // there's only ever one draw_player_display routine and one set of
  // bmp_player0/bmp_player1 data, not a numbered pool like the bitmap
  // types) - true once the first "player" card is found, in screen order
  // then card order, matching MAX_KERNEL_COPIES_PER_TYPE's  overflow
  // convention below (any additional "player" card is silently ignored, not
  // an error - the UI's  canAddCardType already refuses to add a second
  // one).
  let hasPlayerCard = false;
  // The heights of the players of each page's card, by page id; the numbers of lines a row the cards use (a loop of the kernel for each).
  const playerHeights = {};
  const playerKernelLines = new Set();
  // Same project-wide singleton reasoning as hasPlayerCard above, for the
  // "score" minikernel (draw_score_display, layoutmacros.asm's
  // "draw_score" macro) - only one real "score" bB variable/display exists
  // regardless of how many cards might ask for it.
  let hasScoreCard = false;
  let textCardCount = 0;
  let hasTextCard = false;

  // Maps "screenId:cardId" (a card's  id is only unique within its
  // screen, not project-wide - see handleAddCard's  getMaxId) to its
  // resolved "type_slot" kernel key, e.g. "48x2_1" - read back by the "Set
  // title screen scroll position" block's  generator, which only knows
  // the screen+card the user picked from its  dropdown, not which
  // physical kernel copy that resolved to this build.
  const cardSlotsByRef = {};
  // Same "screenId:cardId" keying as cardSlotsByRef above, but only for
  // cards with more than one animation frame - read by
  // generateTitleScreenAnimationChecks below (via registerTitleScreenSubroutine)
  // to build each animated card's per-frame duration-counter/index-write
  // code, and by the "Set title screen scroll position" block's
  // generator, to know whether it needs to write to that card's dedicated
  // scroll-offset var (see reserveTitleScreenAnimationDevVars in
  // generators/bbasic.js) instead of straight to bmp_${key}_index.
  const cardAnimationByRef = {};

  screens.forEach((screen) => {
    const layoutLines = [];
    let screenHasTextCard = false;
    (screen.cards || []).forEach((card) => {
      if (card.type === 'text' && Blockly.BBasic.isTitleTextUsed() && card.textId !== undefined && card.textId !== '') screenHasTextCard = true;
      if (card.type === 'space') {
        const spaceLines = Math.max(1, Math.round(Number(card.lines) || 1));
        layoutLines.push(` draw_space ${spaceLines}`);
        return;
      }
      if (card.type === 'player') {
        // (One for each page: the editor does not add a second one to a page, a second one in a file is left out.)
        if (playerHeights[screen.id]) return;
        layoutLines.push(` draw_player ${screen.id}`);
        const {code, heights, kernelLines} = buildPlayerDataAsm(card, Blockly, screen.id);
        dataBlocks.push(code);
        playerHeights[screen.id] = heights;
        playerKernelLines.add(kernelLines);
        // Both sprites start on screen, side by side and centered in the card's window, until the project
        // positions them with the Player X/Y blocks. (The first page's card: with cards on several pages, a page's card puts them
        // there when the page is drawn after another one, see titlescreen_draw.)
        if (!hasPlayerCard) Blockly.BBasic.titleScreenStartLines.push(...titlePlayerCenterLines(card, heights));
        hasPlayerCard = true;
        cardSlotsByRef[`${screen.id}:${card.id}`] = 'player';
        return;
      }
      if (card.type === 'text') {
        if (!Blockly.BBasic.isTitleTextUsed() || !Blockly.BBasic.titleTextCardInfo || card.textId === undefined || card.textId === '') return;
        textCardCount++;
        hasTextCard = true;
        layoutLines.push(...buildTextCardLines(Blockly, card.textId, textCardCount));
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
      const typeInfo = titleCardTypeInfo(card);
      if (!typeInfo) return;
      const slot = (slotByType[card.type] || 0) + 1;
      slotByType[card.type] = slot;
      // Silently dropped (not an error) - the UI's  handleAddCard already
      // refuses to add a card once the shared pool for that type is full,
      // this only guards against a hand-edited/imported project file
      // exceeding it.
      if (slot > MAX_KERNEL_COPIES_PER_TYPE) return;
      const key = `${card.type}_${slot}`;
      usedKernelKeys.add(key);
      // (A graphic with a window height block has a setup of its kind: the shared one has the number of lines in its numbers.)
      if (Blockly.BBasic.titleShareSetup && card.type === '48x2' && !typeInfo.singleColor && !titleCardHasBall(card) && !(Blockly.BBasic.titleBoxRefs || new Set()).has(`${screen.id}:${card.id}`) &&
          !(Blockly.BBasic.titleWindowRefs || new Set()).has(`${screen.id}:${card.id}`)) {
        Blockly.BBasic.titleShareKeys.add(key);
      }
      layoutLines.push(` draw_${key}`);
      const ref = `${screen.id}:${card.id}`;
      const {code, frameHeight, frameCount, frameDurations, frameOffsets, colorOffsets, colorPages, colorSplit} =
        buildCardDataAsm(card, key, typeInfo, ref, Blockly, Number(screen.backgroundColor) || 0);
      dataBlocks.push(code);
      if (typeInfo.width === 48 && (Blockly.BBasic.titleBoxRefs || new Set()).has(ref)) {
        const varName = (canonical) => Blockly.BBasic.nameDB_.getName(canonical, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        const startBox = titleFrameBox(card, card.frames && card.frames[0], Number(screen.backgroundColor) || 0);
        Blockly.BBasic.titleScreenStartLines.push(
            `${varName(titleCardBoxPf1VarName(ref))} = ${startBox.pf1}`,
            `${varName(titleCardBoxPf2VarName(ref))} = ${startBox.pf2}`,
            `${varName(titleCardBoxColorVarName(ref))} = ${toColorHexByte(startBox.background)}`);
      }
      if (!typeInfo.hasRowColors && (Blockly.BBasic.titleCardColorRefs || new Set()).has(ref)) {
        const colorVar = Blockly.BBasic.nameDB_.getName(
            titleCardColorVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        Blockly.BBasic.titleScreenStartLines.push(`${colorVar} = ${toColorHexByte(card.color || 0)}`);
        // A fade has nothing to do until a block gives it somewhere to go: it is at its target.
        if ((Blockly.BBasic.titleFadeRefs || new Set()).has(ref)) {
          Blockly.BBasic.titleScreenStartLines.push(`${Blockly.BBasic.nameDB_.getName(titleCardFadeTargetVarName(ref),
              Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${toColorHexByte(card.color || 0)}`);
        }
      }
      cardSlotsByRef[ref] = key;
      if ((Blockly.BBasic.titleBallVaryRefs || new Set()).has(ref)) {
        const place = titleCardBallPlaces(card)[0];
        const varName = (canonical) => Blockly.BBasic.nameDB_.getName(canonical, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        Blockly.BBasic.titleScreenStartLines.push(`${varName(titleCardBallXVarName(ref))} = ${titleBallXByte(place.x)}`);
      }
      // A graphic with a window height block starts with the window of the Title tab.
      if ((Blockly.BBasic.titleWindowRefs || new Set()).has(ref) && Number(card.scrollWindow) > 0 && Number(card.scrollWindow) < frameHeight) {
        Blockly.BBasic.titleScreenStartLines.push(`${Blockly.BBasic.nameDB_.getName(titleCardWindowVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${
          windowVarValue(key, Number(card.scrollWindow))}`);
      }
      // "Play animation once": the title screen starts with the graphic's once bit set and its frame counter at
      // the first frame, so every visit plays it through once.
      const startOnceIndex = card.playOnce && isCardAnimated(card) ?
        (Blockly.BBasic.titleCardOnceRefs || []).indexOf(ref) : -1;
      if (startOnceIndex !== -1) {
        Blockly.BBasic.titleScreenStartLines.push(
            `${titleCardOnceVar()}{${titleCardOnceBit(startOnceIndex)}} = 1`,
            `${Blockly.BBasic.nameDB_.getName(titleCardFrameCounterVarName(ref),
                Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = 0`);
      }
      if (isCardAnimated(card)) {
        const pageColor = Number(screen.backgroundColor) || 0;
        cardAnimationByRef[ref] = {key, frameHeight, frameCount, frameDurations, frameOffsets, colorOffsets, colorPages,
          colorSplit,
          frameBoxes: card.frames.map((frame) => titleFrameBox(card, frame, pageColor)),
          ballPlaces: titleCardHasBall(card) ? titleCardBallPlaces(card) : null};
      }
    });

    // About how many lines the page's cards take: the picture of a page shows about 200 lines (the rest of the page is cut off, a text row among it), a graphic
    // takes its rows (two lines each when it is square pixels) and about 7 lines to set up, a text card or the text under the page about 19 (32 with a second row).
    const textLines = Blockly.BBasic.isTextRow2Used() ? 32 : 19;
    const estimatedLines = (screen.cards || []).reduce((total, card) => {
      if (card.type === 'space') return total + Math.max(1, Math.round(Number(card.lines) || 1));
      if (card.type === 'player') return total + Math.max(1, Math.round(Number(card.windowHeight) || 50)) + 4;
      if (card.type === 'score') return total + 12;
      if (card.type === 'text') return total + (screenHasTextCard ? textLines : 0);
      const typeInfo = titleCardTypeInfo(card);
      return typeInfo ? total + padTitleCardFrames(card, typeInfo).frameHeight * (typeInfo.doubleLine ? 2 : 1) + 7 : total;
    }, 0) + (!screenHasTextCard && Blockly.BBasic.isTitleTextUsed() && Blockly.BBasic.titleUnderTextUsed ? textLines : 0);
    if (estimatedLines > 200 && !Blockly.BBasic.titleLayoutWarned.has(screen.id)) {
      Blockly.BBasic.titleLayoutWarned.add(screen.id);
      appendCompileLog(`Title screen "${screen.name || screen.id}": its cards take about ${estimatedLines} lines, and the picture shows about 200: the end of the page is cut off` +
        `${screenHasTextCard || (Blockly.BBasic.isTitleTextUsed() && Blockly.BBasic.titleUnderTextUsed) ? ' (a text row at the end with it)' : ''}.`, 'info');
    }
    screenPlans.push({
      id: screen.id,
      backgroundColor: Number(screen.backgroundColor) || 0,
      layoutMacroName: `titlescreenlayout_${screen.id}`,
      layoutLines,
      hasTextCard: screenHasTextCard,
    });
  });

  // With a Player card on several pages, the first page drawn after Title screen start puts its card's sprites in place too (no page was
  // drawn before: the page number is one no page has).
  const playerPageCount = Object.keys(playerHeights).length;
  if (playerPageCount > 1 && Blockly.BBasic.titleScreenSelectedIdVarName) {
    Blockly.BBasic.titleScreenStartLines.push(`${Blockly.BBasic.titleScreenSelectedIdVarName} = ${titleNoPageId(screens)}`);
  }
  Blockly.BBasic.titlePlayerKernelLines = playerKernelLines;
  return {usedKernelKeys, dataBlocks, screenPlans, cardSlotsByRef, cardAnimationByRef,
    hasPlayerCard, playerHeights: playerPageCount ? playerHeights : null, hasScoreCard, hasTextCard};
};

// The text under a page's graphics (see titletextkernel in text12a.asm), when the project uses the Text Minikernel too: called
// once the layout is done, if the page's timer has enough left for it. A bankswitched ROM calls into the kernel bank the way
// batari Basic does (the return address, the target, then the registers, through the bank switch).
const TEXT_KERNEL_BANK_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8, '64k': 16};
// (The DPC+ text kernel, text12DPCplus.asm, is in bank 6: see "const textbank = 6" in generators/bbasic.js.)
const DPC_PLUS_TEXT_BANK = 6;
const titleTextKernelBank = () => {
  const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
  return config.kernel === 'dpcplus' ? DPC_PLUS_TEXT_BANK : TEXT_KERNEL_BANK_BY_ROMSIZE[config.romSize] || 0;
};

// A text card in a page's layout (the text of one Text tab entry, in the middle of the page): the entry's first row goes where the text kernel
// reads it, the kernel is called the way the call under the page does it (see buildTitleTextCall), and the page's color is put back
// on the line after the text.
const buildTextCardLines = (Blockly, textId, number) => {
  const {offset, wrap} = Blockly.BBasic.titleTextCardInfo(textId);
  const kernelBank = titleTextKernelBank();
  const ret = `title_textcard_${number}_ret`;
  return [
    ` lda #${offset}`,
    ' sta TextIndex',
    ...(Blockly.BBasic.isTextRow2Used() ? [` lda #${wrap ? 1 : 0}`, ' sta TextRow2Active'] : []),
    ...(kernelBank ? [
      ` lda #>(${ret}-1)`, ' pha', ` lda #<(${ret}-1)`, ' pha',
      ' lda #>(titletextkernel-1)', ' pha', ' lda #<(titletextkernel-1)', ' pha',
      ' pha', ' pha', ` ldx #${kernelBank}`, ' jmp BS_jsr', ret,
    ] : [' jsr titletextkernel']),
    ' sta WSYNC',
    ' lda titlescreencolor',
    ' sta COLUBK',
  ];
};

const buildTitleTextCall = (Blockly) => {
  if (!Blockly.BBasic.isTitleTextUsed() || !Blockly.BBasic.titleUnderTextUsed) return [];
  const kernelBank = titleTextKernelBank();
  return [
    '\tlda INTIM',
    `\tcmp #${Blockly.BBasic.titleTextTimerTicks()}`,
    '\tbcc title_text_skip',
    ...(kernelBank ? [
      '\tlda #>(title_text_return-1)',
      '\tpha',
      '\tlda #<(title_text_return-1)',
      '\tpha',
      '\tlda #>(titletextkernel-1)',
      '\tpha',
      '\tlda #<(titletextkernel-1)',
      '\tpha',
      '\tpha ; *** save A (the text kernel does not use it)',
      '\tpha ; *** save X (nor this)',
      `\tldx #${kernelBank}`,
      '\tjmp BS_jsr',
      '@title_text_return',
    ] : ['\tjsr titletextkernel']),
    '@title_text_skip',
  ];
};

// Every internal label the driver body below defines gets an "@" prefix -
// required so Blockly.BBasic.normalizeIndents (applied to every
// Blockly.BBasic.subroutines entry via generateSubroutineBody) doesn't
// wreck the column-0-for-labels-vs-indented-for-mnemonics distinction DASM
// requires inside a raw "asm ... end" block - see generators/bbasic/
// input.js's buildKeypadPollAsm for the same trick, confirmed there
// directly against a real build ("Unknown Mnemonic" failures without it).
// Only the CLOSING "end" needs it too (not the opening "asm") - matching
// that same file's  established convention.
//
// Structure mirrors the original single-screen Titlescreen Kernel driver
// almost exactly (see the version history of this file/public/bb19/
// titlescreen/titlescreen_kernel.asm) - the only real difference is the
// runtime dispatch chain in the middle (choosing which screen's
// titlescreenlayout_N macro and background color to use, based on
// selectedIdVarName, set by the "Draw title screen" block generator below
// right before its "gosub"), so every screen can share ONE compiled
// copy of the vsync/vblank/overscan boilerplate and this ROM's one shared
// set of physical kernel copies instead of needing its  duplicate of
// each (which would either waste ROM repeating identical boilerplate per
// screen, or need every internal label renamed per screen and still fight
// the SAME per-copy kernel files - 48x1_X_kernel.asm's  position48 calls
// via plain same-bank "jsr" - being reachable from multiple different
// banks, which they can't be without their  bank-switch trampolines).
// A page's picture is timed with a fixed number of ticks (230 of 64 cycles) and the overscan after it with 34. With text under the pages the picture
// is given these ticks more and the overscan as many less (the frame keeps its length): a page with a lot of graphics (the Bricks of Olympus
// logo page, with the logo, its title and the torches) had less than the text needs left, and showed none.
const TITLE_TEXT_EXTRA_TICKS = 12;
const buildDriverAsm = (selectedIdVarName, screenPlans, usedKernelKeys, playerKernelLines, hasScoreCard, bgVarName, textCall, shareSetup = false, shareKeys = null, uniformUsed = false,
    ballUsed = false) => {
  const extraTicks = (textCall && textCall.length) || screenPlans.some((plan) => plan.hasTextCard) ? TITLE_TEXT_EXTRA_TICKS : 0;
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
      `\tlda #${230 + extraTicks}`,
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
  // right before its  gosub) against every screen this build actually
  // knows about. Falls through to the next screen's  check on a
  // mismatch; the LAST screen skips its  check and always matches, so a
  // stale/out-of-range id (shouldn't happen - the block's  dropdown can
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
        // With "Set title screen background color" in the project the color comes from a
        // variable (set by every Draw title screen block, see titlescreen_draw).
        bgVarName ? `\tlda ${bgVarName}` : `\tlda #${toColorHexByte(plan.backgroundColor)}`,
        '\tsta titlescreencolor',
        '\tsta COLUBK',
        `\t${plan.layoutMacroName}`,
        // (A page with a text card has its text in the middle: none under it.)
        plan.hasTextCard ? '\tjmp PFWAIT' : '\tjmp title_playfield_done',
    );
    if (!isLast) lines.push(`@titlescreen_skip_${plan.id}`);
  });

  lines.push(
      '',
      '@title_playfield_done',
      // The text call is at the end of the driver: the kernels time their lines to the cycle, and more bytes up here would move them.
      '\tjmp ' + (textCall && textCall.length ? 'title_text_draw' : 'PFWAIT') + ' ; kernel is done. Finish off the screen',
      '',
      '\tinclude "position48.asm"',
  );
  // A title screen too big for its bank has its 48x2 graphics share one setup routine (see 48x2_S_kernel.asm): the cards ask for it
  // with this number.
  const sharedKeys = shareSetup ? [...usedKernelKeys].filter((key) => (shareKeys || new Set()).has(key)) : [];
  // A graphic with row colors of one color has them as one byte: the kernel then has a loop that does not read them (see 48x2_X_kernel.asm).
  if (uniformUsed && [...usedKernelKeys].some((key) => key.startsWith('48x2_'))) lines.push('@title_uniform_48x2 = 1');
  // A 48x2 graphic with the ball behind it has its entry and loops (see draw_bmp_48x2_XB).
  if (ballUsed && [...usedKernelKeys].some((key) => key.startsWith('48x2_'))) lines.push('@title_ball_48x2 = 1');
  if (sharedKeys.length) {
    sharedKeys.forEach((key) => lines.push(`@bmp_${key}_shared = 1`));
    lines.push('\tinclude "48x2_S_kernel.asm"', '');
  }

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
  // just be included/omitted outright rather than needing its #ifconst
  // mk_player_on guard the way the numbered bitmap kernels do (their
  // "used at all" state isn't known until layoutmacros.asm's  draw_TYPE_N
  // macro runs during assembly).
  // (playerKernelLines: the numbers of lines a row of the Player cards, null without one: a loop of the kernel for each.)
  if (playerKernelLines) {
    playerKernelLines.forEach((kernelLines) => lines.push(`@title_player_k${kernelLines} = 1`));
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
      `\tlda #${34 - extraTicks}+128`,
      '\telse',
      `\tlda #overscan_time+128-5-${extraTicks}`,
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
      // NUSIZ9 is not one of the bytes the kernel borrows (its score pointers end at NUSIZ8): it is left as it is.
      '\tcpy #8',
      '\tbeq .skipnusiz9',
      '\tsta _NUSIZ1,y',
      '@.skipnusiz9',
      '\tendif',
      '\tdey',
      '\tbpl .playerheightfixloop',
      '\tendif',
      '',
      // Actually wait out the overscan timer set just above - without this,
      // the "overscan period" TIM64T was configured for never really
      // happens; whatever RETURN falls into (commongamelogic, then the next
      // loop iteration's  vsync) starts immediately, however many/few
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
      // reads this directly for its  COLUPF/PF1/PF2 defaults, not just
      // the COLUBK line above, so it has to exist as a real shared symbol
      // regardless of which screen is currently selected - confirmed as a
      // real build failure ("Unknown Mnemonic 'lda titlescreencolor'")
      // once this byte was removed under the assumption only this
      // driver's  COLUBK line needed it. Forward/backward references
      // both resolve fine within one DASM assembly pass, so this can sit
      // anywhere in the body - here, right before the per-card image data.
      '@titlescreencolor',
      '\t.byte 0',
      '',
      '\tinclude "titlescreen_data.asm"',
      // After the graphics data, so nothing the kernels time to the cycle (their code, their tables) moves.
      ...(textCall && textCall.length ? ['@title_text_draw', ...textCall, '\tjmp PFWAIT', ''] : []),
      '@end',
  );

  return lines.join('\n');
};

// A run of "if counter >= N then variable = value" lines costs about 9 bytes each for every variable. Over four or more steps the same is
// a loop over a table of the steps and a table of the values: the first step is the number of limits the counter has got to. The
// assembly is written the way the generated code wants it (labels and the closing "end" marked with "@", see normalizeIndents).
const TITLE_STEP_TABLE_MIN = 4;
const stepTableAsm = (Blockly, counterVar, limits, targets) => {
  const id = Blockly.BBasic.blockNumbers.next('titlestep');
  const [loop, found, past, limitTable] = ['loop', 'found', 'past', 'limits'].map((part) => `_titlestep_${id}_${part}`);
  const lines = [' asm', '  ldy #0', `@${loop}`, `  cpy #${limits.length}`, `  bcs ${found}`, `  lda ${counterVar}`, `  cmp ${limitTable},y`,
    `  bcc ${found}`, '  iny', `  bne ${loop}`, `@${found}`];
  targets.forEach((target, index) => {
    lines.push(`  lda _titlestep_${id}_v${index},y`);
    [].concat(target.add || []).forEach((operand) => lines.push('  clc', `  adc ${operand}`));
    lines.push(`  sta ${target.variable}`);
  });
  lines.push(`  jmp ${past}`, `@${limitTable}`, `  .byte ${limits.join(', ')}`);
  targets.forEach((target, index) => lines.push(`@_titlestep_${id}_v${index}`, `  .byte ${target.values.join(', ')}`));
  lines.push(`@${past}`, '@end');
  return lines;
};

// The same for "if counter = N then variable = value" (a value written when the counter is exactly at a frame's start).
const startTableAsm = (Blockly, counterVar, starts, variable, values) => {
  const id = Blockly.BBasic.blockNumbers.next('titlestep');
  const [loop, hit, past, startTable, valueTable] = ['loop', 'hit', 'past', 'starts', 'values'].map((part) => `_titlestep_${id}_${part}`);
  return [' asm', `  ldy #${starts.length - 1}`, `  lda ${counterVar}`, `@${loop}`, `  cmp ${startTable},y`, `  beq ${hit}`, '  dey', `  bpl ${loop}`,
    `  jmp ${past}`, `@${hit}`, `  lda ${valueTable},y`, `  sta ${variable}`, `  jmp ${past}`, `@${startTable}`, `  .byte ${starts.join(', ')}`,
    `@${valueTable}`, `  .byte ${values.join(', ')}`, `@${past}`, '@end'];
};

// Per-frame code for every animated card (more than one frame - see
// isCardAnimated's comment in blocks/titlescreen.js), spliced into
// commongamelogic (see generators/bbasic.bb.hbs's
// generatedTitleScreenAnimationChecks placement, right alongside the
// background-fade/seek/etc. checks) so playback advances every real frame
// regardless of where the project's "Draw title screen" block happens
// to sit - background_fade_to hit a real bug from NOT doing this (stalling
// when triggered from inside an "if", since a trigger's code only
// re-runs while that condition holds - see emitColorFadeTrigger's
// comment in generators/bbasic/background.js), so this follows that same
// "always-run check, not tied to the trigger's placement" shape from
// the start instead of risking the same class of bug.
//
// Each card's counter (titleCardFrameCounterVarName) ticks up once per
// real frame and wraps at the animation's total duration (sum of every
// frame's duration), exactly like a Player sprite's player0frame
// (see processAnimation's stateMachine/frameLimit in generators/
// bbasic.js) - reusing that same proven cumulative-duration-threshold
// approach, just landing on a plain NUMBER (temp1, this card's resolved
// frame index) instead of jumping into inline per-frame graphic code the
// way sprites need to (a title card's graphic data is already a plain
// data table, nothing to jump into). temp1 is safe as scratch here the same
// way it already is everywhere else in this codebase (see e.g.
// sprite_player_set's width-conversion branch in this same file's
// sibling generators/bbasic/sprites.js) - written and consumed within this
// one uninterrupted block, never left live across a drawscreen call.
//
// The final index write optionally adds this card's scroll-offset var
// (only for cards actually targeted by a "Set title screen scroll position"
// block - see titleScreenScrollTargetRefs' comment at its bbasic.js
// call site) - bmp_${key}_index already means "row offset from the top of
// the FULL stacked image" (see buildCardDataAsm's comment), and frame
// index * frameHeight already lands exactly on that frame's first row
// in that same stacked table, so adding a small scroll offset on top slides
// the visible window WITHIN whichever frame is currently showing, without
// the two ever needing to know about each other beyond this one shared sum.
const generateTitleScreenAnimationChecks = (Blockly, cardAnimationByRef) => {
  const refs = Object.keys(cardAnimationByRef);
  // What is worked out just before a page is drawn, for each page (see titlescreen_draw).
  const derivedLines = {};
  Blockly.BBasic.titleDerivedLines = derivedLines;
  const windowRefs = Blockly.BBasic.titleWindowRefs || new Set();
  if (!refs.length && !windowRefs.size) return '';
  const scrollTargetRefs = Blockly.BBasic.titleScreenScrollTargetRefs || new Set();
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const animatedCode = refs.map((ref) => {
    // frameOffsets[N] (see buildCardDataAsm) is frame N's ALREADY-computed
    // physical byte offset - a plain multiply of frameHeight before frame
    // dedup existed, but now possibly shared with an earlier, identical
    // frame's offset - so each branch below writes it directly instead of
    // writing a frame NUMBER (temp1) and multiplying by frameHeight
    // afterward, which would only ever reach a frame's offset, never a
    // duplicate's shared one.
    const {key, frameDurations, frameOffsets, colorOffsets, colorPages, colorSplit} = cardAnimationByRef[ref];
    // A graphic whose color lists are stacked a page at a time (titleCardColorSplit) also writes the list's page.
    const counterVar = resolveVar(titleCardFrameCounterVarName(ref));
    const totalDuration = frameDurations.reduce((sum, duration) => sum + duration, 0) || frameDurations.length;
    // The frame counter is one byte, so every frame's duration added together has to fit in it.
    if (totalDuration > 255) {
      const [pageId, cardId] = ref.split(':');
      throw new Error(`The title screen graphic with id ${cardId} on page ${pageId} plays for ${totalDuration} ticks ` +
        'in all (the Duration of every frame added up), but an animation can last at most 255. ' +
        'Shorten the Duration of one or more of its frames.');
    }
    // A graphic with a window height block: its pointers are made for a window of one line, so what the kernel takes off them is the scroll position plus the
    // window less one (the window byte holds that for a 48 wide graphic, see windowVarValue).
    const windowAdd = windowRefs.has(ref) && !key.startsWith('96x2') ? ` + ${resolveVar(titleCardWindowVarName(ref))}` : '';
    const scrollTerm = scrollTargetRefs.has(ref) ? ` + ${resolveVar(titleCardScrollOffsetVarName(ref))}${windowAdd}` : '';
    const colorScrollTerm = colorSplit === 'page' ? '' : scrollTerm;
    // A faded graphic's color list is the one its fade is on, not what the frame says (the fade moves it, see below).
    const isFaded = !!(Blockly.BBasic.titleRowFadePlans || {})[ref];
    // While a "Set title screen graphic frame" block holds the graphic, its frame counter stands still.
    const holdRefs = Blockly.BBasic.titleCardHoldRefs || [];
    const holdIndex = holdRefs.indexOf(ref);
    // With several pages a graphic's counter only runs while its page is the one drawn: otherwise a graphic
    // on a page that is not showing yet plays (or, set to play once, finishes) before anyone sees it.
    const selectedVar = Blockly.BBasic.titleScreenSelectedIdVarName;
    const conditions = [
      selectedVar ? `${selectedVar} = ${ref.split(':')[0]}` : '',
      holdIndex === -1 ? '' : `!${titleCardHoldVar()}{${titleCardHoldBit(holdIndex)}}`,
    ].filter(Boolean);
    // A graphic an "Animate ... in reverse" block can play backwards counts down while its reverse bit is set.
    const reverseIndex = (Blockly.BBasic.titleCardReverseRefs || []).indexOf(ref);
    const reverseBit = reverseIndex === -1 ? '' : `${titleCardReverseVar()}{${titleCardReverseBit(reverseIndex)}}`;
    const forwardConditions = [...conditions, reverseBit ? `!${reverseBit}` : ''].filter(Boolean);
    const tick = forwardConditions.length ? ` if ${forwardConditions.join(' && ')} then ${counterVar} = ${counterVar} + 1` :
      ` ${counterVar} = ${counterVar} + 1`;
    const notReverse = reverseBit ? ` && !${reverseBit}` : '';
    // After "play once" the counter stays on the last frame instead of starting again.
    const onceIndex = (Blockly.BBasic.titleCardOnceRefs || []).indexOf(ref);
    const stopOnLast = onceIndex === -1 ? [] :
      [` if ${counterVar} >= ${totalDuration} && ${titleCardOnceVar()}{${titleCardOnceBit(onceIndex)}}${notReverse} then ${counterVar} = ${totalDuration - 1}`];
    // A block watching for the animation to finish: the first time the counter runs off the end, until it is
    // back at the start.
    const finishedIndex = (Blockly.BBasic.titleCardFinishedRefs || []).indexOf(ref);
    const finishedFlag = finishedIndex === -1 ? '' : `${titleCardFinishedVar()}{${titleCardFinishedBit(finishedIndex)}}`;
    const finishedLatch = finishedIndex === -1 ? '' : `${titleCardFinishedVar()}{${titleCardFinishedLatchBit(finishedIndex)}}`;
    const detectFinish = finishedIndex === -1 ? [] : [
      ` if ${counterVar} >= ${totalDuration} && !${finishedLatch}${notReverse} then ${finishedFlag} = 1`,
      ` if ${counterVar} >= ${totalDuration}${notReverse} then ${finishedLatch} = 1`,
    ];
    // Counting down: at the first frame the animation has finished; a loop goes round to the last frame again,
    // a graphic that plays once stays where it is.
    const reverseConditions = reverseBit ? [...conditions, reverseBit] : [];
    const onceBit = onceIndex === -1 ? '' : `${titleCardOnceVar()}{${titleCardOnceBit(onceIndex)}}`;
    const reverseLines = !reverseBit ? [] : [
      ...(finishedIndex === -1 ? [] : [
        ` if ${[...reverseConditions, `${counterVar} = 0`, `!${finishedLatch}`].join(' && ')} then ${finishedFlag} = 1`,
        ` if ${[...reverseConditions, `${counterVar} = 0`].join(' && ')} then ${finishedLatch} = 1`,
      ]),
      ` if ${[...reverseConditions, `${counterVar} = 0`, onceBit ? `!${onceBit}` : ''].filter(Boolean).join(' && ')} then ${counterVar} = ${totalDuration}`,
      ` if ${[...reverseConditions, `${counterVar} > 0`].join(' && ')} then ${counterVar} = ${counterVar} - 1`,
      ...(finishedIndex === -1 ? [] : [
        ` if ${reverseBit} && ${counterVar} >= ${totalDuration - 1} then ${finishedLatch} = 0`]),
    ];
    const lines = [
      tick,
      ...detectFinish,
      ...stopOnLast,
      ...reverseLines,
      ` if ${counterVar} >= ${totalDuration}${notReverse} then ${counterVar} = 0`,
      ...(finishedIndex === -1 ? [] : [` if ${counterVar} = 0${notReverse} then ${finishedLatch} = 0`]),
    ];
    // The picture's frame offset and the row color list's offset and page are worked out from the counter, every pass; where those
    // bytes are shared with another page's graphics they are worked out just before this page is drawn instead (see titlescreen_draw).
    const derivedVars = Blockly.BBasic.titleDerivedVars || new Set();
    const pageId = ref.split(':')[0];
    const indexLines = derivedVars.has(titleCardIndexVarName(ref)) ? (derivedLines[pageId] = derivedLines[pageId] || []) : lines;
    const colorIndexLines = derivedVars.has(titleCardColorIndexVarName(ref)) ?
      (derivedLines[pageId] = derivedLines[pageId] || []) : lines;
    const colorPageLines = derivedVars.has(titleCardColorPageVarName(ref)) ?
      (derivedLines[pageId] = derivedLines[pageId] || []) : lines;
    // Over several frames the steps are a loop over tables (see stepTableAsm); the variables that go to the same place share it.
    const limits = [];
    frameDurations.reduce((sum, duration, frameIndex) => {
      if (frameIndex < frameDurations.length - 1) limits.push(sum + duration);
      return sum + duration;
    }, 0);
    const scrollVarOf = (term) => (term ? term.split(' + ').filter(Boolean) : null);
    const stepTargets = [
      {lines: indexLines, variable: `bmp_${key}_index`, values: frameOffsets, add: scrollVarOf(scrollTerm), term: scrollTerm},
      // (A card that keeps its colors apart, see titleCardColorSplit, moves a second offset along with the picture's.)
      ...(colorOffsets && !isFaded ? [{lines: colorIndexLines, variable: `bmp_${key}_colorindex`, values: colorOffsets,
        add: scrollVarOf(colorScrollTerm), term: colorScrollTerm}] : []),
      ...(colorPages && colorOffsets && !isFaded ? [{lines: colorPageLines, variable: `bmp_${key}_colorpage`, values: colorPages,
        add: null, term: ''}] : []),
    ];
    // (Without the steps of the offset, the page is only set for the first frame.)
    if (colorPages && !(colorOffsets && !isFaded)) colorPageLines.push(` bmp_${key}_colorpage = ${colorPages[0]}`);
    if (limits.length >= TITLE_STEP_TABLE_MIN) {
      [...new Set(stepTargets.map((target) => target.lines))].forEach((destination) => {
        destination.push(...stepTableAsm(Blockly, counterVar, limits, stepTargets.filter((target) => target.lines === destination)));
      });
    } else {
      stepTargets.forEach((target) => {
        target.lines.push(` ${target.variable} = ${target.values[0]}${target.term}`);
        limits.forEach((limit, index) => {
          target.lines.push(` if ${counterVar} >= ${limit} then ${target.variable} = ${target.values[index + 1]}${target.term}`);
        });
      });
    }
    // The ball's place and width, when they differ between the frames, are written when a frame starts.
    if ((Blockly.BBasic.titleBallVaryRefs || new Set()).has(ref) && cardAnimationByRef[ref].ballPlaces) {
      const {ballPlaces} = cardAnimationByRef[ref];
      const starts = [];
      frameDurations.reduce((start, frameDuration) => {
        starts.push(start);
        return start + frameDuration;
      }, 0);
      [[titleCardBallXVarName, (place) => titleBallXByte(place.x)]]
          .forEach(([varNameOf, value]) => {
            const ballVar = resolveVar(varNameOf(ref));
            if (starts.length >= TITLE_STEP_TABLE_MIN) {
              lines.push(...startTableAsm(Blockly, counterVar, starts, ballVar, ballPlaces.map(value)));
              return;
            }
            starts.forEach((start, frameIndex) => lines.push(` if ${counterVar} = ${start} then ${ballVar} = ${value(ballPlaces[frameIndex])}`));
          });
    }
    // A picture background that differs between the frames is written when a frame starts (so a block that
    // changes it in between lasts until the next frame).
    if ((Blockly.BBasic.titleFrameBoxRefs || new Set()).has(ref)) {
      const {frameBoxes} = cardAnimationByRef[ref];
      [['pf1', titleCardBoxPf1VarName, (value) => value], ['pf2', titleCardBoxPf2VarName, (value) => value],
        ['background', titleCardBoxColorVarName, toColorHexByte]].forEach(([field, varNameOf, format]) => {
        if (frameBoxes.every((box) => box[field] === frameBoxes[0][field])) return;
        const boxVar = resolveVar(varNameOf(ref));
        const starts = [];
        frameDurations.reduce((start, frameDuration) => {
          starts.push(start);
          return start + frameDuration;
        }, 0);
        if (starts.length >= TITLE_STEP_TABLE_MIN) {
          lines.push(...startTableAsm(Blockly, counterVar, starts, boxVar, frameBoxes.map((box) => format(box[field]))));
          return;
        }
        starts.forEach((start, frameIndex) => {
          lines.push(` if ${counterVar} = ${start} then ${boxVar} = ${format(frameBoxes[frameIndex][field])}`);
        });
      });
    }
    return lines.join('\n');
  }).join('\n\n');
  // A graphic with a window height block that does not play (one frame) has its index worked out from the scroll position and the window every pass too.
  const staticCode = [...windowRefs].filter((ref) => !cardAnimationByRef[ref]).map((ref) => {
    const key = Blockly.BBasic.titleScreenCardSlots && Blockly.BBasic.titleScreenCardSlots[ref];
    if (!key) return '';
    return ` bmp_${key}_index = ${resolveVar(titleCardScrollOffsetVarName(ref))}${key.startsWith('96x2') ? '' : ` + ${resolveVar(titleCardWindowVarName(ref))}`}`;
  }).filter(Boolean).join('\n');
  return [animatedCode, staticCode].filter(Boolean).join('\n\n') + '\n';
};

// The steps of the "Fade title screen graphic color" fades, one check for each graphic a block fades: the same steps as the Score and
// Background fades (see buildFadeCheckAsm in generators/bbasic/background.js), the fade running for as long as the color is not
// the target.
const generateTitleColorFadeChecks = (Blockly) => {
  const refs = [...(Blockly.BBasic.titleFadeRefs || [])];
  const resolve = (canonicalName) => Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  // A multicolor graphic's fade: its color list offset (which the kernel reads) steps down the lists made ahead of time, a list
  // every few frames, until it is on the last, and the timer says how long until the next step. Labels get their "@" in the
  // subroutine (see TITLE_FADE_CHECKS_NAME).
  const plans = Blockly.BBasic.titleRowFadePlans || {};
  const rowChecks = Object.keys(plans).map((ref, index) => {
    const {height, stepCount, pace} = plans[ref];
    const timer = resolve(titleCardFadeTimerVarName(ref));
    const colorIndex = resolve(titleCardColorIndexVarName(ref));
    const skip = `_titlerowfade_${index}_skip`;
    return [` if ${timer} = 0 then goto ${skip}`, ` ${timer} = ${timer} - 1`, ` if ${timer} <> 0 then goto ${skip}`,
      ` ${colorIndex} = ${colorIndex} + ${height}`, ` if ${colorIndex} < ${stepCount * height} then ${timer} = ${pace}`, skip]
        .join('\n');
  }).join('\n');
  if (!refs.length && !rowChecks) return '';
  if (refs.length && !Blockly.BBasic.buildFadeCheckAsm) return '';
  const colorChecks = refs.map((ref, index) => {
    const constantPace = (Blockly.BBasic.titleFadeConstantPace || {})[ref];
    const asmLines = Blockly.BBasic.buildFadeCheckAsm({
      colorVar: resolve(titleCardColorVarName(ref)),
      targetVar: resolve(titleCardFadeTargetVarName(ref)),
      timerVar: resolve(titleCardFadeTimerVarName(ref)),
      paceVar: constantPace === undefined ? resolve(titleCardFadePaceVarName(ref)) : `#${constantPace}`,
      flagsVar: null,
      tag: `titlecard${index}`,
    });
    return asmLines;
  }).join('\n');
  // (No empty line in front of the steps of a multicolor graphic's fade when no single color fade is there: an empty line gets an "@" in the subroutine, which
  // took the lines after it for labels and the build failed with "Unknown Mnemonic".)
  return [colorChecks, rowChecks].filter(Boolean).join('\n') + '\n';
};

// Each Player sprites animation with more than one frame plays by itself: the same duration counter the
// picture cards use picks the frame, and bmp_playerN_index is its byte offset (frame * the frame's height).
// With a Player card on several pages, a page's animations play while the page is the one drawn (the counter and the frame offset of a player are
// shared by the pages).
const generateTitlePlayerChecks = (Blockly) => {
  const slots = Blockly.BBasic.titlePlayerSlots;
  if (!slots) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const selectedVar = Blockly.BBasic.titleScreenSelectedIdVarName;
  const byPage = slots.pages.length > 1 && selectedVar;
  return slots.pages.flatMap((page) => [0, 1].filter((playerIndex) => page.slots[playerIndex].frameCount > 1).map((playerIndex) => {
    const {height, durations} = page.slots[playerIndex];
    const counterVar = resolveVar(titlePlayerFrameVarName(playerIndex));
    const indexVar = resolveVar(titlePlayerIndexVarName(playerIndex));
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    const stopOnLast = slots[playerIndex].once ?
      [` if ${counterVar} >= ${total} && ${titlePlayerOnceVar()}{${titlePlayerOnceBit(playerIndex)}} then ${counterVar} = ${total - 1}`] : [];
    const lines = [
      ` ${counterVar} = ${counterVar} + 1`,
      ...stopOnLast,
      ` if ${counterVar} >= ${total} then ${counterVar} = 0`,
      ` ${indexVar} = 0`,
    ];
    const limits = [];
    durations.reduce((sum, duration, frameIndex) => {
      if (frameIndex < durations.length - 1) limits.push(sum + duration);
      return sum + duration;
    }, 0);
    if (limits.length >= TITLE_STEP_TABLE_MIN) {
      // (The index starts at 0, set in the lines above: the table holds it for every step, the first one too.)
      lines.pop();
      lines.push(...stepTableAsm(Blockly, counterVar, limits,
          [{variable: indexVar, values: durations.map((_, index) => index * height), add: null}]));
    } else {
      limits.forEach((limit, index) => lines.push(` if ${counterVar} >= ${limit} then ${indexVar} = ${(index + 1) * height}`));
    }
    if (!byPage) return lines.join('\n');
    const skip = `_titleplayer_${page.screenId}_${playerIndex}_skip`;
    return [` if ${selectedVar} <> ${page.screenId} then goto ${skip}`, ...lines, `@ ${skip}`].join('\n');
  })).join('\n\n') + '\n';
};

export const TITLE_SCREEN_SUBROUTINE_NAME = '_titlescreen_system';
export const TITLE_FADE_CHECKS_NAME = '_title_fade_checks';
// The frame offsets of a page's graphics that share their bytes with other pages' graphics, worked out right before that page is drawn.
export const titleDeriveSubroutineName = (pageId) => `_title_derive_${pageId}`;

// One bit that says "End title screen" has run: from then on Title screen update draws the regular
// game screen instead of the kernel's. Set by the block, cleared by Title screen start.
// One bit that is set while the Title Screen loop runs (see generatedTitleKernelSkip in bbasic.js): the shared part of the game loop returns before
// the half that prepares the regular screen while it is set. (It used to be bit 7 of player0size, which the DPC+ animation code uses as its own
// "picture loaded" flag: with a title screen in the project the animation of player 0 stopped on its first picture, and hiding it did nothing.)
export const TITLE_KERNEL_LOOP_FAMILY = 'titleKernelLoop';
export const titleKernelLoopVar = () => flagPoolVar(TITLE_KERNEL_LOOP_FAMILY);
export const titleKernelLoopBit = () => flagPoolBit(TITLE_KERNEL_LOOP_FAMILY, 0);
export const TITLE_KERNEL_ENDED_FAMILY = 'titleKernelEnded';
export const titleKernelEndedVar = () => flagPoolVar(TITLE_KERNEL_ENDED_FAMILY);
export const titleKernelEndedBit = () => flagPoolBit(TITLE_KERNEL_ENDED_FAMILY, 0);

// One bit per graphic that a "Set title screen graphic frame" block can hold on a frame: while it
// is set the graphic's frame counter stands still (see generateTitleScreenAnimationChecks).
export const TITLE_CARD_HOLD_FAMILY = 'titleCardHold';
export const titleCardHoldVar = () => flagPoolVar(TITLE_CARD_HOLD_FAMILY);
export const titleCardHoldBit = (index) => flagPoolBit(TITLE_CARD_HOLD_FAMILY, index);
// One bit per graphic, and one per Player sprite, that a block has set to "play once": its frame counter
// stops on the last frame instead of wrapping (see generateTitleScreenAnimationChecks).
export const TITLE_CARD_ONCE_FAMILY = 'titleCardOnce';
export const titleCardOnceVar = () => flagPoolVar(TITLE_CARD_ONCE_FAMILY);
export const titleCardOnceBit = (index) => flagPoolBit(TITLE_CARD_ONCE_FAMILY, index);
// Two bits per graphic a "When title screen graphic animation finishes" block watches: the first says it
// finished (cleared by the block), the second keeps a graphic that plays once from finishing again and again
// while it rests on its last frame (cleared when the counter is back at the start).
// One bit per graphic an "Animate ... in reverse" block can play backwards: while it is set, the frame
// counter counts down instead of up.
export const TITLE_CARD_REVERSE_FAMILY = 'titleCardReverse';
export const titleCardReverseVar = () => flagPoolVar(TITLE_CARD_REVERSE_FAMILY);
export const titleCardReverseBit = (index) => flagPoolBit(TITLE_CARD_REVERSE_FAMILY, index);
// Two bits per "Animate title screen graphic" block, so it acts as a trigger: the block starts the animation
// when it runs after a frame in which it did not, not on every frame an "if" around it stays true. The first
// bit says it ran this frame, the second that it ran in the frame before.
export const TITLE_ANIMATE_FAMILY = 'titleAnimateTrigger';
export const titleAnimateVar = () => flagPoolVar(TITLE_ANIMATE_FAMILY);
export const titleAnimateRanBit = (index) => flagPoolBit(TITLE_ANIMATE_FAMILY, index * 2);
export const titleAnimatePreviousBit = (index) => flagPoolBit(TITLE_ANIMATE_FAMILY, index * 2 + 1);
export const TITLE_CARD_FINISHED_FAMILY = 'titleCardFinished';
export const titleCardFinishedVar = () => flagPoolVar(TITLE_CARD_FINISHED_FAMILY);
export const titleCardFinishedBit = (index) => flagPoolBit(TITLE_CARD_FINISHED_FAMILY, index * 2);
export const titleCardFinishedLatchBit = (index) => flagPoolBit(TITLE_CARD_FINISHED_FAMILY, index * 2 + 1);
export const TITLE_PLAYER_ONCE_FAMILY = 'titlePlayerOnce';
export const titlePlayerOnceVar = () => flagPoolVar(TITLE_PLAYER_ONCE_FAMILY);
export const titlePlayerOnceBit = (playerIndex) => flagPoolBit(TITLE_PLAYER_ONCE_FAMILY, Number(playerIndex));
// One bit that says "Set title screen background color" is in effect.
export const TITLE_BG_OVERRIDE_FAMILY = 'titleBgOverride';
export const titleBgOverrideVar = () => flagPoolVar(TITLE_BG_OVERRIDE_FAMILY);
export const titleBgOverrideBit = () => flagPoolBit(TITLE_BG_OVERRIDE_FAMILY, 0);

// Called from bbasic.js's  init(), right after reserveDevVar hands out
// selectedIdVarName - same timing/reasoning as generators/bbasic/input.js's
// registerKeypadPollSubroutine (see its  comment): this has to run
// before anything downstream reads Blockly.BBasic.subroutines back out, and
// the resolved var name it needs is already available at that point.
// Compiles EVERY screen currently in storage (not just ones some "Draw
// title screen" block happens to reference right now) - same "always
// compile every entry, not just referenced ones" convention Backgrounds/
// Player animations already use.
export const registerTitleScreenSubroutine = (Blockly, {selectedIdVarName}) => {
  const titleScreen = processTitleScreenStorageForBuild(useTitleScreenStorage());
  const {usedKernelKeys, dataBlocks, screenPlans, cardSlotsByRef, cardAnimationByRef,
    hasPlayerCard, playerHeights, hasScoreCard} = assignKernelSlots(titleScreen.screens, Blockly);

  Blockly.BBasic.titleScreenUsedKernelKeys = usedKernelKeys;
  Blockly.BBasic.titleScreenHasScoreCard = hasScoreCard;
  // Read back by the "Set title screen scroll position" block's
  // generator (see titlescreen_scroll_set below) - it only knows the
  // screen+card the user picked, not which physical kernel copy that
  // resolved to this build.
  Blockly.BBasic.titleScreenCardSlots = cardSlotsByRef;
  // Read back by "Set title screen player sprite frame" (see
  // titlescreen_player_frame_set below) - null when no "player" card exists
  // anywhere in the project, matching titleScreenCardSlots' "nothing to
  // reference yet" shape.
  Blockly.BBasic.titleScreenPlayerHeights = playerHeights;
  // Builds every animated card's per-frame duration-counter/index-write
  // code (see generateTitleScreenAnimationChecks' comment just below) -
  // has to happen here, not in a separate function called later from
  // bbasic.js's finish(), since cardAnimationByRef (frame heights/durations,
  // resolved kernel slot keys) only exists in this function's scope.
  // titleScreenScrollTargetRefs was already computed and stashed by
  // bbasic.js's pre-scan, BEFORE this function runs (same "reserve/scan
  // before any generator needs to resolve it" timing as every dev var
  // pre-scan in this codebase) - see reserveDevVar's call site there for
  // titleCardFrameCounterVarName/titleCardScrollOffsetVarName.
  // At the start of every frame, what each "Animate title screen graphic" block did last frame becomes
  // "the frame before" and the block starts again as one that has not run.
  const animateTriggerResets = (Blockly.BBasic.titleAnimateBlockIds || []).map((id, index) => [
    ` ${titleAnimateVar()}{${titleAnimatePreviousBit(index)}} = 0`,
    ` if ${titleAnimateVar()}{${titleAnimateRanBit(index)}} then ${titleAnimateVar()}{${titleAnimatePreviousBit(index)}} = 1`,
    ` ${titleAnimateVar()}{${titleAnimateRanBit(index)}} = 0`,
  ].join('\n')).join('\n') + ((Blockly.BBasic.titleAnimateBlockIds || []).length ? '\n' : '');
  Blockly.BBasic.titleScreenAnimationChecks = animateTriggerResets +
    generateTitleScreenAnimationChecks(Blockly, cardAnimationByRef) + generateTitlePlayerChecks(Blockly);
  // The fade steps are assembly with labels, so they are in the title screen loop only, not copied into the common game logic too.
  Object.keys(Blockly.BBasic.subroutines).filter((name) => name.startsWith('_title_derive_')).forEach((name) => {
    delete Blockly.BBasic.subroutines[name];
  });
  Object.entries(Blockly.BBasic.titleDerivedLines || {}).forEach(([pageId, derived]) => {
    if (derived.length) Blockly.BBasic.subroutines[titleDeriveSubroutineName(pageId)] = derived.join('\n');
  });
  // The fade steps are a separate subroutine, placed in whatever bank has room (see BG_FADE_CHECKS_NAME in generators/bbasic.js
  // for the same routine of the Background and Score fades); as a subroutine the code goes through normalizeIndents, which wants
  // labels marked with "@" and the closing "end" as "@end".
  const fadeChecksAsm = generateTitleColorFadeChecks(Blockly);
  delete Blockly.BBasic.subroutines[TITLE_FADE_CHECKS_NAME];
  if (fadeChecksAsm) {
    Blockly.BBasic.subroutines[TITLE_FADE_CHECKS_NAME] = fadeChecksAsm.split('\n').map((line) => {
      const text = line.trim();
      if (text === 'asm') return 'asm';
      if (text === 'end') return '@end';
      return /^[ ]/.test(line) ? text : '@' + text;
    }).join('\n');
  }
  // Read back by "Set title screen scroll position" (see titlescreen_scroll_set
  // below) - an animated card's index is owned by the per-frame check just
  // built above (frame base + scroll offset, recombined every frame), so
  // that block has to write to this card's scroll-offset var instead of
  // straight to bmp_${key}_index for one of these, or the two would fight
  // over the same byte every frame.
  Blockly.BBasic.titleScreenCardAnimations = cardAnimationByRef;
  const asmFiles = {'titlescreen_data.asm': packTitleData(dataBlocks.join('\n\n'))};
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
    buildDriverAsm(selectedIdVarName, screenPlans, usedKernelKeys, hasPlayerCard ? [...Blockly.BBasic.titlePlayerKernelLines] : null, hasScoreCard,
        Blockly.BBasic.titleBgUsed ?
          Blockly.BBasic.nameDB_.getName(TITLE_BG_COLOR_VAR_NAME, Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null,
        buildTitleTextCall(Blockly), !!Blockly.BBasic.titleShareSetup, Blockly.BBasic.titleShareKeys, !!Blockly.BBasic.titleUniformUsed,
        !!Blockly.BBasic.titleBallUsed);
};

// With a Player card on several pages: when the page drawn is not the one drawn last, the page's Player card puts its sprites where they start
// (its Start X and Y, centered without them, and its Size), as Title screen start does with one card.
const titlePlayerPageSwitch = (Blockly, screenId) => {
  const selectedVar = Blockly.BBasic.titleScreenSelectedIdVarName;
  const heights = (Blockly.BBasic.titleScreenPlayerHeights || {})[screenId];
  if (!selectedVar || !heights || Object.keys(Blockly.BBasic.titleScreenPlayerHeights).length < 2) return '';
  const page = titlePlayerPages(processTitleScreenStorageForBuild(useTitleScreenStorage()).screens)
      .find(({screen}) => String(screen.id) === String(screenId));
  if (!page) return '';
  const skip = `_titleplayerpage_${Blockly.BBasic.blockNumbers.next()}_same`;
  // A card with no Size draws one copy: when the card of another page has a Size for that player, it is put back to one copy here.
  const allPages = titlePlayerPages(processTitleScreenStorageForBuild(useTitleScreenStorage()).screens);
  const oneCopy = [0, 1].filter((player) => !titlePlayerSizeCode(page.card, player) && allPages.some((other) => titlePlayerSizeCode(other.card, player)))
      .map((player) => `player${player}size = player${player}size & $F8`);
  return [`if ${selectedVar} = ${screenId} then goto ${skip}`, ...titlePlayerCenterLines(page.card, heights),
    ...titlePlayerCardStartLines(page.card), ...oneCopy, `@ ${skip}`].join('\n') + '\n';
};

export default (Blockly) => {
  Blockly.BBasic['titlescreen_draw'] = function(block) {
    const screenId = block.getFieldValue('SCREEN');
    const selectedIdVarName = Blockly.BBasic.titleScreenSelectedIdVarName;
    // Only unset if no "Draw title screen" block exists anywhere on the
    // workspace at all (see bbasic.js's  titleScreenDrawUsed pre-scan) -
    // can't happen for a block that's actually being generated right now,
    // but guards against a stray leftover reference during, e.g., a
    // mid-refactor state.
    if ((!selectedIdVarName && !Blockly.BBasic.titleScreenDrawUsed) || !screenId) {
      return 'rem No title screen selected\n';
    }
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(TITLE_SCREEN_SUBROUTINE_NAME));
    // With a single page there is no page number variable to set (see bbasic.js).
    const selectPage = selectedIdVarName ? `${selectedIdVarName} = ${screenId}\n` : '';
    // The frame offsets this page's graphics share with other pages are worked out now, from their frame counters.
    const deriveName = titleDeriveSubroutineName(screenId);
    const derive = Blockly.BBasic.subroutines[deriveName] ? ` gosub ${deriveName}${Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(deriveName))}\n` : '';
    // On DPC+ the kernel keeps its pointers in the bytes the score bars are drawn from (aux5 and aux6 are pfscore1 and pfscore2 there), so
    // a project with score bars keeps their values on the stack while the kernel draws, and the bars show what the blocks set.
    const barsUsed = ((useConfigurationStorage() && useConfigurationStorage().value) || {}).kernel === 'dpcplus' &&
      block.workspace.getAllBlocks(false).some((other) => other.isEnabled() && /^score_bar_/.test(other.type));
    const callKernel = ` gosub ${TITLE_SCREEN_SUBROUTINE_NAME}${suffix}\n`;
    let draw = `${titlePlayerPageSwitch(Blockly, screenId)}${selectPage}${derive}` + (barsUsed ?
      ' asm\n lda pfscore1\n pha\n lda pfscore2\n pha\n@end\n' + callKernel + ' asm\n pla\n sta pfscore2\n pla\n sta pfscore1\n@end\n' :
      callKernel);
    if (Blockly.BBasic.titleBgUsed) {
      // The driver draws the background color in this variable: the page's color, unless "Set
      // title screen background color" has taken over.
      const screen = processTitleScreenStorageDefaults(useTitleScreenStorage())
          .screens.find(({id}) => String(id) === String(screenId));
      const bgVar = Blockly.BBasic.nameDB_.getName(TITLE_BG_COLOR_VAR_NAME, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      draw = `if !${titleBgOverrideVar()}{${titleBgOverrideBit()}} then ${bgVar} = ` +
        `${toColorHexByte((screen && Number(screen.backgroundColor)) || 0)}\n` + draw;
    }
    // After "End title screen" the kernel is off and this block does nothing.
    if (!Blockly.BBasic.titleEndUsed) return draw;
    const skipLabel = `_titledraw_${Blockly.BBasic.blockNumbers.next('titledraw')}_skip`;
    return `if ${titleKernelEndedVar()}{${titleKernelEndedBit()}} then goto ${skipLabel}\n${draw}@ ${skipLabel}\n`;
  };

  // Starts a fade of a single-color graphic's color: where it is going and how long each step waits (see generateTitleColorFadeChecks).
  Blockly.BBasic['titlescreen_card_color_fade'] = function(block) {
    const ref = block.getFieldValue('CARD');
    // A multicolor graphic: the step it is on is where it goes on from, and it is not started again while it fades or once it is done.
    const rowPlan = ref && (Blockly.BBasic.titleRowFadePlans || {})[ref];
    if (rowPlan) {
      const timer = Blockly.BBasic.nameDB_.getName(titleCardFadeTimerVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const colorIndex = Blockly.BBasic.nameDB_.getName(titleCardColorIndexVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const skip = `_titlerowfade_${Blockly.BBasic.blockNumbers.next()}_skip`;
      return [`if ${timer} <> 0 then goto ${skip}`, `if ${colorIndex} >= ${rowPlan.stepCount * rowPlan.height} then goto ${skip}`,
        `${timer} = ${rowPlan.pace}`, `@ ${skip}`].join('\n') + '\n';
    }
    if (!ref || !(Blockly.BBasic.titleFadeRefs || new Set()).has(ref)) {
      return 'rem This fade needs a single-color graphic, or a multicolor one with a color from the color picker and a number of frames\n';
    }
    const resolve = (canonicalName) => Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    const target = resolve(titleCardFadeTargetVarName(ref));
    const timer = resolve(titleCardFadeTimerVarName(ref));
    const constantPace = (Blockly.BBasic.titleFadeConstantPace || {})[ref];
    if (constantPace !== undefined) return `${target} = ${color}\n${timer} = ${constantPace}\n`;
    // (frames / 4 is a shift, so no call to the divide routine.)
    const pace = resolve(titleCardFadePaceVarName(ref));
    const readyLabel = `_titlefade_${Blockly.BBasic.blockNumbers.next()}_paceready`;
    return [`${target} = ${color}`, `${pace} = (${frames}) / ${FADE_STEPS}`, `if ${pace} <> 0 then goto ${readyLabel}`,
      ` ${pace} = 1`, `@ ${readyLabel}`, `${timer} = ${pace}`].join('\n') + '\n';
  };

  Blockly.BBasic['titlescreen_card_color_set'] = function(block) {
    const ref = block.getFieldValue('CARD');
    if (!ref || !(Blockly.BBasic.titleCardColorRefs || new Set()).has(ref)) {
      return 'rem No single-color title screen graphic selected\n';
    }
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const colorVar = Blockly.BBasic.nameDB_.getName(titleCardColorVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${colorVar} = ${value}\n`;
  };

  // Jumps the graphic's frame counter to where the chosen frame starts (so the animation checks, which
  // work out the frame from the counter, show it from the next pass on), and holds it there on request.
  const boxVar = (canonical) => Blockly.BBasic.nameDB_.getName(canonical, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const boxRefFor = (block) => {
    const ref = block.getFieldValue('CARD');
    return ref && (Blockly.BBasic.titleBoxRefs || new Set()).has(ref) ? ref : null;
  };

  Blockly.BBasic['titlescreen_box_set'] = function(block) {
    const ref = boxRefFor(block);
    if (!ref) return 'rem No 48-wide title screen graphic selected\n';
    const mode = block.getFieldValue('MODE');
    // The sixteen blocks the kernel controls: PF1 bit 7 is the leftmost, PF2 bit 0 the ninth; the picture is
    // behind the last six.
    const [pf1, pf2] = mode === 'full' ? [255, 255] : mode === 'off' ? [0, 0] : [0, 252];
    return `${boxVar(titleCardBoxPf1VarName(ref))} = ${pf1}\n${boxVar(titleCardBoxPf2VarName(ref))} = ${pf2}\n`;
  };

  Blockly.BBasic['titlescreen_box_color_set'] = function(block) {
    const ref = boxRefFor(block);
    if (!ref) return 'rem No 48-wide title screen graphic selected\n';
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return `${boxVar(titleCardBoxColorVarName(ref))} = ${value}\n`;
  };

  Blockly.BBasic['titlescreen_card_frame_set'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const animation = ref && Blockly.BBasic.titleScreenCardAnimations && Blockly.BBasic.titleScreenCardAnimations[ref];
    if (!animation) return 'rem No title screen graphic with several frames selected\n';
    const hold = block.getFieldValue('HOLD') === 'TRUE';
    const holdIndex = (Blockly.BBasic.titleCardHoldRefs || []).indexOf(ref);
    const counterVar = Blockly.BBasic.nameDB_.getName(
        titleCardFrameCounterVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const durations = animation.frameDurations;
    const total = durations.reduce((sum, duration) => sum + duration, 0) || durations.length;
    // Where each frame starts. Without a hold the counter goes up before the frame is chosen, so
    // it is set one tick early (the first frame wraps from the end).
    const starts = durations.map((_, index) => durations.slice(0, index).reduce((sum, d) => sum + d, 0));
    const counterFor = (index) => (hold ? starts[index] : (starts[index] + total - 1) % total);
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const lines = [];
    const literal = /^\s*\d+\s*$/.test(value) ? Number(value) : null;
    if (literal !== null) {
      lines.push(`${counterVar} = ${counterFor(Math.min(literal, durations.length - 1))}`);
    } else {
      lines.push(`temp1 = ${value}`, `if temp1 >= ${durations.length} then temp1 = ${durations.length - 1}`);
      durations.forEach((_, index) => lines.push(`if temp1 = ${index} then ${counterVar} = ${counterFor(index)}`));
    }
    if (holdIndex !== -1) {
      lines.push(`${titleCardHoldVar()}{${titleCardHoldBit(holdIndex)}} = ${hold ? 1 : 0}`);
    }
    // Jumping to a frame plays on forward again, if an "Animate ... in reverse" block had it going backwards.
    const reverseIndex = (Blockly.BBasic.titleCardReverseRefs || []).indexOf(ref);
    if (reverseIndex !== -1) lines.push(`${titleCardReverseVar()}{${titleCardReverseBit(reverseIndex)}} = 0`);
    const onceIndex = (Blockly.BBasic.titleCardOnceRefs || []).indexOf(ref);
    if (onceIndex !== -1) {
      const once = !hold && block.getFieldValue('PLAYBACK') === 'once';
      lines.push(`${titleCardOnceVar()}{${titleCardOnceBit(onceIndex)}} = ${once ? 1 : 0}`);
    }
    return lines.join('\n') + '\n';
  };

  // Starts a graphic's animation again from the beginning (or from the last frame, in reverse): the frame counter
  // is put one tick before the start, since it moves before the frame is chosen.
  Blockly.BBasic['titlescreen_card_animate'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const animation = ref && Blockly.BBasic.titleScreenCardAnimations && Blockly.BBasic.titleScreenCardAnimations[ref];
    if (!animation) return 'rem No title screen graphic with several frames selected\n';
    const reverse = block.getFieldValue('DIRECTION') === 'reverse';
    const counterVar = Blockly.BBasic.nameDB_.getName(
        titleCardFrameCounterVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const durations = animation.frameDurations;
    const total = durations.reduce((sum, duration) => sum + duration, 0) || durations.length;
    // A trigger: it starts the animation only when it runs after a frame in which it did not, so an "if" that
    // stays true does not start it over every frame, and the animation goes on after the "if" turns false.
    const triggerIndex = (Blockly.BBasic.titleAnimateBlockIds || []).indexOf(block.id);
    const skipLabel = `_titleanimate_${Blockly.BBasic.blockNumbers.next()}_end`;
    const lines = [
      ...(triggerIndex === -1 ? [] : [
        `${titleAnimateVar()}{${titleAnimateRanBit(triggerIndex)}} = 1`,
        `if ${titleAnimateVar()}{${titleAnimatePreviousBit(triggerIndex)}} then goto ${skipLabel}`,
      ]),
      `${counterVar} = ${reverse ? total : total - 1}`];
    const holdIndex = (Blockly.BBasic.titleCardHoldRefs || []).indexOf(ref);
    if (holdIndex !== -1) lines.push(`${titleCardHoldVar()}{${titleCardHoldBit(holdIndex)}} = 0`);
    const onceIndex = (Blockly.BBasic.titleCardOnceRefs || []).indexOf(ref);
    if (onceIndex !== -1) {
      lines.push(`${titleCardOnceVar()}{${titleCardOnceBit(onceIndex)}} = ${block.getFieldValue('PLAYBACK') === 'once' ? 1 : 0}`);
    }
    const reverseIndex = (Blockly.BBasic.titleCardReverseRefs || []).indexOf(ref);
    if (reverseIndex !== -1) {
      lines.push(`${titleCardReverseVar()}{${titleCardReverseBit(reverseIndex)}} = ${reverse ? 1 : 0}`);
    }
    // Starting at the end of the count does not count as finishing.
    const finishedIndex = (Blockly.BBasic.titleCardFinishedRefs || []).indexOf(ref);
    if (finishedIndex !== -1) {
      lines.push(`${titleCardFinishedVar()}{${titleCardFinishedBit(finishedIndex)}} = 0`,
          `${titleCardFinishedVar()}{${titleCardFinishedLatchBit(finishedIndex)}} = 1`);
    }
    if (triggerIndex !== -1) lines.push(`@ ${skipLabel}`);
    return lines.join('\n') + '\n';
  };

  Blockly.BBasic['titlescreen_bg_set'] = function(block) {
    if (!Blockly.BBasic.titleBgUsed) return 'rem No title screen background color to set\n';
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const bgVar = Blockly.BBasic.nameDB_.getName(TITLE_BG_COLOR_VAR_NAME, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${bgVar} = ${value}\n${titleBgOverrideVar()}{${titleBgOverrideBit()}} = 1\n`;
  };

  Blockly.BBasic['titlescreen_bg_reset'] = function(block) {
    if (!Blockly.BBasic.titleBgUsed) return 'rem No title screen background color to reset\n';
    return `${titleBgOverrideVar()}{${titleBgOverrideBit()}} = 0\n`;
  };

  // Stops the kernel and goes back to the top of Title screen update, which from then on draws the
  // regular game screen (see generateGameLoopEvent). The documentation asks for the missile
  // heights to be zeroed when leaving the Titlescreen Kernel, which uses the missile registers.
  Blockly.BBasic['titlescreen_end'] = function(block) {
    if (!Blockly.BBasic.titleEndUsed) return 'rem No title screen kernel to end\n';
    if (Blockly.BBasic.currentEventName !== 'title_update') {
      return 'rem "End title screen" only works inside "Title screen update"\n';
    }
    // The kernel leaves CTRLPF at the value it needs: the ball width and playfield priority a block set
    // are put back from the CTRLPF shadow.
    const shadowVar = Blockly.BBasic.ctrlpfShadowUsed ? Blockly.BBasic.nameDB_.getName(
        ctrlpfShadowVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
    return `${titleKernelEndedVar()}{${titleKernelEndedBit()}} = 1\n` +
      'missile0height = 0\n' +
      'missile1height = 0\n' +
      (shadowVar ? `CTRLPF = ${shadowVar}\n` : '') +
      (Blockly.BBasic.titleEndResets || []).map((line) => `${line}\n`).join('');
  };

  // Starts the title screen over: the "Title screen start" event sets the title state back (and turns the kernel on again, see the
  // kernel-ended bit there) and carries on into "Title screen update". Inside "Title screen start" itself that would start over forever.
  Blockly.BBasic['titlescreen_start'] = function(block) {
    const eventName = Blockly.BBasic.currentEventName;
    if (eventName === 'title_start') return 'rem "Start title screen" is not needed inside "Title screen start"\n';
    const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getEventBank('title_start'));
    return `goto title_start_begin${suffix}\n`;
  };

  Blockly.BBasic['titlescreen_scroll_set'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const key = Blockly.BBasic.titleScreenCardSlots && Blockly.BBasic.titleScreenCardSlots[ref];
    // Falls back to a no-op rem, same as titlescreen_draw's "no
    // selection" guard above - a project with no scrolling graphics
    // configured yet (or one whose scrolling was since turned back off)
    // shouldn't fail the whole build over a dropdown with nothing valid in
    // it.
    if (!key) return 'rem No scrolling title screen graphic selected\n';
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    // An animated card's bmp_${key}_index is owned by the per-frame
    // animation check (generateTitleScreenAnimationChecks) - it recomputes
    // "frame base + scroll offset" every frame, so this has to write to the
    // scroll-offset var that check reads instead of straight to
    // bmp_${key}_index, or the two would silently overwrite each other
    // every frame (same class of bug two independent writers of the same
    // register always risk - see collision.js's comment on a similar
    // fight elsewhere in this codebase).
    const cardAnimation = (Blockly.BBasic.titleScreenCardAnimations && Blockly.BBasic.titleScreenCardAnimations[ref]) || (Blockly.BBasic.titleWindowRefs || new Set()).has(ref);
    if (cardAnimation) {
      const scrollVar = Blockly.BBasic.nameDB_.getName(
          titleCardScrollOffsetVarName(ref), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      return `${scrollVar} = ${value}\n`;
    }
    // bmp_${key}_index is an alias for a real dev var's resolved address
    // (see buildCardDataAsm's comment) - referenced directly by that
    // alias name, no separate "dim" needed at THIS call site since
    // buildCardDataAsm's pre-scan already reserved it.
    return `bmp_${key}_index = ${value}\n`;
  };

  // Changes how many lines a scrolling graphic draws (see windowVarValue): the scroll position follows so that the window stays inside the picture.
  Blockly.BBasic['titlescreen_window_set'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const key = Blockly.BBasic.titleScreenCardSlots && Blockly.BBasic.titleScreenCardSlots[ref];
    if (!key || !(Blockly.BBasic.titleWindowRefs || new Set()).has(ref)) return 'rem No scrolling title screen graphic selected\n';
    const card = processTitleScreenStorageForBuild(useTitleScreenStorage()).screens
        .reduce((found, screen) => found || (screen.cards || []).find((candidate) => `${screen.id}:${candidate.id}` === ref), null);
    if (!card) return 'rem No scrolling title screen graphic selected\n';
    const frameHeight = cardFrameHeight(card);
    const resolveVar = (canonicalName) => Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const windowVar = resolveVar(titleCardWindowVarName(ref));
    const scrollVar = resolveVar(titleCardScrollOffsetVarName(ref));
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    return ` temp1 = ${value}\n if temp1 = 0 then temp1 = 1\n if temp1 > ${frameHeight} then temp1 = ${frameHeight}\n` +
      ` ${windowVar} = ${key.startsWith('96x2') ? 'temp1' : 'temp1 - 1'}\n temp2 = ${frameHeight} - temp1\n if ${scrollVar} > temp2 then ${scrollVar} = temp2\n`;
  };

  Blockly.BBasic['titlescreen_scroll_by'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const key = Blockly.BBasic.titleScreenCardSlots && Blockly.BBasic.titleScreenCardSlots[ref];
    if (!key) return 'rem No scrolling title screen graphic selected\n';
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const amount = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const down = block.getFieldValue('DIRECTION') === 'down';
    const windowed = (Blockly.BBasic.titleWindowRefs || new Set()).has(ref);
    const cardAnimation = (Blockly.BBasic.titleScreenCardAnimations && Blockly.BBasic.titleScreenCardAnimations[ref]) || windowed;
    // Same target var as titlescreen_scroll_set (see its comment).
    const scrollVar = cardAnimation ? resolveVar(titleCardScrollOffsetVarName(ref)) : `bmp_${key}_index`;
    if (block.getFieldValue('STOP') !== 'TRUE') {
      return `${scrollVar} = ${scrollVar} ${down ? '+' : '-'} ${amount}\n`;
    }
    const watches = Blockly.BBasic.titleScrollEdgeWatches || new Set();
    const edge = down ? 'bottom' : 'top';
    const edgeSlot = (Blockly.BBasic.titleScrollEdgeSlots || new Map()).get(`${ref}|${edge}`);
    const flagLine = watches.has(`${ref}|${edge}`) && edgeSlot ?
      ` if temp1 >= temp2 then ${resolveVar(edgeSlot.varName)}{${edgeSlot.bit}} = 1\n` : '';
    if (!down) {
      // temp2 = old position; clamp at 0 (bB bytes are unsigned, so compare
      // before subtracting).
      return ` temp1 = ${amount}\n temp2 = ${scrollVar}\n ${scrollVar} = 0\n` +
        ` if temp1 < temp2 then ${scrollVar} = temp2 - temp1\n${flagLine}`;
    }
    // Largest offset = one frame's height minus the window height. The same
    // for every frame of an animated card, so it holds for whichever frame
    // is currently showing.
    const card = processTitleScreenStorageForBuild(useTitleScreenStorage()).screens
        .reduce((found, screen) => found || (screen.cards || [])
            .find((candidate) => `${screen.id}:${candidate.id}` === ref), null);
    if (!card) return 'rem No scrolling title screen graphic selected\n';
    let maxOffset = Math.max(0, cardFrameHeight(card) - (Number(card.scrollWindow) || 0));
    // With a window height block the window is the byte's (see windowVarValue): the most the picture scrolls is its height less the window.
    let maxLine = '';
    if (windowed) {
      const windowVar = resolveVar(titleCardWindowVarName(ref));
      maxLine = ` temp3 = ${cardFrameHeight(card) - (key.startsWith('96x2') ? 0 : 1)} - ${windowVar}\n`;
      maxOffset = 'temp3';
    }
    // temp2 = rows left before the bottom (0 if already at or past it).
    return `${maxLine} temp1 = ${amount}\n temp2 = 0\n if ${scrollVar} < ${maxOffset} then temp2 = ${maxOffset} - ${scrollVar}\n` +
      ` if temp1 < temp2 then ${scrollVar} = ${scrollVar} + temp1\n` +
      ` if temp1 >= temp2 then ${scrollVar} = ${maxOffset}\n${flagLine}`;
  };

  // Runs once after a "Scroll title screen graphic" block stopped at the
  // chosen edge - same flag-then-clear shape as background_scroll_edge_reached.
  Blockly.BBasic['titlescreen_scroll_edge_reached'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const edge = block.getFieldValue('EDGE');
    const watches = Blockly.BBasic.titleScrollEdgeWatches || new Set();
    if (!ref || !watches.has(`${ref}|${edge}`)) return '';
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const edgeSlot = (Blockly.BBasic.titleScrollEdgeSlots || new Map()).get(`${ref}|${edge}`);
    if (!edgeSlot) return '';
    const flag = `${Blockly.BBasic.nameDB_.getName(edgeSlot.varName, Blockly.Names.DEVELOPER_VARIABLE_TYPE)}{${edgeSlot.bit}}`;
    const labelEnd = `_titlescrolledge_${Blockly.BBasic.blockNumbers.next()}_end`;
    return '\n' + [
      `if !${flag} then goto ${labelEnd}`,
      `${flag} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') + '\n';
  };

  // Runs once each time a graphic's animation finishes (see detectFinish in generateTitleScreenAnimationChecks).
  Blockly.BBasic['titlescreen_animation_finished'] = function(block) {
    const ref = block.getFieldValue('CARD');
    const index = (Blockly.BBasic.titleCardFinishedRefs || []).indexOf(ref);
    if (!ref || index === -1) return '';
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const flag = `${titleCardFinishedVar()}{${titleCardFinishedBit(index)}}`;
    const labelEnd = `_titleanimfin_${Blockly.BBasic.blockNumbers.next()}_end`;
    return '\n' + [
      `if !${flag} then goto ${labelEnd}`,
      `${flag} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') + '\n';
  };

  Blockly.BBasic['titlescreen_player_frame_set'] = function(block) {
    const playerIndex = block.getFieldValue('PLAYER');
    const slots = Blockly.BBasic.titlePlayerSlots;
    // No "player" card configured anywhere in the project yet - same no-op
    // rem fallback as titlescreen_scroll_set's "nothing to reference"
    // guard above.
    if (!Blockly.BBasic.titleScreenPlayerHeights || !slots) return 'rem No title screen player sprite configured\n';
    // With a Player card on several pages, the block works on the card of the page that is drawn.
    const selectedVar = Blockly.BBasic.titleScreenSelectedIdVarName;
    if (slots.pages.length > 1 && selectedVar) {
      return slots.pages.map((page) => {
        const skip = `_titleplayerframe_${Blockly.BBasic.blockNumbers.next()}_skip`;
        return `if ${selectedVar} <> ${page.screenId} then goto ${skip}\n${playerFrameCode(block, playerIndex, page.slots[playerIndex], slots[playerIndex])}@ ${skip}\n`;
      }).join('');
    }
    return playerFrameCode(block, playerIndex, slots.pages[0].slots[playerIndex], slots[playerIndex]);
  };
  // The code of the frame block for one page's card: slot is the player of that card, shared what the pages share (the "play once" bit).
  const playerFrameCode = (block, playerIndex, pageSlot, shared) => {
    const height = pageSlot.height;
    const slot = {...pageSlot, once: shared.once};
    if (slot.frameCount > 1) {
      // The animation plays by itself: jump its counter to where the frame starts, and it carries on from
      // there (the counter goes up before the frame is chosen, so it is set one tick early).
      const counterVar = Blockly.BBasic.nameDB_.getName(
          titlePlayerFrameVarName(playerIndex), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const total = slot.durations.reduce((sum, duration) => sum + duration, 0);
      const counterFor = (index) =>
        (slot.durations.slice(0, index).reduce((sum, duration) => sum + duration, 0) + total - 1) % total;
      const number = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const literal = /^\s*\d+\s*$/.test(number) ? Number(number) : null;
      const onceLines = slot.once ?
        [`${titlePlayerOnceVar()}{${titlePlayerOnceBit(playerIndex)}} = ${block.getFieldValue('PLAYBACK') === 'once' ? 1 : 0}`] : [];
      if (literal !== null) {
        return [`${counterVar} = ${counterFor(Math.min(literal, slot.frameCount - 1))}`, ...onceLines].join('\n') + '\n';
      }
      return [`temp1 = ${number}`, `if temp1 >= ${slot.frameCount} then temp1 = ${slot.frameCount - 1}`,
        ...slot.durations.map((_, index) => `if temp1 = ${index} then ${counterVar} = ${counterFor(index)}`),
        ...onceLines].join('\n') + '\n';
    }
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
    // bmp_playerN_index is a raw byte offset into the flattened frame array
    // (see resolvePlayerSlotFrames'  comment), height rows apart per
    // frame - height is known here at compile time (baked into the title
    // screen's  data block above), so the multiply happens in the
    // generated source itself (a variable times a compile-time constant),
    // not at runtime in JS, letting VALUE be any expression (a literal,
    // variable, or computed frame number).
    const indexVar = Blockly.BBasic.nameDB_.getName(
        titlePlayerIndexVarName(playerIndex), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${indexVar} = ${value} * ${height}\n`;
  };
  // The PXE kernel has no Title Screen kernel yet (the one here switches banks): its blocks make no code.
  Object.keys(Blockly.BBasic).filter((key) => key.startsWith('titlescreen_')).forEach((key) => {
    const generate = Blockly.BBasic[key];
    Blockly.BBasic[key] = function(block, ...rest) {
      if (isPxe(useConfigurationStorage().value)) return block.outputConnection ? ['0', Blockly.BBasic.ORDER_ATOMIC] : '';
      const code = generate.call(this, block, ...rest);
      // Once "End title screen" has run, "Title screen update" goes on without the kernel and the title graphics are over: the blocks that
      // work on them do nothing, so the Title Screen's variables and flag bits can be used by the game (see flagOverlay in bbasic.js).
      if (!Blockly.BBasic.titleEndUsed || Blockly.BBasic.currentEventName !== 'title_update' || key === 'titlescreen_end' ||
          key === 'titlescreen_draw' || key === 'titlescreen_start' || typeof code !== 'string' || !code.trim() || block.outputConnection) return code;
      const labelEnd = `_titleafterend_${Blockly.BBasic.blockNumbers.next()}_end`;
      return `
if ${titleKernelEndedVar()}{${titleKernelEndedBit()}} then goto ${labelEnd}
${code}
@ ${labelEnd}
`;
    };
  });
};
