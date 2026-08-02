<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <editor-zoom v-model="zoom" />
        <v-list>
          <v-list-item class="entry-list-item" v-for="animation in state.animations" v-bind:key="animation.id">
            <v-list-item-content>
                <v-list-item-title>
                  <div class="animation-id-row">
                    <v-btn
                      :title="isCollapsed(animation) ? 'Expand this animation' : 'Collapse this animation'"
                      icon
                      small
                      class="animation-collapse-btn"
                      @click="() => toggleCollapsed(animation)"
                    >
                      <v-icon>{{ isCollapsed(animation) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                    </v-btn>
                    <div class="animation-id-badge">ID: {{ animation.id }}</div>
                  </div>
                  <v-text-field label="Animation name" v-model="animation.name" @change="handleChildChange" />

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
                        class="delete-btn-inset delete-icon-btn"
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
                    <div class="pixel-editor-container" :style="{width: editorWidth}">
                      <v-menu
                        top
                        v-if="animation.frames.length > 1"
                      >
                        <template v-slot:activator="{ on, attrs }">
                          <v-btn
                            title="Delete this frame"
                            icon
                            small
                            absolute
                            top
                            right
                            class="frame-delete-btn delete-icon-btn"
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
                        @input="handleChildChange"
                      >
                        <template v-slot:badge>
                          <div class="frame-number-badge">FRAME: {{ frameIndex + 1 }}</div>
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

    // Purely a view preference - see TextEditor.vue's identical collapsedIds
    // for why this lives in local component state and is reassigned wholesale.
    const collapsedIds = ref({});
    const isCollapsed = (animation) => !!collapsedIds.value[animation.id];
    const toggleCollapsed = (animation) => {
      collapsedIds.value = {
        ...collapsedIds.value,
        [animation.id]: !collapsedIds.value[animation.id],
      };
    };

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

/* v-list-item's own default left padding stacks on top of v-card-text's,
   pushing everything in each row (name field and frame editors alike) in
   further than the Score tab's graphic cards, which sit directly in a
   v-card-text with no list-item wrapper. Zeroing it here brings both back to
   the same left edge as Score. */
.entry-list-item {
  padding-left: 0;
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

/* Holds the collapse button and "ID: N" badge on one row - a plain flex
   row rather than the Text/Data/SoundFX tabs' absolute-positioned button
   overlaid on a card corner, since there's no bordered card around the
   whole animation entry for those to sit on top of here. */
.animation-id-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Same style as the other "ID: N"/"FRAME: N" badges. */
.animation-id-badge {
  text-align: left;
  font-size: 0.75em;
  font-family: monospace;
  opacity: 0.6;
}

/* Vuetify's fab+absolute+top combo centers the button on its container's top
   edge, poking half of it out (and clipped there by the list item's overflow);
   pull it down so the whole button is visible instead. */
.delete-btn-inset {
  top: 8px !important;
}

/* Pulled up further than delete-btn-inset - this one sits right above the
   "Duration" field, which the smaller default offset overlapped. */
.frame-delete-btn {
  top: -8px !important;
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
