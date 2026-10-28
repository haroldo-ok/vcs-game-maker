<template>
  <div>
    <v-card class="editor-container" :ripple="false" :style="{'--sticky-toolbar-offset': `${folderToolbarHeight}px`}" @click="deselectCard">
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message player-intro-paragraph">
          Draw sprite animations here, shared by all Player sprites - assign one to a Player
          with a "Player animation" block, then control playback with "Player animation
          Play/Pause" (Actions tab). Each animation has its 1x/2x/4x width (matching real
          player size) setting, which will be set automatically when that sprite is activated.
        </p>

        <!-- The folders are pinned above the toolbar of the graphics (which sticks just under them), as on the Text tab. -->
        <div ref="folderToolbar" class="sprite-folder-toolbar tight-under-intro" :class="{'folder-toolbar-pinned': folderToolbarPinned}">
          <card-folder-bar
            :folders="foldersOf()"
            :current="openFolderId()"
            root-label="Sprites"
            noun="sprite"
            :accept="draggingCardIndex !== null"
            @update:current="openFolder"
            @change="refresh"
            @add-folder="handleAddFolder"
            @delete-folder="handleDeleteFolder"
            @drop-cards="handleDropCards"
          />
        </div>

        <graphic-editor-toolbar :active-editor="effectiveFrameEditor" :card-columns.sync="cardColumns" card-columns-what="animations" @height-hotkey="handleSetHeightHotkey">
          <template v-slot:before-tools>
            <editor-zoom v-model="zoom" :levels="playerZoomLevels" />
            <pixel-grid-toggle v-model="showPixelGrid" />
            <pixel-grid-toggle
              v-model="showPixelGridLabels"
              :icon="null"
              label="XY"
              title-on="Hide pixel coordinates (Shift+')"
              title-off="Show pixel coordinates (Shift+')"
              :disabled="!showPixelGrid"
              disabled-title="Turn on the pixel grid to show coordinates"
            />
          </template>
          <template v-slot:after-tools>
            <div class="text-center">
              <v-dialog
                v-model="heightMenuVisible"
                width="480"
              >
                <template v-slot:activator="{ on, attrs }">
                  <v-btn
                    text
                    small
                    class="unified-toolbar-height-btn"
                    title="Set height (H)"
                    :disabled="!selectedAnimation"
                    v-bind="attrs"
                    v-on="on"
                    @click="openHeightMenu"
                  >
                    <v-icon>mdi-human-male-height-variant</v-icon>
                  </v-btn>
                </template>

                <v-card>
                  <v-list>
                    <v-list-item>
                      <v-list-item-content>
                        <v-list-item-title>Set height for every frame on this card</v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>

                  <v-divider></v-divider>

                  <v-list>
                    <v-list-item>
                      <v-list-item-action>

                        <v-slider
                          v-model="heightMenuValue"
                          :min="1"
                          :max="128"
                          label="Height"
                          class="align-center"
                          style="width: 400px"
                        >
                          <template v-slot:append>
                            <v-text-field
                              v-model="heightMenuValue"
                              class="mt-0 pt-0"
                              type="number"
                              style="width: 60px"
                            ></v-text-field>
                          </template>
                        </v-slider>

                      </v-list-item-action>
                    </v-list-item>
                  </v-list>

                  <div class="unified-toolbar-scale-checkbox">
                    <v-checkbox
                      v-model="heightMenuScaleContents"
                      label="Scale existing contents (nearest neighbor)"
                      hide-details
                      dense
                    />
                  </div>

                  <v-card-actions>
                    <v-spacer></v-spacer>

                    <v-btn
                      text
                      @click="heightMenuVisible = false"
                    >
                      Cancel
                    </v-btn>
                    <v-btn
                      color="primary"
                      text
                      @click="handleUnifiedSetHeight()"
                    >
                      Set height
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
            </div>
          </template>
          <template v-slot:extra-tools>
            <v-menu
              top
              :close-on-content-click="false"
              v-model="asepriteImportMenuOpen"
            >
              <template v-slot:activator="{ on, attrs }">
                <v-btn
                  icon
                  small
                  title="Import from Aseprite (sprite strip + .json)"
                  v-bind="attrs"
                  v-on="on"
                >
                  <v-icon>mdi-file-import-outline</v-icon>
                </v-btn>
              </template>

              <v-card>
                <v-card-text class="import-animation-menu import-aseprite-menu">
                  <v-btn
                    color="primary"
                    block
                    @click="() => { asepriteImportMenuOpen = false; handleImportAsepriteSheet(); }"
                  >
                    Choose .json + image&hellip;
                  </v-btn>
                  <v-switch
                    v-model="asepriteReplaceAnimations"
                    label="Replace animations"
                    hide-details
                  />
                </v-card-text>
              </v-card>
            </v-menu>
          </template>
          <template v-if="spriteColorsEnabled" v-slot:below-tools>
            <quick-color-palette v-model="selectedQuickColor" :active-editor="effectiveFrameEditor" />
          </template>
        </graphic-editor-toolbar>
        <v-list class="animation-list" :class="{'animation-list-columns': cardColumns}" :style="cardColumns ? {'--sprite-card-min': cardColumnMin()} : null">
          <v-list-item
            class="entry-list-item"
            v-for="{card: animation, index} in visibleEntries()"
            v-bind:key="animation.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="animation-card"
                :class="[dragCardClass(index), {'animation-card-selected': selectedCardIds.includes(animation.id)}]"
                v-on="dragTargetListeners(index)"
                @click.stop="selectCard(animation.id, $event)"
              >
                <div
                  class="animation-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="cardHandleListeners(index)"
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
                  <div class="animation-id-badge">ID:{{ animation.id }}</div>
                  <v-text-field
                    class="animation-name-field"
                    label="Animation name"
                    v-model="animation.name"
                    @change="handleChildChange"
                  />

                  <!-- Sets this animation's real NUSIZ width (normal/double/
                       quad), not just a preview - the pixel grid still edits
                       at the real 8-pixel resolution underneath, but the
                       compiled ROM now sets player{N}size to match this
                       choice every frame the animation is active (see
                       processAnimation's comment in generators/
                       bbasic.js), overriding whatever a "Set player size"
                       block elsewhere set moments earlier for as long as
                       this animation stays selected. Per-animation, not
                       global or per-frame: different animations on the same
                       player commonly want different widths (e.g. a normal
                       walk cycle vs. a doubled-width "power-up" pose), so a
                       single shared setting couldn't represent both. -->
                  <v-btn-toggle
                    v-if="!isCollapsed(animation)"
                    :value="animation.previewWidthScale || 1"
                    class="animation-preview-scale-toggle"
                    dense
                    mandatory
                    @change="(scale) => handleSetPreviewScale(animation, scale)"
                  >
                    <v-btn :value="1" x-small title="Normal (1x) width">1x</v-btn>
                    <v-btn :value="2" x-small title="Doubled (2x) width">2x</v-btn>
                    <v-btn :value="4" x-small title="Quadrupled (4x) width">4x</v-btn>
                  </v-btn-toggle>

                  <!-- A 16 pixel wide animation. Two sprites draw it, the player the left half and another sprite (a Player 2 to 9 picked
                       automatically with DPC+, the other player otherwise) the right half, which follows the player's frame, position,
                       width and flip. -->
                  <v-btn-toggle
                    v-if="!isCollapsed(animation)"
                    :value="animation.wide ? 16 : 8"
                    class="animation-preview-scale-toggle"
                    dense
                    mandatory
                    @change="(width) => handleSetWide(animation, width === 16)"
                  >
                    <v-btn :value="8" x-small title="A sprite 8 pixels wide">8px</v-btn>
                    <v-btn
                      :value="16"
                      x-small
                      :title="isDpcPlus ? 'A sprite 16 pixels wide, drawn by two sprites: the right half is a Player 2 to 9 picked automatically that follows this player' : 'A sprite 16 pixels wide, drawn by two sprites: the right half is the other player (Player 1 when this is Player 0), which then cannot be used for anything else'"
                    >16px</v-btn>
                  </v-btn-toggle>

                  <div class="animation-corner-toolbar">
                    <confirm-delete-menu
                      v-if="state.animations.length > 1"
                      :title="deleteQuestion(animation.id, 'animation')"
                      :selected="animation.id === selectedCardId && selectedCardIds.includes(animation.id)"
                      :activator-title="deleteQuestion(animation.id, 'animation').replace('?', '')"
                      icon-btn-class="player-icon-btn-size"
                      @confirm="handleDeleteAnimation(animation)"
                    />
                    <v-btn
                      icon
                      small
                      title="Duplicate this animation"
                      class="titlescreen-play-btn player-icon-btn-size"
                      @click.stop="() => handleDuplicateAnimation(animation)"
                    >
                      <v-icon>mdi-content-duplicate</v-icon>
                    </v-btn>
                    <v-menu
                          top
                          :close-on-content-click="false"
                          :value="importMenuOpenAnimationId === animation.id"
                          @input="(open) => { if (!open) importMenuOpenAnimationId = null; }"
                        >
                      <template v-slot:activator="{ attrs }">
                        <v-btn
                          title="Import animation frames from image files"
                          icon
                          small
                          class="import-icon-btn player-icon-btn-size"
                          v-bind="attrs"
                          @click="importMenuOpenAnimationId = animation.id"
                        >
                          <v-icon>mdi-image-multiple</v-icon>
                        </v-btn>
                      </template>

                      <v-card>
                        <v-card-text class="import-animation-menu">
                          <v-btn
                            color="primary"
                            block
                            @click="() => { importMenuOpenAnimationId = null; handleImportAnimationFrames(animation); }"
                          >
                            Choose images&hellip;
                          </v-btn>
                          <v-btn
                            block
                            class="mt-2"
                            title="Frames from batari Basic sprite files (player0: rows of %01...), one file per frame; a file with 16 pixel rows makes the animation 16 pixels wide (DPC+)"
                            @click="() => { importMenuOpenAnimationId = null; handleImportSpriteFiles(animation); }"
                          >
                            Choose .spr files&hellip;
                          </v-btn>
                          <v-switch
                            v-model="replaceFramesOnImport"
                            label="Replace frames"
                            hide-details
                          />
                          <v-switch
                            v-model="keepColorsOnImport"
                            label="Keep row colors"
                            :disabled="!replaceFramesOnImport"
                            hide-details
                          />
                        </v-card-text>
                      </v-card>
                    </v-menu>

                    <v-btn
                      :title="testingId === animation.id ? 'Building...' :
                        buildInProgress ? 'Another build is already running - try again once it finishes' :
                        'Test this animation (played by Player 0) in the emulator'"
                      icon
                      small
                      :disabled="buildInProgress && testingId !== animation.id"
                      :loading="testingId === animation.id"
                      class="titlescreen-play-btn player-icon-btn-size"
                      @click.stop="() => handleTestAnimation(animation)"
                    >
                      <v-icon>mdi-play</v-icon>
                    </v-btn>
                  </div>

                </v-list-item-title>
                <v-list v-if="!isCollapsed(animation)" class="animation-frame-list">
                  <v-list-item
                    v-for="(frame, frameIndex) in animation.frames"
                    v-bind:key="frame.id"
                    class="pixel-editor-parent-container"
                    :class="frameDrag(animation).dragCardClass(frameIndex)"
                    v-on="frameDrag(animation).dragTargetListeners(frameIndex)"
                  >
                    <div
                      class="pixel-editor-container"
                      :class="{
                        'pixel-editor-container-wide': zoom >= 1,
                        'pixel-editor-container-active': frameHighlightState(animation, frame) === 'blue',
                        'pixel-editor-container-active-grey': frameHighlightState(animation, frame) === 'grey',
                      }"
                      :style="{width: frameEditorWidth(animation)}"
                      :draggable="armedFrameKey === frameKey(animation, frame)"
                      v-on="frameHandleListeners(animation, frameIndex)"
                      @mousedown="(event) => armFrameDrag(event, animation, frame)"
                      @mouseup="armedFrameKey = null"
                    >
                      <v-text-field
                        label="Duration"
                        v-model.number="frame.duration"
                        hide-details
                        type="number"
                        min="1"
                        step="1"
                        @change="() => handleFrameDurationChange(frame)"
                      />
                      <pixel-editor
                        :ref="pixelEditorRefKey(animation, frame)"
                        :key="widthOfAnimation(animation)"
                        :width="widthOfAnimation(animation)"
                        :height="frame.pixels.length || 1"
                        :aspectRatio="(widthOfAnimation(animation) / (frame.pixels.length || 1)) * (animation.previewWidthScale || 1)"
                        v-model="frame.pixels"
                        :fgColor="fgColor"
                        :rowColors="editorRowColors(frame)"
                        :name="animation.name || name"
                        :showClearButton="true"
                        :showGrid="showPixelGrid"
                        :showCellIds="showPixelGrid && showPixelGridLabels"
                        :hideToolbar="true"
                        @input="handleChildChange"
                        @clear="() => handleClearRowColors(frame)"
                        @clear-colors="() => handleClearRowColors(frame)"
                        @move-rows="(move) => handleMoveRows(frame, move)"
                        @flip-rows="() => handleFlipRowColors(frame)"
                        @activate="(editorInstance) => setActiveFrame(editorInstance, animation.id, frame.id)"
                      >
                        <template v-if="spriteColorsEnabled" v-slot:sidebar>
                          <playfield-color-strip
                            :value="frame.rowColors"
                            :quickColors="spriteColorPalette"
                            :activeQuickColor="selectedQuickColor"
                            @input="(colors) => handleRowColorsInput(frame, colors)"
                          />
                        </template>
                        <template v-slot:toolbar-end>
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
                        </template>
                        <template v-slot:badge>
                          <div class="frame-number-badge">ID:{{ frameIndex + 1 }}</div>
                          <div class="frame-corner-toolbar">
                            <confirm-delete-menu
                              v-if="animation.frames.length > 1"
                              title="Delete this frame?"
                              :selected="frameHighlightState(animation, frame) === 'blue'"
                              :select-priority="2"
                              activator-title="Delete this frame"
                              icon-btn-class="player-icon-btn-size"
                              @confirm="handleDeleteFrame(animation, frame)"
                            />
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
import {recordReorder} from '../hooks/reorder-history';
import Vue from 'vue';
import {computed, defineComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref} from '@vue/composition-api';
import {chunk, max} from 'lodash';

