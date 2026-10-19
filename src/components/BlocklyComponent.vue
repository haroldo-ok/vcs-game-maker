<template>
  <div>
    <div class="blocklyDiv" :class="{'blocklyDiv-desaturated': desaturateBlocklyColors}" ref="blocklyDiv">
    </div>
    <xml ref="blocklyToolbox" style="display:none">
      <slot></slot>
    </xml>
  </div>
</template>

<script>
/**
 * @license
 *
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Blockly Vue Component.
 * @author samelh@google.com (Sam El-Husseini)
 */

import Blockly from 'blockly';
import {debounce} from 'lodash';
import {WorkspaceSearch} from '@blockly/plugin-workspace-search';
import {Multiselect, MultiselectBlockDragger} from '@mit-app-inventor/blockly-plugin-workspace-multiselect';
import {installBlocklyClipboardSync} from '../utils/blockly-clipboard';
// Side-effecting only - registers a 'search' toolbox item kind via
// Blockly.registry.register() at module load (node_modules/@blockly/
// toolbox-search/src/toolbox_search.ts), the same self-registering pattern
// the @blockly/field-grid-dropdown import already uses elsewhere in this
// app (src/blocks/color.js/input.js) - nothing to call directly here, the
// actual search category comes from the <category kind="search" ...> entry
// in blockly-toolbox.xml.hbs.
import '@blockly/toolbox-search';

import {useDarkModeStorage, useDesaturateBlocklyColorsStorage} from '../hooks/project';

// @blockly/toolbox-search indexes EVERY registered block type for its
// search category (BlockSearcher.indexBlocks, node_modules/@blockly/
// toolbox-search/src/block_searcher.ts) by constructing a blank instance of
// each on a throwaway headless workspace and reading every field's text -
// including, for a FieldDropdown, each option's text. An "image"-style
// dropdown option (an {src, alt, width, height} object rather than a plain
// string) is expected to always carry a real `alt` string there
// (indexDropdownOption reads option[0].alt directly, with no fallback) -
// confirmed as a real crash this app actually hits ("Cannot read properties
// of undefined (reading 'toLowerCase')", thrown inside generateTrigrams
// once it gets handed that undefined alt) the moment Blockly.inject() first
// builds the toolbox and this plugin's indexing runs, aborting BOTH the
// rest of that injection (losing the whole toolbox sidebar) and whatever
// later mounted() steps position the trashcan/zoom/grid-snap/multiselect
// icons (left wherever their un-positioned SVG default happens to be - the
// top-left corner). Rather than track down which of this app's many
// dropdown fields has an image option with a missing/undefined alt (every
// one the normal rendering/tooltip code already tolerates happily, since
// nothing else reads it as strictly as this plugin does), this guarantees
// every FieldDropdown always hands back a real string there - BlockSearcher
// itself isn't exported from the plugin's package, so there's no way to
// patch its indexDropdownOption/generateTrigrams directly instead.
if (!Blockly.FieldDropdown.prototype.getOptions.isAltTextGuardPatch) {
  const originalGetOptions = Blockly.FieldDropdown.prototype.getOptions;
  Blockly.FieldDropdown.prototype.getOptions = function(...args) {
    const options = originalGetOptions.apply(this, args);
    options.forEach((option) => {
      if (option[0] && typeof option[0] === 'object' && typeof option[0].alt !== 'string') {
        option[0].alt = '';
      }
    });
    return options;
  };
  Blockly.FieldDropdown.prototype.getOptions.isAltTextGuardPatch = true;
}

// A text or number field being edited moves its block back into view when the window is resized, but Blockly bumps the block that has the
// field, and a block inside another one can not be moved by itself ("Block has parent", once for every resize event). The block that is
// in the workspace itself (the root of the ones it is plugged into) is the one to bump.
// (FieldInput, the class of the text and number fields, is not exported by name: it is the parent of FieldTextInput.)
const fieldInputPrototype = Object.getPrototypeOf(Blockly.FieldTextInput.prototype);
if (!fieldInputPrototype.repositionForWindowResize.isRootBlockPatch) {
  fieldInputPrototype.repositionForWindowResize = function() {
    const block = this.getSourceBlock();
    if (!(block instanceof Blockly.BlockSvg)) return false;
    const workspace = block.workspace;
    const bumped = Blockly.bumpObjects.bumpIntoBounds(workspace, workspace.getMetricsManager().getViewMetrics(true), block.getRootBlock());
    if (!bumped) this.resizeEditor_();
    return true;
  };
  fieldInputPrototype.repositionForWindowResize.isRootBlockPatch = true;
}

// Same path geometry as the multiselect plugin's default icons
// (node_modules/@mit-app-inventor/blockly-plugin-workspace-multiselect/
// test/media/unselect.svg and select.svg - fetched directly from its repo,
// not guessed), but with fill recoloured to exactly match the grid-snap
// icon's rest (black) and active (the app's primary blue) colors instead
// of their stock #455A64 - the plugin only ever offers "which image to
// show," not a CSS-targetable fill, since <image> elements are a fixed
// raster/vector reference, not a fill-able inline shape the way
// grid-snap's hand-drawn glyph is. Supplied via multiselectIcon.
// disabledIcon/enabledIcon below, a real plugin option (see its README),
// rather than trying to force a color via a CSS filter.
const MULTISELECT_ICON_INACTIVE = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg fill="#000000" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path d="M 4 2 C 2.895 2 2 2.895 2 4 L 2 16 C 2 17.105 2.895 18 4 18 L 16 18 C 17.105 18 18 17.105 18 16 ' +
    'L 18 4 C 18 2.895 17.105 2 16 2 L 4 2 z M 4 4 L 16 4 L 16 16 L 4 16 L 4 4 z M 20 6 L 20 20 L 6 20 L 6 22 ' +
    'L 20 22 C 21.105 22 22 21.105 22 20 L 22 6 L 20 6 z M 13.292969 6.2929688 L 9 10.585938 L 6.7070312 ' +
    '8.2929688 L 5.2929688 9.7070312 L 9 13.414062 L 14.707031 7.7070312 L 13.292969 6.2929688 z"/></svg>');
const MULTISELECT_ICON_ACTIVE = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg fill="#1976d2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path d="M 4 2 C 2.895 2 2 2.895 2 4 L 2 16 C 2 17.105 2.895 18 4 18 L 16 18 C 17.105 18 18 17.105 18 16 ' +
    'L 18 4 C 18 2.895 17.105 2 16 2 L 4 2 z M 14 6 C 14.256 6 14.512031 6.0979687 14.707031 6.2929688 ' +
    'C 15.097031 6.6829687 15.097031 7.3170312 14.707031 7.7070312 L 9.7070312 12.707031 ' +
    'C 9.3170313 13.098031 8.6829687 13.098031 8.2929688 12.707031 L 5.2929688 9.7070312 ' +
    'C 4.9029688 9.3170312 4.9029687 8.6829688 5.2929688 8.2929688 C 5.6829687 7.9029688 6.3170313 7.9029687 ' +
    '6.7070312 8.2929688 L 9 10.585938 L 13.292969 6.2929688 C 13.487969 6.0979687 13.744 6 14 6 z M 21 6 ' +
    'C 20.448 6 20 6.448 20 7 L 20 20 L 7 20 C 6.448 20 6 20.448 6 21 C 6 21.552 6.448 22 7 22 L 20 22 ' +
    'C 21.105 22 22 21.105 22 20 L 22 7 C 22 6.448 21.552 6 21 6 z"/></svg>');

