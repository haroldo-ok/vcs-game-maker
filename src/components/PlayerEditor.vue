<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <div class="editor-toolbar-row">
          <editor-zoom v-model="zoom" />
          <pixel-grid-toggle v-model="showPixelGrid" />
        </div>
        <quick-color-palette v-if="spriteColorsEnabled" v-model="selectedQuickColor" />
        <v-list class="animation-list">
          <v-list-item
            class="entry-list-item"
            v-for="(animation, index) in state.animations"
            v-bind:key="animation.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                class="animation-card"
                :class="dragCardClass(index)"
                v-on="dragTargetListeners(index)"
              >
                <div
                  class="animation-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-list-item-title>
                  <v-btn
                    :title="isCollapsed(animation) ? 'Expand this animation' : 'Collapse this animation'"
                    icon
                    small
                    absolute
                    top
                    left
                    class="animation-collapse-btn"
                    @click="() => toggleCollapsed(animation)"
                  >
                    <v-icon>{{ isCollapsed(animation) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                  </v-btn>
                  <div class="animation-id-badge">ID: {{ animation.id }}</div>
                  <v-text-field
                    class="animation-name-field"
                    label="Animation name"
                    v-model="animation.name"
                    @change="handleChildChange"
                  />

                  <!-- Preview-only: stretches how wide each frame's own
                       pixel grid RENDERS here, to sanity-check what a
                       NUSIZ-doubled/quadrupled sprite would actually look
                       like on real hardware, without touching the frame's
                       own stored pixel data (a genuinely wider sprite is a
                       different bB feature - "player0size"/"player1size" -
                       this is purely a display aid for previewing that
                       choice's visual effect while still drawing at the
                       real 8-pixel resolution). Per-animation, not global
                       or per-frame: different animations on the same
                       player commonly use different NUSIZ settings (e.g. a
                       normal walk cycle vs. a doubled-width "power-up"
                       pose), so a single shared setting wouldn't preview
                       either one accurately once the other diverged. -->
                  <v-btn-toggle
                    :value="animation.previewWidthScale || 1"
                    class="animation-preview-scale-toggle"
                    dense
                    mandatory
                    @change="(scale) => handleSetPreviewScale(animation, scale)"
                  >
                    <v-btn :value="1" x-small title="Preview at normal (1x) width">1x</v-btn>
                    <v-btn :value="2" x-small title="Preview at doubled (2x) width">2x</v-btn>
                    <v-btn :value="4" x-small title="Preview at quadrupled (4x) width">4x</v-btn>
                  </v-btn-toggle>

                  <v-menu
                        top
                        v-if="state.animations.length > 1"
                      >
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        title="Delete this animation"
                        icon
                        small
                        absolute
                        top
                        right
                        class="delete-btn-inset delete-icon-btn player-icon-btn-size"
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon>mdi-delete</v-icon>
                      </v-btn>
                    </template>

                    <v-card>
                      <v-card-title>Delete this animation?</v-card-title>
                      <v-list>
                        <v-list-item @click="handleDeleteAnimation(animation)">
                          <v-list-item-icon>
                            <v-icon>mdi-check</v-icon>
                          </v-list-item-icon>
                          <v-list-item-title>Yes, delete</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-icon>
                            <v-icon>mdi-cancel</v-icon>
                          </v-list-item-icon>
                          <v-list-item-title>No, don't delete</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-card>
                  </v-menu>

                </v-list-item-title>
                <v-list v-if="!isCollapsed(animation)">
                  <v-list-item
                    v-for="(frame, frameIndex) in animation.frames"
                    v-bind:key="frame.id"
                    class="pixel-editor-parent-container"
                  >
                    <div
                      class="pixel-editor-container"
                      :class="{'pixel-editor-container-wide': zoom >= 1}"
                      :style="{width: frameEditorWidth(animation)}"
                    >
                      <v-text-field
                        label="Duration"
                        v-model.number="frame.duration"
                        hide-details
                        type="number"
                        @change="handleChildChange"
                      />
                      <pixel-editor
                        :width="8"
                        :height="frame.pixels.length || 1"
                        :aspectRatio="(8 / (frame.pixels.length || 1)) * 160/192 * (animation.previewWidthScale || 1)"
                        v-model="frame.pixels"
                        :fgColor="fgColor"
                        :rowColors="editorRowColors(frame)"
                        :name="name"
                        :showClearButton="true"
                        :allowApplyToAllFrames="true"
                        :showGrid="showPixelGrid"
                        @input="handleChildChange"
                        @resize-all-frames="(opts) => handleResizeAllFrames(animation, frame, opts)"
                      >
                        <template v-if="spriteColorsEnabled" v-slot:sidebar>
                          <playfield-color-strip
                            :value="frame.rowColors"
                            :quickColors="spriteColorPalette"
                            :activeQuickColor="selectedQuickColor"
                            @input="(colors) => handleRowColorsInput(frame, colors)"
                          />
                        </template>
                        <template v-slot:badge>
                          <div class="frame-number-badge">FRAME: {{ frameIndex + 1 }}</div>
                          <div class="frame-corner-toolbar">
                            <v-btn
                              icon
                              small
                              title="Copy this frame's image (and row colors, if any)"
                              class="player-icon-btn-size"
                              @click="() => handleCopyFrame(frame)"
                            >
                              <v-icon>mdi-content-copy</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              :disabled="!copiedFrameData"
                              title="Paste copied image (and row colors, if any) onto this frame"
                              class="player-icon-btn-size"
                              @click="() => handlePasteFrame(frame)"
                            >
                              <v-icon>mdi-content-paste</v-icon>
                            </v-btn>
                            <v-btn
                              v-if="spriteColorsEnabled"
                              icon
                              small
                              title="Copy this frame's row colors only"
                              class="player-icon-btn-size copy-paste-color-btn"
                              @click="() => handleCopyRowColors(frame)"
                            >
                              <v-icon>mdi-content-copy</v-icon>
                              <span class="copy-paste-color-badge">C</span>
                            </v-btn>
                            <v-btn
                              v-if="spriteColorsEnabled"
                              icon
                              small
                              :disabled="!copiedFrameRowColors"
                              title="Paste copied row colors only onto this frame"
                              class="player-icon-btn-size copy-paste-color-btn"
                              @click="() => handlePasteRowColors(frame)"
                            >
                              <v-icon>mdi-content-paste</v-icon>
                              <span class="copy-paste-color-badge">C</span>
                            </v-btn>
                            <v-menu v-if="animation.frames.length > 1" top>
                              <template v-slot:activator="{ on, attrs }">
                                <v-btn
                                  title="Delete this frame"
                                  icon
                                  small
                                  class="delete-icon-btn player-icon-btn-size"
                                  v-bind="attrs"
                                  v-on="on"
                                >
                                  <v-icon>mdi-delete</v-icon>
                                </v-btn>
                              </template>

                              <v-card>
                                <v-card-title>Delete this frame?</v-card-title>
                                <v-list>
                                  <v-list-item @click="handleDeleteFrame(animation, frame)">
                                    <v-list-item-icon>
                                      <v-icon>mdi-check</v-icon>
                                    </v-list-item-icon>
                                    <v-list-item-title>Yes, delete</v-list-item-title>
                                  </v-list-item>
                                  <v-list-item>
                                    <v-list-item-icon>
                                      <v-icon>mdi-cancel</v-icon>
                                    </v-list-item-icon>
                                    <v-list-item-title>No, don't delete</v-list-item-title>
                                  </v-list-item>
                                </v-list>
                              </v-card>
                            </v-menu>
                          </div>
                        </template>
                      </pixel-editor>
                    </div>
                  </v-list-item>
                  <v-list-item class="add-frame-list-item">
                    <v-btn
                      class="add-frame-buttom"
                      color="primary"
                      title="Add animation frame"
                      dark
                      fab
                      @click="handleAddFrame(animation)"
                    >
                      <v-icon>mdi-plus</v-icon>
                    </v-btn>
                  </v-list-item>
                </v-list>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-animation-buttom"
      color="primary"
      title="Add animation"
      dark
      absolute
      right
      fab
      @click="handleAddAnimation"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';

import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import QuickColorPalette from '../components/QuickColorPalette.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {DEFAULT_ROW_COLOR} from '../blocks/background';
import {DEFAULT_SPRITES, processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {useColorPaletteStorage, useConfigurationStorage, usePixelGridOverlayStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {colorByteToCss} from '../utils/palette';
import {playfieldToMatrix, resizePixelMatrixHeight} from '../utils/pixels';

// Width of one frame editor at 100% zoom. The container is normally sized by
// its own contents, so this pins it before the zoom factor is applied.
const EDITOR_BASE_WIDTH = 275;

// Clipboard for one frame's whole row-color list (see handleCopyRowColors/
// handlePasteRowColors) - module-scope, not a ref inside setup(), since
// Player0Editor.vue/Player1Editor.vue each mount their own separate
// PlayerEditor instance (see the zoom/collapsed-ids hooks' own per-player
// comments just below); a plain instance ref would only let colors be
// copied between frames of the SAME player, but a copied row-color set is
// just as meaningful pasted onto the other player's own frame. null until
// the first copy. Same "module-scope ref shared across instances" pattern
// Configuration.vue's own collapsedSections uses for the same reason.
const copiedFrameRowColors = ref(null);

// Same reasoning/mechanism as copiedFrameRowColors just above, for the
// "standard" copy/paste pair (handleCopyFrame/handlePasteFrame) that copies
// a frame's whole image - {pixels, rowColors} together, not just one or the
// other. A separate clipboard from copiedFrameRowColors, not a shared one:
// copying a whole frame shouldn't clobber whatever the user last copied
// with the colors-only pair (or vice versa) if they're using both.
const copiedFrameData = ref(null);

export default defineComponent({
  components: {EditorZoom, PixelEditor, PixelGridToggle, PlayfieldColorStrip, QuickColorPalette},
  props: ['storageFactory', 'title', 'fgColor', 'name'],
  setup(props) {
    // Player 0 and Player 1 are separate instances, so each keeps its own zoom.
    const zoom = useEditorZoom(props.name);
    // Shared across Player 0/1 AND the Background tab (see
    // PixelGridToggle.vue's own comment) - not per-player like zoom above.
    const showPixelGrid = usePixelGridOverlayStorage();
    const editorWidth = computed(() => `${Math.round(EDITOR_BASE_WIDTH * zoom.value)}px`);
    // Widens the frame editor's own container by the SAME factor the
    // aspectRatio calculation below scales by, instead of just increasing
    // aspectRatio alone against a fixed-width container - confirmed as a
    // real bug that way: the proportion-wrapper's height is a PERCENTAGE OF
    // ITS OWN WIDTH (padding-bottom: 100/aspectRatio%, see PixelEditor.vue),
    // so widening the aspect ratio while the container's own width stayed
    // fixed just made the box shorter, not wider. Scaling width and
    // aspectRatio by the same factor keeps the derived height exactly
    // where it was at 1x (height = width / aspectRatio - both the
    // numerator and denominator grow by the same factor, cancelling out),
    // so only the width actually changes as the toggle goes from 1x to 4x.
    const frameEditorWidth = (animation) =>
      `${Math.round(EDITOR_BASE_WIDTH * zoom.value * (animation.previewWidthScale || 1))}px`;
    const getMaxId = (elements) => {
      return max(elements.map((o) => o.id))||0;
    };

    const configurationStorage = useConfigurationStorage();
    // Per-row SPRITE colors (batari Basic playercolors/player1colors) are an
    // all-or-nothing, project-wide setting (see the Options tab's "enable
    // per-row sprite colors" toggle) - same reasoning as BackgroundEditor's
    // own pfColorsEnabled, and shared between BOTH players since this
    // component is instantiated once per player (see PlayerEditor's own
    // "name" prop) but the underlying kernel_options line is a single
    // project-wide setting either way.
    const spriteColorsEnabled = computed(() =>
      (configurationStorage && configurationStorage.value && configurationStorage.value.enableSpriteColors) ??
        false);

    // Read-only here - components/QuickColorPalette.vue (mounted above)
    // owns writing to this same shared storage; this component only needs
    // the list itself, to pass into PlayfieldColorStrip's own quickColors
    // prop below.
    const colorPaletteStorage = useColorPaletteStorage();
    const spriteColorPalette = computed(() => colorPaletteStorage.value || []);

    // Which quick color (see components/QuickColorPalette.vue) is currently
    // "armed" for painting row colors directly - v-model'd to that
    // component above, and passed into PlayfieldColorStrip's own
    // activeQuickColor prop below. Not module-scope (unlike the palette
    // data itself, which QuickColorPalette owns via shared project
    // storage) - which color is armed is closer to a live "tool selection"
    // than shared project data, so it's fine (arguably more expected) for
    // it to reset when switching between the Player 0/Player 1 tabs rather
    // than following the user across them.
    const selectedQuickColor = ref(null);

    // Same reasoning/mechanism as BackgroundEditor's own ensureRowColors -
    // fills in a missing/mismatched-length row color list (a frame's own
    // height can change via "Set height", unlike a background's fixed
    // pfres-driven row count) whenever per-row sprite colors is on, without
    // clobbering colors the user already picked. Left alone while the
    // option is off, so re-enabling it doesn't lose prior work.
    const ensureRowColors = (frame, rows) => {
      if (!spriteColorsEnabled.value) return;
      const existing = frame.rowColors || [];
      if (existing.length === rows) return;
      const next = existing.slice(0, rows);
      while (next.length < rows) next.push(DEFAULT_ROW_COLOR);
      frame.rowColors = next;
    };

    const playerStorage = props.storageFactory();
    const state = computed({
      get() {
        try {
          const player = processPlayerStorageDefaults(playerStorage);
          // `!animation.id` (rather than == null) would also be true for
          // animation.id === 0 - a real, already-assigned id now that new
          // animations start there (see handleAddAnimation below), not a
          // missing one - which would otherwise get silently reassigned to
          // a brand new id every single time this getter runs.
          let nextId = getMaxId(player.animations);
          for (const animation of player.animations) {
            if (animation.id == null) {
              animation.id = nextId;
              nextId++;
            }
          }
          // One-time renumbering for a project saved before animations
          // started at id 0 (see handleAddAnimation's own comment) - shifts
          // every id down by the current minimum, preserving relative order
          // and any gaps exactly as they were, so an existing project's
          // first animation reads "ID: 0" too instead of staying stuck at
          // whatever it happened to start at before. A no-op once the
          // minimum is already 0 (idempotent - safe to run on every load).
          if (player.animations.length) {
            const minId = Math.min(...player.animations.map((a) => a.id));
            if (minId > 0) {
              player.animations.forEach((animation) => {
                animation.id -= minId;
              });
            }
          }
          player.animations.forEach((animation) => {
            animation.frames.forEach((frame) => ensureRowColors(frame, frame.pixels.length));
          });
          return player;
        } catch (e) {
          console.error('Error loading player 0 from local storage', e);
          return DEFAULT_SPRITES;
        }
      },

      set(newState) {
        playerStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    // Player 0 and Player 1 are separate instances, so each keeps its own
    // set of collapsed animations - same reasoning as the zoom above.
    const {isCollapsed, toggleCollapsed} = useCollapsedIds(props.name);

    // Card reordering - same hook/pattern as Text/SoundFX/Data/Music/
    // Background (see hooks/drag-reorder.js's own comment). No per-player
    // key needed here, unlike useCollapsedIds/useEditorZoom above: Player0/
    // Player1Editor.vue each mount their own separate PlayerEditor
    // instance, so this setup() (and the fresh refs useDragReorder creates)
    // already runs once per player with no shared state to collide.
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.animations,
        (items) => {
          state.value.animations = items;
          handleChildChange();
        },
    );

    const instance = getCurrentInstance();

    const handleAddFrame = (animation) => {
      const frames = animation.frames;
      const maxId = getMaxId(frames);
      // Prefill the new frame with the previous frame's graphic (a copy, so
      // editing it does not change the frame it came from), falling back to an
      // empty grid when the animation has no frames yet.
      const previousFrame = frames[frames.length - 1];
      const pixels = previousFrame ?
        structuredClone(previousFrame.pixels) :
        playfieldToMatrix(
            '........\n'+
            '........\n'+
            '........\n'+
            '........\n'+
            '........\n'+
            '........\n'+
            '........\n'+
            '........');
      const newFrame = {
        id: maxId+1,
        duration: 10,
        pixels,
        // Copied the same "previous frame, or nothing" way as pixels just
        // above - a brand new frame with no previous one to copy from just
        // gets ensureRowColors' own default fill (run on the next
        // state.value read) instead of an explicit empty array here.
        ...(previousFrame && previousFrame.rowColors ?
          {rowColors: structuredClone(previousFrame.rowColors)} : {}),
      };

      animation.frames.push(newFrame);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteFrame = (animation, frame) => {
      animation.frames = animation.frames.filter(({id}) => id != frame.id);
      console.info('Deleted ', frame);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Applies the SAME resize (and "scale existing contents" choice) the
    // triggering frame's own PixelEditor instance just used on itself, to
    // every OTHER frame in the same animation - the triggering frame
    // itself is skipped here since its own handleSetHeight already
    // resized it locally (see PixelEditor.vue's own resize-all-frames
    // comment); redoing it here too would just repeat the same work.
    // Every OTHER frame's own PixelEditor instance picks up its new
    // pixels via its own "value" watcher (see that component's own
    // comment on why a watcher is needed there at all, not just a prop).
    const handleResizeAllFrames = (animation, triggeringFrame, {height, scaleContents}) => {
      animation.frames.forEach((frame) => {
        if (frame.id === triggeringFrame.id) return;
        frame.pixels = resizePixelMatrixHeight(frame.pixels, height, 8, scaleContents);
      });
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // A single blank frame, not a copy of the previous animation's own
    // frames - confirmed as the wanted behavior directly: a brand new
    // animation starting pre-filled with an unrelated animation's entire
    // frame set (every frame, every pose) meant deleting all of them by
    // hand was the normal first step before drawing anything new, every
    // time. Same empty 8x8 grid handleAddFrame's own "no frames yet"
    // fallback uses, so a fresh animation's first frame looks the same
    // either way it was reached.
    const handleAddAnimation = () => {
      state.value.animations.push({
        // Starts at 0 (not getMaxId's own +1, which would start the very
        // first animation at 1) - only for the FIRST animation, where
        // getMaxId's own "no elements yet" fallback of 0 would otherwise
        // still read as "id 1 is next". Every animation after that keeps
        // incrementing off the real max exactly as before.
        id: state.value.animations.length ? getMaxId(state.value.animations) + 1 : 0,
        name: `Animation ${state.value.animations.length + 1}`,
        frames: [
          {
            id: 1,
            duration: 10,
            pixels: playfieldToMatrix(
                '........\n'+
              '........\n'+
              '........\n'+
              '........\n'+
              '........\n'+
              '........\n'+
              '........\n'+
              '........'),
          },
        ],
      });

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteAnimation = (animation) => {
      state.value.animations = state.value.animations.filter(({id}) => id != animation.id);
      console.info('Deleted ', animation);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Preview-only display setting (see the toggle's own template comment) -
    // stored on the animation itself, not a separate zoom-style hook, since
    // it's meant to persist with the project the same way every other
    // animation/frame property here already does, unlike the Player 0/1
    // zoom level, which deliberately resets every reload.
    const handleSetPreviewScale = (animation, scale) => {
      animation.previewWidthScale = scale;
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Same reasoning/mechanism as BackgroundEditor's own handleRowColorsInput.
    const handleRowColorsInput = (frame, colors) => {
      frame.rowColors = colors;
      handleChildChange();
      // The pixel editor holds its own display state, so persisting isn't
      // enough to repaint the preview - force a re-render so it receives the
      // updated row colors and recolors its canvas.
      instance.proxy.$forceUpdate();
    };

    // Copies/pastes a frame's ENTIRE row-color list at once (not one row at
    // a time) - same "copy this whole thing, paste it onto another" pattern
    // as MusicEditor's own handleCopyTrack/handlePasteTrack for an
    // instrument's notes. Pasting doesn't resize the target frame's own
    // list to match the source's length - handleRowColorsInput->
    // ensureRowColors (run on the next state.value read, same as every
    // other frame mutation here) reconciles it to the target frame's own
    // pixel height right afterward, padding with DEFAULT_ROW_COLOR or
    // truncating as needed, the exact same way a fresh/resized frame's row
    // colors already get filled in.
    const handleCopyRowColors = (frame) => {
      copiedFrameRowColors.value = structuredClone(frame.rowColors || []);
    };
    const handlePasteRowColors = (frame) => {
      if (!copiedFrameRowColors.value) return;
      handleRowColorsInput(frame, structuredClone(copiedFrameRowColors.value));
    };

    // "Standard" copy/paste - the frame's whole image, plus its row colors
    // too whenever per-row sprite colors is on. While that toggle is off,
    // this copies/pastes pixels ONLY (rowColors is never read or written
    // here) - the colors-only pair (handleCopyRowColors/handlePasteRowColors
    // above) is the one place row colors ever move on their own; this pair
    // treats them as just another part of "the frame" when the feature is
    // actually in use, and ignores them entirely when it isn't.
    const handleCopyFrame = (frame) => {
      copiedFrameData.value = {
        pixels: structuredClone(frame.pixels),
        ...(spriteColorsEnabled.value && frame.rowColors ?
          {rowColors: structuredClone(frame.rowColors)} : {}),
      };
    };
    const handlePasteFrame = (frame) => {
      if (!copiedFrameData.value) return;
      frame.pixels = structuredClone(copiedFrameData.value.pixels);
      if (spriteColorsEnabled.value && copiedFrameData.value.rowColors) {
        frame.rowColors = structuredClone(copiedFrameData.value.rowColors);
      }
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Same reasoning/mechanism as BackgroundEditor's own editorRowColors.
    const editorRowColors = (frame) => {
      if (!spriteColorsEnabled.value || !frame.rowColors) {
        return null;
      }
      return frame.rowColors.map((byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      });
    };

    return {state, handleChildChange,
      handleAddFrame, handleDeleteFrame, handleResizeAllFrames,
      handleAddAnimation, handleDeleteAnimation, handleSetPreviewScale,
      handleRowColorsInput, editorRowColors, spriteColorsEnabled,
      copiedFrameRowColors, handleCopyRowColors, handlePasteRowColors,
      copiedFrameData, handleCopyFrame, handlePasteFrame,
      spriteColorPalette, selectedQuickColor,
      isCollapsed, toggleCollapsed,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
      zoom, showPixelGrid, editorWidth, frameEditorWidth,
      props};
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* v-list-item's own default 0 16px padding stacks on top of v-card-text's,
   pushing everything in each row (name field and frame editors alike) in
   further than the Score tab's graphic cards, which sit directly in a
   v-card-text with no list-item wrapper. Zeroing both sides (not just left,
   as this used to) brings the whole row back to Score's own left/right
   edges evenly, instead of the right edge sitting 16px further in than the
   left. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

/* Same fix, and matching 8px/12px values, as BackgroundEditor.vue's own
   .background-list/.entry-list-item rules - v-list-item__content's default
   12px top/bottom padding was adding extra space BETWEEN cards beyond
   anything explicitly set (there was no explicit gap at all before), so
   this tab's own animation-card spacing didn't match the Background tab's.
   flex+gap here plays the same role .background-list's own CSS grid gap
   does (this tab stays single-column, so grid itself isn't needed) -
   margin-top puts back the space above the FIRST card that zeroing
   v-list-item__content's own padding would otherwise have also removed. */
.animation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.entry-list-item >>> .v-list-item__content {
  padding: 0;
}

/* Same rounded, thin-bordered look as the Sound/Data/Text/Music tabs' own
   per-item cards (e.g. SoundFXEditor's .soundfx-card) - wraps directly
   around the existing title/frames-list content rather than switching to a
   v-card-text section like those tabs use, so the change is just the
   border; padding here replaces the internal spacing a v-card-text would
   otherwise have provided. */
/* width: 100% - same fix as BackgroundEditor.vue's identical
   .background-card rule: without it, this card (nested inside
   v-list-item-content, not the list item itself) shrinks to its own
   content's natural width instead of filling its row, so a collapsed
   animation (just the title row) rendered narrower than an expanded one
   (whose frames force wider content). */
.animation-card {
  position: relative;
  width: 100%;
  padding: 12px;
}

/* Only this top strip is draggable (see hooks/drag-reorder.js's own
   comment on why) - covers the same header band the collapse/ID/delete
   controls already occupy. Sits behind them (they're later in DOM order,
   so they paint on top and stay clickable) but in front of everything
   else, so a click-and-drag gesture anywhere else in the card still selects
   text/drags a frame's pixel editor instead of starting a reorder drag. */
.animation-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

.pixel-editor-parent-container {
  display: inline-block;
  vertical-align: middle;
  padding-left: 0;
}

/* Same style as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - plain flow instead of that one's absolute positioning,
   since here it needs to sit between the Duration field and the sprite
   graphic rather than float over a corner. */
/* Same placement as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - top-left corner of the card, via the "badge" slot
   PixelEditor.vue exposes for exactly this. */
/* Matches .animation-id-badge's style below - plain flow, not overlaid on
   the card border. rem rather than em: this sits inside a smaller-font
   ancestor (the nested pixel editor card) than the animation badge does, so
   an em size came out smaller/fainter-looking there - rem ties both to the
   same root size regardless of ancestor context. */
.frame-number-badge {
  text-align: left;
  font-size: 0.75rem;
  font-family: monospace;
  /* Sits inside the nested pixel-editor card, a slightly different
     background shade than .animation-id-badge's own card - the same
     opacity (0.6) read lighter here, so it's bumped up to actually match. */
  opacity: 0.75;
  /* Pulls it up out of v-card-text's default 16px top padding - full padding
     above this first line of text read as too much empty space. */
  margin-top: -8px;
}

/* Nudges the row-color sidebar and sprite canvas down a few pixels, so
   neither sits flush against the copy/paste/delete icon row directly above
   (those buttons are absolutely positioned over this same top corner, so
   they don't otherwise push this content down on their own). */
.pixel-editor-parent-container >>> .editor-with-sidebar {
  margin-top: 6px;
}

/* Absolutely positioned (matching Text/SoundFX/Data/Music's own collapse
   button placement exactly) rather than flowed in a flex row alongside the
   ID badge - the row wrapper this used to sit in is gone; .animation-
   name-field's own margin-top (below) makes room for both this and the
   badge to sit above it instead. */
.animation-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same placement/style as every other tab's own "ID: N" badge (see
   MusicEditor.vue's .music-id-badge). */
.animation-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75em;
  font-family: monospace;
  opacity: 0.6;
}

/* Same reasoning as TextEditor.vue's .text-name-field - reserves room below
   the now-absolutely-positioned collapse button/ID badge instead of them
   overlapping this field, now that neither sits in a normal-flow row above
   it anymore. Matches .soundfx-name-field's own margin-top (SoundFXEditor.vue)
   for consistent badge-to-name spacing across every tab. */
.animation-name-field {
  margin-top: 20px;
}

/* Sits right after the name field, in the same normal-flow row as the rest
   of this card's header controls - small/dense to read as a minor display
   toggle, not a primary action competing with the name field or the
   delete button (absolutely positioned into the corner, see
   .delete-btn-inset, so it never overlaps this either). Left-aligned to 0,
   matching the sprite frame's own left edge below
   (.pixel-editor-parent-container's own "padding-left: 0") rather than the
   field's default Vuetify indent. A NEGATIVE top margin, not just a small
   positive one - the name field isn't hide-details, so Vuetify already
   reserves its own ~18px hint/error-message strip below the input whether
   or not anything is actually showing there, which read as extra dead
   space stacking on top of any positive margin this toggle added of its
   own; pulling up into that reserved strip (rather than adding to it)
   closes the gap down to what's actually visible. */
.animation-preview-scale-toggle {
  margin: -14px 40px 0 0;
}

.animation-preview-scale-toggle >>> .v-btn {
  height: 24px !important;
  min-width: 32px !important;
  font-size: 11px;
}

/* Matches the app's own primary blue (already used for the "Add frame"/
   "Add animation" fab buttons and the drawing-tool active state right
   above), white text for contrast - Vuetify's own v-btn-toggle default
   "selected" look (a faint grey tint, barely different from unselected)
   didn't read as clearly "this one's active" against the other two. */
.animation-preview-scale-toggle >>> .v-btn.v-btn--active {
  background-color: #1976d2 !important;
  color: #fff !important;
}

/* top/right match every other tab's own delete corner button (see
   MusicEditor.vue's .music-toolbar-top-right) exactly, for a consistent
   corner position across every card type. */
.delete-btn-inset {
  top: 8px !important;
  right: 8px !important;
}

/* Holds every frame-level corner button (copy/paste frame, copy/paste
   colors, delete) in one absolutely-positioned flex row instead of each
   button computing its own "right" offset by hand - the color buttons are
   only shown while per-row sprite colors is on (see their own v-if), so a
   fixed per-button offset would leave a gap where they'd normally sit
   whenever that's off. A flex row packs whichever buttons are actually
   present flush together regardless. */
.frame-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

/* The colors-only copy/paste pair uses the exact same mdi-content-copy/
   mdi-content-paste glyphs, in the same standard icon color, as the
   "standard" whole-frame pair right next to them - a small "C" badge
   overlaid on the bottom-right corner (not a color change) is what tells
   them apart at a glance, while both pairs still read as "the same kind of
   action" family. position: relative here so the badge (position: absolute)
   anchors to the button itself, not some further-out ancestor. */
.copy-paste-color-btn {
  position: relative;
}

.copy-paste-color-badge {
  position: absolute;
  bottom: 3px;
  right: -2px;
  font-size: 8px;
  font-weight: bold;
  line-height: 1;
  padding: 0 1px;
  border-radius: 2px;
  background: white;
  color: rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

/* At 100% zoom and above, the card is wide enough for every frame toolbar
   icon (eraser/pencil, undo/redo, export/import, Set height, Delete) to fit
   on one row - PixelEditor.vue's own toolbar row wraps by design for
   narrower cards (see its own comment), which was dropping Delete onto a
   lone second row by itself even at 100%. Forcing nowrap unconditionally
   broke the 50%/75% zoom levels instead, where the row genuinely is too
   narrow and needs to wrap - gating this on zoom keeps that case intact. */
.pixel-editor-container-wide >>> .pixel-editor-toolbar-row {
  flex-wrap: nowrap;
}

/* Same icon/button sizing as the Player Sprite tab's own toolbar icons
   (PixelEditor.vue's .pixel-editor-tools rules) - size only, no colour
   changes, so .delete-icon-btn's red-on-hover convention is untouched.
   margin: 0 (not "0 1px") to match that same base component's own trim -
   see its own comment on why every bit of width matters for this row to
   fit without wrapping at higher zoom. */
.player-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0;
}

.player-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

/* editor-zoom and pixel-grid-toggle are separate components, each with
   their own inline layout - a flex row keeps them on one visual line and
   vertically centered against each other regardless of either one's own
   internal baseline/height quirks. */
.editor-toolbar-row {
  display: flex;
  align-items: center;
}

/* mdi-delete's own glyph reads visually smaller than mdi-content-copy/
   mdi-content-paste at the exact same font-size (more built-in padding
   around the trash-can shape than those two icons have) - bumped up a
   couple pixels so all three corner buttons read as the same size at a
   glance, not just the same CSS font-size. */
.delete-icon-btn.player-icon-btn-size >>> .v-icon {
  font-size: 21px !important;
}

/* Sits inline after the last frame, vertically centered against the frame
   cards' height via vertical-align (rather than the list item's own default
   flex centering, which only centers within its own row). margin-top only
   matters once this wraps onto its own line below the frame cards (there's
   nothing to space it from while it's still sharing a row with them) - a
   real gap there, not flush against the row of cards above it, confirmed
   as needed once a frame count/zoom combination actually causes that wrap. */
.add-frame-list-item {
  display: inline-block;
  vertical-align: middle;
  width: auto;
  margin-top: 16px;
}

/* Same circular style as "Add animation" below (and the Background tab's "+"
   button), just sized down to the button's original pill-shape height
   instead of Vuetify's default 56px fab. */
.add-frame-buttom {
  width: 36px;
  height: 36px;
}

/* Floats bottom-right, matching the Background tab's "+" button. */
.add-animation-buttom {
  bottom: 8px;
}

/* No drop shadow on floating (absolute-positioned) buttons - delete, add, etc. */
.v-btn--absolute {
  box-shadow: none !important;
}
</style>
