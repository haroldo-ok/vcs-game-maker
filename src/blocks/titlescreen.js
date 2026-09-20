'use strict';

import * as Blockly from 'blockly/core';

import {TITLE_ICON} from './icon';
import {useTitleScreenStorage} from '../hooks/project';

const TITLESCREEN_COLOR = 'rgb(233, 30, 99)';

// One entry per bitmap kernel type the Titlescreen Kernel (public/bb19/
// titlescreen/) supports in this app - see generators/bbasic/titlescreen.js
// for how these map to the kernel's own draw_bmp_TYPE_N routines. width is
// the fixed pixel width every card of this type draws at (not adjustable
// per card - it's a property of which minikernel variant is used, same as
// a player sprite's own fixed 8-pixel width). blockCount (width/8) is how
// many separate 8-pixel-wide column strips the kernel's own byte format
// splits the image into - see eventsToTitleScreenBlocks in the generator.
// doubleLine marks the "x2" kernels (48x2/96x2), which draw each pixel row
// across 2 scanlines (square-ish pixels, and support a color PER ROW) vs.
// the "x1" kernels (48x1), which draw 1 scanline per row (half-height
// pixels, single fixed color for the whole image). A single screen can
// freely mix any of these types across its own stacked cards (each card
// picks its own type independently) - the kernel's own examples do exactly
// this (see ex1-basic_color.bas's own titlescreenlayout: a 96x2, two 48x1s,
// a space, gameselect, and score, all stacked in one screen).
export const TITLE_SCREEN_KERNEL_TYPES = {
  '48x1': {width: 48, blockCount: 6, doubleLine: false, hasRowColors: false},
  '48x2': {width: 48, blockCount: 6, doubleLine: true, hasRowColors: true},
  '96x2': {width: 96, blockCount: 12, doubleLine: true, hasRowColors: true},
};

// The kernel ships exactly 8 pre-built copies of each bitmap type (see
// public/bb19/titlescreen/*_kernel.asm, numbered 1-8) - a 9th card of the
// same type has no kernel variant left to use. This pool is shared across
// EVERY title screen in the project (see generators/bbasic/titlescreen.js's
// own resolveAllTitleScreens) - a physical kernel copy belongs to exactly
// one card project-wide, not one card per screen. Enforced when adding a
// card (see TitleScreenEditor.vue's own handleAddCard).
export const MAX_KERNEL_COPIES_PER_TYPE = 8;

// The "player" minikernel (draws up to 2 real Player 0/1 hardware sprites
// within a title screen) is a project-wide singleton, not a numbered pool
// like the bitmap types above - see generators/bbasic/titlescreen.js's own
// assignKernelSlots/buildPlayerDataAsm for why (there's only ever one
// draw_player_display routine and one set of bmp_player0/bmp_player1 data
// project-wide). Enforced the same way as MAX_KERNEL_COPIES_PER_TYPE, in
// TitleScreenEditor.vue's own canAddCardType.
export const MAX_PLAYER_CARDS = 1;

// Same project-wide singleton reasoning as MAX_PLAYER_CARDS above, for the
// "score" minikernel (draws the real bB "score" variable) - only one real
// score display exists regardless of how many cards ask for it.
export const MAX_SCORE_CARDS = 1;

// A blank starting image for a freshly added bitmap card. A single row (an
// earlier default) rendered as a barely-visible sliver, unlike every other
// tab's own "add" default (PlayerEditor.vue's handleAddFrame starts frames
// at a full 8x8 grid, BackgroundEditor.vue's handleAddBackground starts at
// the project's own full row count) - 20 rows gives a usable starting canvas
// at any of the kernel's supported widths, well within the ~192-scanline
// budget documented in the kernel's own docs, and is still just a starting
// point the "Set height" tool can resize freely.
const DEFAULT_TITLE_SCREEN_CARD_HEIGHT = 20;
export const blankTitleScreenPixels = (width) =>
  Array.from({length: DEFAULT_TITLE_SCREEN_CARD_HEIGHT}, () => new Array(width).fill(0));

// One title-screen "page" - its own ordered card list and its own
// background color, selectable independently by name from a "Draw title
// screen" block's own dropdown (see generateTitleScreenOptions below and
// the block definition's SCREEN field). id is stable across renames/
// reordering (assigned once, at creation - see TitleScreenEditor.vue's own
// getMaxId pattern), which is what "Draw title screen" blocks actually
// store, not the display name.
export const defaultTitleScreenScreen = (id) => ({
  id,
  name: `Title Screen ${id}`,
  backgroundColor: 0,
  cards: [],
});

export const DEFAULT_TITLE_SCREEN_STORAGE = {
  screens: [defaultTitleScreenScreen(1)],
};

// A freshly loaded/imported project may not have a titleScreen key at all
// yet (added after this feature existed) - same "structuredClone the
// default shape" fallback every other tab's own *StorageDefaults function
// already uses (see e.g. blocks/music.js's processSongsStorageDefaults).
// Also migrates the ORIGINAL single-screen shape ({backgroundColor, cards})
// from before multiple screens existed into a one-screen "screens" list,
// so an existing project's already-built title screen isn't silently
// dropped the first time this loads under the new format.
export const processTitleScreenStorageDefaults = (storage) => {
  const data = storage.value;
  if (!data || (!Array.isArray(data.screens) && !Array.isArray(data.cards))) {
    const fresh = structuredClone(DEFAULT_TITLE_SCREEN_STORAGE);
    storage.value = fresh;
    return fresh;
  }
  if (!Array.isArray(data.screens)) {
    const migrated = {
      screens: [{
        id: 1,
        name: 'Title Screen 1',
        backgroundColor: data.backgroundColor || 0,
        cards: data.cards || [],
      }],
    };
    storage.value = migrated;
    return migrated;
  }
  if (!data.screens.length) {
    data.screens.push(defaultTitleScreenScreen(1));
  }
  return data;
};

