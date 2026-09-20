<template>
  <div>
    <v-card flat class="editor-container" :ripple="false" @click="deselectCard">
      <v-card-title>Title (alpha 0.24)</v-card-title>
      <v-card-text>
        <p class="v-messages theme--light v-messages__message titlescreen-intro-paragraph">
          Compose a title screen from stacked image strips (drawn top to bottom) using the
          Titlescreen Kernel. 48x1 images are single-color and half-height pixels (the sharpest
          option); 48x2/96x2 images support a different color per row, at normal (roughly
          square) pixel proportions. Add a "Draw title screen" block (Actions tab) to show it -
          call it in a loop for as long as you want it up. Per the kernel's documentation, a
          page's total stacked height shouldn't exceed about 85 rows of 48x2/96x2 (double-line)
          images, or about 170 rows of 48x1 (single-line) images - each card also costs a few
          extra lines to set itself up, so stay comfortably under that limit.
        </p>

        <div class="editor-toolbar-row">
          <editor-zoom v-model="zoom" />
          <pixel-grid-toggle v-model="showPixelGrid" />
        </div>

        <v-list class="titlescreen-list">
          <v-list-item
            class="entry-list-item"
            v-for="(screen, screenIndex) in state.screens"
            v-bind:key="screen.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="titlescreen-screen-card"
                :class="[screenDragCardClass(screenIndex), {'titlescreen-screen-card-selected': screen.id === selectedScreenId}]"
                v-on="screenDragTargetListeners(screenIndex)"
                @click.stop="selectScreen(screen.id)"
              >
                <div
                  class="titlescreen-drag-handle"
                  title="Drag to reorder"
                  v-bind="screenDragAttrs(screenIndex)"
                  v-on="screenDragHandleListeners(screenIndex)"
                />
                <v-list-item-title class="titlescreen-header-title">
                  <v-btn
                    :title="isScreenCollapsed(screen) ? 'Expand this title screen' : 'Collapse this title screen'"
                    icon
                    small
                    absolute
                    top
                    left
                    class="titlescreen-collapse-btn"
                    @click="() => toggleScreenCollapsed(screen)"
                  >
                    <v-icon>{{ isScreenCollapsed(screen) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                  </v-btn>
                  <div class="titlescreen-id-badge">ID:{{ screen.id }}</div>

                  <div class="titlescreen-screen-title-row">
                    <v-text-field
                      class="titlescreen-screen-name-field"
                      label="Page name"
                      v-model="screen.name"
                      @change="handleChildChange"
                    />

                    <color-swatch-picker
                      :value="screen.backgroundColor || 0"
                      :allow-clear="false"
                      title="Click to set this title screen page's background color"
                      @input="(byte) => handleSetBackgroundColor(screen, byte)"
                    />
                    <span class="titlescreen-bg-color-label">Background color</span>
                  </div>

                  <div v-if="state.screens.length > 1" class="titlescreen-corner-toolbar">
                    <v-menu top>
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn
                          title="Delete this title screen"
                          icon
                          small
                          class="delete-icon-btn titlescreen-icon-btn-size"
                          v-bind="attrs"
                          v-on="on"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </template>

                      <v-card>
                        <v-card-title>Delete this title screen?</v-card-title>
                        <v-list>
                          <v-list-item @click="() => handleDeleteScreen(screen)">
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
                </v-list-item-title>

                <div v-if="!isScreenCollapsed(screen)" class="titlescreen-screen-body">
                  <v-list class="titlescreen-card-list">
                    <v-list-item
                      class="entry-list-item"
                      v-for="(card, index) in screen.cards"
                      v-bind:key="card.id"
                    >
                      <v-list-item-content>
                        <v-card
                          outlined
                          :ripple="false"
                          class="titlescreen-card"
                          :class="[cardDragCardClass(screen, index), {'titlescreen-card-selected': card.id === selectedCardId}]"
                          v-on="cardDragTargetListeners(screen, index)"
                          @click.stop="selectCard(card.id)"
                        >
                          <div
                            class="titlescreen-drag-handle"
                            title="Drag to reorder"
                            v-bind="cardDragAttrs(screen, index)"
                            v-on="cardDragHandleListeners(screen, index)"
                          />
                          <v-list-item-title class="titlescreen-header-title">
                            <v-btn
                              :title="isCollapsed(cardCollapseKey(screen, card)) ? 'Expand this card' : 'Collapse this card'"
                              icon
                              small
                              absolute
                              top
                              left
                              class="titlescreen-collapse-btn"
                              @click="() => toggleCollapsed(cardCollapseKey(screen, card))"
                            >
                              <v-icon>{{ isCollapsed(cardCollapseKey(screen, card)) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                            </v-btn>
                            <div class="titlescreen-id-badge">ID:{{ card.id }} &middot; {{ cardTypeLabel(card) }}</div>

                            <div class="titlescreen-corner-toolbar">
                              <v-menu top>
                                <template v-slot:activator="{ on, attrs }">
                                  <v-btn
                                    title="Delete this card"
                                    icon
                                    small
                                    class="delete-icon-btn titlescreen-icon-btn-size"
                                    v-bind="attrs"
                                    v-on="on"
                                  >
                                    <v-icon>mdi-delete</v-icon>
                                  </v-btn>
                                </template>

                                <v-card>
                                  <v-card-title>Delete this card?</v-card-title>
                                  <v-list>
                                    <v-list-item @click="() => handleDeleteCard(screen, card)">
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
                          </v-list-item-title>

                          <div v-if="!isCollapsed(cardCollapseKey(screen, card))" class="titlescreen-card-body">
                            <template v-if="card.type === 'space'">
                              <v-text-field
                                label="Blank scanlines"
                                v-model.number="card.lines"
                                type="number"
                                min="1"
                                hide-details
                                @change="handleChildChange"
                              />
                            </template>

                            <template v-else-if="card.type === 'score'">
                              <p class="v-messages theme--light v-messages__message titlescreen-player-hint">
                                Shows the game's own score (6 digits), using the same font currently selected
                                on the Score tab and colored via the Score category's "Score set color to"
                                block (Actions tab) - nothing to configure here. The Options tab's "Show
                                remaining CPU cycles as the score" has no effect here - it only overlays the
                                standard game kernel's own score drawing, which a title screen never calls.
                              </p>
                            </template>

                            <template v-else-if="card.type === 'player'">
                              <div class="titlescreen-player-row">
                                <v-select
                                  label="Player 0 animation"
                                  :items="playerAnimationOptions()"
                                  v-model="card.player0Animation"
                                  hide-details
                                  class="titlescreen-player-select"
                                  @change="handleChildChange"
                                />
                                <playfield-color-strip
                                  class="titlescreen-player-color"
                                  :value="[card.player0Color || 0]"
                                  @input="(colors) => { card.player0Color = colors[0]; handleChildChange(); }"
                                />
                                <span class="titlescreen-player-color-label">Fallback color</span>
                              </div>
                              <div class="titlescreen-player-row">
                                <v-select
                                  label="Player 1 animation"
                                  :items="playerAnimationOptions()"
                                  v-model="card.player1Animation"
                                  hide-details
                                  class="titlescreen-player-select"
                                  @change="handleChildChange"
                                />
                                <playfield-color-strip
                                  class="titlescreen-player-color"
                                  :value="[card.player1Color || 0]"
                                  @input="(colors) => { card.player1Color = colors[0]; handleChildChange(); }"
                                />
                                <span class="titlescreen-player-color-label">Fallback color</span>
                              </div>
                              <p class="v-messages theme--light v-messages__message titlescreen-player-hint">
                                "Fallback color" is only used when the chosen animation doesn't have its own
                                per-row sprite colors (Options tab). Position with the normal "Player 0/1 set
                                X/Y" blocks, and pick a starting frame with "Set title screen player sprite
                                frame to" (Actions tab).
                              </p>
                              <div class="titlescreen-player-row">
                                <v-text-field
                                  label="Window height"
                                  title="How tall the whole player minikernel's own draw region is, in scanlines - independent of either player's own sprite height."
                                  v-model.number="card.windowHeight"
                                  type="number"
                                  min="1"
                                  hide-details
                                  class="titlescreen-player-window-field"
                                  @change="handleChildChange"
                                />
                                <v-select
                                  label="Scanlines per pixel row"
                                  title="1 = half-height pixels (sharper), 2 = roughly square pixels."
                                  :items="[{text: '1 (sharper)', value: 1}, {text: '2 (square pixels)', value: 2}]"
                                  v-model.number="card.kernelLines"
                                  hide-details
                                  class="titlescreen-player-window-field"
                                  @change="handleChildChange"
                                />
                              </div>
                            </template>

                            <template v-else>
                              <div class="pixel-editor-container" :style="{width: editorWidth(card), maxWidth: editorWidth(card)}">
                                <pixel-editor
                                  :width="cardWidth(card)"
                                  :height="card.pixels.length || 1"
                                  :aspectRatio="cardWidth(card) / (card.pixels.length || 1)"
                                  v-model="card.pixels"
                                  :fgColor="editorFgColor(card)"
                                  :rowColors="editorRowColors(card)"
                                  :allowChangingHeight="true"
                                  :showClearButton="true"
                                  :showGrid="showPixelGrid"
                                  :name="`titlescreen-${screen.id}-${card.id}`"
                                  @input="() => handlePixelsInput(card)"
                                  @resize="() => handlePixelsInput(card)"
                                  @clear="() => handleClearCardColors(card)"
                                >
                                  <template v-if="cardHasRowColors(card)" v-slot:sidebar>
                                    <playfield-color-strip
                                      :value="card.rowColors"
                                      @input="(colors) => handleRowColorsInput(card, colors)"
                                    />
                                  </template>
                                  <template v-else v-slot:sidebar>
                                    <playfield-color-strip
                                      :value="[card.color || 0]"
                                      @input="(colors) => handleSetCardColor(card, colors[0])"
                                    />
                                  </template>
                                </pixel-editor>
                              </div>

                              <v-text-field
                                class="titlescreen-scroll-window-field"
                                label="Window height (0 = no scrolling)"
                                title="How many rows show at once - leave at 0 (or at/above the image's full height) to show the whole image with no scrolling. Once set smaller, use the Set title screen scroll position block (Actions tab) to scroll through the rest of the image at runtime."
                                v-model.number="card.scrollWindow"
                                type="number"
                                min="0"
                                :max="card.pixels.length || 1"
                                hide-details
                                @change="handleChildChange"
                              />
                            </template>
                          </div>
                        </v-card>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>

                  <v-menu top>
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        class="add-titlescreen-card-buttom"
                        color="primary"
                        title="Add a card"
                        small
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon left>mdi-plus</v-icon>
                        Add graphic
                      </v-btn>
                    </template>
                    <v-card>
                      <v-list>
                        <v-list-item
                          v-for="option in addCardOptions"
                          :key="option.type"
                          :disabled="!canAddCardType(option.type)"
                          @click="() => handleAddCard(screen, option.type)"
                        >
                          <v-list-item-title>
                            {{ option.label }}
                            <span v-if="!canAddCardType(option.type)" class="titlescreen-add-limit-note">
                              (max {{ maxCopiesForType(option.type) }} reached)
                            </span>
                          </v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-card>
                  </v-menu>
                </div>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-frame-buttom"
      color="primary"
      title="Add a new title screen page"
      dark
      absolute
      right
      fab
      @click="handleAddScreen"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';

import {colorByteToCss} from '../utils/palette';

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useTitleScreenStorage, usePixelGridOverlayStorage,
  usePlayerAnimationsStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {DEFAULT_ROW_COLOR} from '../blocks/background';
import {TITLE_SCREEN_KERNEL_TYPES, MAX_KERNEL_COPIES_PER_TYPE, MAX_PLAYER_CARDS, MAX_SCORE_CARDS,
  blankTitleScreenPixels, processTitleScreenStorageDefaults} from '../blocks/titlescreen';
import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';

export default defineComponent({
  name: 'TitleScreenEditor',
  components: {ColorSwatchPicker, EditorZoom, PixelEditor, PixelGridToggle, PlayfieldColorStrip},
  setup() {
    const instance = getCurrentInstance();
    const titleScreenStorage = useTitleScreenStorage();
    const zoom = useEditorZoom('titlescreen');
    const showPixelGrid = usePixelGridOverlayStorage();

    const state = computed({
      get() {
        return processTitleScreenStorageDefaults(titleScreenStorage);
      },
      set(newState) {
        titleScreenStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    const getMaxId = (entries) => max(entries.map(({id}) => id)) || 0;

    const handleAddScreen = () => {
      const maxId = getMaxId(state.value.screens);
      const newScreen = {id: maxId + 1, name: `Title Screen ${maxId + 1}`, backgroundColor: 0, cards: []};
      state.value.screens.push(newScreen);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteScreen = (screen) => {
      if (state.value.screens.length <= 1) return;
      state.value.screens = state.value.screens.filter(({id}) => id !== screen.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const cardWidth = (card) => (TITLE_SCREEN_KERNEL_TYPES[card.type] || {width: 48}).width;
    // Matches BackgroundEditor.vue's own per-column pixel scale reasoning
    // (a fixed on-screen size per source pixel) - without this, the pixel
    // editor's canvas (see PixelEditor.vue's own aspectRatio/proportion-
    // wrapper trick) stretches to fill whatever width its flex parent
    // happens to have, rendering way oversized/undersized instead of at a
    // consistent, legible scale.
    const TITLESCREEN_PIXEL_SCALE = 14;
    const editorWidth = (card) => `${Math.round(cardWidth(card) * TITLESCREEN_PIXEL_SCALE * zoom.value)}px`;
    const cardHasRowColors = (card) => !!(TITLE_SCREEN_KERNEL_TYPES[card.type] || {}).hasRowColors;
    const cardTypeLabel = (card) => {
      if (card.type === 'space') return 'Space';
      if (card.type === 'player') return 'Player sprites';
      if (card.type === 'score') return 'Score';
      return card.type;
    };

    // Same reasoning as BackgroundEditor.vue's own editorRowColors - without
    // this, PixelEditor.vue's own canvas always draws "on" pixels in the
    // single fgColor regardless of a card's own row colors, which only ever
    // showed up in the sidebar strip, never the actual drawing preview
    // (confirmed as a real, reported bug). A pure black row ($00) is nudged
    // to near-black so the editor still counts those pixels as "on" rather
    // than reading them as the black background.
    const editorRowColors = (card) => {
      if (!cardHasRowColors(card) || !card.rowColors) return null;
      return card.rowColors.map((byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      });
    };

    // A 48x1 card (no row colors) has its own single fixed color
    // (card.color) instead - PixelEditor.vue only ever falls back to its
    // own fgColor prop when rowColors is null (see its own "(this.rowColors
    // && this.rowColors[y]) || this.fgColor"), which this used to hardcode
    // to plain white regardless of card.color - a real reported bug (48x1
    // cards never previewed their own picked color, always drawing white).
    // Irrelevant for a row-color card (editorRowColors above always wins
    // there), but still needs SOME value - white matches the old hardcoded
    // default for that case. Same black-nudge as editorRowColors above, for
    // the same reason.
    const editorFgColor = (card) => {
      if (cardHasRowColors(card)) return '#ffffff';
      const css = colorByteToCss(card.color || 0);
      return css === '#000000' ? '#010101' : css;
    };

    const addCardOptions = [
      {type: '48x1', label: '48x1 image (single color, half-height pixels)'},
      {type: '48x2', label: '48x2 image (per-row color, square pixels)'},
      {type: '96x2', label: '96x2 image (per-row color, wider, more ROM)'},
      {type: 'player', label: 'Player sprites (existing Player 0/1 animations)'},
      {type: 'score', label: 'Score (the game\'s own score)'},
      {type: 'space', label: 'Space (blank gap)'},
    ];

    // The kernel ships exactly MAX_KERNEL_COPIES_PER_TYPE pre-built copies of
    // each bitmap type (see public/bb19/titlescreen/*_kernel.asm) - "space"
    // has no such limit, it's just a plain WSYNC loop. That pool is shared
    // across EVERY title screen page in the project (see
    // generators/bbasic/titlescreen.js's own assignKernelSlots), not one
    // pool per page, so this counts cards on every page, not just the one
    // currently being edited. "player"/"score" have their own, much smaller
    // limits (MAX_PLAYER_CARDS/MAX_SCORE_CARDS - see their own comments in
    // blocks/titlescreen.js) since there's only ever one of each minikernel
    // project-wide, not a numbered pool of 8.
    const countOfType = (type) => state.value.screens
        .reduce((total, screen) => total + screen.cards.filter((card) => card.type === type).length, 0);
    const maxCopiesForType = (type) => type === 'player' ? MAX_PLAYER_CARDS :
      type === 'score' ? MAX_SCORE_CARDS : MAX_KERNEL_COPIES_PER_TYPE;
    const canAddCardType = (type) => type === 'space' || countOfType(type) < maxCopiesForType(type);
    const maxCopies = MAX_KERNEL_COPIES_PER_TYPE;

    const handleAddCard = (screen, type) => {
      if (!canAddCardType(type)) return;
      const maxId = getMaxId(screen.cards);
      const newCard = (() => {
        if (type === 'space') return {id: maxId + 1, type, lines: 10};
        if (type === 'score') return {id: maxId + 1, type};
        if (type === 'player') {
          return {
            id: maxId + 1, type,
            windowHeight: 50, kernelLines: 1,
            player0Animation: '', player1Animation: '',
            player0Color: 0x0e, player1Color: 0x0e,
          };
        }
        const pixels = blankTitleScreenPixels(TITLE_SCREEN_KERNEL_TYPES[type].width);
        return {
          id: maxId + 1,
          type,
          pixels,
          color: 0x0f,
          rowColors: TITLE_SCREEN_KERNEL_TYPES[type].hasRowColors ?
            pixels.map(() => DEFAULT_ROW_COLOR) : undefined,
        };
      })();
      screen.cards.push(newCard);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Animation dropdown options for a "player" card's own Player 0/1
    // fields - both dropdowns share the same pool of animations now (see
    // hooks/project.js's usePlayerAnimationsStorage), same "index into the
    // pool, storage read fresh every call" convention as blocks/sprites.js's
    // own buildAnimationOptions (see its own comment), so a renamed/added
    // animation shows up here without a reload. An empty option lets a card
    // draw just one of the two players, falling back to a single blank row
    // for the other (see resolvePlayerSlotFrames in generators/bbasic/
    // titlescreen.js).
    const playerAnimationOptions = () => {
      const player = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage());
      return [
        {text: 'None', value: ''},
        ...player.animations.map((animation, index) =>
          ({text: animation.name || `Unnamed ${index + 1}`, value: `${index}`})),
      ];
    };

    const handleDeleteCard = (screen, card) => {
      screen.cards = screen.cards.filter(({id}) => id !== card.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleSetBackgroundColor = (screen, color) => {
      screen.backgroundColor = color;
      handleChildChange();
    };

    const handleSetCardColor = (card, color) => {
      card.color = color;
      handleChildChange();
    };

    // Clearing a card's own graphic (PixelEditor.vue's own "clear" event,
    // separate from an ordinary pixel edit) resets its own color field(s)
    // back to the same default handleAddCard itself starts a new card at,
    // rather than leaving old picks behind on an otherwise blank card.
    const handleClearCardColors = (card) => {
      if (cardHasRowColors(card)) {
        card.rowColors = (card.rowColors || []).map(() => DEFAULT_ROW_COLOR);
      } else {
        card.color = 0x0f;
      }
      handleChildChange();
    };

    // Keeps rowColors in sync with the image's own current height whenever
    // the pixel editor's own height changes (drawing taller/shorter,
    // resizing, importing a differently-sized image) - same
    // pad-or-truncate-without-clobbering-existing-picks reasoning as
    // PlayerEditor.vue's own ensureRowColors.
    const ensureRowColors = (card) => {
      if (!cardHasRowColors(card)) return;
      const rows = card.pixels.length || 1;
      const existing = card.rowColors || [];
      if (existing.length === rows) return;
      const next = existing.slice(0, rows);
      while (next.length < rows) next.push(DEFAULT_ROW_COLOR);
      card.rowColors = next;
    };

    const handlePixelsInput = (card) => {
      ensureRowColors(card);
      handleChildChange();
    };

    const handleRowColorsInput = (card, colors) => {
      card.rowColors = colors;
      handleChildChange();
    };

    const {isCollapsed: isScreenCollapsed, toggleCollapsed: toggleScreenCollapsed, collapseAll: collapseAllScreens} =
      useCollapsedIds('titlescreen-screens', true);
    collapseAllScreens();

    // Card collapse state is shared across every screen (one storage
    // namespace, same as every other tab), but a card's own id is only
    // unique WITHIN its screen (see handleAddCard's own getMaxId, scoped
    // per screen) - so two different screens' cards can share the same raw
    // id. cardCollapseKey combines both into one id useCollapsedIds can
    // safely key on without those colliding.
    const {isCollapsed: isCollapsedRaw, toggleCollapsed: toggleCollapsedRaw, collapseAll: collapseAllCards} =
      useCollapsedIds('titlescreen-cards', true);
    collapseAllCards();
    const cardCollapseKey = (screen, card) => ({id: `${screen.id}-${card.id}`});
    const isCollapsed = (key) => isCollapsedRaw(key);
    const toggleCollapsed = (key) => toggleCollapsedRaw(key);

    const {dragAttrs: screenDragAttrs, dragCardClass: screenDragCardClass,
      dragHandleListeners: screenDragHandleListeners, dragTargetListeners: screenDragTargetListeners} = useDragReorder(
        () => state.value.screens,
        (items) => {
          state.value.screens = items;
          handleChildChange();
        },
    );

    // One useDragReorder instance PER SCREEN (each screen's own card list
    // reorders independently) - useDragReorder is a plain factory (see
    // hooks/drag-reorder.js), not a Vue lifecycle hook, so it's safe to call
    // more than once/lazily like this. Cached by screen id so every card in
    // the same screen shares one instance (its own draggedIndex/
    // dragOverIndex refs), rather than creating a fresh, disconnected one
    // per card.
    const cardDragReordersByScreen = new Map();
    const cardDragReorderFor = (screen) => {
      if (!cardDragReordersByScreen.has(screen.id)) {
        cardDragReordersByScreen.set(screen.id, useDragReorder(
            () => screen.cards,
            (items) => {
              screen.cards = items;
              handleChildChange();
            },
        ));
      }
      return cardDragReordersByScreen.get(screen.id);
    };
    const cardDragAttrs = (screen, index) => cardDragReorderFor(screen).dragAttrs(index);
    const cardDragCardClass = (screen, index) => cardDragReorderFor(screen).dragCardClass(index);
    const cardDragHandleListeners = (screen, index) => cardDragReorderFor(screen).dragHandleListeners(index);
    const cardDragTargetListeners = (screen, index) => cardDragReorderFor(screen).dragTargetListeners(index);

    // Purely a visual "which card am I looking at" marker, plain local
    // component state - same reasoning/shape as every other tab's own
    // selectCard/deselectCard (see e.g. MusicEditor.vue's own comment).
    // Screens get their own separate selection (a page and a graphic card
    // are never the same thing to have "selected" at once).
    const selectedCardId = ref(null);
    const selectCard = (id) => {
      selectedCardId.value = id;
    };
    const selectedScreenId = ref(null);
    const selectScreen = (id) => {
      selectedScreenId.value = id;
    };
    const deselectCard = () => {
      selectedCardId.value = null;
      selectedScreenId.value = null;
    };

    return {
      state, handleChildChange,
      handleAddScreen, handleDeleteScreen,
      isScreenCollapsed, toggleScreenCollapsed,
      screenDragAttrs, screenDragCardClass, screenDragHandleListeners, screenDragTargetListeners,
      cardWidth, editorWidth, cardHasRowColors, editorRowColors, editorFgColor, cardTypeLabel,
      addCardOptions, canAddCardType, maxCopies, maxCopiesForType, playerAnimationOptions,
      handleAddCard, handleDeleteCard,
      handleSetBackgroundColor, handleSetCardColor, handleClearCardColors,
      handlePixelsInput, handleRowColorsInput,
      isCollapsed, toggleCollapsed, cardCollapseKey,
      cardDragAttrs, cardDragCardClass, cardDragHandleListeners, cardDragTargetListeners,
      showPixelGrid, zoom,
      selectedCardId, selectCard,
      selectedScreenId, selectScreen,
      deselectCard,
    };
  },
});
</script>
<style scoped>
.titlescreen-intro-paragraph {
  margin-bottom: 16px;
}

/* Same reasoning as BackgroundEditor.vue's own identical rule - keeps
   editor-zoom and pixel-grid-toggle on one visually-centered line. */
.editor-toolbar-row {
  display: flex;
  align-items: center;
}

.titlescreen-list {
  margin-top: 16px;
}

/* hooks/drag-reorder.js's own CSS_CLASS_DRAGGING/CSS_CLASS_DRAG_OVER -
   applying those classes alone does nothing without the actual visual
   rule for them, which this tab never had (confirmed as a real bug: the
   classes WERE being toggled correctly, just invisible). Same top-border
   convention MusicEditor.vue's own identical rule uses (a single vertical
   list, not a multi-column grid needing Text/Background's own left/right
   variant). Shared by both the screen list and the nested card list. */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* v-list-item's own default 0 16px padding stacks on top of v-card-text's,
   pushing every card in further on the right than the left - same fix as
   BackgroundEditor.vue's own identical rule (see its own comment). */
.entry-list-item {
  padding: 0;
}

/* Same fix as DataEditor.vue's own identical rule: without this,
   .v-list-item__content's default overflow: hidden clips a selected card's
   own 2px outline on its left/right edges (min-width: 0 has to come with
   it - overflow: visible alone silently undoes this flex item's default
   0 min-width, letting it refuse to shrink below its own widest content). */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}

/* width: 100% - same fix as BackgroundEditor.vue's/PlayerEditor.vue's own
   identical .background-card/.animation-card rule: without it, this card
   (nested inside v-list-item-content, not the list item itself) shrinks to
   its own content's natural width instead of filling its row, so a
   collapsed card (just the title row) rendered visibly narrower than an
   expanded one (whose pixel editor forces a wider width). */
/* margin-bottom: 8px matches BackgroundEditor.vue's own .background-list
   grid gap (its own between-card spacing) - not that same 12px this card
   uses for its own internal padding, which is a separate value there too. */
.titlescreen-screen-card,
.titlescreen-card {
  position: relative;
  width: 100%;
  padding: 12px;
  margin-bottom: 8px;
}

/* Only .titlescreen-card needs this: when collapsed, its own body (which
   normally supplies margin-top: 34px to clear the absolutely positioned
   collapse button/ID badge/corner toolbar - see .titlescreen-card-body's
   own comment) isn't rendered at all, so without this the card's own box
   shrank shorter than that positioned content needed, and the toolbar/
   badge visually spilled out past its bottom edge. .titlescreen-screen-card
   never has this problem (its own title row stays visible even collapsed),
   so it doesn't get this rule - it was making that card too tall. */
.titlescreen-card {
  min-height: 44px;
}

/* A top strip, not a left one - matches BackgroundEditor.vue's own
   .background-drag-handle exactly (see its own comment): covers the same
   header band the collapse/ID/delete controls occupy, sitting behind them
   in paint order (they're later in the DOM, so they stay clickable) but in
   front of everything else, so dragging elsewhere in the card still
   selects text/drags the pixel editor instead of starting a reorder. */
/* v-list-item-title is a plain, non-positioned block - unlike its own
   absolutely-positioned collapse-btn/badge/corner-toolbar children (which
   already paint above .titlescreen-drag-handle on their own, position:
   absolute vs. static), its own EMPTY space still captures pointer events
   across its whole box (a transparent element still blocks clicks to
   whatever's behind it, regardless of background) - confirmed as a real
   bug: dragging never started anywhere except exactly on top of a button.
   pointer-events: none here lets a click/drag in that empty space fall
   through to the drag handle underneath; re-enabling it on every direct
   child keeps those controls (and the title row's own input/swatch)
   clickable as normal. */
.titlescreen-header-title {
  pointer-events: none;
}

.titlescreen-header-title > * {
  pointer-events: auto;
}

.titlescreen-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* Matches every other tab's own collapse button placement exactly (see
   BackgroundEditor.vue's own .background-collapse-btn/PlayerEditor.vue's
   own .animation-collapse-btn) - absolutely positioned in the card's
   top-left corner, not flowed in normal layout. */
.titlescreen-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same placement as PlayerEditor.vue's own .animation-name-field - a
   graphic card has no name field of its own (nothing follows here), but a
   Title Screen page does, plus its own background color swatch alongside
   it on the same row. margin-top clears the absolutely positioned collapse
   button/ID badge above (see .titlescreen-id-badge/.titlescreen-collapse-
   btn) - the corner toolbar's own absolute top-right position never
   collides with it horizontally, same as every other tab's own identical
   layout. */
.titlescreen-screen-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
}

.titlescreen-screen-name-field {
  max-width: 220px;
}

/* Same reasoning as BackgroundEditor.vue's own .pixel-editor-container >>>
   .v-card rule - PixelEditor.vue always wraps itself in its own outlined
   v-card, which is redundant once .titlescreen-card already frames the
   whole entry the same way. */
.pixel-editor-container >>> .v-card {
  border: none !important;
  box-shadow: none !important;
}

/* Same reasoning as BackgroundEditor.vue's own identical rules - Vuetify's
   default v-card-text padding (16px on every side) otherwise left a wide
   gap to the left of the canvas (and above/below it) that had nothing to
   do with this card's own 12px padding, which already provides its own
   spacing. */
.pixel-editor-container >>> .v-card__text {
  padding: 0 0 4px 0 !important;
}

.pixel-editor-container >>> .v-card__actions {
  padding: 4px 0 0 0 !important;
}

/* Same placement/style as every other tab's own "ID: N" badge (see
   BackgroundEditor.vue's own .background-id-badge). */
.titlescreen-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75em;
  font-family: monospace;
  opacity: 0.6;
}

/* Matches the Text tab's own .text-bkcolor-label size (TextEditor.vue) -
   this page's background color now uses the same ColorSwatchPicker dot the
   Text/Score tabs use for their own single background color, instead of
   PlayfieldColorStrip's own multi-row strip (which is meant for per-ROW
   colors, not a single project/page-wide one - a real reported style
   mismatch). */
.titlescreen-bg-color-label {
  font-size: 1rem;
}

/* The wrapper itself is positioned (not the button inside via Vuetify's
   own "absolute" prop) - same as BackgroundEditor.vue's own
   .background-corner-toolbar/PlayerEditor.vue's own .animation-corner-
   toolbar. Positioning the button directly instead (an earlier version of
   this) put it outside the v-menu activator's own wrapper element instead
   of the card - confirmed as a real bug (the button rendered detached from
   the card entirely) - this wrapper avoids that since IT establishes the
   position, not something nested inside the menu's own markup. */
.titlescreen-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

/* No drop shadow on floating (absolute-positioned) buttons - collapse,
   delete, add - matching BackgroundEditor.vue's own identical rule. */
.v-btn--absolute {
  box-shadow: none !important;
}

.titlescreen-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
}

/* Comes right after .titlescreen-screen-title-row, which already clears
   the absolutely positioned collapse button/ID badge above it (see its own
   comment) - only needs a little breathing room of its own, not a second
   clearance margin. */
.titlescreen-screen-body {
  margin-top: 8px;
}

/* Unlike a Title Screen page, a graphic card has no name field (or any
   other normal-flow content) between its header and body to clear the
   absolutely positioned collapse button/ID badge/corner toolbar above -
   this margin does that job directly instead (34px clears the corner
   toolbar's own delete button, the taller of the two). */
/* overflow-x: auto - unlike BackgroundEditor.vue/PlayerEditor.vue (whose
   own CSS grid track width is set to match editorWidth exactly - see their
   own comments), this card stays a fixed width: 100% regardless of a
   graphic's own type/zoom. A 96-wide card (double a 48-wide one) at zoom
   above ~50% can make .pixel-editor-container's own fixed pixel width
   (set inline via editorWidth) exceed THIS element's own box - since this
   is the narrower, width-constrained ancestor (not .pixel-editor-container
   itself, whose box is always exactly as wide as its own content and so
   never clips anything on its own), this is the right place for the
   scrollbar to actually appear. Without it, that overflow spilled out past
   the card's (and its own screen card's, and eventually the whole page's)
   right edge instead of staying contained, a real reported bug. overflow-y
   is explicitly hidden rather than left as the default visible: CSS forces
   one axis's "visible" to compute as "auto" whenever the other axis isn't
   also visible, so leaving this "visible" produced an unwanted vertical
   scrollbar too (confirmed as a real bug) - hidden avoids that forced
   conversion, and is safe since nothing in here is ever taller than its
   own content. */
.titlescreen-card-body {
  margin-top: 34px;
  overflow-x: auto;
  overflow-y: hidden;
}

.titlescreen-card-list {
  padding-top: 0;
  padding-bottom: 0;
}

.titlescreen-player-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.titlescreen-player-select,
.titlescreen-player-window-field {
  max-width: 260px;
}

.titlescreen-player-color {
  display: inline-flex;
  vertical-align: middle;
  height: 22px !important;
}

.titlescreen-player-color-label {
  font-size: 14px;
}

.titlescreen-player-hint {
  margin-bottom: 8px;
}

.add-titlescreen-card-buttom {
  margin-top: 8px;
}

/* Same class name/positioning as BackgroundEditor.vue's own identical
   "Add background" button - a floating primary-colored FAB in the bottom-
   right corner, absolutely positioned relative to the outer wrapping div
   (a sibling of .editor-container, not inside its v-card-text). */
.add-frame-buttom {
  bottom: 8px;
}

/* Matches BackgroundEditor.vue's own identical .editor-container rule -
   without this, the card just flows in normal page scroll (this tab never
   had its own override, unlike Background's), and .add-frame-buttom above
   (a sibling outside this card, not inside its own scroll region) ends up
   anchored to some ancestor that scrolls the page along with it instead of
   staying pinned in place - a real reported bug ("the add button should not
   scroll"). Making THIS card itself the scrolling region (position:
   absolute + overflow: auto, pinned to the full height of its own slot)
   is what lets the button sit outside it and stay fixed regardless of how
   far the card's own content scrolls. */
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

.titlescreen-add-limit-note {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
}

.titlescreen-scroll-window-field {
  max-width: 260px;
  margin-top: 8px;
}
</style>
