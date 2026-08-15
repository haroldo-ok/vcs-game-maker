<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <editor-zoom v-model="zoom" />
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
                      :style="{width: editorWidth}"
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
                        :aspectRatio="(8 / (frame.pixels.length || 1)) * 160/192"
                        v-model="frame.pixels"
                        :fgColor="fgColor"
                        :name="name"
                        :showClearButton="true"
                        @input="handleChildChange"
                      >
                        <template v-slot:badge>
                          <div class="frame-number-badge">FRAME: {{ frameIndex + 1 }}</div>
                          <v-menu v-if="animation.frames.length > 1" top>
                            <template v-slot:activator="{ on, attrs }">
                              <v-btn
                                title="Delete this frame"
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
import {computed, defineComponent, getCurrentInstance} from '@vue/composition-api';
import {max} from 'lodash';

import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {DEFAULT_SPRITES, processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {useEditorZoom} from '../hooks/zoom';
import {playfieldToMatrix} from '../utils/pixels';

// Width of one frame editor at 100% zoom. The container is normally sized by
// its own contents, so this pins it before the zoom factor is applied.
const EDITOR_BASE_WIDTH = 275;

export default defineComponent({
  components: {EditorZoom, PixelEditor},
  props: ['storageFactory', 'title', 'fgColor', 'name'],
  setup(props) {
    // Player 0 and Player 1 are separate instances, so each keeps its own zoom.
    const zoom = useEditorZoom(props.name);
    const editorWidth = computed(() => `${Math.round(EDITOR_BASE_WIDTH * zoom.value)}px`);
    const getMaxId = (elements) => {
      return max(elements.map((o) => o.id))||0;
    };

    const playerStorage = props.storageFactory();
    const state = computed({
      get() {
        try {
          const player = processPlayerStorageDefaults(playerStorage);
          let nextId = getMaxId(player.animations);
          for (const animation of player.animations) {
            if (!animation.id) {
              animation.id = nextId;
              nextId++;
            }
          }
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

    const handleAddAnimation = () => {
      const newAnimation = structuredClone(state.value.animations[state.value.animations.length-1]);
      state.value.animations.push({
        ...newAnimation,
        id: getMaxId(state.value.animations) + 1,
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

    return {state, handleChildChange,
      handleAddFrame, handleDeleteFrame,
      handleAddAnimation, handleDeleteAnimation,
      isCollapsed, toggleCollapsed,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
      zoom, editorWidth,
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

/* top/right match every other tab's own delete corner button (see
   MusicEditor.vue's .music-toolbar-top-right) exactly, for a consistent
   corner position across every card type. */
.delete-btn-inset {
  top: 8px !important;
  right: 8px !important;
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
   changes, so .delete-icon-btn's red-on-hover convention is untouched. */
.player-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

.player-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

/* Sits inline after the last frame, vertically centered against the frame
   cards' height via vertical-align (rather than the list item's own default
   flex centering, which only centers within its own row). */
.add-frame-list-item {
  display: inline-block;
  vertical-align: middle;
  width: auto;
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