// Every screen's own id/name, for the "Draw title screen" block's own
// dropdown field - re-read from storage every time the dropdown opens
// (rather than cached), the same "computed over localStorage isn't
// reactive" reasoning as background.js's own buildBackgroundOptions, so a
// renamed/added/deleted screen shows up without reloading the page. Values
// are the screen's stable id (as a string, matching Blockly's own
// string-only field convention), not its display name, so a rename doesn't
// silently retarget every "Draw title screen" block that already pointed
// at it.
const buildTitleScreenOptions = () => {
  try {
    const {screens} = processTitleScreenStorageDefaults(useTitleScreenStorage());
    if (!screens.length) return [['No title screens', '']];
    return screens.map(({id, name}) => [name || `Title Screen ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list title screen options', e);
    return [['Error', '1']];
  }
};

// Programmatic block definition (not defineBlocksWithJsonArray) - a JSON
// definition can only take a fixed list of dropdown options, but this one
// needs to rebuild its list from storage every time it's opened (see
// buildTitleScreenOptions above), the same reason background_select/
// background_set_select in blocks/background.js use a real FieldDropdown
// instead.
Blockly.Blocks['titlescreen_draw'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${TITLE_ICON} Draw title screen`)
        .appendField(new Blockly.FieldDropdown(buildTitleScreenOptions), 'SCREEN');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TITLESCREEN_COLOR);
    this.setTooltip('Draws the chosen Title Screen tab page to the TV. Call this ' +
      'repeatedly (e.g. every frame of "Title screen update") for as long as you want it shown.');
  },
};

// Every card, across every screen, whose own "Window height (scrolling)"
// field is set smaller than its full image height - only those actually
// get a runtime scroll-position byte at all (see buildCardDataAsm's own
// "ifconst"-gated declaration), so a card that isn't scrolling has nothing
// for this block to target. Value is "screenId:cardId" (a card's own id is
// only unique within its screen - see handleAddCard's own getMaxId), parsed
// back apart by the generator (see generators/bbasic/titlescreen.js's own
// titlescreen_scroll_set).
const buildScrollableCardOptions = () => {
  try {
    const {screens} = processTitleScreenStorageDefaults(useTitleScreenStorage());
    const options = [];
    screens.forEach((screen) => {
      (screen.cards || []).forEach((card) => {
        const height = (card.pixels && card.pixels.length) || 0;
        const scrollWindow = Number(card.scrollWindow) || 0;
        if (!(scrollWindow > 0 && scrollWindow < height)) return;
        const screenLabel = screen.name || `Title Screen ${screen.id}`;
        options.push([`${screenLabel} → ${card.type} (ID:${card.id})`, `${screen.id}:${card.id}`]);
      });
    });
    if (!options.length) return [['No scrolling graphics configured', '']];
    return options;
  } catch (e) {
    console.error('Failed to list scrollable title screen graphics', e);
    return [['Error', '']];
  }
};

Blockly.Blocks['titlescreen_scroll_set'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${TITLE_ICON} Set title screen scroll position of`)
        .appendField(new Blockly.FieldDropdown(buildScrollableCardOptions), 'CARD')
        .appendField('to');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TITLESCREEN_COLOR);
    this.setTooltip('Scrolls a Title Screen graphic that has its own "Window height" set ' +
      'smaller than its full image - 0 shows the very top/first rows, increasing it scrolls ' +
      'further down/through the image. Only graphics with scrolling enabled (Title Screen tab) ' +
      'appear in the dropdown.');
  },
};

// Frame number is a plain 0-based index into the chosen Player 0/1
// animation, same numbering PlayerNFrame/the animation frame list itself
// already use - the generator (titlescreen.js's own titlescreen_player_
// frame_set) converts that into the raw byte offset bmp_playerN_index
// actually expects, using that animation's own per-frame height (baked in
// at compile time), so this block never needs to know that detail. Not
// gated behind "does a player card exist" the way buildScrollableCardOptions
// gates its own dropdown - there's only ever one Player 0 and one Player 1
// slot project-wide (see MAX_PLAYER_CARDS), so a plain fixed dropdown is
// enough; the generator itself falls back to a no-op rem if no "player"
// card has actually been added on the Title tab yet.
Blockly.Blocks['titlescreen_player_frame_set'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${TITLE_ICON} Set title screen player`)
        .appendField(new Blockly.FieldDropdown([['0', '0'], ['1', '1']]), 'PLAYER')
        .appendField('sprite frame to');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TITLESCREEN_COLOR);
    this.setTooltip('Changes which frame of the chosen Player 0/1 animation the Title tab\'s ' +
      'player sprite minikernel shows (0 = the first frame). Position it with the normal ' +
      '"Player 0/1 set X/Y" blocks - the title screen sprite is the same hardware sprite, just ' +
      'drawn by the title screen kernel instead of the normal game kernel while a title screen ' +
      'is being shown.');
  },
};