// Blockly's  default for a block style's colourTertiary (the outline/
// border stroke colour - see renderers/common/path_object.js's
// "stroke: this.style.colourTertiary") - whenever a theme doesn't set one
// explicitly, which the Classic theme this app uses never does (only
// colourPrimary, a bare hue number, per category - see node_modules/
// blockly/core/theme/classic.js) - blends the block's  colour 30% of the
// way toward WHITE, producing a lighter border than the block's  fill.
// Confirmed as a real reported bug this way ("all the borders/outlines are
// now a lighter color than the block color") once Thrasos'  flat drawer
// made that border the ONLY outline a block has (Geras' light/dark bevel
// highlight used to sit visually on top of it, made the lighter border less
// noticeable). Same 0.3 blend factor, toward BLACK instead - a plain darker
// border, no bevel, on every block regardless of which category/custom
// colour it uses (this app defines plenty of block colours as raw CSS
// strings outside Classic's  named categories too - e.g. 'purple',
// SCORE_COLOR - which resolve through this exact same code path via
// Blockly's "auto_<colour>" style lookup, so patching here covers those the
// same way, with no per-block-file changes needed).
Blockly.blockRendering.ConstantProvider.prototype.generateTertiaryColour_ = function(colour) {
  return Blockly.utils.colour.blend('#000', colour, 0.3) || colour;
};

// Options tab's "Desaturate Blockly block colors" toggle (see
// useDesaturateBlocklyColorsStorage in hooks/project.js) - -50% saturation,
// applied in real HSL space (matching Photoshop's  Hue/Saturation
// adjustment, which scales S the same way) - NOT a CSS filter:
// filter: saturate() operates on non-linear sRGB via a fixed luminance
// matrix, a different algorithm that visibly darkened blues in particular
// instead of just muting them, confirmed as a real reported mismatch
// against Photoshop's  result at the same "50%".
const clamp01 = (n) => Math.max(0, Math.min(1, n));

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(clean.substr(i, 2), 16) / 255);
};

const rgbToHex = (r, g, b) => '#' + [r, g, b]
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('');

// Standard RGB<->HSL conversion (e.g. matching the CSS Color 4 spec's
// algorithm) - h in [0,1) (not degrees), s/l in [0,1].
const rgbToHsl = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
};

const hue2rgb = (p, q, tIn) => {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

const hslToRgb = (h, s, l) => {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
};

// saturationFactor multiplies S (0.5 = Photoshop's "-50") - same slider
// Photoshop's  Hue/Saturation dialog exposes, applied to the same
// component.
const desaturateHex = (hex, saturationFactor) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, clamp01(s * saturationFactor), l);
  return rgbToHex(r, g, b);
};

// Dark Mode's block-color treatment - see the .blocklyBlockCanvas exclusion
// rule's comment in App.vue for why blocks get this dedicated JS handling
// instead of the blanket CSS invert() every other tab uses: a plain RGB
// channel invert approximates an HSL lightness flip, but block colors
// (generateTertiaryColour_/hueToHex above) already sit at a roughly 50% HSL
// lightness by construction - too close to that transform's fixed point
// (1 - 0.5 = 0.5) to actually read as darker, confirmed as a real reported
// "blocks are too bright" once Subdued Palette's desaturation (which leaves
// lightness untouched) made that flat, washed-out midtone impossible to
// miss against the newly-darkened workspace around it. A real lightness
// reduction in HSL space instead - lightnessFactor multiplies L the same
// way desaturateHex's saturationFactor multiplies S.
const darkenHex = (hex, lightnessFactor) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, s, clamp01(l * lightnessFactor));
  return rgbToHex(r, g, b);
};

// Every block's colour - a Classic-theme hue NUMBER or a raw hex/CSS
// colour name string alike - used to fully resolve through
// Blockly.utils.parsing.parseBlockColour on its way to becoming
// colourPrimary (see renderers/common/constants.js's
// validatedBlockStyle_), so patching THAT one function used to cover every
// block with no per-block-file changes needed. Confirmed directly against
// the installed v10 bundle (blockly_compressed.js) that this is no longer
// true: Blockly's build pipeline inlines parseBlockColour as a MODULE-LOCAL
// function reference inside the compiled bundle (named
// `parseBlockColour$$module$build$src$core$utils$parsing` there), and both
// BlockSvg.prototype.setColour (via the base Block.prototype.setColour) and
// ConstantProvider.prototype.validatedBlockStyle_ call that LOCAL reference
// directly, never through the Blockly.utils.parsing.parseBlockColour
// property this patch reassigns - so reassigning the export is now a
// complete no-op for actual block colours. The exact same "exported
// property patch silently does nothing because the real caller holds a
// captured local reference instead" issue already diagnosed for
// Blockly.Variables.flyoutCategoryBlocks below, just hitting a different
// function this time.
//
// Patching ConstantProvider.prototype.getBlockStyleForColour instead -
// confirmed via the same bundle read that BlockSvg.prototype.setColour
// calls it as a genuine `this.workspace.getRenderer().getConstants().
// getBlockStyleForColour(...)` property access (not a captured local), so
// wrapping it here reliably runs for every block. It returns a cached
// {style, name} pair (style has colourPrimary/colourSecondary/
// colourTertiary) keyed by the block's ALREADY-fully-resolved
// (non-desaturated) hex colour, generated and cached once per distinct
// colour - desaturating the three colour fields on that same style object,
// in place, the first time each distinct colour is seen covers every block
// using it from then on, including the ones already cached. Read live (not
// cached) on every call, same "just check the stored value directly, no
// reactive binding needed" pattern the dark-mode/desaturation reads
// throughout this file already use - this only ever actually runs while a
// workspace is being
// (re)injected, once per tab visit, so there's no live-toggle-mid-session
// case to handle here.
//
// Guarded (isDesaturationPatch) against re-wrapping itself - the 'blockly'
// module instance persists across this FILE's dev-server hot-reloads, but
// this file's module-level code (this patch included) re-executes on every
// one of them; without the guard, each edit-triggered reload wrapped
// whatever the PREVIOUS reload had already wrapped, compounding the
// desaturation further with every single edit made during a dev session -
// confirmed as the actual cause of a real reported "the colors just
// changed, they looked right and now don't" mid-session, with no code
// change of the actual 0.5 factor involved at all.
if (!Blockly.blockRendering.ConstantProvider.prototype.getBlockStyleForColour.isDesaturationPatch) {
  const originalGetBlockStyleForColour =
      Blockly.blockRendering.ConstantProvider.prototype.getBlockStyleForColour;
  Blockly.blockRendering.ConstantProvider.prototype.getBlockStyleForColour = function(colour) {
    const result = originalGetBlockStyleForColour.call(this, colour);
    const desaturate = useDesaturateBlocklyColorsStorage().value;
    // See darkenHex's comment above for why Dark Mode darkens block colors
    // directly here instead of relying on the app-wide CSS invert every
    // other tab uses.
    const darken = useDarkModeStorage().value;
    if ((desaturate || darken) && !result.style.isAdjustedForPreferences) {
      ['colourPrimary', 'colourSecondary', 'colourTertiary'].forEach((key) => {
        let hex = result.style[key];
        if (desaturate) hex = desaturateHex(hex, 0.5);
        if (darken) hex = darkenHex(hex, 0.5);
        result.style[key] = hex;
      });
      result.style.isAdjustedForPreferences = true;
    }
    return result;
  };
  Blockly.blockRendering.ConstantProvider.prototype.getBlockStyleForColour.isDesaturationPatch = true;
}

// Same reasoning/guard as the parseBlockColour patch just above, for the
// TOOLBOX CATEGORY labels ("Logic", "Loops", "Math", etc) - confirmed
// directly that these resolve their  colour through an entirely
// SEPARATE function (ToolboxCategory.prototype.parseColour_, not
// Blockly.utils.parseBlockColour), so without this, "Soft Blockly colors"
// left every category label in the toolbox sidebar still fully saturated
// even with every actual block already muted.
if (!Blockly.ToolboxCategory.prototype.parseColour_.isDesaturationPatch) {
  const originalParseColour = Blockly.ToolboxCategory.prototype.parseColour_;
  Blockly.ToolboxCategory.prototype.parseColour_ = function(colourValue) {
    const hex = originalParseColour.call(this, colourValue);
    return hex && useDesaturateBlocklyColorsStorage().value ? desaturateHex(hex, 0.5) : hex;
  };
  Blockly.ToolboxCategory.prototype.parseColour_.isDesaturationPatch = true;
}