import CardFolderBar from '../components/CardFolderBar.vue';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import EditorZoom from '../components/EditorZoom.vue';
import GraphicEditorToolbar from '../components/GraphicEditorToolbar.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import QuickColorPalette from '../components/QuickColorPalette.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useCardFolders} from '../hooks/card-folders';
import {useCardSelection} from '../hooks/card-selection';
import {recordFieldsChange, recordRowColorsChange} from '../utils/row-color-history';
import {DEFAULT_ROW_COLOR, clearRowColors} from '../blocks/background';
import {DEFAULT_SPRITES, processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {useColorPaletteStorage, useConfigurationStorage, useErrorStorage, usePixelGridLabelsStorage, usePixelGridOverlayStorage,
  useSpriteCardColumnsStorage} from '../hooks/project';
import {buildPlayerAnimationPreviewRom, useBuildInProgress} from '../hooks/rom';
import {useEditorZoom, ZOOM_LEVELS} from '../hooks/zoom';

// The Sprites tab zooms out further than the other tabs, down to 25%.
const PLAYER_ZOOM_LEVELS = [0.25, ...ZOOM_LEVELS];
import {colorByteToCss} from '../utils/palette';
import {playfieldToMatrix, resizePixelMatrixHeight, scaleRowColors, carryOverFrameColors} from '../utils/pixels';
import {rowColorsForMove} from '../utils/row-color-move';
import {loadImageFromFile, openFileDialogMultiple, sortImportedAnimationFrameFiles} from '../utils/file';
import {createCroppedResizedCanvas, createResizedCanvas} from '../utils/image';
import {parseAsepriteSheet} from '../utils/aseprite';
import {escapeHtml} from '../utils/build-error';
import {clampFrameDuration} from '../utils/duration';
import {REMOVED, removeCards} from '../utils/card-refs';
import {parseSpriteFile, resizeRowsToWidth, setAnimationWide, widthOfAnimation} from '../utils/wide-sprite';

// Width of one frame editor at 100% zoom. The container is normally sized by
// its  contents, so this pins it before the zoom factor is applied.
const EDITOR_BASE_WIDTH = 275;

// Clipboard for one frame's whole row-color list (see handleCopyRowColors/
// handlePasteRowColors) - module-scope, not a ref inside setup(), so a
// copied row-color set survives navigating away from this tab and back
// (this component is destroyed/recreated on navigation - see
// hooks/collapse.js's  comment on that lifecycle). null until the first
// copy. Same "module-scope ref shared across instances" pattern
// Configuration.vue's  collapsedSections uses for the same reason.
const copiedFrameRowColors = ref(null);

// Same reasoning/mechanism as copiedFrameRowColors just above, for the
// "standard" copy/paste pair (handleCopyFrame/handlePasteFrame) that copies
// a frame's whole image - {pixels, rowColors} together, not just one or the
// other. A separate clipboard from copiedFrameRowColors, not a shared one:
// copying a whole frame shouldn't clobber whatever the user last copied
// with the colors-only pair (or vice versa) if they're using both.
const copiedFrameData = ref(null);

export default defineComponent({
  components: {CardFolderBar, ConfirmDeleteMenu, EditorZoom, GraphicEditorToolbar, PixelEditor, PixelGridToggle, PlayfieldColorStrip, QuickColorPalette},
  props: ['storageFactory', 'title', 'fgColor', 'name'],
  setup(props) {
    const instance = getCurrentInstance();

    // How tall the pinned folders are: the toolbar of the graphics sticks under them, not behind them.
    const folderToolbar = ref(null);
    const folderToolbarHeight = ref(0);
    // Whether the folders are pinned at the top of the tab (scrolled): they get room above them then.
    const folderToolbarPinned = ref(false);
    let pinnedContainer = null;
    const updatePinned = () => {
      const element = folderToolbar.value;
      if (!element || !pinnedContainer) return;
      folderToolbarPinned.value = element.getBoundingClientRect().top <= pinnedContainer.getBoundingClientRect().top + 1;
      // (Pinned, it has more room above, so it is taller: the toolbar under it sticks after that.)
      folderToolbarHeight.value = pinnedHeight(element);
    };
    // (One pixel less than it is, rounded down: the toolbar under it overlaps its edge instead of leaving a gap that shows what is behind.)
    const pinnedHeight = (element) => Math.max(0, Math.floor(element.getBoundingClientRect().height) - 1);
    let folderToolbarObserver = null;
    onMounted(() => {
      const element = folderToolbar.value;
      if (!element) return;
      folderToolbarHeight.value = pinnedHeight(element);
      pinnedContainer = element.closest('.editor-container');
      if (pinnedContainer) {
        pinnedContainer.addEventListener('scroll', updatePinned);
        updatePinned();
      }
      if (typeof ResizeObserver !== 'undefined') {
        folderToolbarObserver = new ResizeObserver(() => {
          folderToolbarHeight.value = pinnedHeight(element);
        });
        folderToolbarObserver.observe(element, {box: 'border-box'});
      }
    });
    onBeforeUnmount(() => {
      if (folderToolbarObserver) folderToolbarObserver.disconnect();
      if (pinnedContainer) pinnedContainer.removeEventListener('scroll', updatePinned);
    });
    // 0.75, not the shared 100% default - same "this tab reads better at a
    // different starting zoom" reasoning useEditorZoom's comment already
    // documents for Text (200%) and Score (150%).
    const zoom = useEditorZoom(props.name, 0.75, PLAYER_ZOOM_LEVELS);
    // Shared across Player 0/1 AND the Background tab (see
    // PixelGridToggle.vue's  comment) - not per-player like zoom above.
    const showPixelGrid = usePixelGridOverlayStorage();
    const showPixelGridLabels = usePixelGridLabelsStorage();
    // The animation cards in several columns (the window wide enough for more than one) or in one.
    const cardColumns = useSpriteCardColumnsStorage();
    const editorWidth = computed(() => `${Math.round(EDITOR_BASE_WIDTH * zoom.value)}px`);
    // Widens the frame editor's  container by the SAME factor the
    // aspectRatio calculation below scales by, instead of just increasing
    // aspectRatio alone against a fixed-width container - confirmed as a
    // real bug that way: the proportion-wrapper's height is a PERCENTAGE OF
    // ITS WIDTH (padding-bottom: 100/aspectRatio%, see PixelEditor.vue),
    // so widening the aspect ratio while the container's  width stayed
    // fixed just made the box shorter, not wider. Scaling width and
    // aspectRatio by the same factor keeps the derived height exactly
    // where it was at 1x (height = width / aspectRatio - both the
    // numerator and denominator grow by the same factor, cancelling out),
    // so only the width actually changes as the toggle goes from 1x to 4x.
    const frameEditorWidth = (animation) =>
      `${Math.round(EDITOR_BASE_WIDTH * zoom.value * (animation.previewWidthScale || 1) * (widthOfAnimation(animation) / 8))}px`;
    // With the cards in columns, a column is as wide as the widest frame editor shown needs (zoomed in, or a wide animation), and at least
    // 520px; a card never gets wider than the list.
    const cardColumnMin = () => {
      const widest = Math.max(0, ...visibleEntries().map(({card}) => parseInt(frameEditorWidth(card), 10)));
      return `${Math.max(520, widest + 40)}px`;
    };
    const getMaxId = (elements) => {
      return max(elements.map((o) => o.id))||0;
    };

    const configurationStorage = useConfigurationStorage();
    const isDpcPlus = computed(() => (configurationStorage.value || {}).kernel === 'dpcplus');
    // Per-row SPRITE colors (batari Basic playercolors/player1colors) - see
    // the Options tab's "Enable per-row Player 0/1 sprite colors"
    // toggles (still two independent, per-hardware-player toggles - see
    // generateConfiguration's  comment in generators/bbasic.js for why
    // player1colors is valid on its  but playercolors isn't). This
    // editor is now a SINGLE shared tab (one pool of animations either
    // hardware player can use - see PlayerEditorView.vue), not one instance
    // per player, so it has no "which player" context of its  anymore -
    // the row-color painting UI shows if EITHER player's  toggle is on,
    // since a shared animation's rowColors data is meaningful to show/edit
    // as long as at least one hardware player would actually render it.
    const spriteColorsEnabled = computed(() => {
      const config = configurationStorage && configurationStorage.value;
      return !!(config && (config.kernel === 'dpcplus' || config.enablePlayer0SpriteColors || config.enablePlayer1SpriteColors));
    });

    // Read-only here - components/QuickColorPalette.vue (mounted above)
    // owns writing to this same shared storage; this component only needs
    // the list itself, to pass into PlayfieldColorStrip's  quickColors
    // prop below.
    const colorPaletteStorage = useColorPaletteStorage();
    const spriteColorPalette = computed(() => colorPaletteStorage.value || []);

    // Which quick color (see components/QuickColorPalette.vue) is currently
    // "armed" for painting row colors directly - v-model'd to that
    // component above, and passed into PlayfieldColorStrip's
    // activeQuickColor prop below. Not module-scope (unlike the palette
    // data itself, which QuickColorPalette owns via shared project
    // storage) - which color is armed is closer to a live "tool selection"
    // than shared project data, so it's fine (arguably more expected) for
    // it to reset when switching between the Player 0/Player 1 tabs rather
    // than following the user across them.
    const selectedQuickColor = ref(null);

    // Same reasoning/mechanism as BackgroundEditor's  ensureRowColors -
    // fills in a missing/mismatched-length row color list (a frame's
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

    // Purely a visual "which card am I looking at" marker - same
    // selectCard/selectedCardId/deselectCard pattern as MusicEditor.vue's
    // song cards and the other tabs'  entry cards (see
    // MusicEditor.vue's  comment for the full reasoning): plain local
    // component state, not persisted, not wired into anything else. Also
    // drives the shared "Set height" tool below (see selectedAnimation's
    // comment).
    // Shift+click selects a range, Ctrl/Cmd+click adds or removes a card (see hooks/card-selection.js): deleting or
    // dragging one of several selected cards does it to all of them.
    const selectedCardId = ref(null);
    const {selectedCardIds, selectCard, deselectCard, idsToDelete, deleteQuestion, remapIds: remapSelectedIds} =
      useCardSelection(
          () => visibleEntries().map(({card}) => card.id), selectedCardId);
    // The indices, in the whole list, of the selected cards (dragging one of them moves them all).
    const getSelectedFullIndices = () => state.value.animations
        .map((animation, index) => (selectedCardIds.value.includes(animation.id) ? index : -1)).filter((index) => index >= 0);

    // Tracks whichever frame's PixelEditor instance was last clicked
    // into (see its "activate" event, emitted from PixelEditor.vue's
    // handleActivate) - the single toolbar above (Eraser/Pencil/Undo/Redo/
    // Export/Import) acts on THIS frame, since every card's per-instance
    // toolbar is now hidden (hideToolbar on the pixel-editor below) in favor
    // of this one shared row. Holds the component instance itself (not just
    // an id), so the toolbar's buttons can call straight into its exposed
    // setTool/undo/redo/handleExportImage/handleImportImage methods.
    // activeAnimationId/activeFrameId (plain ids, not the objects
    // themselves) are what isFrameActive below compares against to draw the
    // "you're editing this one" outline - frame ids are only unique WITHIN
    // that animation (see handleAddFrame's getMaxId, scoped per
    // animation), so both ids are needed together to identify one frame
    // uniquely across the whole tab.
    const activeFrameEditor = ref(null);
    const activeAnimationId = ref(null);
    const activeFrameId = ref(null);
    const setActiveFrame = (editorInstance, animationId, frameId) => {
      activeFrameEditor.value = editorInstance;
      activeAnimationId.value = animationId;
      activeFrameId.value = frameId;
    };
    const isFrameActive = (animation, frame) =>
      activeAnimationId.value === animation.id && activeFrameId.value === frame.id;

    // Whether the given frame's outline should currently draw as the
    // app's usual "selected" blue (its card is the one actually selected
    // right now - see selectedAnimation below) or a neutral grey (it's
    // still the frame the shared toolbar would act on - see
    // effectiveFrameEditor below - but its card was deselected, e.g. by
    // clicking outside every card) - confirmed as the wanted behavior
    // directly: deselecting shouldn't erase which frame is "active" (the
    // toolbar keeps acting on it), just stop implying that frame's whole
    // CARD is still the selected one.
    const frameHighlightState = (animation, frame) => {
      if (!isFrameActive(animation, frame)) return null;
      return selectedAnimation.value && selectedAnimation.value.id === animation.id ? 'blue' : 'grey';
    };

    // Unique per animation+frame (frame ids are only unique WITHIN their
    // animation - see handleAddFrame's getMaxId) - used as this frame's
    // PixelEditor.vue $ref name (see the template) so effectiveFrameEditor
    // (declared further below, once selectedAnimation itself exists) can
    // resolve straight to its component instance.
    const pixelEditorRefKey = (animation, frame) => `pixelEditor_${animation.id}_${frame.id}`;

    // Same fields as PixelEditor.vue's height-menu state, now living
    // here instead, since the menu itself moved to this shared toolbar - and
    // now always resizes every frame on the selected card together (see
    // selectedAnimation's  comment), so there's no separate "apply to
    // every frame" opt-in left to track.
    const heightMenuVisible = ref(false);
    const heightMenuValue = ref(0);
    const heightMenuScaleContents = ref(false);
    const openHeightMenu = () => {
      if (!selectedAnimation.value) return;
      heightMenuValue.value = selectedAnimation.value.frames[0].pixels.length;
      heightMenuScaleContents.value = false;
    };
    // The "H" hotkey (see GraphicEditorToolbar.vue's handleToolHotkey) -
    // openHeightMenu alone only prefills the dialog's fields, since normally
    // it's v-dialog's activator wiring (v-bind="attrs" v-on="on" on the
    // "Set height" button) that actually flips heightMenuVisible on; a
    // hotkey has no activator click to piggyback on, so this does both.
    const handleSetHeightHotkey = () => {
      if (!selectedAnimation.value) return;
      openHeightMenu();
      heightMenuVisible.value = true;
    };
    // Set height can be undone: every frame's rows and row colors as they were before and after.
    const heightSnapshot = (animation) => structuredClone(animation.frames.map(({id, pixels, rowColors}) => ({id, pixels, rowColors})));
    const restoreHeight = (animationId, snapshot) => {
      const current = state.value.animations.find((candidate) => candidate.id === animationId);
      if (!current) return;
      structuredClone(snapshot).forEach((saved) => {
        const frame = current.frames.find((candidate) => candidate.id === saved.id);
        if (!frame) return;
        frame.pixels = saved.pixels;
        frame.rowColors = saved.rowColors;
      });
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const handleUnifiedSetHeight = () => {
      const animation = selectedAnimation.value;
      if (!animation) return;
      heightMenuValue.value = Math.max(1, Math.min(128, heightMenuValue.value || 0));
      const before = heightSnapshot(animation);
      animation.frames.forEach((frame) => {
        // Scaling the contents scales each row's color along with its pixels.
        if (heightMenuScaleContents.value && frame.rowColors) {
          frame.rowColors = scaleRowColors(frame.rowColors, frame.pixels.length, heightMenuValue.value);
        }
        frame.pixels = resizePixelMatrixHeight(frame.pixels, heightMenuValue.value, widthOfAnimation(animation), heightMenuScaleContents.value);
      });
      const after = heightSnapshot(animation);
      const animationId = animation.id;
      recordReorder({
        undo: () => restoreHeight(animationId, before),
        redo: () => restoreHeight(animationId, after),
        isCurrent: () => state.value.animations.some((candidate) => candidate.id === animationId),
      });
      handleChildChange();
      instance.proxy.$forceUpdate();
      heightMenuVisible.value = false;
    };

    const playerStorage = props.storageFactory();
    const state = computed({
      get() {
        try {
          const player = processPlayerAnimationsStorageDefaults(playerStorage);
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
          // started at id 0 (see handleAddAnimation's  comment) - shifts
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
          console.error('Error loading player animations from local storage', e);
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

    // A frame lasts at least one video frame, however many are typed in.
    const handleFrameDurationChange = (frame) => {
      frame.duration = clampFrameDuration(frame.duration);
      handleChildChange();
    };

    // The card the shared "Set height" tool actually acts on - null (and the
    // tool disabled) until a card is selected. Deliberately keyed off
    // selectedCardId (the same "which card am I looking at" marker every
    // other tab click already updates - see selectCard/deselectCard above),
    // not activeFrame/activeFrameEditor (the last frame actually clicked
    // INTO to draw/undo/etc.) - a resize is a whole-card action (every frame
    // on the card is set to the same height together, no per-frame choice),
    // so it should track the card the user is looking at, not risk staying
    // pointed at a stale frame from a DIFFERENT card that was merely drawn
    // on earlier and never explicitly deselected.
    const selectedAnimation = computed(
        () => state.value.animations.find((animation) => animation.id === selectedCardId.value) || null);

    // What the shared toolbar (Eraser/Pencil/Undo/Redo/Export/Import) above
    // actually acts on - the explicitly-clicked-into frame (activeFrameEditor)
    // when it still belongs to the currently SELECTED animation, otherwise
    // the selected animation's first frame, resolved via its $ref.
    // Without this fallback, the tools stayed disabled (and the "which frame"
    // outline never appeared) until a graphic was clicked directly - reported
    // as unexpected, since selecting a card (clicking its title/name field/
    // anywhere else in it) already conveys "I'm working on this one" the same
    // way every other per-card tool in this app already treats it. (Declared
    // here, not alongside activeFrameEditor above, purely for readability -
    // it reads selectedAnimation, so it makes more sense sitting next to it.)
    const effectiveFrameEditor = computed(() => {
      if (activeFrameEditor.value && selectedAnimation.value && activeAnimationId.value === selectedAnimation.value.id) {
        return activeFrameEditor.value;
      }
      if (selectedAnimation.value && selectedAnimation.value.frames.length) {
        const firstFrame = selectedAnimation.value.frames[0];
        const refs = instance.proxy.$refs[pixelEditorRefKey(selectedAnimation.value, firstFrame)];
        // Vue 2 returns an array for a ref name reused across a v-for
        // iteration - not the case here (this key is unique per frame), but
        // guarding it anyway costs nothing and avoids a subtle crash if that
        // ever changes.
        return Array.isArray(refs) ? refs[0] || null : refs || null;
      }
      return null;
    });

    // Every card starts collapsed on every visit to this tab (see
    // collapseAll's  comment in hooks/collapse.js), not just ones never
    // expanded before.
    const {isCollapsed, toggleCollapsed, collapseAll, remapIds: remapCollapsedIds} = useCollapsedIds(props.name, true);
    collapseAll();

    // The animations are numbered by their place (see utils/card-refs.js): after a move or a delete each keeps what the tab holds by
    // number (collapsed, selected, being edited) under its new number.
    const renumbered = (idMap) => {
      remapSelectedIds(idMap);
      remapCollapsedIds(idMap);
      if (activeAnimationId.value !== null && idMap.has(activeAnimationId.value)) {
        activeAnimationId.value = idMap.get(activeAnimationId.value) === REMOVED ? null : idMap.get(activeAnimationId.value);
      }
      if (importMenuOpenAnimationId.value !== null && idMap.has(importMenuOpenAnimationId.value)) {
        importMenuOpenAnimationId.value = idMap.get(importMenuOpenAnimationId.value) === REMOVED ?
          null : idMap.get(importMenuOpenAnimationId.value);
      }
    };

    // Card reordering - same hook/pattern as Text/SoundFX/Data/Music/
    // Background (see hooks/drag-reorder.js's  comment). The blocks, data table cells and title screen players that pick an animation
    // hold its place in the list: they follow it to the new place.
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.animations,
        (items) => {
          state.value.animations = items;
          handleChildChange();
        },
        getSelectedFullIndices,
        {sideBySide: () => cardColumns.value, renumber: {kind: 'animation', onRenumbered: renumbered}},
    );

    // Folders for the cards (see hooks/card-folders.js and components/CardFolderBar.vue): the animations keep their numbers and their place in
    // the one list, a folder is only for looking after them. The folders are `folders` of the storage, the folder an animation is in its `folder`.
    const foldersOf = () => {
      const player = state.value;
      if (!Array.isArray(player.folders)) player.folders = [];
      return player.folders;
    };
    const refresh = () => {
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const {openFolderId, visibleEntries, openFolder, newCardFolder, handleAddFolder, handleDeleteFolder, draggingCardIndex, wrapHandleListeners, handleDropCards} =
      useCardFolders({
        getCards: () => state.value.animations,
        getFolders: foldersOf,
        setFolders: (folders) => {
          state.value.folders = folders;
        },
        refresh,
        getSelectedIndices: getSelectedFullIndices,
        deselectCard,
        tab: 'sprites',
      });
    const cardHandleListeners = wrapHandleListeners(dragHandleListeners);

    // Frame reordering: one drag-reorder instance per animation, made on
    // first use (the hook is per list), dropping a frame onto another moves
    // it to that position. Frame ids don't change, so the selected frame
    // stays selected.
    const frameDragByAnimationId = new Map();
    const frameDrag = (animation) => {
      // Looked up again on every drop: the stored state can be rebuilt between renders.
      const currentAnimation = () => state.value.animations.find(({id}) => id === animation.id) || animation;
      // Kept by the animation itself, not its number, which changes when the animations are numbered again.
      if (!frameDragByAnimationId.has(animation)) {
        frameDragByAnimationId.set(animation, useDragReorder(
            () => currentAnimation().frames,
            (items) => {
              currentAnimation().frames = items;
              handleChildChange();
            },
        ));
      }
      return frameDragByAnimationId.get(animation);
    };

    // The frame's drag listeners: the hook's, plus showing the whole frame as the thing being dragged.
    // Any part of a frame that isn't the drawing, a field, a button or the row
    // color strip starts a drag: the frame only becomes draggable while the
    // mouse is pressed on such a part (a draggable frame all the time would turn
    // dragging over its labels into dragging the frame instead of selecting text).
    const FRAME_DRAG_BLOCKED = 'canvas, input, textarea, select, button, a, .v-input, .v-btn, .playfield-color-strip';
    const armedFrameKey = ref(null);
    const frameKey = (animation, frame) => `${animation.id}:${frame.id}`;
    const armFrameDrag = (event, animation, frame) => {
      armedFrameKey.value = event.button === 0 && !event.target.closest(FRAME_DRAG_BLOCKED) ?
        frameKey(animation, frame) : null;
    };
    const frameHandleListeners = (animation, frameIndex) => {
      const listeners = frameDrag(animation).dragHandleListeners(frameIndex);
      return {
        dragend: (event) => {
          armedFrameKey.value = null;
          listeners.dragend(event);
        },
        dragstart: (event) => {
          // Not a drag that started from a frame's drag area (say, dragged text).
          if (!armedFrameKey.value) return;
          listeners.dragstart(event);
          const frameBox = event.currentTarget.closest('.pixel-editor-container');
          if (frameBox && event.dataTransfer.setDragImage) {
            const box = frameBox.getBoundingClientRect();
            event.dataTransfer.setDragImage(frameBox, event.clientX - box.left, event.clientY - box.top);
          }
        },
      };
    };

    const handleAddFrame = (animation) => {
      const frames = animation.frames;
      const maxId = getMaxId(frames);
      // With a frame selected in this animation, the new frame is a copy of
      // that one, placed right after it; otherwise it copies the last frame
      // (a copy, so editing it does not change the frame it came from) and
      // goes at the end, falling back to an empty grid when there are no
      // frames yet.
      const selectedIndex = activeAnimationId.value === animation.id ?
        frames.findIndex((frame) => frame.id === activeFrameId.value) : -1;
      const previousFrame = selectedIndex >= 0 ? frames[selectedIndex] : frames[frames.length - 1];
      const pixels = previousFrame ?
        structuredClone(previousFrame.pixels) :
        Array.from({length: 8}, () => Array(widthOfAnimation(animation)).fill(0));
      const newFrame = {
        id: maxId+1,
        duration: selectedIndex >= 0 ? previousFrame.duration : 10,
        pixels,
        // Copied the same "previous frame, or nothing" way as pixels just
        // above - a brand new frame with no previous one to copy from just
        // gets ensureRowColors'  default fill (run on the next
        // state.value read) instead of an explicit empty array here.
        ...(previousFrame && previousFrame.rowColors ?
          {rowColors: structuredClone(previousFrame.rowColors)} : {}),
      };

      if (selectedIndex >= 0) frames.splice(selectedIndex + 1, 0, newFrame);
      else frames.push(newFrame);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Imports batari Basic sprite files (see parseSpriteFile) as frames, one per file, in file name order: appended after the
    // animation's frames, or replacing them like the image import does. A file 16 pixels wide makes the animation wide.
    const handleImportSpriteFiles = (animation) => {
      openFileDialogMultiple('.spr,.txt,.bas').then((files) => {
        if (!files.length) return;
        const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
        return Promise.all(ordered.map((file) => file.text().then((text) => ({file, sprite: parseSpriteFile(text)}))))
            .then((results) => {
              const sprites = results.filter((result) => result.sprite);
              if (!sprites.length) {
                errorStorage.value = 'Import .spr files: no sprite rows (player0: %01...) found in the selected files.';
                return;
              }
              if (sprites.some((result) => result.sprite.width === 16)) {
                if (!('wide' in animation)) Vue.set(animation, 'wide', false);
                setAnimationWide(animation, true);
              }
              const width = widthOfAnimation(animation);
              const keptFrames = replaceFramesOnImport.value ? [] : animation.frames;
              let nextId = getMaxId(keptFrames) + 1;
              const newFrames = sprites.map(({sprite}) => ({
                id: nextId++, duration: 10, pixels: resizeRowsToWidth(sprite.pixels, width)}));
              animation.frames = [...keptFrames, ...newFrames];
              handleChildChange();
              instance.proxy.$forceUpdate();
            });
      });
    };

    // Whether "Import animation frames" replaces this animation's existing
    // frames instead of appending after them - one shared toggle (not
    // per-animation), read fresh at click time by handleImportAnimationFrames
    // below, same "module-scope ref, not per-instance state" reasoning as
    // copiedFrameData/copiedFrameRowColors above: there's only ever one
    // import happening at a time, so a single shared preference is simpler
    // than tracking it per animation card for no real benefit.
    const replaceFramesOnImport = ref(false);
    // With "Replace frames" on, whether the new frames keep the row colors of the frames they replace.
    const keepColorsOnImport = ref(false);

    // Which animation's "Import animation frames" popover is currently
    // open, by id (null when none is) - drives the menu's :value/@input
    // below instead of leaving it to Vuetify's default click-toggle
    // (activator slot's "on"), specifically so "Choose images..." can close
    // it immediately, right as the OS file picker takes over, rather than
    // leaving it sitting open (and now stale/pointless) behind that native
    // dialog until the user clicks elsewhere afterward.
    const importMenuOpenAnimationId = ref(null);

    // Converts one loaded image into this animation's  frame pixel
    // format - width is always forced to 8 (the fixed player-sprite width;
    // see the pixel-editor's :width="8" above, not something a frame
    // can individually override), height auto-sized to the image's
    // resolution (clamped 1-64, same range/rounding as PixelEditor.vue's
    // handleImportImage, which this otherwise mirrors exactly -
    // on/off threshold included, so a batch import looks the same as
    // importing each frame one at a time through that existing button
    // would have).
    // The actual canvas-pixels-to-frame-matrix conversion, factored out of
    // imageToFramePixels below so handleImportAsepriteSheet's per-frame
    // cropped canvases (see createCroppedResizedCanvas) can reuse the exact
    // same on/off threshold instead of duplicating it.
    const canvasToFramePixels = (canvas, width = 8) => {
      const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const imgPixels = imageData.data;
      const pixelValues = [];
      for (let i = 0, n = imgPixels.length; i < n; i += 4) {
        const r = imgPixels[i];
        const g = imgPixels[i + 1];
        const b = imgPixels[i + 2];
        pixelValues.push((r + g + b) / 3);
      }
      return chunk(pixelValues.map((v) => v > 32 ? 1 : 0), width);
    };

    const imageToFramePixels = (img, width = 8) => {
      const targetHeight = Math.min(128, Math.max(1, Math.round(img.height)));
      const canvas = createResizedCanvas(img, width, targetHeight);
      return canvasToFramePixels(canvas, width);
    };

    // Imports several image files at once as new animation frames, in one
    // shot - one image per frame, ordered by sortImportedAnimationFrameFiles
    // (numbered filenames first, else selection order). replaceFramesOnImport
    // decides whether these land alongside this animation's existing frames
    // or replace them outright - read fresh here (not captured earlier),
    // matching how every other live toggle in this app is read at the
    // moment it's actually used.
    const handleImportAnimationFrames = (animation) => {
      openFileDialogMultiple('image/*').then((files) => {
        if (!files.length) return;
        const orderedFiles = sortImportedAnimationFrameFiles(files);
        return Promise.all(orderedFiles.map((file) => loadImageFromFile(file).then((img) => imageToFramePixels(img, widthOfAnimation(animation)))))
            .then((pixelMatrices) => {
              const keptFrames = replaceFramesOnImport.value ? [] : animation.frames;
              let nextId = getMaxId(keptFrames) + 1;
              let newFrames = pixelMatrices.map((pixels) => ({id: nextId++, duration: 10, pixels}));
              if (replaceFramesOnImport.value && keepColorsOnImport.value) {
                newFrames = carryOverFrameColors(animation.frames, newFrames);
              }
              animation.frames = [...keptFrames, ...newFrames];
              handleChildChange();
              instance.proxy.$forceUpdate();
            });
      });
    };

    // Whether "Import from Aseprite" overwrites an existing animation that
    // shares a new frameTag's name, instead of adding it as a separate
    // animation alongside - one shared toggle, same "there's only ever one
    // import happening at a time" reasoning as replaceFramesOnImport above.
    const asepriteReplaceAnimations = ref(false);
    const asepriteImportMenuOpen = ref(false);

    const errorStorage = useErrorStorage();

    const readFileAsText = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });

    // Imports an Aseprite "Export Sprite Sheet" (File > Export Sprite
    // Sheet in Aseprite) .json plus its sprite strip image as one or more
    // whole new animations - one per frameTag in the .json, in that tag's
    // frame order/direction, each frame cropped straight out of the
    // strip image at the .json's recorded rectangle and its duration
    // converted from Aseprite's milliseconds to this app's NTSC-frame count
    // (see utils/aseprite.js). Only offered on this tab (see
    // GraphicEditorToolbar.vue's "extra-tools" slot) - Background/Title/
    // Score/Text have no concept of a multi-pose animation a frameTag could
    // map onto.
    const handleImportAsepriteSheet = () => {
      openFileDialogMultiple('.json,image/*').then((files) => {
        if (!files.length) return;
        const jsonFile = files.find((file) => file.name.toLowerCase().endsWith('.json'));
        if (!jsonFile) {
          errorStorage.value = 'Import from Aseprite: select both the sprite sheet\'s .json file and its image.';
          return;
        }
        const imageFiles = files.filter((file) => file !== jsonFile);

        readFileAsText(jsonFile).then((text) => {
          let sheet;
          try {
            sheet = parseAsepriteSheet(JSON.parse(text));
          } catch (err) {
            errorStorage.value = `Import from Aseprite: ${escapeHtml(err.message)}.`;
            return;
          }
          if (!sheet.tags.length) {
            errorStorage.value = 'Import from Aseprite: the .json has no frame tags (animations) to import.';
            return;
          }
          // Matches by the filename the .json itself references
          // (meta.image) when it's among the selected files; falls back to
          // whichever single non-.json file was picked otherwise, so
          // selecting just the two files Aseprite actually produced always
          // works even if the image got renamed since export.
          const imageFile = imageFiles.find((file) => file.name === sheet.imageName) || imageFiles[0];
          if (!imageFile) {
            errorStorage.value = 'Import from Aseprite: couldn\'t find the sprite strip image among the selected files.';
            return;
          }

          loadImageFromFile(imageFile).then((img) => {
            const existingByName = new Map(state.value.animations.map((animation) => [animation.name, animation]));
            sheet.tags.forEach((tag) => {
              let nextFrameId = 1;
              const frames = tag.frameIndexes.map((frameIndex) => {
                const sourceFrame = sheet.frames[frameIndex];
                const targetHeight = Math.min(128, Math.max(1, Math.round(sourceFrame.h)));
                const canvas = createCroppedResizedCanvas(
                    img, sourceFrame.x, sourceFrame.y, sourceFrame.w, sourceFrame.h, 8, targetHeight);
                return {id: nextFrameId++, duration: sourceFrame.durationFrames, pixels: canvasToFramePixels(canvas)};
              });

              const existing = asepriteReplaceAnimations.value ? existingByName.get(tag.name) : null;
              if (existing) {
                existing.frames = frames;
              } else {
                const newAnimation = {id: getMaxId(state.value.animations) + 1, name: tag.name, frames};
                state.value.animations.push(newAnimation);
                existingByName.set(tag.name, newAnimation);
              }
            });
            handleChildChange();
            instance.proxy.$forceUpdate();
          });
        });
      });
    };

    const handleDeleteFrame = (animation, frame) => {
      animation.frames = animation.frames.filter(({id}) => id != frame.id);
      console.info('Deleted ', frame);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // A single blank frame, not a copy of the previous animation's
    // frames - confirmed as the wanted behavior directly: a brand new
    // animation starting pre-filled with an unrelated animation's entire
    // frame set (every frame, every pose) meant deleting all of them by
    // hand was the normal first step before drawing anything new, every
    // time. Same empty 8x8 grid handleAddFrame's "no frames yet"
    // fallback uses, so a fresh animation's first frame looks the same
    // either way it was reached.
    const handleAddAnimation = () => {
      const newAnimation = {
        // Starts at 0 (not getMaxId's +1, which would start the very
        // first animation at 1) - only for the FIRST animation, where
        // getMaxId's "no elements yet" fallback of 0 would otherwise
        // still read as "id 1 is next". Every animation after that keeps
        // incrementing off the real max exactly as before.
        id: state.value.animations.length ? getMaxId(state.value.animations) + 1 : 0,
        ...newCardFolder(),
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
      };
      state.value.animations.push(newAnimation);
      // Every card on this tab defaults to collapsed (see useCollapsedIds'
      // "true" default above), but a card the user just this moment
      // created should still open right away, so they can see/start
      // drawing its first frame immediately instead of having to expand it
      // themselves first. ensureExpanded (used elsewhere purely to stop a
      // brand new entry from inheriting a REUSED id's  stale override)
      // isn't enough here by itself - it only clears an existing override,
      // it doesn't fight the "true" default this tab now has, so a
      // never-before-seen id would still read as collapsed. toggleCollapsed
      // instead flips (and explicitly stores) this exact id's  state
      // starting from whatever isCollapsed currently resolves to (the
      // collapsed default, for a brand new id), landing on expanded.
      toggleCollapsed(newAnimation);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Builds and loads a throwaway ROM where Player 0 plays just this
    // animation (see buildPlayerAnimationPreviewRom).
    const testingId = ref(null);
    const buildInProgress = useBuildInProgress();
    const handleTestAnimation = async (animation) => {
      if (buildInProgress.value) return;
      testingId.value = animation.id;
      try {
        // Horizontally the middle of the lit pixels over all frames, so the
        // drawing (not the 8 pixel wide box) is centered; vertically the middle
        // of the sprite's height (its tallest frame), so empty rows at the top
        // or bottom count and the sprite doesn't jump between frames.
        let minX = widthOfAnimation(animation); let maxX = -1;
        animation.frames.forEach((frame) => (frame.pixels || []).forEach((row) => row.forEach((on, x) => {
          if (!on) return;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        })));
        const rows = Math.max(...animation.frames.map((frame) => (frame.pixels || []).length), 1);
        await buildPlayerAnimationPreviewRom(state.value.animations.indexOf(animation),
            maxX < 0 ? widthOfAnimation(animation) / 2 : (minX + maxX + 1) / 2, rows,
            animation.previewWidthScale || 1,
            // The animation's row colors show even when the Options tab's per-row sprite colors are off.
            animation.frames.some((f) => f.rowColors && f.rowColors.some((c) => c != null && c !== DEFAULT_ROW_COLOR)),
            animation.name);
      } finally {
        testingId.value = null;
      }
    };

    // A copy of an animation (every frame, with its pixels, row colors and
    // duration) added at the end of the list under a new id, so no existing
    // animation number or block that uses one changes.
    const handleDuplicateAnimation = (animation) => {
      const copy = JSON.parse(JSON.stringify(animation));
      copy.id = getMaxId(state.value.animations) + 1;
      copy.name = `${animation.name || 'Animation'} copy`;
      state.value.animations.push(copy);
      // Opened right away, like a newly added animation.
      toggleCollapsed(copy);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteAnimation = (animation) => {
      // (At least one animation is kept: the ids are of the cards listed, so the whole list is counted here.)
      let doomed = idsToDelete(animation.id);
      if (doomed.length >= state.value.animations.length) doomed = doomed.slice(1);
      const {remaining, idMap} = removeCards('animation', state.value.animations, doomed);
      state.value.animations = remaining;
      if (idMap) renumbered(idMap);
      if (doomed.length > 1) deselectCard();
      console.info('Deleted ', animation);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Preview-only display setting (see the toggle's  template comment) -
    // stored on the animation itself, not a separate zoom-style hook, since
    // it's meant to persist with the project the same way every other
    // animation/frame property here already does, unlike the Player 0/1
    // zoom level, which deliberately resets every reload.
    // Makes the animation 16 pixels wide or 8 again (DPC+): every frame's rows get 8 empty pixels on their right, or lose
    // their right 8 pixels.
    const handleSetWide = (animation, wide) => {
      if (!('wide' in animation)) Vue.set(animation, 'wide', false);
      setAnimationWide(animation, wide);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleSetPreviewScale = (animation, scale) => {
      animation.previewWidthScale = scale;
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Same reasoning/mechanism as BackgroundEditor's  handleRowColorsInput.
    const setRowColors = (frame, colors) => {
      frame.rowColors = colors;
      handleChildChange();
      // The pixel editor holds its  display state, so persisting isn't
      // enough to repaint the preview - force a re-render so it receives the
      // updated row colors and recolors its canvas.
      instance.proxy.$forceUpdate();
    };
    // A change made by the user (the color strip, Clear, Paste) can be undone; moving selected
    // pixels takes the row colors along through the pixel editor's history instead.
    const handleRowColorsInput = (frame, colors) => {
      recordRowColorsChange(frame, setRowColors, colors);
    };

    // Moving selected pixels with the Move tool takes the colors of their rows along
    // (PixelEditor.vue's 'move-rows' event - see utils/row-color-move.js).

    const handleMoveRows = (frame, move) => {
      if (!spriteColorsEnabled.value) return;
      const colors = rowColorsForMove(frame, move);
      if (colors) setRowColors(frame, colors);
    };

    // Clearing a frame (PixelEditor.vue's "clear" event, separate from
    // an ordinary pixel edit) resets its row colors back to the same
    // default every row starts at, rather than leaving old per-row picks
    // behind on an otherwise blank frame.
    // Turning the whole frame upside down turns its row colors with it (one step for Undo, see recordRowColorsChange).
    const handleFlipRowColors = (frame) => {
      if (!spriteColorsEnabled.value || !frame.rowColors) return;
      handleRowColorsInput(frame, frame.rowColors.slice().reverse());
    };
    const handleClearRowColors = (frame) => {
      if (!spriteColorsEnabled.value || !frame.rowColors) return;
      handleRowColorsInput(frame, clearRowColors(frame.rowColors));
    };

    // Copies/pastes a frame's ENTIRE row-color list at once (not one row at
    // a time) - same "copy this whole thing, paste it onto another" pattern
    // as MusicEditor's  handleCopyTrack/handlePasteTrack for an
    // instrument's notes. Pasting doesn't resize the target frame's
    // list to match the source's length - handleRowColorsInput->
    // ensureRowColors (run on the next state.value read, same as every
    // other frame mutation here) reconciles it to the target frame's
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
    // above) is the one place row colors ever move by themselves; this pair
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
      const saveAndRedraw = () => {
        handleChildChange();
        instance.proxy.$forceUpdate();
      };
      // Can be undone (see recordFieldsChange): the history of the pixel editor does not see a pasted image.
      recordFieldsChange([{owner: frame, fields: ['pixels', 'rowColors']}], () => {
        frame.pixels = structuredClone(copiedFrameData.value.pixels);
        if (spriteColorsEnabled.value && copiedFrameData.value.rowColors) {
          frame.rowColors = structuredClone(copiedFrameData.value.rowColors);
        }
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };

    // Same reasoning/mechanism as BackgroundEditor's  editorRowColors.
    const editorRowColors = (frame) => {
      if (!spriteColorsEnabled.value || !frame.rowColors) {
        return null;
      }
      return frame.rowColors.map((byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      });
    };

    return {selectedCardId, selectedCardIds, selectCard, deselectCard, deleteQuestion,
      state, handleChildChange, handleFrameDurationChange,
      handleAddFrame, handleDeleteFrame,
      handleImportAnimationFrames, replaceFramesOnImport, keepColorsOnImport, importMenuOpenAnimationId,
      handleImportAsepriteSheet, asepriteReplaceAnimations, asepriteImportMenuOpen,
      handleAddAnimation, handleDeleteAnimation, handleDuplicateAnimation, handleSetPreviewScale, handleSetWide, handleImportSpriteFiles,
      widthOfAnimation, isDpcPlus,
      testingId, buildInProgress, handleTestAnimation,
      handleRowColorsInput, handleMoveRows, handleFlipRowColors, handleClearRowColors, editorRowColors, spriteColorsEnabled,
      copiedFrameRowColors, handleCopyRowColors, handlePasteRowColors,
      copiedFrameData, handleCopyFrame, handlePasteFrame,
      spriteColorPalette, selectedQuickColor,
      isCollapsed, toggleCollapsed,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners, frameDrag, frameHandleListeners,
      visibleEntries, foldersOf, openFolderId, openFolder, refresh, handleAddFolder, handleDeleteFolder, handleDropCards, draggingCardIndex, cardHandleListeners,
      folderToolbar, folderToolbarHeight, folderToolbarPinned,
      armedFrameKey, frameKey, armFrameDrag,
      zoom, playerZoomLevels: PLAYER_ZOOM_LEVELS, showPixelGrid, showPixelGridLabels, cardColumns, cardColumnMin, editorWidth, frameEditorWidth,
      activeFrameEditor, setActiveFrame, isFrameActive, frameHighlightState, selectedAnimation,
      effectiveFrameEditor, pixelEditorRefKey,
      heightMenuVisible, heightMenuValue, heightMenuScaleContents,
      openHeightMenu, handleUnifiedSetHeight, handleSetHeightHotkey,
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

/* v-list-item's  default 0 16px padding stacks on top of v-card-text's,
   pushing everything in each row (name field and frame editors alike) in
   further than the Score tab's graphic cards, which sit directly in a
   v-card-text with no list-item wrapper. Zeroing both sides (not just left,
   as this used to) brings the whole row back to Score's left/right
   edges evenly, instead of the right edge sitting 16px further in than the
   left. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

/* Same fix, and matching 8px/12px values, as BackgroundEditor.vue's
   .background-list/.entry-list-item rules - v-list-item__content's default
   12px top/bottom padding was adding extra space BETWEEN cards beyond
   anything explicitly set (there was no explicit gap at all before), so
   this tab's animation-card spacing didn't match the Background tab's.
   flex+gap here plays the same role .background-list's CSS grid gap
   does (this tab stays single-column, so grid itself isn't needed) -
   margin-top puts back the space above the FIRST card that zeroing
   v-list-item__content's padding would otherwise have also removed. */
/* The folders stay at the top of the tab when it scrolls, across its full width like the toolbars of the other tabs (the tab's 16px of padding is
   cancelled and put back); the toolbar of the graphics sticks just under them. */
.sprite-folder-toolbar {
  position: sticky;
  top: 0;
  z-index: 3;
  background-color: #fff;
  margin-left: -16px;
  margin-right: -16px;
  /* 2px above the folders (in padding: a margin of the bar would run into the negative margin above), so they are as far under the label of the tab as
     the toolbar of the Playfield tab is. */
  padding: 2px 16px 0;
  --toolbar-bleed: 16px;
}

.sprite-folder-toolbar >>> .card-folder-bar {
  margin-top: 0;
}

/* Room above the folders when they are pinned: as far from the top of the tab as the Text tab's are. Not before, so they are as far under the label
   of the tab as the toolbar of the Playfield tab is. */
.sprite-folder-toolbar.folder-toolbar-pinned {
  padding-top: 10px;
}

/* As far from the line of the folders to the icons under it as from the icons to the line under them: the room is in the padding of the toolbar
   under the folders, not a margin between the two (a margin let what scrolls behind show between them while they are pinned). */
.sprite-folder-toolbar + .graphic-editor-toolbar {
  padding-top: 8px;
}
/* Pinned: the toolbar overlaps the folders by a pixel, so it has that pixel more above the icons: as far above them as below. */
.sprite-folder-toolbar + .graphic-editor-toolbar.graphic-editor-toolbar-scrolled {
  padding-top: 11px;
}

.desaturate-app-colors .sprite-folder-toolbar {
  background-color: #e1e1e1;
}

.animation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Tighter than the 12px this used to match (BackgroundEditor.vue's
     .background-list) - the toolbar row directly above (unique to this
     tab, added later) already has its top/bottom padding, so the old
     12px on top of that read as too much combined space before the first
     card. */
  margin-top: 4px;
}

/* Several columns of cards when the window is wide enough: each card at least as wide as its frames need to be useful. */
.animation-list-columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--sprite-card-min, 520px)), 1fr));
  align-items: start;
}

/* A frame editor wider than its card (a very wide animation, or the list narrower than one column) shrinks to the card. */
.animation-list-columns .pixel-editor-parent-container,
.animation-list-columns .pixel-editor-container {
  max-width: 100%;
}

/* A real <v-list> (unlike Title screen's equivalent .titlescreen-frame-list,
   a plain div), so it carries Vuetify's default 8px top/bottom padding
   unless stripped - stacking on top of .animation-card's 12px bottom
   padding below, leaving noticeably more space under the last frame than
   the same card's edges elsewhere (confirmed as a real reported bug). */
.animation-frame-list {
  padding: 0;
  /* 8px under the 1x/2x/4x and 8px/16px buttons above. */
  margin-top: 8px;
}

.pixel-editor-container {
  position: relative;
  padding-top: 8px;
}

/* Frames sit side by side, so the drop mark is a bar on the near side (left
   of the frame dragged over, or right of it when the dragged frame comes from
   before it and so lands after it) instead of the cards' bar on top. */
.pixel-editor-parent-container.drag-reorder-over {
  border-top: none !important;
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.pixel-editor-parent-container.drag-reorder-over.drag-reorder-over-after {
  border-left: none !important;
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* A frame is grabbed anywhere except the drawing, its fields and buttons. */
.pixel-editor-container {
  cursor: grab;
}

/* overflow: visible added alongside the padding reset (see MusicEditor.vue's
   identical fix) - stops this element's default "overflow: hidden" from
   clipping a selected card's 2px outline - min-width: 0 has to come
   with it (same comment there for the full explanation): overflow: visible
   silently undoes a flex item's default 0 min-width, letting it refuse
   to shrink below its widest content instead of the tab's width. */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}

/* Same rounded, thin-bordered look as the Sound/Data/Text/Music tabs'
   per-item cards (e.g. SoundFXEditor's .soundfx-card) - wraps directly
   around the existing title/frames-list content rather than switching to a
   v-card-text section like those tabs use, so the change is just the
   border; padding here replaces the internal spacing a v-card-text would
   otherwise have provided. */
/* width: 100% - same fix as BackgroundEditor.vue's identical
   .background-card rule: without it, this card (nested inside
   v-list-item-content, not the list item itself) shrinks to its
   content's natural width instead of filling its row, so a collapsed
   animation (just the title row) rendered narrower than an expanded one
   (whose frames force wider content). */
.animation-card {
  position: relative;
  width: 100%;
  padding: 12px;
}

/* Only this top strip is draggable (see hooks/drag-reorder.js's
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
     background shade than .animation-id-badge's card - the same
     opacity (0.6) read lighter here, so it's bumped up to actually match. */
  opacity: 0.75;
  /* Pulls it up out of v-card-text's default 16px top padding - full padding
     above this first line of text read as too much empty space. */
  margin-top: -8px;
}

/* Nudges the row-color sidebar and sprite canvas down a few pixels, so
   neither sits flush against the copy/paste/delete icon row directly above
   (those buttons are absolutely positioned over this same top corner, so
   they don't otherwise push this content down by themselves). */
.pixel-editor-parent-container >>> .editor-with-sidebar {
  margin-top: 6px;
}

/* Absolutely positioned (matching Text/SoundFX/Data/Music's  collapse
   button placement exactly) rather than flowed in a flex row alongside the
   ID badge - the row wrapper this used to sit in is gone; .animation-
   name-field's margin-top (below) makes room for both this and the
   badge to sit above it instead. */
.animation-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same placement/style as every other tab's "ID: N" badge (see
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
   it anymore. Matches .soundfx-name-field's margin-top (SoundFXEditor.vue)
   for consistent badge-to-name spacing across every tab.
   margin-bottom: -12px - this field isn't hide-details, so (like
   DataEditor.vue's Table name field) Vuetify already reserves a
   hint/error strip below it, but this one measured about 12px taller than
   Data's equivalent card ends up (confirmed against both real rendered
   cards while collapsed) - pulled back in to match that same gap exactly,
   rather than leaving this card noticeably taller than every other tab's
   for no visible reason. */
.animation-name-field {
  /* 8px under the buttons in the corner and 8px above what follows. */
  margin-top: 30px;
  margin-bottom: -13px;
}

/* Sits right after the name field, in the same normal-flow row as the rest
   of this card's header controls - small/dense to read as a minor display
   toggle, not a primary action competing with the name field or the
   delete button (absolutely positioned into the corner, see
   .delete-btn-inset, so it never overlaps this either). Left-aligned to 0,
   matching the sprite frame's left edge below
   (.pixel-editor-parent-container's "padding-left: 0") rather than the
   field's default Vuetify indent. A NEGATIVE top margin, not just a small
   positive one - the name field isn't hide-details, so Vuetify already
   reserves its ~18px hint/error-message strip below the input whether
   or not anything is actually showing there, which read as extra dead
   space stacking on top of any positive margin this toggle added of its
   ; pulling up into that reserved strip (rather than adding to it)
   closes the gap down to what's actually visible. */
.animation-preview-scale-toggle {
  margin: -14px 40px 0 0;
}

.animation-preview-scale-toggle >>> .v-btn {
  height: 24px !important;
  min-width: 32px !important;
  font-size: 11px;
}

/* Matches the app's  primary blue (already used for the "Add frame"/
   "Add animation" fab buttons and the drawing-tool active state right
   above), white text for contrast - Vuetify's v-btn-toggle default
   "selected" look (a faint grey tint, barely different from unselected)
   didn't read as clearly "this one's active" against the other two. */
.animation-preview-scale-toggle >>> .v-btn.v-btn--active {
  background-color: var(--v-primary-base, #1976d2) !important;
  color: #fff !important;
}

/* Holds the animation card's  corner buttons (Import animation frames,
   Delete) in one absolutely-positioned flex row, same shape/reasoning as
   .frame-corner-toolbar below (added first, for the frame-level buttons) -
   top/right match every other tab's delete corner button (see
   MusicEditor.vue's .music-toolbar-top-right) for a consistent corner
   position across every card type. */
.animation-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

/* The "Choose images..."/"Choose .json + image..." button and "Replace..."
   switch inside the Import animation frames/Import from Aseprite popovers -
   a fixed width so the popover reads as a small, deliberate control rather
   than stretching to fit whatever width v-menu's default sizing would give
   it. A flex column (not just a fixed width) is what actually guarantees
   the button lines up flush with this element's left/right padding -
   v-btn--block's width (min-width: 100% against the block-level box's
   auto width) was coming out WIDER than that padded content box, bleeding
   past it on one side (clipped by the popover card's overflow: hidden -
   see App.vue's ".v-menu__content > .v-card" rule), rather than landing
   flush - confirmed as a real reported "not enough margin on the left"
   bug. Flex-column + stretch sizes every child (the button included)
   to this exact content width instead, with no such mismatch possible.
   gap (not a margin-top on the button) is what spaces the two elements
   apart now, so it stays correct however they're ordered. */
.import-animation-menu {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Vuetify's v-switch carries a default margin-top: 16px (see
   .v-input--selection-controls in vuetify.css), which stacked on top of
   the flex gap above, making the space between the button and the switch
   noticeably bigger than the space between the switch and the card's
   bottom padding - confirmed as a real reported "space above/below the
   toggle doesn't match" bug. Zeroed here so the flex gap alone controls
   that spacing, same as it already does everywhere else in this card. */
.import-animation-menu >>> .v-input--selection-controls {
  margin-top: 0;
}

/* Wider than .import-animation-menu's shared 220px - "Choose .json +
   image..." is longer than that menu's "Choose images..." and was
   getting clipped/wrapped at that width. */
.import-aseprite-menu {
  width: 300px;
}

/* Holds every frame-level corner button (copy/paste frame, copy/paste
   colors, delete) in one absolutely-positioned flex row instead of each
   button computing its "right" offset by hand - the color buttons are
   only shown while per-row sprite colors is on (see their v-if), so a
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
   on one row - PixelEditor.vue's toolbar row wraps by design for
   narrower cards (see its comment), which was dropping Delete onto a
   lone second row by itself even at 100%. Forcing nowrap unconditionally
   broke the 50%/75% zoom levels instead, where the row genuinely is too
   narrow and needs to wrap - gating this on zoom keeps that case intact. */
.pixel-editor-container-wide >>> .pixel-editor-toolbar-row {
  flex-wrap: nowrap;
}

/* Marks which frame the shared toolbar above (Eraser/Pencil/Undo/Redo/
   Export/Import/Set height) currently acts on (see isFrameActive's
   comment) - same border-color + outline treatment as every other tab's
   "-selected" card highlight (App.vue's shared .animation-card-
   selected/.background-card-selected/etc. rule), reaching into THIS
   frame's PixelEditor.vue instance, which (unlike Background/Title's
   nested pixel editors) keeps its real outlined v-card border, since
   nothing here strips it the way .pixel-editor-container >>> .v-card is
   stripped on those other tabs. */
.pixel-editor-container-active >>> .v-card {
  border-color: var(--v-primary-base, #1976d2) !important;
  outline: 2px solid var(--v-primary-base, #1976d2) !important;
}

/* frameHighlightState's "grey" case - this frame is still what the
   shared toolbar acts on (its card was just deselected, e.g. by clicking
   outside every card), so the outline stays rather than disappearing
   outright, but recolors to the same neutral grey every outlined card
   border already uses at rest (App.vue's shared darkened outlined-card
   border rule) instead of implying the whole card is still selected. */
.pixel-editor-container-active-grey >>> .v-card {
  border-color: rgba(0, 0, 0, 0.24) !important;
  outline: 2px solid rgba(0, 0, 0, 0.24) !important;
}

/* .player-icon-btn-size's size/disabled-opacity/icon-font-size rules -
   see App.vue's shared, unscoped copy (moved there once confirmed
   byte-identical to BackgroundEditor.vue's duplicate of this exact
   class name - scoped CSS can't share a rule across components even under
   the same class name, so each tab using it still has to apply it here). */

/* editor-zoom and pixel-grid-toggle are separate components, each with
   their inline layout - a flex row keeps them on one visual line and
   vertically centered against each other regardless of either one's
   internal baseline/height quirks. */
/* The "Set height" button passed into GraphicEditorToolbar.vue's
   "after-tools" slot - that component only owns the sticky bar itself and
   the standard Eraser/Pencil/Undo/Redo/Export/Import icons (see its
   comment), not this tab-specific control, so its styling stays here.
   Rendered as part of THIS component's template (slot content keeps
   its origin component's scoped attribute even once teleported into a
   child's slot), so no ">>> ancestor-class" wrapper is needed to reach it
   the way PixelEditor.vue's per-card toolbar buttons need - just a
   plain deep selector for the parts Vuetify itself renders internally
   (the icon). */
/* !important on width/min-width - Vuetify's ".v-btn.v-size--small"
   default min-width (2-class selector) otherwise beats this rule's
   single-class specificity, leaving a much wider hit-box/padding around the
   icon than every other icon button in this toolbar - confirmed directly as
   the real cause of a reported "looks too far to the right" gap before the
   divider that follows this slot. */
.unified-toolbar-height-btn {
  width: auto !important;
  min-width: 0 !important;
  margin-left: -6px !important;
  padding: 0 2px;
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.55);
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Same rest/hover/press treatment as every icon in GraphicEditorToolbar.vue
   itself (its .get-tools >>> .v-btn rules) - this button previously
   fell back to Vuetify's default "text" button hover (a grey background
   overlay, not the flat color-only fade the rest of the toolbar uses),
   reading as a different, out-of-place control sitting right next to them. */
.unified-toolbar-height-btn::before {
  display: none;
}

.unified-toolbar-height-btn:not(.v-btn--disabled):hover {
  color: rgba(0, 0, 0, 0.87) !important;
}

.unified-toolbar-height-btn:not(.v-btn--disabled):active {
  transform: scale(0.92);
}

.unified-toolbar-height-btn >>> .v-icon {
  font-size: 16px;
  margin-top: -1px;
  transition: color 0.15s ease;
}

/* Same reasoning/values as PixelEditor.vue's .pixel-editor-scale-
   checkbox - pulled up against the slider's list-item above it, with a
   left inset matching that list-item's default padding. */
.unified-toolbar-scale-checkbox {
  margin-top: -30px;
  padding-left: 16px;
}

/* .delete-icon-btn.player-icon-btn-size's mdi-delete size bump - see
   App.vue's shared, unscoped copy. */

/* Rest/hover/no-filled-circle treatment lives in App.vue's global
   .import-icon-btn rule (shared with TitleScreenEditor.vue's identical
   button) - only the icon-size bump is per-tab, since player-icon-btn-size
   is this component's sizing class. Same 21px bump as .delete-icon-btn
   above, so both corner buttons read as the exact same size at a glance. */
.import-icon-btn.player-icon-btn-size >>> .v-icon {
  font-size: 21px !important;
}

/* Sits inline after the last frame, vertically centered against the frame
   cards' height via vertical-align (rather than the list item's default
   flex centering, which only centers within its row). margin-top only
   matters once this wraps onto its line below the frame cards (there's
   nothing to space it from while it's still sharing a row with them) - a
   real gap there, not flush against the row of cards above it, confirmed
   as needed once a frame count/zoom combination actually causes that wrap. */
.add-frame-list-item {
  display: inline-block;
  vertical-align: middle;
  width: auto;
  margin-top: 16px;
  /* A plain v-list-item's default left padding/inline whitespace put
     this ~32px from the last frame's graphic - pulled in to match the
     Title tab's equivalent gap (TitleScreenEditor.vue's
     .titlescreen-add-frame-list-item, a plain 12px margin-left there since
     that one's just a bare div, not a v-list-item with its padding to
     fight). */
  margin-left: -20px;
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
.titlescreen-play-btn:active >>> .v-icon,
.titlescreen-play-btn.v-btn--loading >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}
</style>