// Keeps the toolbox flyout (the drawer of draggable block previews a
// clicked category opens) open across a zoom - confirmed directly that
// WorkspaceSvg.prototype.setScale (the function EVERY zoom path - the +/-
// buttons, Ctrl+wheel, zoom-to-fit, zoom-reset - ultimately calls)
// unconditionally calls Blockly.hideChaff(false) itself, and that false
// (not true - see hideChaff's "onlyClosePopups" parameter) is
// specifically what tells the flyout to close itself, not just dismiss
// unrelated popups like tooltips/context menus. A real reported
// annoyance: picking a category, then zooming to get a better look before
// dragging a block in, closed the very drawer you were about to drag from.
//
// Temporarily swaps out Blockly.hideChaff for the duration of setScale's
// (synchronous) call, forcing it to behave as if onlyClosePopups were
// always true - deliberately NOT a permanent override of hideChaff
// itself, which would also leave the flyout open on every OTHER
// hideChaff(false) call site too (e.g. clicking empty canvas), well
// beyond what was actually asked for ("when zooming").
if (!Blockly.WorkspaceSvg.prototype.setScale.isKeepFlyoutOpenPatch) {
  const originalSetScale = Blockly.WorkspaceSvg.prototype.setScale;
  Blockly.WorkspaceSvg.prototype.setScale = function(newScale) {
    const originalHideChaff = Blockly.hideChaff;
    Blockly.hideChaff = () => originalHideChaff(true);
    try {
      originalSetScale.call(this, newScale);
    } finally {
      Blockly.hideChaff = originalHideChaff;
    }
  };
  Blockly.WorkspaceSvg.prototype.setScale.isKeepFlyoutOpenPatch = true;
}

// The same width as App.vue's global ::-webkit-scrollbar (10px), so the editor's scrollbars match the rest of the app.

// The handle's cross-axis size/offset (normally (thickness - 5) wide with a
// fixed 2.5px offset from each edge) doesn't land on the app's 12px thumb
// width no matter what scrollbarThickness is set to - and can't be fixed by
// overriding Scrollbar's internal DOM-building step (tried first): the
// Scrollbar CONSTRUCTOR itself re-sets svgHandle's width/x (and height/y
// for horizontal) right after building that DOM, clobbering anything set
// there. Wrapping the whole constructor instead, so this runs after ALL of
// the original construction logic. Static properties (scrollbarThickness,
// DEFAULT_SCROLLBAR_MARGIN) are copied across since other Blockly modules
// read them off Blockly.Scrollbar directly.
// Blockly 8 rewrote Scrollbar as a real ES6 class (node_modules/blockly/
// core/scrollbar.js) - a plain function body calling it via
// OriginalScrollbar.apply(this, args) (Blockly 6's shape, which this used
// to be) throws "Class constructor Scrollbar cannot be invoked without
// 'new'" in v8+, since a class constructor can only ever be called through
// `new`/`super(...)`, never .apply()/.call(). A real `class ... extends`
// with `super(...args)` is the only way to both still run the original
// constructor AND run this patch's code right after it. svgHandle (below)
// is still named without a trailing underscore the same way in Blockly 10
// (TypeScript's `private` keyword replaced the old Closure-style `_`
// suffix convention somewhere between 8 and 10 - confirmed directly against
// the installed package's scrollbar.d.ts).
const OriginalScrollbar = Blockly.Scrollbar;
// eslint-disable-next-line require-jsdoc
class PatchedScrollbar extends OriginalScrollbar {
  // eslint-disable-next-line require-jsdoc
  constructor(...args) {
    super(...args);
    const horizontal = args[1];
    const inset = 2;
    const handleSize = Blockly.Scrollbar.scrollbarThickness - inset * 2;
    const radius = handleSize / 2;
    if (horizontal) {
      this.svgHandle.setAttribute('height', handleSize);
      this.svgHandle.setAttribute('y', inset);
    } else {
      this.svgHandle.setAttribute('width', handleSize);
      this.svgHandle.setAttribute('x', inset);
    }
    this.svgHandle.setAttribute('rx', radius);
    this.svgHandle.setAttribute('ry', radius);
  }
}
// scrollbarThickness/DEFAULT_SCROLLBAR_MARGIN are real static properties on
// the Scrollbar class itself (Scrollbar.scrollbarThickness = 15, set right
// after the class body - node_modules/blockly/core/scrollbar.js), not
// instance properties - `class ... extends` already inherits a parent
// class's static properties through its prototype chain, so
// PatchedScrollbar.scrollbarThickness already resolves correctly with no
// separate Object.assign needed (unlike the old plain-function version,
// which had no prototype chain to inherit through).
Blockly.Scrollbar = PatchedScrollbar;
Blockly.Scrollbar.scrollbarThickness = 10;

// The drawer the toolbox opens with a category's blocks is drawn with rounded corners (an 8px arc at the top and bottom of the
// side facing the workspace). The same box, with square corners: the width and height Blockly passes in leave out the
// two corners, so they are added back here.
if (!Blockly.VerticalFlyout.prototype.setBackgroundPath.isSquareCornersPatch) {
  Blockly.VerticalFlyout.prototype.setBackgroundPath = function(width, height) {
    const atRight = this.toolboxPosition_ === Blockly.utils.toolbox.Position.RIGHT;
    const totalWidth = width + this.CORNER_RADIUS;
    const totalHeight = Math.max(0, height) + 2 * this.CORNER_RADIUS;
    const path = [`M ${atRight ? totalWidth : 0},0`, 'h', atRight ? -totalWidth : totalWidth, 'v', totalHeight, 'h',
      atRight ? totalWidth : -totalWidth, 'z'];
    this.svgBackground_.setAttribute('d', path.join(' '));
  };
  Blockly.VerticalFlyout.prototype.setBackgroundPath.isSquareCornersPatch = true;
}

// Stock Blockly's "Set [variable] to" flyout block starts with its VALUE
// input empty - unlike math_change (see flyoutCategoryBlocks below, in
// node_modules/blockly/core/variables.js) it doesn't get its  math_number
// shadow, so dragging it out gave no visible drop target until something was
// plugged in. Wrapped (not overwritten outright) so the button and every
// other block flyoutCategoryBlocks builds - math_change, variables_get -
// are untouched; only the variables_set entry gets a VALUE child appended
// after the fact.
//
// bit_get/bit_set/system_variable_get (see blocks/bit.js) are also spliced
// in here, right after the "Create variable..." button and before any of
// the user's variables. They belong in the Variables category alongside the
// standard get/set/change blocks, but a plain <block> listed as that
// category's XML child in the toolbox is silently ignored (the "custom"
// attribute hands its entire flyout content to flyoutCategory instead) -
// this is the only way to place a static block inside a dynamic category at
// all.
//
// Patches Blockly.Variables.flyoutCategory (the OUTER function a
// "custom=VARIABLE" toolbox category actually calls - see
// blockly-toolbox.xml.hbs), not flyoutCategoryBlocks (the inner helper this
// used to patch instead) - confirmed directly against
// node_modules/blockly/core/variables.js that flyoutCategory's body
// calls flyoutCategoryBlocks as a plain local function reference captured
// at module-load time, not through the exported Blockly.Variables.
// flyoutCategoryBlocks property, so reassigning that property (like this
// patch used to) silently has no effect at all - a side effect of Blockly's
// ES module rewrite, not something flagged in any changelog. flyoutCategory
// itself builds the button, then concats flyoutCategoryBlocks(workspace)
// onto it (confirmed via the same source read) - wrapping the OUTER
// function and post-processing its full return value (button at index 0,
// everything else right after) achieves the exact same end result as the
// old inner-function patch did.
//
// Guarded (isExtraBlocksPatch) against re-wrapping itself, same reasoning
// as the parseBlockColour/ToolboxCategory.parseColour_ guards below - this
// one was originally left unguarded, which would re-append another VALUE
// child and another copy of the three extra blocks on every dev-server
// hot-reload of this file, compounding with each edit.
if (!Blockly.Variables.flyoutCategory.isExtraBlocksPatch) {
  const originalFlyoutCategory = Blockly.Variables.flyoutCategory;
  Blockly.Variables.flyoutCategory = function(workspace) {
    const xmlList = originalFlyoutCategory.call(this, workspace);
    xmlList.forEach((element) => {
      if (element.tagName !== 'block' || element.getAttribute('type') !== 'variables_set') return;
      // Blockly.Xml.textToDom moved to Blockly.utils.xml.textToDom
      // somewhere between Blockly 8 and 10 - confirmed directly against the
      // installed package's xml.d.ts files (gone from core/xml.d.ts, now
      // only declared in core/utils/xml.d.ts).
      const value = Blockly.utils.xml.textToDom(
          '<value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value>');
      element.appendChild(value);
    });
    const extraBlocks = Blockly.utils.xml.textToDom(
        '<xml>' +
        '<block type="bit_get"></block>' +
        '<block type="bit_set">' +
        '<value name="VALUE"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value>' +
        '</block>' +
        '<block type="nibble_get"></block>' +
        '<block type="nibble_set">' +
        '<value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value>' +
        '</block>' +
        '<block type="system_variable_get"></block>' +
        '<block type="display_ram_set"><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block>' +
        '<block type="display_ram_change"><value name="VALUE"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block>' +
        '<block type="display_ram_get"></block>' +
        '<block type="data_stream_point"><value name="INDEX"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block>' +
        '<block type="display_ram_fill"><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value>' +
        '<value name="START"><shadow type="math_number"><field name="NUM">0</field></shadow></value>' +
        '<value name="COUNT"><shadow type="math_number"><field name="NUM">16</field></shadow></value></block>' +
        '<block type="display_ram_copy"><value name="COUNT"><shadow type="math_number"><field name="NUM">16</field></shadow></value>' +
        '<value name="FROM"><shadow type="math_number"><field name="NUM">0</field></shadow></value>' +
        '<value name="TO"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block>' +
        '<block type="data_stream_read"></block>' +
        '<block type="data_stream_write"><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block>' +
        '</xml>',
    ).children;
    return [xmlList[0], ...extraBlocks, ...xmlList.slice(1)];
  };
  Blockly.Variables.flyoutCategory.isExtraBlocksPatch = true;
}

// A "live-snap-while-dragging" patch (rounding a block's live position to
// the nearest grid vertex on every mousemove, via BlockSvg.prototype.
// moveDuringDrag) used to live here, and was removed after being confirmed
// as the actual cause of a real, longstanding reported bug: dragging a group
// of connected blocks made them visibly lose alignment/connection with each
// other mid-drag, snapping back correctly only once the drag ended.
// Root cause, confirmed directly against Blockly's  BlockDragger.
// prototype.drag (node_modules/blockly/core/block_dragger.js): that method
// calls moveDuringDrag(newLoc) to move the block(s) visually, then
// SEPARATELY calls this.draggedConnectionManager_.update(delta, ...) - using
// the ORIGINAL, un-rounded delta - to compute the insertion-marker/
// connection-highlight ghost outline. The patch only rounded the position
// inside moveDuringDrag, so the block rendered at its snapped spot while
// Blockly's  connection-highlight system kept working from the real,
// unsnapped mouse position - the two disagreed for the whole drag,
// reconciling only at drop. Stock Blockly's  default (snap only at the
// very end of a drag, via BlockSvg.prototype.snapToGrid, reached through
// BlockDragger's  endDrag flow) doesn't have this problem, since nothing
// about connection-highlighting happens after that point - reverting to it
// entirely was the safer fix over trying to also patch BlockDragger.
// prototype.drag itself to keep the two in sync.

// No wheel-behavior patch needed here (an earlier version of this had one,
// for a since-reverted shift-to-zoom scheme) - Ctrl+wheel to zoom, plain
// wheel to scroll vertically, is already stock Blockly's  default
// onMouseWheel_ behavior (node_modules/blockly/core/workspace_svg.js: zooms
// when canWheelZoom && e.ctrlKey, otherwise scrolls). The only reason plain
// wheel used to always zoom regardless of Ctrl was that this app never set
// a "move" option at all, leaving wheel-scrolling off entirely (see
// ActionEditor.vue's "move: {wheel: true}" option, which is the actual
// fix) - once that's on, stock Blockly's  logic already does exactly
// what's wanted with no override needed.

// Module-scope (not component data) - same reasoning as every other
// "survive remount" ref elsewhere in this app (e.g. BackgroundEditor.vue's
// copiedBackgroundData): Vue Router destroys and recreates this
// component every time its tab is left and revisited, so a plain instance
// property would reset right back to nothing on every visit. Only ever
// read/written imperatively (see mounted()/beforeDestroy() below), never
// bound in a template, so a plain object is enough - no reactivity needed.
let savedScrollState = null;

// Whether IBM Plex Mono has already been CONFIRMED loaded at least once this
// session - module-level (not per-instance) for the same "survives this
// component's repeated destroy/recreate on tab switches" reason as
// savedScrollState above. Lets ensureBlockFontSizing below skip straight to
// document.fonts.check()'s synchronous answer on every call after the
// first real one - still correct (the font can't un-load), just without
// re-running the async document.fonts.load() race on every single mount/
// reload once it's already a known-true fact.
let blocklyFontConfirmedLoaded = false;

export default {
  name: 'BlocklyComponent',
  props: ['options', 'value'],
  data() {
    return {
      workspace: null,
      workspaceSearch: null,
      multiselect: null,
      stopClipboardSync: null,
      lastSavedWorkspace: null,
    };
  },
  computed: {
    // Only the block TEXT (see .blocklyDiv-desaturated's  CSS comment
    // for why emoji glyphs specifically need this, unlike ordinary block
    // fill colours - see Blockly.utils.parseBlockColour's  patch above)
    // needs a live, reactive binding here - block fill colour itself is
    // desaturated once, up front, at colour-resolution time, with no
    // per-render reactivity needed since a workspace is never re-injected
    // without a full remount anyway.
    desaturateBlocklyColors() {
      return useDesaturateBlocklyColorsStorage().value;
    },
  },
  mounted() {
    const options = this.$props.options || {};
    if (!options.toolbox) {
      options.toolbox = this.$refs['blocklyToolbox'];
    }
    // The multiselect plugin's README is explicit that this has to be
    // set at injection time ("Required to work") - Multiselect.init() below
    // (which runs after inject()) only wires up selection/keyboard/context-
    // menu behavior, it doesn't swap the block dragger itself.
    if (!options.plugins) options.plugins = {};
    options.plugins.blockDragger = MultiselectBlockDragger;

    this.workspace = Blockly.inject(this.$refs['blocklyDiv'], options);
    // WorkspaceSvg's constructor (node_modules/blockly/blockly_
    // compressed.js) auto-registers the "custom=VARIABLE" toolbox
    // category's callback itself, as
    // `this.registerToolboxCategoryCallback(CATEGORY_NAME, flyoutCategory)`
    // - but, confirmed directly against that compiled bundle, `flyoutCategory`
    // there is the SAME module-local function reference the
    // Blockly.Variables.flyoutCategory patch above reassigns, not the
    // exported property the patch actually overwrites - so by the time this
    // line runs, the workspace has already bound the toolbox's "Variables"
    // category to the ORIGINAL, unpatched function, silently dropping the
    // bit_get/bit_set/system_variable_get blocks and the variables_set
    // VALUE shadow that patch exists to add, no matter how early the patch
    // itself ran. Re-registering here, now that the workspace instance
    // actually exists, overwrites that auto-registered callback with the
    // patched one - the same captured-local-reference problem the
    // flyoutCategory patch's comment already describes for
    // flyoutCategoryBlocks, just one level further out.
    this.workspace.registerToolboxCategoryCallback(
        Blockly.Variables.CATEGORY_NAME, Blockly.Variables.flyoutCategory);
    // Kept as an instance field (not a local/inline function) so
    // beforeDestroy() below can flush() it - lodash's debounce defaults to
    // a 0ms wait, so a field edit immediately followed by navigating to a
    // different tab (unmounting this component, disposing the workspace)
    // can lose that edit entirely if the debounced call never gets to fire
    // before teardown - confirmed as a real reported bug ("changing the
    // set field to Y isn't remembered when navigating away from the
    // Actions tab - it keeps going back to X").
    this.debouncedHandleChange = debounce(() => this.handleChange());
    this.workspace.addChangeListener(this.debouncedHandleChange);
    this.loadWorkspace(this.value);

    // Finds/highlights blocks already placed on the canvas - Ctrl+F (Cmd+F
    // on Mac) opens it, Escape or its close button closes it. Kept as an
    // instance field (not local to mounted()) so beforeDestroy() below can
    // dispose it - this component's workspace gets torn down and
    // re-injected on remount (e.g. switching project tabs), and the plugin
    // registers its keyboard shortcut/DOM against the workspace it was
    // built with, so it has to be disposed and rebuilt every time, not just
    // created once.
    this.workspaceSearch = new WorkspaceSearch(this.workspace);
    this.workspaceSearch.init();

    // Copy/paste of blocks between browser windows, through the system clipboard.
    this.stopClipboardSync = installBlocklyClipboardSync();

    // Lets the user drag a rubber-band selection box (or ctrl/shift-click)
    // over several blocks and move/delete/duplicate them as one group -
    // same "rebuild every mount, since it registers against the workspace
    // instance mounted() just created" reasoning as workspaceSearch above.
    // No double-click-to-collapse behavior, and neighbour-bumping on drop
    // is left at Blockly's stock behavior (not suppressed).
    this.multiselect = new Multiselect(this.workspace);
    this.multiselect.init({
      multiselectIcon: {disabledIcon: MULTISELECT_ICON_INACTIVE, enabledIcon: MULTISELECT_ICON_ACTIVE},
    });
    // The plugin's built-in selection-mode toggle button
    // (this.multiselect.controls_, a MultiselectControls instance - not
    // itself an exported class from the plugin's package, so this reaches
    // it off the Multiselect instance's plain "controls_" property
    // instead) registers as an independent POSITIONABLE component in the
    // corner OPPOSITE the toolbox, via the exact same getCornerOppositeToolbox/
    // bumpPositionRect system the trashcan/zoom controls/grid-snap row
    // already use for that same corner - but this app's position()
    // overrides for those three hand-build a single custom horizontal row
    // with no awareness of this plugin's 4th icon, confirmed as a real
    // reported overlap ("grid and multiselect icons are overlapping")
    // otherwise. Overridden here (on this ONE instance, not the shared
    // MultiselectControls.prototype some other workspace might use - there's
    // only ever one of these per workspace anyway) to sit in the SAME corner
    // as the toolbox instead - the corner that row never uses at all - so
    // there's no possible overlap with it, without having to hand-integrate
    // a 4th slot into that row's custom layout math.
    //
    // WIDTH/HEIGHT/MARGIN_HORIZONTAL/MARGIN_VERTICAL (32/32/20/20) are
    // copied from the plugin's multiselect_controls.js - private
    // module-scope consts there too, same reasoning as TRASHCAN_WIDTH/etc.
    // in trashcan-size.js for why they have to be hardcoded here instead of
    // read off the plugin directly.
    const controls = this.multiselect.controls_;
    if (controls) {
      controls.position = function(metrics, savedPositions) {
        if (!this.initialized_) return;
        const opposite = Blockly.uiPosition.getCornerOppositeToolbox(this.workspace_, metrics);
        const cornerPosition = {
          horizontal: opposite.horizontal === Blockly.uiPosition.horizontalPosition.LEFT ?
            Blockly.uiPosition.horizontalPosition.RIGHT : Blockly.uiPosition.horizontalPosition.LEFT,
          vertical: opposite.vertical === Blockly.uiPosition.verticalPosition.TOP ?
            Blockly.uiPosition.verticalPosition.BOTTOM : Blockly.uiPosition.verticalPosition.TOP,
        };
        const startRect = Blockly.uiPosition.getStartPositionRect(
            cornerPosition, new Blockly.utils.Size(32, 32), 20, 20, metrics, this.workspace_);
        const bumpDirection = cornerPosition.vertical === Blockly.uiPosition.verticalPosition.TOP ?
          Blockly.uiPosition.bumpDirection.DOWN : Blockly.uiPosition.bumpDirection.UP;
        const positionRect = Blockly.uiPosition.bumpPositionRect(startRect, 20, bumpDirection, savedPositions);
        this.top_ = positionRect.top;
        this.left_ = positionRect.left;
        if (this.svgGroup_) {
          this.svgGroup_.setAttribute('transform', `translate(${this.left_},${this.top_})`);
        }
      };
      controls.getBoundingRectangle = function() {
        const bottom = this.top_ + 32;
        const right = this.left_ + 32;
        return new Blockly.utils.Rect(this.top_, bottom, this.left_, right);
      };
      // Matches the grid-snap icon's "active (toggled on) is always full
      // opacity, solid blue, regardless of hover" rule (see
      // ActionEditor.vue's setupGridSnapZoomButton) - confirmed as a real
      // reported request ("when multiselect is active, it should have the
      // same active state as the grid icon"). The plugin's
      // updateMultiselectIcon only ever swaps which image is shown
      // (enabled_img/disabled_img - both the same #455A64 by default,
      // see multiselectIcon.enabledIcon/disabledIcon below), with no class
      // or style change to hook a CSS rule onto - wrapped here (not
      // overwritten outright) so its swap-the-image-source behavior stays
      // untouched, this just also toggles a class App.vue's CSS can target.
      // A rectangle drawn over blocks inside a wrapper (an event, a subroutine, a comment wrapper) also touches the wrapper's
      // outline, which spans everything inside it, so the wrapper got selected with them (the plugin only drops such a
      // parent in a few cases). A wrapper (the block whose statement input holds the others) is left out of the selection unless the rectangle reaches its top left corner, the
      // header of the wrapper, so only the blocks inside and below it are selected.
      const originalEnable = controls.enableMultiselect.bind(controls);
      controls.enableMultiselect = function(byIcon) {
        originalEnable(byIcon);
        const selection = this.dragSelect_ && this.dragSelect_.Selection;
        if (!selection || !selection.filterSelected) return;
        const originalFilter = selection.filterSelected;
        selection.filterSelected = (info) => {
          const result = originalFilter(info) || info;
          const {select, unselect} = result;
          const rect = info.selectorRect || {};
          const left = rect.left !== undefined ? rect.left : rect.x;
          const top = rect.top !== undefined ? rect.top : rect.y;
          const right = rect.right !== undefined ? rect.right : left + rect.width;
          const bottom = rect.bottom !== undefined ? rect.bottom : top + rect.height;
          const blockOf = (element) => {
            const id = element.parentElement && element.parentElement.dataset && element.parentElement.dataset.id;
            return id ? this.workspace_.getBlockById(id) : null;
          };
          const picked = new Map();
          select.forEach((_, element) => {
            const block = blockOf(element);
            if (block) picked.set(block.id, {block, element});
          });
          picked.forEach(({block, element}) => {
            let ancestor = block.getSurroundParent();
            while (ancestor) {
              const entry = picked.get(ancestor.id);
              if (entry) {
                const corner = select.get(entry.element);
                const cornerX = corner && (corner.left !== undefined ? corner.left : corner.x);
                const cornerY = corner && (corner.top !== undefined ? corner.top : corner.y);
                const reached = corner && cornerX >= left && cornerX <= right && cornerY >= top && cornerY <= bottom;
                if (!reached) {
                  select.delete(entry.element);
                  unselect.set(entry.element, corner);
                  picked.delete(ancestor.id);
                }
              }
              ancestor = ancestor.getSurroundParent();
            }
          });
          return {select, unselect};
        };
      };

      const originalUpdateIcon = controls.updateMultiselectIcon.bind(controls);
      controls.updateMultiselectIcon = function(enable) {
        originalUpdateIcon(enable);
        if (this.multiselectGroup_) {
          this.multiselectGroup_.classList.toggle('blockly-multiselect-active', !!enable);
        }
      };
    }

    this.ensureBlockFontSizing();
    this.watchFontLoading();

    // Applied synchronously, right here - BEFORE the browser ever paints
    // this mount's  first frame - rather than from inside the resize-
    // settle pass below. An earlier version restored it there instead
    // (reasoning: scroll(x, y) is a raw pixel translate, not something that
    // depends on the container's  size the way the scrollbar's THUMB
    // position does - see resizeWorkspace's  comment just below for the
    // actual thing that settle pass exists for), which was confirmed as a
    // real, reported bug: the workspace visibly rendered at Blockly's
    // default scroll position for a moment, then visibly JUMPED to the
    // saved one about 100ms later. Restoring it here instead means this
    // mount's very first paint already shows the right place - no jump to
    // see at all.
    if (savedScrollState) {
      this.workspace.setScale(savedScrollState.scale);
      this.workspace.scroll(savedScrollState.scrollX, savedScrollState.scrollY);
    }

    // Keep the Blockly SVG sized to its container. The surrounding layout can
    // resize the container after inject (Blockly only reflows on window
    // resize), which would otherwise leave the SVG mis-sized and its zoom and
    // trashcan controls anchored off-screen.
    //
    // The scrollbar specifically needs its  extra settle-and-recompute
    // pass: ResizeObserver can fire mid-reflow (e.g. while a sibling panel's
    // resize is still being applied across a couple of frames), and
    // Blockly.svgResize()/workspace.resize() then caches the scrollbar's
    // position from that in-between size instead of the final one - the SVG
    // itself keeps tracking the container correctly (CSS does that on its
    // ), so only the scrollbar (positioned from Blockly's  cached
    // metrics, not live CSS) ends up visibly drawn in the wrong place versus
    // where it actually receives clicks.
    const resizeWorkspace = () => {
      Blockly.svgResize(this.workspace);
      if (this.workspace.scrollbar) this.workspace.scrollbar.resize();
    };
    this.resizeObserver = new ResizeObserver(() => {
      resizeWorkspace();
      clearTimeout(this.resizeSettleTimer);
      this.resizeSettleTimer = setTimeout(resizeWorkspace, 100);
    });
    this.resizeObserver.observe(this.$refs['blocklyDiv']);
  },
  beforeDestroy() {
    this.unwatchFontLoading();
    // Flushes any pending debounced save (see mounted()'s comment on
    // debouncedHandleChange) before the workspace below is disposed and
    // this component's "value" prop's last-known state becomes the
    // project's permanent record of this tab's blocks.
    if (this.debouncedHandleChange && this.debouncedHandleChange.flush) {
      this.debouncedHandleChange.flush();
    }
    if (this.workspaceSearch) {
      // This plugin's dispose() (see node_modules/@blockly/
      // plugin-workspace-search/src/WorkspaceSearch.js) nulls out its DOM
      // refs but never unregisters itself from the workspace's
      // ComponentManager (a real bug, confirmed still present as of 5.0.16,
      // the latest release still compatible with this app's Blockly
      // version) - left registered, ANY later
      // resize (e.g. this same tab remounting, or just the window/pane
      // resizing again) calls its position() method against those
      // now-null refs and throws "Cannot read properties of null (reading
      // 'style')", confirmed directly against a real crash. Removed here
      // by hand, by the same id the plugin itself registers under, before
      // dispose() runs.
      if (this.workspace) {
        this.workspace.getComponentManager().removeComponent(this.workspaceSearch.id);
      }
      this.workspaceSearch.dispose();
      this.workspaceSearch = null;
    }
    if (this.stopClipboardSync) {
      this.stopClipboardSync();
      this.stopClipboardSync = null;
    }
    if (this.multiselect) {
      // Unlike workspaceSearch above, this plugin's dispose() DOES
      // correctly unregister its controls from the ComponentManager itself
      // (confirmed directly against node_modules/@mit-app-inventor/
      // blockly-plugin-workspace-multiselect/src/multiselect_controls.js) -
      // no manual removeComponent() workaround needed here.
      this.multiselect.dispose();
      this.multiselect = null;
    }
    // Captured here (not just read live from this.workspace whenever
    // mounted() next needs it) since the workspace itself - along with
    // scrollX/scrollY/scale - is torn down entirely once this component is
    // destroyed; this is the last point they're still readable.
    if (this.workspace) {
      savedScrollState = {
        scrollX: this.workspace.scrollX,
        scrollY: this.workspace.scrollY,
        scale: this.workspace.scale,
      };
      // Never actually disposed before - harmless as long as nothing a
      // fresh Blockly.inject() creates later collides with anything the
      // old, still-alive workspace left registered. @blockly/toolbox-search
      // broke that assumption: its ToolboxSearchCategory registers a
      // keyboard shortcut ("startSearch", Ctrl+B - see toolbox_search.ts)
      // on Blockly.ShortcutRegistry.registry, a GLOBAL singleton shared by
      // every workspace, not something scoped to the one being built - and
      // only unregisters it from its dispose(), which only runs if the
      // WORKSPACE's dispose() runs (Toolbox.dispose() cascades to disposing
      // every ToolboxItem, including this one). Confirmed as a real crash
      // (`Error: Shortcut named "startSearch" already exists.`, thrown from
      // ShortcutRegistry.register) the moment this tab is revisited (Vue
      // Router destroys and recreates this component - see savedScrollState
      // 's comment above) and mounted() calls Blockly.inject() again
      // while the previous mount's workspace/toolbox/search category was
      // still alive and still held that same registration - aborting the
      // rest of Toolbox init, with the exact same "missing toolbox sidebar,
      // every canvas icon piled in the top-left corner" symptom already
      // diagnosed once this upgrade for a different inject()-time crash
      // (see the FieldDropdown.getOptions alt-text guard above).
      this.workspace.dispose();
      // Blockly's Ctrl+Z / Ctrl+Y (a keydown listener on the whole document,
      // installed once) act on whatever it thinks the main workspace is. After
      // this one is disposed it still pointed at it, so pressing Ctrl+Z on any
      // other tab (Sprites, Backgrounds...) ran an undo on the dead workspace
      // and threw "Workspace is null". With no main workspace it does nothing.
      if (Blockly.common.getMainWorkspace() === this.workspace) Blockly.common.setMainWorkspace(null);
      // Marks this component as torn down so the delayed re-render calls
      // (the font-load promise and the drag-retry poll in
      // rerenderForFontLoad) don't run against the disposed workspace: its
      // blocks' fields are already freed, so rendering them throws "The text
      // content is null" and leaves Blockly's shared render queue broken -
      // after which nothing new (a block dragged out of the toolbox, say)
      // can render.
      this.workspaceDisposed = true;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    clearTimeout(this.resizeSettleTimer);
  },
  methods: {
    // IBM Plex Mono (--blockly-font-family, see App.vue, and
    // ActionEditor.vue's matching "normal 11px" fontStyle) loads
    // asynchronously via a <link> in public/index.html, same as any web
    // font - browsers fetch that stylesheet eagerly, but LAZILY defer
    // actually downloading the font FILE it references until something on
    // the page needs to render text in it. The very first thing that needs
    // it sizes every block's initial text measurement against whatever
    // fallback font is active at that instant instead - the real font then
    // swaps in visually once it finishes loading, but Blockly never
    // re-measures existing blocks by itself, so they stay the WRONG size
    // until something forces a re-render. Called from both mounted() (the
    // initial inject) and loadWorkspace() (any later full rebuild - an
    // undo/redo that recreates blocks, a project reload, switching back to
    // this tab) rather than just once at mount, since each of those can
    // independently create blocks that get measured fresh against whatever
    // the font state happens to be at THAT moment - a single mount-time
    // check only ever covered the first of these, confirmed as a real
    // reported recurrence ("undersized blocks" after an undo or a tab
    // switch, not just on first load).
    //
    // document.fonts.check() first (a synchronous, exact "is this specific
    // font variant already loaded" query, not an ambient "are fonts
    // settled" guess) - once blocklyFontConfirmedLoaded is true (the module-
    // level flag above, set the first time this resolves), every later call
    // short-circuits straight to a render with no async wait at all, which
    // covers the common case (the font finished loading ages ago) without
    // re-running a promise chain on every single reload.
    //
    // document.fonts.ready (tried first, before document.fonts.load() below
    // existed) is NOT the right signal for the first, not-yet-confirmed
    // case: it resolves once every font ALREADY SCHEDULED to load has
    // finished - but if the lazy download above hasn't been scheduled yet at
    // the moment this code runs (a real race - confirmed as why that first
    // attempt still needed a page refresh), it can resolve before the real
    // font ever starts loading, let alone finishes. document.fonts.load()
    // instead actively requests this exact font (deduped by the browser if
    // it's already loading/cached) and its returned promise only resolves
    // once THAT specific load genuinely completes - a real signal, not an
    // ambient one.
    // Re-measures the blocks every time the browser finishes loading ANY font file, not just
    // the one confirmed once at mount. The single check in ensureBlockFontSizing can pass
    // too early: document.fonts.check() answers true when no matching font face is
    // registered yet (the web font's stylesheet still arriving, the first visit after a
    // project load), and a font loads in pieces by character range, so text with a symbol
    // or emoji from a range not fetched yet is measured against the fallback font the
    // first time and stays the wrong size - the "blocks sized wrong for the font, and
    // sometimes again later" reports. 'loadingdone' fires after each such load; the
    // short delay folds a burst of them into one re-render.
    watchFontLoading() {
      if (!document.fonts || !document.fonts.addEventListener) return;
      this.fontsLoadedListener = () => {
        clearTimeout(this.fontRerenderTimer);
        this.fontRerenderTimer = setTimeout(() => this.rerenderForFontLoad(), 60);
      };
      document.fonts.addEventListener('loadingdone', this.fontsLoadedListener);
    },
    unwatchFontLoading() {
      clearTimeout(this.fontRerenderTimer);
      if (this.fontsLoadedListener && document.fonts && document.fonts.removeEventListener) {
        document.fonts.removeEventListener('loadingdone', this.fontsLoadedListener);
      }
      this.fontsLoadedListener = null;
    },
    // Whether IBM Plex Mono is really loaded: a face for it is registered AND finished
    // loading. document.fonts.check() alone also says yes while no face is registered yet.
    blockFontLoaded() {
      let registered = false;
      let loaded = false;
      document.fonts.forEach((face) => {
        if (String(face.family).replace(/["']/g, '') !== 'IBM Plex Mono') return;
        registered = true;
        if (face.status === 'loaded') loaded = true;
      });
      return registered && loaded && document.fonts.check('normal 11px "IBM Plex Mono"');
    },
    ensureBlockFontSizing() {
      if (!document.fonts) {
        this.rerenderForFontLoad();
        return;
      }
      if (blocklyFontConfirmedLoaded || this.blockFontLoaded()) {
        blocklyFontConfirmedLoaded = true;
        this.rerenderForFontLoad();
        return;
      }
      if (!document.fonts.load) {
        this.rerenderForFontLoad();
        return;
      }
      document.fonts.load('normal 11px "IBM Plex Mono"').catch(() => {}).then(() => {
        blocklyFontConfirmedLoaded = true;
        this.rerenderForFontLoad();
      });
    },
    // Re-measures/re-renders every block once the real IBM Plex Mono font
    // has actually finished loading (see ensureBlockFontSizing's comment
    // for the full race this fixes) - deferred (not run immediately)
    // whenever a drag gesture is in progress at the moment the font-load
    // promise resolves. Confirmed as a real reported bug otherwise: a block
    // currently being dragged lives on Blockly's  separate "drag surface"
    // layer (see BlockSvg.prototype.moveToDragSurface in node_modules/
    // blockly/core/block_svg.js), tracked there via that surface's
    // transform rather than the block's normal workspace-relative position -
    // rendering it mid-gesture (which reads/writes that normal position)
    // produced a large, arbitrary jump, not the small (half a grid-spacing)
    // pop a grid-snap-on-drop would explain. Retries on a short poll (same
    // "just check back shortly" shape as this file's  resize-settle timer
    // just above) rather than a one-shot deferral, since a drag can easily
    // still be in progress the first time this checks back too.
    rerenderForFontLoad() {
      if (!this.workspace || this.workspaceDisposed) return;
      if (this.workspace.isDragging && this.workspace.isDragging()) {
        setTimeout(() => this.rerenderForFontLoad(), 100);
        return;
      }
      // Blockly's  WorkspaceSvg.prototype.render() (node_modules/blockly/
      // core/workspace_svg.js) - NOT a hand-rolled
      // "getAllBlocks().forEach(block => block.render())" loop, which this
      // used to be. That loop walks blocks in forward (parent-before-child)
      // order; Blockly's  version deliberately renders in REVERSE
      // (children/leaves first), since a parent with inline inputs sizes its
      // row layout from its children's already-rendered dimensions -
      // render the parent first (while a child has just been measured with
      // the new font but not yet re-rendered itself) and its inline fields
      // get positioned against a child width that's about to change out from
      // under them. Confirmed as a real reported recurrence of this same
      // font-race bug, but with a NEW symptom ("fields overlapping" rather
      // than plain wrong sizing) that only this ordering, not the font race
      // itself, explains.
      // render() alone only re-measures a field that is marked dirty, and a field measured
      // against the fallback font before the real one arrived is not: its text width stays the
      // old one and the block keeps the wrong size. BlockSvg.markDirty() marks every field of
      // the block (and the renderer's constants) for a fresh measurement.
      this.markBlocksDirty(this.workspace);
      this.workspace.render();
      // The toolbox flyout is a genuinely separate sub-workspace (its
      // blocks, its  earlier text measurement race) - workspace.render()
      // above only walks the MAIN workspace, so a category open at the
      // moment the font finishes loading still stayed the wrong size until
      // it was closed and reopened, a real reported recurrence of this same
      // bug. getFlyout() returns null whenever no category is currently open
      // (nothing to fix yet - the flyout measures fresh, correctly, the next
      // time one IS opened, by which point the font load has long since
      // resolved).
      const flyout = this.workspace.getFlyout && this.workspace.getFlyout();
      const flyoutWorkspace = flyout && flyout.getWorkspace && flyout.getWorkspace();
      if (flyoutWorkspace) {
        this.markBlocksDirty(flyoutWorkspace);
        flyoutWorkspace.render();
      }
    },
    markBlocksDirty(workspace) {
      workspace.getAllBlocks(false).forEach((block) => {
        if (block.markDirty) block.markDirty();
      });
    },
    setSoundsEnabled(enabled) {
      const audioMgr = this.workspace.getAudioManager();
      if (enabled) {
        const pathToMedia = (this.$props.options || {}).media || 'media/';
        audioMgr.load(
            [pathToMedia + 'click.mp3', pathToMedia + 'click.wav', pathToMedia + 'click.ogg'], 'click');
        audioMgr.load(
            [pathToMedia + 'disconnect.wav', pathToMedia + 'disconnect.mp3', pathToMedia + 'disconnect.ogg'],
            'disconnect');
        audioMgr.load(
            [pathToMedia + 'delete.mp3', pathToMedia + 'delete.ogg', pathToMedia + 'delete.wav'], 'delete');
      } else {
        audioMgr.SOUNDS_ = {};
      }
    },
    // Blockly.Events.disable()/enable() around domToWorkspace - without
    // this, every one of these calls fired real BLOCK_CREATE (etc.) events
    // for the whole re-synced XML, which Blockly's workspace listens to
    // ITSELF (separately from this component's addChangeListener) to
    // build its native undo/redo stack. This call is a programmatic resync
    // (the v-model round trip, or loading a different project), never a
    // real user edit - letting it reach the undo stack anyway meant a
    // user's later Ctrl+Z could end up reversing "recreate this entire
    // workspace" instead last real action, wiping every block
    // at once - confirmed as a real reported bug ("sometimes when undoing a
    // block move or edit, all blockly blocks vanish from the canvas").
    // try/finally guarantees events are re-enabled even if domToWorkspace
    // itself throws partway through (a malformed/corrupt XML, for
    // instance) - Events.disable()/enable() are a bare increment/decrement
    // counter (see node_modules/blockly/core/events/events.js), so leaving
    // it decremented one short on an exception would silently disable
    // events for the rest of the session.
    loadWorkspace(value) {
      // Blockly.Xml.textToDom moved to Blockly.utils.xml.textToDom, and
      // domToWorkspace's argument order flipped from (workspace, xml) to
      // (xml, workspace) - both somewhere between Blockly 8 and 10,
      // confirmed directly against the installed package's xml.d.ts files
      // (core/xml.d.ts's domToWorkspace declaration takes xml first).
      const xml = Blockly.utils.xml.textToDom(value && value !== 'null' ?
          value : '<xml xmlns="https://developers.google.com/blockly/xml"/>');
      Blockly.Events.disable();
      try {
        Blockly.Xml.domToWorkspace(xml, this.workspace);
      } finally {
        Blockly.Events.enable();
      }
      // See ensureBlockFontSizing's comment - this rebuild can create new
      // blocks (an undo/redo, a project reload), each needing
      // the exact same font-race check mounted() already runs once for the
      // initial inject.
      this.ensureBlockFontSizing();
    },
    // Entry point for the 'value' watch below - skipped outright (not
    // deferred/retried) whenever a drag is in progress, so a v-model round
    // trip triggered by the drag's  mid-drag 'move' event never rebuilds
    // the workspace out from under it. Retrying a queued copy of THIS same
    // stale snapshot once the drag ends was tried first and is wrong -
    // Blockly.Xml.domToWorkspace (loadWorkspace's  call) never clears
    // the workspace first, so replaying that now-stale snapshot on top of
    // the already-correct post-drag workspace just duplicated every block.
    // Dropping it here instead is safe: the drag's  final 'move' event
    // fires its  handleChange/emit round trip right after, which lands
    // as a genuinely fresh (not dragging) call to this same method with
    // current data - and since that data was already captured into
    // lastSavedWorkspace before being emitted, it's a no-op here anyway.
    loadExternalWorkspace(newVal) {
      if (this.workspace && this.workspace.isDragging && this.workspace.isDragging()) {
        return;
      }
      if (newVal !== this.lastSavedWorkspace) {
        this.loadWorkspace(newVal);
        // Previously an incidental side effect of loadWorkspace's
        // domToWorkspace call firing real change events (which handleChange
        // then captured into lastSavedWorkspace itself) - now that
        // loadWorkspace deliberately disables events (see its comment),
        // that side effect no longer happens, so this has to be set
        // explicitly instead. Without it, this same (already fully synced)
        // value would still look "new" on the NEXT comparison too, calling
        // domToWorkspace again on data the workspace already has - which
        // (per this method's comment above) duplicates every block,
        // since domToWorkspace never clears the workspace first.
        this.lastSavedWorkspace = newVal;
      }
    },
    handleChange() {
      const xml = Blockly.Xml.workspaceToDom(this.workspace);
      const text = Blockly.Xml.domToPrettyText(xml);
      this.lastSavedWorkspace = text;
      this.$emit('input', text, {
        workspace: this.workspace,
      });
    },
  },
  watch: {
    // Guarded against mid-drag reloads (see loadExternalWorkspace's
    // comment) - Blockly fires an abstract 'move' event partway through a
    // drag gesture, not only at drop, so handleChange's v-model round trip
    // (serialize -> emit -> parent's reactive storage -> this same 'value'
    // prop) can deliver a snapshot of the workspace taken WHILE a block is
    // still mid-drag. Rebuilding every block from that snapshot right then
    // (loadWorkspace disposes and recreates the whole tree) is exactly the
    // dragged group's  visible misalignment/detachment that was
    // confirmed via screen recording - it self-corrects afterwards only
    // because the drag's  final 'move' event repeats this same round
    // trip once more with the real, settled position.
    value(newVal) {
      this.loadExternalWorkspace(newVal);
    },
    'options.sounds'(newVal) {
      if (this.workspace) {
        this.setSoundsEnabled(newVal);
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.blocklyDiv {
  height: 100%;
  width: 100%;
  text-align: left;
}

/* Blockly's stock CSS (node_modules/blockly/blockly_compressed.js:
   ".blocklyMainBackground { stroke-width: 1; stroke: #c6c6c6; }") draws a
   thin grey border around the inner edge of the workspace background rect
   - a real reported request to remove it. >>> (deep combinator) reaches
   this SVG element despite it being injected by Blockly at runtime, never
   carrying this component's scope attribute (same reasoning as
   .blocklyText/.blocklyFlyoutLabelText just below). */
.blocklyDiv >>> .blocklyMainBackground {
  stroke: none;
}

/* Options tab's "Desaturate Blockly block colors" toggle, the text/
   emoji half - see Blockly.utils.parseBlockColour's patch above for
   the block FILL colour half. Emoji icon characters embedded in a block's
   message string (see blocks/icon.js - MISSILE_ICON, COLOR_ICON, etc)
   render as native colour-emoji glyphs via the OS/browser's emoji
   font, entirely outside Blockly's SVG fill/theme system - there's no
   "colour" value to desaturate in HSL the way a block's fill has, so
   this is a plain CSS filter instead, scoped to just the text elements
   (same .blocklyText/.blocklyFlyoutLabelText classes App.vue's font-
   family override already targets, for the same "block canvas AND
   toolbox/flyout both" reach) rather than the whole canvas - a filter
   across the ENTIRE .blocklyDiv was tried first and reverted (see this
   component's git history): saturate() uses a different algorithm
   than Photoshop's HSL-based slider (see parseBlockColour's comment),
   and applying it to block fills a SECOND time on top of the already-
   desaturated HSL fills double-muted them. >>> pierces this component's
   scoped CSS boundary - Blockly injects its SVG text nodes into
   .blocklyDiv at runtime, so they never carry this component's scope
   attribute the way template-authored elements do. */
.blocklyDiv-desaturated >>> .blocklyText,
.blocklyDiv-desaturated >>> .blocklyFlyoutLabelText {
  filter: saturate(50%);
}

/* @blockly/plugin-workspace-search's CSS (injected as a runtime <style>
   tag into <head> the first time WorkspaceSearch.init() runs, not
   authored here - see node_modules/@blockly/plugin-workspace-search/src/
   css.js) gives its search bar a heavy drop shadow by default. Same >>>
   deep-scope reasoning as .blocklyText above (its .blockly-ws-search div
   is appended into the workspace's injection div, a descendant of
   .blocklyDiv, but never carries this component's scope attribute since
   it's created imperatively, not from this component's template) - a
   two-class-equivalent selector so this reliably beats the plugin's
   plain ".blockly-ws-search" rule on specificity regardless of which
   <style> tag ends up later in <head> (its runtime injection timing isn't
   guaranteed to run after this component's compiled styles). */
.blocklyDiv >>> .blockly-ws-search {
  box-shadow: none;
}
</style>
