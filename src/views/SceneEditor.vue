<template>
  <div>
    <v-card class="editor-container" :ripple="false" :style="{'--sticky-toolbar-offset': `${folderToolbarHeight}px`}" @click="handleDeselect">
      <v-card-title>Scene (alpha 0.3)</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message scene-intro-paragraph">
          Set up a stage, a level or a menu here: choose a playfield, then drag the sprites that the project has onto it
          and give each its color, width and animation. Each scene is kept in a card on the Data tab, in a layout
          that works for any kind of game. The "Set scene" block picks a scene from a list and puts it on the screen;
          "Set scene by ID" does the same by the number of the scene's Data card.
        </p>

        <!-- Acts on whichever card is selected, the same shared toolbar as the Data tab's. -->
        <!-- The folders are pinned above the toolbar (which sticks just under them), as on the Sprite and Playfield tabs. The scenes are cards of the
             Data tab, so the folders are the Data tab's. -->
        <div ref="folderToolbar" class="scene-folder-toolbar tight-under-intro" :class="{'folder-toolbar-pinned': folderToolbarPinned}">
          <card-folder-bar
            :folders="foldersOf()"
            :current="openFolderId()"
            root-label="Scenes"
            noun="scene"
            :accept="draggingCardIndex !== null"
            @update:current="openFolder"
            @change="refresh"
            @add-folder="handleAddFolder"
            @delete-folder="handleDeleteFolder"
            @drop-cards="handleDropCards"
          />
        </div>

        <div class="scene-toolbar" :class="{'scene-toolbar-scrolled': isToolbarScrolled}" @click.stop>
          <div class="scene-toolbar-row">
            <editor-zoom v-model="zoom" />
            <pixel-grid-toggle v-model="showGrid" />
            <pixel-grid-toggle
              v-model="showGridLabels"
              :icon="null"
              label="XY"
              title-on="Hide pixel coordinates"
              title-off="Show pixel coordinates"
              :disabled="!showGrid"
              disabled-title="Turn on the pixel grid to show coordinates"
            />
            <pixel-grid-toggle
              v-model="cardColumns"
              icon="mdi-view-column"
              tall
              title-on="Show the scenes in one column"
              title-off="Show the scenes in several columns"
            />
            <v-divider class="scene-outer-divider" vertical />
            <div class="scene-tools">
              <v-btn icon small :title="UNDO_TITLE" :disabled="!(selectedScene && canUndoScene(selectedScene)) && !reorderCanUndo" @click="() => handleUndo(selectedScene)">
                <v-icon>mdi-undo</v-icon>
              </v-btn>
              <v-btn icon small :title="REDO_TITLE" :disabled="!(selectedScene && canRedoScene(selectedScene)) && !reorderCanRedo" @click="() => handleRedo(selectedScene)">
                <v-icon>mdi-redo</v-icon>
              </v-btn>
            </div>
          </div>
          <v-divider class="scene-divider" />
        </div>

        <v-list
          class="scene-list"
          :class="{'scene-list--columns': cardColumns}"
          :style="cardColumns ? {gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${480 * zoom + 34}px), ${480 * zoom + 34}px))`} : {}"
        >
          <v-list-item class="entry-list-item" v-for="scene in visibleScenes()" v-bind:key="scene.table.id">
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="scene-card"
                :class="[dragCardClass(tableIndex(scene)), {'scene-card-selected': selectedCardIds.includes(scene.table.id), 'scene-card-collapsed': isCollapsed(scene.table)}]"
                v-on="dragTargetListeners(tableIndex(scene))"
                @click.stop="(event) => selectCard(scene.table.id, event)"
              >
                <div
                  class="scene-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(tableIndex(scene))"
                  v-on="cardHandleListeners(tableIndex(scene))"
                />
                <v-btn
                  :title="isCollapsed(scene.table) ? 'Expand this scene' : 'Collapse this scene'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="scene-collapse-btn"
                  @click.stop="() => handleToggle(scene.table)"
                >
                  <v-icon>{{ isCollapsed(scene.table) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="scene-id-badge" title="The ID for the Set scene by ID block">ID:{{ scene.table.id }}</div>

                <div class="scene-toolbar-top-right">
                  <confirm-delete-menu
                    :title="deleteQuestion(scene.table.id, 'scene')"
                    :selected="scene.table.id === selectedCardId && selectedCardIds.includes(scene.table.id)"
                    :activator-title="deleteQuestion(scene.table.id, 'scene').replace('?', '')"
                    icon-btn-class="scene-icon-btn-size"
                    @confirm="handleDeleteScene(scene)"
                  />
                  <v-btn
                    icon
                    small
                    title="Duplicate this scene"
                    class="titlescreen-play-btn scene-icon-btn-size"
                    @click.stop="() => handleDuplicateScene(scene)"
                  >
                    <v-icon>mdi-content-duplicate</v-icon>
                  </v-btn>
                  <v-btn
                    :title="testingId === scene.table.id ? 'Building...' :
                      buildInProgress ? 'Another build is already running - try again once it finishes' :
                      'Test this scene in the emulator (its offset areas move)'"
                    icon
                    small
                    :disabled="buildInProgress && testingId !== scene.table.id"
                    :loading="testingId === scene.table.id"
                    class="titlescreen-play-btn scene-icon-btn-size"
                    @click.stop="() => handleTestScene(scene)"
                  >
                    <v-icon>mdi-play</v-icon>
                  </v-btn>
                </div>

                <v-card-text class="scene-name-section">
                  <div class="scene-name-row">
                    <v-text-field
                      class="scene-name-field"
                      label="Scene name"
                      :value="scene.table.name"
                      @change="(value) => handleRename(scene, value)"
                    />
                    <v-select
                      label="Playfield"
                      class="scene-background-field"
                      :items="backgroundItems"
                      :value="scene.background"
                      @change="(value) => handleBackground(scene, value)"
                    />
                  </div>
                </v-card-text>

                <v-card-text v-if="!isCollapsed(scene.table)" class="scene-body-section" @click.stop>
                  <div class="scene-caption-row">
                    <div class="scene-caption">
                      {{ scene.objects.length }} sprite{{ scene.objects.length === 1 ? '' : 's' }},
                      {{ scene.triggers.length }} trigger{{ scene.triggers.length === 1 ? '' : 's' }},
                      {{ scene.offsets.length }} offset area{{ scene.offsets.length === 1 ? '' : 's' }}
                    </div>
                  </div>

                  <div class="scene-body">
                    <div class="scene-canvas-wrap" :style="{width: `${480 * zoom}px`}">
                      <canvas
                        :id="`scene-canvas-${scene.table.id}`"
                        class="scene-canvas"
                        width="160"
                        height="192"
                        @pointerdown="(event) => handlePointerDown(scene, event)"
                        @pointermove="(event) => handlePointerHover(scene, event)"
                      />
                      <canvas v-if="showGrid" :id="`scene-grid-${scene.table.id}`" class="scene-grid-canvas" />
                    </div>
                    <div class="scene-properties">
                      <v-menu offset-y>
                        <template v-slot:activator="{on, attrs}">
                          <v-btn text small class="scene-add-sprite-btn plain-btn" :disabled="!freeObjects(scene).length" v-bind="attrs" v-on="on">
                            <v-icon left small>mdi-plus</v-icon>
                            Add sprite
                          </v-btn>
                        </template>
                        <v-list dense>
                          <v-list-item v-for="object in freeObjects(scene)" v-bind:key="object" @click="handleAddObject(scene, object)">
                            <v-list-item-title>{{ objectLabel(object) }}</v-list-item-title>
                          </v-list-item>
                        </v-list>
                      </v-menu>
                      <v-btn text small class="scene-add-sprite-btn plain-btn" title="Add a rectangle that acts when a sprite touches it" @click.stop="handleAddTrigger(scene)">
                        <v-icon left small>mdi-plus</v-icon>
                        Add trigger
                      </v-btn>
                      <v-btn text small class="scene-add-sprite-btn plain-btn" title="Add an area of the playfield whose pixels move" @click.stop="handleAddOffset(scene)">
                        <v-icon left small>mdi-plus</v-icon>
                        Add offset area
                      </v-btn>
                      <div class="scene-chips">
                        <v-chip
                          v-for="sprite in scene.objects"
                          v-bind:key="sprite.object"
                          small
                          :outlined="!isSelected(scene, sprite.object)"
                          :color="spriteColor(sprite.object)"
                          :text-color="isSelected(scene, sprite.object) ? 'white' : null"
                          :class="{'scene-chip-idle': !isSelected(scene, sprite.object)}"
                          :style="{'--scene-chip-colour': spriteColor(sprite.object)}"
                          @click.stop="select(scene, sprite.object)"
                        >{{ objectLabel(sprite.object) }}</v-chip>
                        <span v-if="!scene.objects.length" class="scene-empty">No sprites yet: use Add sprite.</span>
                      </div>
                      <div v-if="scene.triggers.length" class="scene-chips">
                        <v-chip
                          v-for="(trigger, index) in scene.triggers"
                          v-bind:key="`trigger-${index}`"
                          small
                          :outlined="!isTriggerSelected(scene, index)"
                          color="pink accent-2"
                          :text-color="isTriggerSelected(scene, index) ? 'white' : null"
                          :class="{'scene-chip-idle': !isTriggerSelected(scene, index)}"
                          style="--scene-chip-colour: #ff4081"
                          @click.stop="selectTrigger(scene, index)"
                        >{{ index + 1 }} {{ trigger.name }}</v-chip>
                      </div>

                      <div v-if="selectedTrigger(scene)" class="scene-fields" @click.stop>
                        <v-text-field
                          :label="`Trigger ${(selected.trigger || 0) + 1} name (its number for the by number blocks)`" outlined dense hide-details class="scene-select-field"
                          :value="selectedTrigger(scene).name"
                          @change="(value) => handleTriggerName(scene, value)"
                        />
                        <div class="scene-number-row">
                          <v-text-field
                            label="Left" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedTrigger(scene).left"
                            @change="(value) => handleTriggerField(scene, 'left', value)"
                          />
                          <v-text-field
                            label="Top" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedTrigger(scene).top"
                            @change="(value) => handleTriggerField(scene, 'top', value)"
                          />
                          <v-text-field
                            label="Width" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedTrigger(scene).width"
                            @change="(value) => handleTriggerField(scene, 'width', value)"
                          />
                          <v-text-field
                            label="Height" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedTrigger(scene).height"
                            @change="(value) => handleTriggerField(scene, 'height', value)"
                          />
                        </div>
                        <!-- Hidden for now (what a trigger does by itself: moving the sprite, setting up a scene; the blocks of the project
                             act for it): remove the v-if="false" of these three to show them again. -->
                        <v-select
                          v-if="false"
                          label="When a sprite touches it"
                          outlined
                          dense
                          hide-details
                          class="scene-select-field"
                          :items="triggerKindItems"
                          :value="selectedTrigger(scene).kind"
                          @change="(value) => handleTriggerKind(scene, value)"
                        />
                        <div v-if="false && selectedTrigger(scene).kind === TRIGGER_MOVE" class="scene-number-row">
                          <v-text-field
                            label="Move to X" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedTrigger(scene).targetX"
                            @change="(value) => handleTriggerField(scene, 'targetX', value)"
                          />
                          <v-text-field
                            label="Move to Y" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedTrigger(scene).targetY"
                            @change="(value) => handleTriggerField(scene, 'targetY', value)"
                          />
                        </div>
                        <v-select
                          v-else-if="false"
                          label="Scene"
                          outlined
                          dense
                          hide-details
                          class="scene-select-field"
                          :items="triggerSceneItems"
                          :value="selectedTrigger(scene).targetScene"
                          @change="(value) => handleTriggerScene(scene, value)"
                        />
                        <div class="scene-label scene-trigger-by" title="Which sprites set this trigger off" @click.stop="triggerByOpen = !triggerByOpen">
                          <v-icon small>{{ triggerByOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
                          Triggered by
                        </div>
                        <template v-if="triggerByOpen">
                          <!-- The players line up in columns; the missiles and the ball are together on a line. -->
                          <div class="scene-check-row scene-trigger-checks">
                            <v-checkbox
                              v-for="object in triggerObjects().filter(isPlayer)"
                              v-bind:key="object"
                              :label="objectLabel(object)"
                              dense
                              hide-details
                              class="scene-check"
                              :input-value="!!(selectedTrigger(scene).mask & (1 << object))"
                              @change="(value) => handleTriggerMask(scene, object, value)"
                            />
                          </div>
                          <div class="scene-check-row scene-trigger-checks">
                            <v-checkbox
                              v-for="object in triggerObjects().filter((candidate) => !isPlayer(candidate))"
                              v-bind:key="object"
                              :label="objectLabel(object)"
                              dense
                              hide-details
                              class="scene-check"
                              :input-value="!!(selectedTrigger(scene).mask & (1 << object))"
                              @change="(value) => handleTriggerMask(scene, object, value)"
                            />
                          </div>
                        </template>
                        <v-checkbox
                          label="Trigger function/subroutine"
                          title="When a sprite sets this trigger off, it calls a Subroutine or a Function of the Blocks tab"
                          dense
                          hide-details
                          class="scene-check"
                          :input-value="!!selectedTrigger(scene).call"
                          @change="(value) => handleTriggerCallOn(scene, value)"
                        />
                        <template v-if="selectedTrigger(scene).call">
                          <v-select
                            label="Subroutine or function"
                            outlined
                            dense
                            hide-details
                            class="scene-select-field"
                            no-data-text="No Subroutine or Function blocks on the Blocks tab"
                            :items="triggerCallItems(selectedTrigger(scene).call)"
                            :value="triggerCallValue(selectedTrigger(scene).call)"
                            @change="(value) => handleTriggerCallTarget(scene, value)"
                          />
                          <div v-if="triggerCallParams(selectedTrigger(scene).call)" class="scene-number-row scene-call-args">
                            <v-text-field
                              v-for="i in triggerCallParams(selectedTrigger(scene).call)"
                              v-bind:key="`arg-${i}`"
                              :label="`Argument ${i}`" type="number" outlined dense hide-details class="scene-number-field"
                              :value="(selectedTrigger(scene).call.args || [])[i - 1] || 0"
                              @change="(value) => handleTriggerCallArg(scene, i - 1, value)"
                            />
                          </div>
                        </template>
                        <v-btn text small class="plain-btn" @click.stop="handleRemoveTrigger(scene)">
                          <v-icon left small>mdi-minus</v-icon>
                          Remove trigger
                        </v-btn>
                      </div>

                      <div v-if="scene.offsets.length" class="scene-chips">
                        <v-chip
                          v-for="(offset, index) in scene.offsets"
                          v-bind:key="`offset-${index}`"
                          small
                          :outlined="!isOffsetSelected(scene, index)"
                          color="cyan darken-1"
                          :text-color="isOffsetSelected(scene, index) ? 'white' : null"
                          :class="{'scene-chip-idle': !isOffsetSelected(scene, index)}"
                          style="--scene-chip-colour: #00acc1"
                          @click.stop="selectOffset(scene, index)"
                        >Offset {{ index + 1 }}</v-chip>
                      </div>

                      <div v-if="selectedOffset(scene)" class="scene-fields" @click.stop>
                        <v-select
                          label="Pixels move" outlined dense hide-details class="scene-select-field"
                          :items="offsetDirectionItems"
                          :value="selectedOffset(scene).direction"
                          @change="(value) => handleOffsetDirection(scene, value)"
                        />
                        <v-checkbox
                          label="Whole playfield" dense hide-details class="scene-check"
                          :input-value="selectedOffset(scene).whole"
                          @change="(value) => handleOffsetWhole(scene, value)"
                        />
                        <div v-if="!selectedOffset(scene).whole" class="scene-number-row">
                          <v-text-field
                            label="From X" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedOffset(scene).left"
                            @change="(value) => handleOffsetField(scene, 'left', value)"
                          />
                          <v-text-field
                            label="From Y" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedOffset(scene).top"
                            @change="(value) => handleOffsetField(scene, 'top', value)"
                          />
                          <v-text-field
                            label="To X" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedOffset(scene).right"
                            @change="(value) => handleOffsetField(scene, 'right', value)"
                          />
                          <v-text-field
                            label="To Y" type="number" outlined dense hide-details class="scene-number-field"
                            :value="selectedOffset(scene).bottom"
                            @change="(value) => handleOffsetField(scene, 'bottom', value)"
                          />
                        </div>
                        <div class="scene-number-row">
                          <v-select
                            label="How often" outlined dense hide-details class="scene-select-field scene-often-field"
                            :items="offsetFrameItems"
                            :value="selectedOffset(scene).mask"
                            @change="(value) => handleOffsetMask(scene, value)"
                          />
                          <v-text-field
                            label="+ frames" type="number" min="0" max="255" outlined dense hide-details class="scene-number-field scene-delta-field"
                            :value="selectedOffset(scene).delta"
                            @change="(value) => handleOffsetDelta(scene, value)"
                          />
                        </div>
                        <v-btn text small class="plain-btn" @click.stop="handleRemoveOffset(scene)">
                          <v-icon left small>mdi-minus</v-icon>
                          Remove offset area
                        </v-btn>
                      </div>

                      <div v-if="selectedSprite(scene)" class="scene-fields" @click.stop>
                        <div class="scene-number-row">
                        <v-text-field
                          label="X" type="number" outlined dense hide-details class="scene-number-field"
                          :value="selectedSprite(scene).x"
                          @input="(value) => value !== '' && handleField(scene, 'x', value)"
                          @change="(value) => handleField(scene, 'x', value)"
                        />
                        <v-text-field
                          label="Y" type="number" outlined dense hide-details class="scene-number-field"
                          :value="selectedSprite(scene).y"
                          @input="(value) => value !== '' && handleField(scene, 'y', value)"
                          @change="(value) => handleField(scene, 'y', value)"
                        />
                        <v-text-field
                          v-if="!isPlayer(selectedSprite(scene).object)"
                          label="Height" type="number" outlined dense hide-details class="scene-number-field"
                          :value="selectedSprite(scene).height"
                          @input="(value) => value !== '' && handleField(scene, 'height', value)"
                          @change="(value) => handleField(scene, 'height', value)"
                        />
                        </div>
                        <div v-if="hasColor(selectedSprite(scene).object)" class="scene-color-row">
                          <span class="scene-label">Color</span>
                          <color-swatch-picker
                            :value="hasFlag(selectedSprite(scene), COLOR_FLAG) ? selectedSprite(scene).color : null"
                            allow-clear
                            clear-label="Use the colors of the sprite's picture"
                            fallback-color="#888888"
                            @input="(value) => handleColor(scene, value)"
                          />
                        </div>
                        <v-select
                          v-if="isPlayer(selectedSprite(scene).object)"
                          label="Animation"
                          outlined
                          dense
                          hide-details
                          class="scene-select-field"
                          :items="animationItems"
                          :value="hasFlag(selectedSprite(scene), ANIMATION_FLAG) ? selectedSprite(scene).animation : -1"
                          @change="(value) => handleAnimation(scene, value)"
                        />
                        <v-select
                          label="Width"
                          outlined
                          dense
                          hide-details
                          class="scene-select-field"
                          :items="widthItems(selectedSprite(scene).object)"
                          :value="hasFlag(selectedSprite(scene), SIZE_FLAG) ? selectedSprite(scene).size : -1"
                          @change="(value) => handleWidth(scene, value)"
                        />
                        <div class="scene-check-row">
                        <v-checkbox
                          v-if="isPlayer(selectedSprite(scene).object)"
                          label="Facing left"
                          dense
                          hide-details
                          class="scene-check"
                          :input-value="hasFlag(selectedSprite(scene), FLIPPED_FLAG)"
                          @change="(value) => handleFlag(scene, FLIPPED_FLAG, value)"
                        />
                        <v-checkbox
                          label="Hidden"
                          dense
                          hide-details
                          class="scene-check"
                          :input-value="hasFlag(selectedSprite(scene), HIDDEN_FLAG)"
                          @change="(value) => handleFlag(scene, HIDDEN_FLAG, value)"
                        />
                        </div>
                        <v-btn text small class="plain-btn" @click.stop="handleRemoveObject(scene)">
                          <v-icon left small>mdi-minus</v-icon>
                          Remove sprite
                        </v-btn>
                      </div>
                      <div v-else-if="scene.objects.length && !selectedTrigger(scene)" class="scene-empty">Click a sprite to change its settings, or drag/use arrow keys to place in Scene.</div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-scene-button"
      color="primary"
      title="Add scene"
      dark
      absolute
      right
      fab
      @click="handleAddScene"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>

<script>
import {computed, defineComponent, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch} from '@vue/composition-api';
import {max} from 'lodash';
import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import CardFolderBar from '../components/CardFolderBar.vue';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import EditorZoom from '../components/EditorZoom.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import {useEditorZoom} from '../hooks/zoom';
import {useWorkspaceStorage, useBackgroundsStorage, useConfigurationStorage, useDataTablesStorage, usePixelGridLabelsStorage, usePixelGridOverlayStorage,
  usePlayerAnimationsStorage, useSceneCardColumnsStorage} from '../hooks/project';
import {processDataTablesStorageDefaults} from '../blocks/data';
import {sceneObjectColour} from '../blocks/sprites';
import {adjustedBlockColour} from '../utils/block-colours';
import {BACKGROUND_OFFSET_OPTIONS, processBackgroundStorageDefaults, colorsAtRows} from '../blocks/background';
import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {insertCardAfter, remapKeyed, removeCards} from '../utils/card-refs';
import {buildScenePreviewRom, useBuildInProgress} from '../hooks/rom';
import {useCollapsedIds} from '../hooks/collapse';
import {useCardSelection} from '../hooks/card-selection';
import {useCardFolders} from '../hooks/card-folders';
import {useDragReorder} from '../hooks/drag-reorder';
import {canRedoReorder, canUndoReorder, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';
import {beginCardDelete, recordCardDelete} from '../hooks/delete-history';
import {REDO_TITLE, UNDO_TITLE, undoRedoKind} from '../utils/undo-hotkey';
import {colorByteToCss} from '../utils/palette';
import {pfRowDivisorFor, backgroundRowLinesFor} from '../utils/playfield-coords';
import {pfIsWide} from '../utils/pxe';
import {
  SCENE_FLAG_ANIMATION, SCENE_FLAG_COLOR, SCENE_FLAG_FLIPPED, SCENE_FLAG_HEIGHT, SCENE_FLAG_HIDDEN, SCENE_FLAG_SIZE, SCENE_NO_ANIMATION,
  MISSILE_WIDTHS, sceneHasTriggerExtra, triggerObjectsOf, SCENE_TRIGGER_LOAD, SCENE_TRIGGER_MOVE, SCENE_SCREEN_LINES, SCENE_SCREEN_WIDTH, availableSceneObjects, decodeScene,
  SCENE_OFFSET_MASKS, encodeScene, isScenePlayer, isSceneTable, newSceneObject, newSceneOffset, newSceneTrigger, sceneObjectLabel, sceneValueFormats,
  sceneValueNotes, triggerNamesOf, triggerCallsOf, triggerCallTargetsOf,
} from '../utils/scene';

// White or black text, whichever has the higher contrast ratio (WCAG relative luminance) against the given CSS color: the same rule the
// pixel editor's cell labels use.
const contrastingLabelColor = (cssColor) => {
  const probe = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
  probe.fillStyle = '#000000';
  probe.fillStyle = cssColor;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  const linear = (channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.05 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';
};

// What the Playfield tab's picture shows (see BackgroundEditor.vue's editorRowColors and editorBkRowColors): the colors of the rows of the
// playfield when the project uses them, and of the background behind it with DPC+ when it uses those; the cells of a playfield that has no row
// colors are orange.
const PLAYFIELD_COLOR = 'orange';
const rowColorCss = (byte) => {
  const css = colorByteToCss(byte);
  return css === '#000000' ? '#010101' : css;
};
const backgroundRowColors = (background, config) => ({
  pf: config.enablePfColors && background.rowColors && background.rowColors.length ? background.rowColors.map(rowColorCss) : null,
  bk: config.kernel === 'dpcplus' && config.enableDpcPlusBkColors && background.bkRowColors && background.bkRowColors.length ?
    background.bkRowColors.map((byte) => colorByteToCss(byte)) : null,
});
// The color that covers a height (in lines, of total) when the colors are spread over the whole picture.
const colorAtHeight = (colors, line, total) => colors[Math.min(colors.length - 1, Math.floor(line * colors.length / total))];
// How tall a row of the playfield is, in lines: the rows come from the playfield that is set (its pfres under DPC+), not the project's.
const backgroundLayout = (background, config) => ({
  rowLines: config.kernel === 'dpcplus' ? backgroundRowLinesFor(background, config) : 2 * pfRowDivisorFor(config),
});

const SCREEN_WIDTH = 160;
const SCREEN_LINES = 192;
// How an offset area is marked on the picture: the way its pixels move.
const OFFSET_ARROWS = {alternate: '⇄', alternate_rl: '⇄', left: '←', right: '→', alternate_ud: '⇅', alternate_du: '⇅', up: '↑', down: '↓'};
// The playfield is 128 pixels wide, centered on the 160 pixel screen.
const PLAYFIELD_LEFT = 16;
// Where the playfield starts on the screen: the PXE kernel's 40 column one fills it (see pfWidthOf).
const playfieldLeftOf = (config) => (pfIsWide(config) ? 0 : PLAYFIELD_LEFT);
// Where each copy of a player is, in pixels from the first (the number of the width/quantity option is the index).
const COPY_OFFSETS = [[0], [0, 16], [0, 32], [0, 16, 32], [0, 64], [0], [0, 32, 64], [0]];
const COPY_STRETCH = [1, 1, 1, 1, 1, 2, 1, 4];
const PLAYER_WIDTH_LABELS = ['1 copy', '2 copies, close', '2 copies, medium', '3 copies, close', '2 copies, wide', 'Double-sized',
  '3 copies, medium', 'Quad-sized'];

export default defineComponent({
  components: {CardFolderBar, ColorSwatchPicker, ConfirmDeleteMenu, EditorZoom, PixelGridToggle},
  setup() {
    const dataStorage = useDataTablesStorage();
    const configurationStorage = useConfigurationStorage();
    const backgroundsStorage = useBackgroundsStorage();
    const animationsStorage = usePlayerAnimationsStorage();

    const config = () => (configurationStorage && configurationStorage.value) || {};
    const loadTables = () => processDataTablesStorageDefaults(dataStorage).dataTables.slice();
    const tables = ref(loadTables());
    const selected = ref(null);
    const zoom = useEditorZoom('scene', 1);
    const showGrid = usePixelGridOverlayStorage();
    const showGridLabels = usePixelGridLabelsStorage();
    const cardColumns = useSceneCardColumnsStorage();

    const scenes = computed(() => tables.value.filter(isSceneTable).map((table) => ({table, ...decodeScene(table.values, table.triggerNames, table.triggerCalls)})));
    const instance = getCurrentInstance();

    // The cards are selected, collapsed and reordered the way the other tabs' are. The scenes are cards among the Data tab's
    // tables, so the ones that move are the tables and a scene's place is its place in the whole list.
    const selectedCardId = ref(null);
    const {selectedCardIds, selectCard, deselectCard, idsToDelete, deleteQuestion, remapIds: remapSelectedIds} =
      useCardSelection(() => visibleScenes().map(({table}) => table.id), selectedCardId);
    // The indices, in the whole list of the Data tab's tables, of the selected scenes (dragging one of them moves them all).
    const getSelectedFullIndices = () => tables.value
        .map((table, index) => (selectedCardIds.value.includes(table.id) ? index : -1)).filter((index) => index >= 0);
    const {isCollapsed, toggleCollapsed, collapseAll, ensureExpanded, remapIds: remapCollapsedIds} = useCollapsedIds('scene', true);
    collapseAll();
    // The scene whose card is selected, or the one a sprite or a trigger is selected in (Undo and Redo, and the Delete key, work on it).
    // (When nothing is selected any more, the one that was changed last: a sprite that was deleted can be brought back.)
    const lastChangedSceneId = ref(null);
    const selectedScene = computed(() => scenes.value.find(({table}) => table.id === selectedCardId.value) ||
      (selected.value && scenes.value.find(({table}) => table.id === selected.value.scene)) ||
      scenes.value.find(({table}) => table.id === lastChangedSceneId.value) || null);
    const tableIndex = (scene) => tables.value.indexOf(scene.table);

    const backgrounds = () => processBackgroundStorageDefaults(backgroundsStorage).backgrounds;
    const animations = () => processPlayerAnimationsStorageDefaults(animationsStorage).animations || [];
    const backgroundItems = computed(() => [{text: 'None', value: 0},
      ...backgrounds().map(({id, name}) => ({text: name || `Playfield ${id}`, value: id}))]);
    const animationItems = computed(() => [{text: 'Leave as it is', value: -1},
      ...animations().map((animation, index) => ({text: animation.name || `Unnamed ${index + 1}`, value: index}))]);

    // Writes the scenes' cards back to the Data tab's storage and refreshes the list.
    const save = (mutate) => {
      const data = processDataTablesStorageDefaults(dataStorage);
      mutate(data);
      dataStorage.value = {...data};
      tables.value = data.dataTables.slice();
    };

    // Undo and redo of what is changed in a scene: what the card held before each change, per card.
    const undoStacks = {};
    const redoStacks = {};
    const historyVersion = ref(0);
    const snapshotOf = (table) => ({name: table.name, values: table.values.slice(), valueFormats: (table.valueFormats || []).slice(),
      valueNotes: (table.valueNotes || []).slice(), triggerNames: (table.triggerNames || []).slice(),
      triggerCalls: (table.triggerCalls || []).map((call) => (call ? {...call, args: (call.args || []).slice()} : null))});
    const stackOf = (stacks, id) => {
      if (!stacks[id]) stacks[id] = [];
      return stacks[id];
    };
    const recordChange = (id) => {
      const table = tables.value.find((candidate) => candidate.id === id);
      if (!table) return;
      const stack = stackOf(undoStacks, id);
      stack.push(snapshotOf(table));
      if (stack.length > 100) stack.shift();
      redoStacks[id] = [];
      historyVersion.value++;
    };
    const canUndoScene = (scene) => historyVersion.value >= 0 && stackOf(undoStacks, scene.table.id).length > 0;
    const canRedoScene = (scene) => historyVersion.value >= 0 && stackOf(redoStacks, scene.table.id).length > 0;
    const restore = (id, from, to) => {
      const table = tables.value.find((candidate) => candidate.id === id);
      const snapshot = stackOf(from, id).pop();
      if (!table || !snapshot) return;
      stackOf(to, id).push(snapshotOf(table));
      save((data) => {
        const target = data.dataTables.find((candidate) => candidate.id === id);
        if (target) Object.assign(target, snapshot);
      });
      historyVersion.value++;
    };
    const reorderCanUndo = computed(() => canUndoReorder());
    const reorderCanRedo = computed(() => canRedoReorder());
    const handleUndo = (scene) => {
      if (tryUndoReorder()) return;
      if (scene && canUndoScene(scene)) restore(scene.table.id, undoStacks, redoStacks);
    };
    const handleRedo = (scene) => {
      if (tryRedoReorder()) return;
      if (scene && canRedoScene(scene)) restore(scene.table.id, redoStacks, undoStacks);
    };
    // The arrow keys move the selected sprite one step, or four with Shift (a playfield cell is four pixels wide).
    const ARROW_STEPS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    const handleArrowKeys = (event) => {
      const step = ARROW_STEPS[event.key];
      const target = event.target;
      if (!step || !selected.value || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable], .v-menu__content, [role="listbox"]')) return;
      const scene = scenes.value.find(({table}) => table.id === selected.value.scene);
      if (scene && selected.value.offset !== undefined && selectedOffset(scene) && !selectedOffset(scene).whole) {
        event.preventDefault();
        const grid = offsetGrid(scene);
        withScene(scene, (next) => {
          const moved = next.offsets[selected.value.offset];
          const width = Math.abs(moved.right - moved.left);
          const height = Math.abs(moved.bottom - moved.top);
          const left = clampTo(Math.min(moved.left, moved.right) + step[0], 0, grid.columns - 1 - width);
          const top = clampTo(Math.min(moved.top, moved.bottom) + step[1], 0, grid.rows - 1 - height);
          Object.assign(moved, {left, right: left + width, top, bottom: top + height});
        });
        return;
      }
      if (scene && selected.value.trigger !== undefined && selectedTrigger(scene)) {
        event.preventDefault();
        const moveBy = event.shiftKey ? 4 : 1;
        withScene(scene, (next) => {
          const moved = next.triggers[selected.value.trigger];
          moved.left = clampTo(moved.left + step[0] * moveBy, 0, SCENE_SCREEN_WIDTH - moved.width);
          moved.top = clampTo(moved.top + step[1] * moveBy, 0, SCENE_SCREEN_LINES - moved.height);
        });
        return;
      }
      const sprite = scene && scene.objects.find((candidate) => candidate.object === selected.value.object);
      if (!sprite) return;
      event.preventDefault();
      const amount = event.shiftKey ? 4 : 1;
      withScene(scene, (next) => {
        const moved = next.objects.find((candidate) => candidate.object === sprite.object);
        moved.x = Math.min(255, Math.max(0, moved.x + step[0] * amount));
        moved.y = Math.min(255, Math.max(0, moved.y + step[1] * amount));
      });
    };
    const handleDeleteKey = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target;
      if (!selected.value || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable], .v-menu__content, [role="listbox"]')) return;
      const scene = scenes.value.find(({table}) => table.id === selected.value.scene);
      if (!scene) return;
      if (selected.value.offset !== undefined && selectedOffset(scene)) {
        event.preventDefault();
        handleRemoveOffset(scene);
      } else if (selected.value.trigger !== undefined && selectedTrigger(scene)) {
        event.preventDefault();
        handleRemoveTrigger(scene);
      } else if (selectedSprite(scene)) {
        event.preventDefault();
        handleRemoveObject(scene);
      }
    };
    const handleHistoryHotkey = (event) => {
      const history = undoRedoKind(event);
      if (!history) return;
      const scene = selectedScene.value;
      const can = history === 'undo' ? reorderCanUndo.value || (scene && canUndoScene(scene)) : reorderCanRedo.value || (scene && canRedoScene(scene));
      if (can) {
        event.preventDefault();
        (history === 'undo' ? handleUndo : handleRedo)(scene);
      }
    };

    // The scenes are numbered by their place (see utils/card-refs.js): after a move, a delete or a copy each keeps what it holds by
    // number (undo history, the selection, collapsed, the sprite selected), under its new number.
    const renumbered = (idMap) => {
      remapSelectedIds(idMap);
      remapCollapsedIds(idMap);
      const undo = remapKeyed(undoStacks, idMap);
      const redo = remapKeyed(redoStacks, idMap);
      Object.keys(undoStacks).forEach((key) => delete undoStacks[key]);
      Object.keys(redoStacks).forEach((key) => delete redoStacks[key]);
      Object.assign(undoStacks, undo);
      Object.assign(redoStacks, redo);
      if (selected.value && idMap.has(selected.value.scene)) selected.value = {...selected.value, scene: idMap.get(selected.value.scene)};
    };
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => tables.value,
        (items) => save((data) => {
          data.dataTables = items;
        }),
        getSelectedFullIndices,
        {sideBySide: () => cardColumns.value, renumber: {kind: 'datatable', onRenumbered: renumbered}},
    );

    // Folders for the cards (see hooks/card-folders.js and components/CardFolderBar.vue): the scenes are tables of the Data tab, so the folders are
    // the Data tab's (`folders` of its storage, the folder of a table its `folder`) and a scene is in the same folder on both tabs.
    const foldersOf = () => {
      const data = processDataTablesStorageDefaults(dataStorage);
      if (!Array.isArray(data.folders)) data.folders = [];
      return data.folders;
    };
    const refresh = () => save(() => {});
    const {openFolderId, folderOf, openFolder, newCardFolder, handleAddFolder, handleDeleteFolder, draggingCardIndex, wrapHandleListeners, handleDropCards} =
      useCardFolders({
        getCards: () => tables.value,
        getFolders: foldersOf,
        setFolders: (folders) => save((data) => {
          data.folders = folders;
        }),
        refresh,
        getSelectedIndices: getSelectedFullIndices,
        deselectCard,
        tab: 'scene',
      });
    const cardHandleListeners = wrapHandleListeners(dragHandleListeners);
    // The scenes in the open folder.
    const visibleScenes = () => scenes.value.filter(({table}) => folderOf(table) === openFolderId());

    // How tall the pinned folders are: the toolbar under them sticks after them, not behind them (as on the Sprite tab).
    const folderToolbar = ref(null);
    const folderToolbarHeight = ref(0);
    // Whether the folders are pinned at the top of the tab (scrolled): they get room above them then.
    const folderToolbarPinned = ref(false);
    let pinnedContainer = null;
    // (One pixel less than it is, rounded down: the toolbar under it overlaps its edge instead of leaving a gap that shows what is behind.)
    const pinnedHeight = (element) => Math.max(0, Math.floor(element.getBoundingClientRect().height) - 1);
    const updatePinned = () => {
      const element = folderToolbar.value;
      if (!element || !pinnedContainer) return;
      folderToolbarPinned.value = element.getBoundingClientRect().top <= pinnedContainer.getBoundingClientRect().top + 1;
      folderToolbarHeight.value = pinnedHeight(element);
    };
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

    const writeScene = (id, scene) => {
      lastChangedSceneId.value = id;
      recordChange(id);
      save((data) => {
        const table = data.dataTables.find((candidate) => candidate.id === id);
        if (!table) return;
        table.values = encodeScene(scene);
        table.valueFormats = sceneValueFormats(scene.objects.length, (scene.triggers || []).length, (scene.offsets || []).length,
            sceneHasTriggerExtra(scene.triggers) ? (scene.triggers || []).length : 0);
        table.valueNotes = sceneValueNotes(scene.objects, scene.triggers || [], scene.offsets || [], sceneHasTriggerExtra(scene.triggers));
        table.triggerNames = triggerNamesOf(scene.triggers || []);
        table.triggerCalls = triggerCallsOf(scene.triggers || []);
      });
    };
    const withScene = (scene, change) => {
      const next = {background: scene.background, objects: scene.objects.map((sprite) => ({...sprite})),
        triggers: (scene.triggers || []).map((trigger) => ({...trigger})), offsets: (scene.offsets || []).map((offset) => ({...offset}))};
      change(next);
      writeScene(scene.table.id, next);
    };

    const objectLabel = sceneObjectLabel;
    // The colors of the sprite blocks, which change with the sprite chosen in their dropdown.
    // (Muted or darkened with the Soft Blockly colors and Dark Mode settings, as the blocks are.)
    const spriteColor = (object) => adjustedBlockColour(sceneObjectColour(object));
    const isPlayer = isScenePlayer;
    const hasFlag = (sprite, flag) => !!(sprite.flags & flag);
    const hasColor = (object) => isScenePlayer(object) || (object !== 12 && config().kernel === 'dpcplus');
    const freeObjects = (scene) => availableSceneObjects(config()).filter((object) => !scene.objects.some((sprite) => sprite.object === object));
    const widthItems = (object) => [{text: 'Leave as it is', value: -1},
      ...(isScenePlayer(object) ? PLAYER_WIDTH_LABELS.map((text, value) => ({text, value})) :
        MISSILE_WIDTHS.map((width, value) => ({text: `${width} pixel${width > 1 ? 's' : ''}`, value})))];

    const selectedSprite = (scene) => (selected.value && selected.value.scene === scene.table.id ?
      scene.objects.find((sprite) => sprite.object === selected.value.object) || null : null);
    const isSelected = (scene, object) => !!selected.value && selected.value.scene === scene.table.id && selected.value.object === object;
    const select = (scene, object) => {
      selected.value = {scene: scene.table.id, object};
    };
    // The triggers (rectangles that act when a sprite touches them) are selected the same way: {scene, trigger: place in the scene's list}.
    const selectedTrigger = (scene) => (selected.value && selected.value.scene === scene.table.id && selected.value.trigger !== undefined ?
      (scene.triggers || [])[selected.value.trigger] || null : null);
    const isTriggerSelected = (scene, index) => !!selected.value && selected.value.scene === scene.table.id && selected.value.trigger === index;
    const selectTrigger = (scene, index) => {
      selected.value = {scene: scene.table.id, trigger: index};
    };
    const triggerKindItems = [{text: 'Move the sprite to X and Y', value: SCENE_TRIGGER_MOVE}, {text: 'Set up a scene', value: SCENE_TRIGGER_LOAD}];
    const triggerSceneItems = computed(() => scenes.value.map(({table}) => ({text: table.name || `Scene ${table.id}`, value: table.id})));
    const triggerObjects = () => triggerObjectsOf(config());
    // Whether the sprites that set the selected trigger off are listed (a line of them, short, when they are not).
    const triggerByOpen = ref(false);
    // The playfield offset areas: rectangles of playfield cells whose pixels move while the scene is showing. Selected as {scene, offset: place in the list}.
    const selectedOffset = (scene) => (selected.value && selected.value.scene === scene.table.id && selected.value.offset !== undefined ?
      (scene.offsets || [])[selected.value.offset] || null : null);
    const isOffsetSelected = (scene, index) => !!selected.value && selected.value.scene === scene.table.id && selected.value.offset === index;
    const selectOffset = (scene, index) => {
      selected.value = {scene: scene.table.id, offset: index};
    };
    const offsetDirectionItems = BACKGROUND_OFFSET_OPTIONS.map(([text, value]) => ({text, value}));
    const offsetFrameItems = SCENE_OFFSET_MASKS.map((mask) => ({text: mask === 0 ? 'every frame' : `${mask + 1} frames`, value: mask}));
    // The cells of the playfield the scene has: its columns, its rows, and how tall a row is in lines.
    const offsetGrid = (scene) => {
      const background = backgrounds().find(({id}) => id === scene.background) || backgrounds()[0];
      const pixels = background && background.pixels ? background.pixels : [];
      return {rows: pixels.length || 11, columns: pixels[0] ? pixels[0].length : 32, rowLines: background ? backgroundLayout(background, config()).rowLines : 16};
    };
    // The rectangle of an area on the picture, in pixels and lines.
    const offsetRect = (scene, offset) => {
      const grid = offsetGrid(scene);
      const left = offset.whole ? 0 : Math.min(offset.left, offset.right);
      const right = offset.whole ? grid.columns - 1 : Math.max(offset.left, offset.right);
      const top = offset.whole ? 0 : Math.min(offset.top, offset.bottom);
      const bottom = offset.whole ? grid.rows - 1 : Math.max(offset.top, offset.bottom);
      return {x: playfieldLeftOf(config()) + 4 * left, y: grid.rowLines * top, width: 4 * (right - left + 1), height: grid.rowLines * (bottom - top + 1)};
    };
    const handleAddOffset = (scene) => {
      const index = (scene.offsets || []).length;
      withScene(scene, (next) => {
        const grid = offsetGrid(scene);
        const offset = newSceneOffset();
        offset.right = Math.min(offset.right, grid.columns - 1);
        offset.bottom = Math.min(offset.bottom, grid.rows - 1);
        offset.top = Math.min(offset.top, offset.bottom);
        next.offsets.push(offset);
      });
      selectOffset(scene, index);
    };
    const handleRemoveOffset = (scene) => {
      const index = selected.value && selected.value.offset;
      if (index === undefined || !selectedOffset(scene)) return;
      withScene(scene, (next) => {
        next.offsets.splice(index, 1);
      });
      selected.value = null;
    };
    const changeOffset = (scene, change) => {
      const index = selected.value && selected.value.offset;
      if (index === undefined || !selectedOffset(scene)) return;
      withScene(scene, (next) => change(next.offsets[index]));
    };
    const handleOffsetField = (scene, field, value) => changeOffset(scene, (offset) => {
      const grid = offsetGrid(scene);
      offset[field] = clampTo(value, 0, field === 'left' || field === 'right' ? grid.columns - 1 : grid.rows - 1);
    });
    const handleOffsetDirection = (scene, direction) => changeOffset(scene, (offset) => {
      offset.direction = direction;
    });
    const handleOffsetWhole = (scene, whole) => changeOffset(scene, (offset) => {
      offset.whole = !!whole;
    });
    const handleOffsetMask = (scene, mask) => changeOffset(scene, (offset) => {
      offset.mask = mask;
    });
    const handleOffsetDelta = (scene, value) => changeOffset(scene, (offset) => {
      offset.delta = Math.max(0, Math.min(255, Math.round(Number(value)) || 0));
    });
    const triggerNameFor = (scene) => {
      let number = (scene.triggers || []).length + 1;
      while ((scene.triggers || []).some((trigger) => trigger.name === `Trigger ${number}`)) number++;
      return `Trigger ${number}`;
    };
    const handleAddTrigger = (scene) => {
      const index = (scene.triggers || []).length;
      withScene(scene, (next) => {
        next.triggers.push(newSceneTrigger(triggerNameFor(scene), config()));
      });
      selectTrigger(scene, index);
    };
    const handleRemoveTrigger = (scene) => {
      const index = selected.value && selected.value.trigger;
      if (index === undefined || !selectedTrigger(scene)) return;
      withScene(scene, (next) => {
        next.triggers.splice(index, 1);
      });
      selected.value = null;
    };
    const changeTrigger = (scene, change) => {
      const index = selected.value && selected.value.trigger;
      if (index === undefined || !selectedTrigger(scene)) return;
      withScene(scene, (next) => change(next.triggers[index]));
    };
    const clampTo = (value, low, high) => Math.min(high, Math.max(low, Math.round(Number(value)) || 0));
    const handleTriggerField = (scene, field, value) => changeTrigger(scene, (trigger) => {
      if (field === 'left') trigger.left = clampTo(value, 0, SCENE_SCREEN_WIDTH - 1);
      else if (field === 'top') trigger.top = clampTo(value, 0, SCENE_SCREEN_LINES - 1);
      else if (field === 'width') trigger.width = clampTo(value, 1, SCENE_SCREEN_WIDTH);
      else if (field === 'height') trigger.height = clampTo(value, 1, SCENE_SCREEN_LINES);
      else trigger[field] = clampTo(value, 0, 255);
      trigger.width = Math.min(trigger.width, SCENE_SCREEN_WIDTH - trigger.left);
      trigger.height = Math.min(trigger.height, SCENE_SCREEN_LINES - trigger.top);
    });
    const handleTriggerName = (scene, name) => changeTrigger(scene, (trigger) => {
      trigger.name = String(name || '').trim() || trigger.name;
    });
    const handleTriggerKind = (scene, kind) => changeTrigger(scene, (trigger) => {
      trigger.kind = kind;
    });
    const handleTriggerScene = (scene, id) => changeTrigger(scene, (trigger) => {
      trigger.targetScene = id;
    });
    const handleTriggerMask = (scene, object, on) => changeTrigger(scene, (trigger) => {
      trigger.mask = on ? trigger.mask | (1 << object) : trigger.mask & ~(1 << object);
    });
    // What a trigger calls when it fires: a Subroutine or a Function of the Blocks tab (read from the blocks as they are saved), and the numbers
    // given to the arguments the Function reads.
    const workspaceStorage = useWorkspaceStorage();
    const callTargets = computed(() => triggerCallTargetsOf(workspaceStorage.value || ''));
    const callValueOf = (type, name) => `${type}:${name}`;
    const triggerCallValue = (call) => (call && call.name ? callValueOf(call.type, call.name) : null);
    const triggerCallItems = (call) => {
      const {subroutines, functions} = callTargets.value;
      const items = [];
      if (subroutines.length) items.push({header: 'Subroutines'}, ...subroutines.map((name) => ({text: name, value: callValueOf('subroutine', name)})));
      if (functions.length) items.push({header: 'Functions'}, ...functions.map(({name}) => ({text: name, value: callValueOf('function', name)})));
      // (One the Blocks tab no longer has stays listed, so the choice shows; the build leaves it out.)
      if (call && call.name && !items.some((item) => item.value === callValueOf(call.type, call.name))) {
        items.push({text: `${call.name} (not on the Blocks tab)`, value: callValueOf(call.type, call.name)});
      }
      return items;
    };
    const triggerCallParams = (call) => {
      if (!call || call.type !== 'function' || !call.name) return 0;
      const fn = callTargets.value.functions.find((candidate) => candidate.name === call.name);
      return fn ? fn.params : (call.args || []).length;
    };
    const handleTriggerCallOn = (scene, on) => changeTrigger(scene, (trigger) => {
      const {subroutines, functions} = callTargets.value;
      const first = subroutines.length ? {type: 'subroutine', name: subroutines[0]} : functions.length ? {type: 'function', name: functions[0].name} : {type: 'subroutine', name: ''};
      trigger.call = on ? {...first, args: []} : null;
    });
    const handleTriggerCallTarget = (scene, value) => changeTrigger(scene, (trigger) => {
      const text = String(value || '');
      const at = text.indexOf(':');
      const type = text.slice(0, at) === 'function' ? 'function' : 'subroutine';
      trigger.call = {type, name: text.slice(at + 1), args: trigger.call && trigger.call.type === type ? (trigger.call.args || []).slice() : []};
    });
    const handleTriggerCallArg = (scene, index, value) => changeTrigger(scene, (trigger) => {
      if (!trigger.call) return;
      const args = (trigger.call.args || []).slice();
      while (args.length < index) args.push(0);
      args[index] = clampTo(value, 0, 255);
      trigger.call = {...trigger.call, args};
    });

    const handleAddScene = () => {
      let newId = 0;
      const before = beginCardDelete();
      save((data) => {
        const id = (max(data.dataTables.map((table) => table.id)) || 0) + 1;
        newId = id;
        const number = data.dataTables.filter(isSceneTable).length + 1;
        const first = backgrounds()[0];
        data.dataTables.push({
          id,
          ...newCardFolder(),
          name: `Scene ${number}`,
          values: encodeScene({background: first ? first.id : 0, objects: [], triggers: []}),
          valueFormats: sceneValueFormats(0, 0, 0),
          valueNotes: sceneValueNotes([], [], []),
          triggerNames: [],
          triggerCalls: [],
          columns: 8,
          scene: true,
        });
      });
      recordCardDelete(before);
      const added = tables.value.find((table) => table.id === newId);
      if (added) ensureExpanded(added);
      selectCard(newId);
      redraw();
    };
    const handleRename = (scene, name) => {
      if (name === scene.table.name) return;
      recordChange(scene.table.id);
      save((data) => {
        const table = data.dataTables.find((candidate) => candidate.id === scene.table.id);
        if (table) table.name = name;
      });
    };
    const handleDuplicateScene = (scene) => {
      let copyId = 0;
      const before = beginCardDelete();
      save((data) => {
        const source = data.dataTables.find((candidate) => candidate.id === scene.table.id);
        if (!source) return;
        const copy = {...structuredClone(source), name: `${source.name || 'Scene'} copy`};
        const idMap = insertCardAfter('datatable', data.dataTables, source, copy);
        if (idMap) renumbered(idMap);
        copyId = copy.id;
      });
      recordCardDelete(before);
      const copy = tables.value.find((table) => table.id === copyId);
      if (copy) ensureExpanded(copy);
      selectCard(copyId);
      redraw();
    };
    const handleDeleteScene = (scene) => {
      const doomed = idsToDelete(scene.table.id);
      save((data) => {
        const {remaining, idMap} = removeCards('datatable', data.dataTables, doomed);
        data.dataTables = remaining;
        if (idMap) renumbered(idMap);
      });
      if (doomed.length > 1) deselectCard();
      selected.value = null;
    };
    // Builds and loads a throwaway ROM showing just this scene (see buildScenePreviewRom); the busy handling of the Play buttons of the other tabs.
    const testingId = ref(null);
    const buildInProgress = useBuildInProgress();
    const handleTestScene = async (scene) => {
      if (buildInProgress.value) return;
      testingId.value = scene.table.id;
      try {
        await buildScenePreviewRom(scene.table);
      } finally {
        testingId.value = null;
      }
    };
    const handleDeselect = () => {
      deselectCard();
      selected.value = null;
    };
    // The picture of a card that was collapsed is not on the page until it opens.
    const handleToggle = (table) => {
      toggleCollapsed(table);
      redraw();
    };
    const handleBackground = (scene, id) => withScene(scene, (next) => {
      next.background = id;
    });
    const handleAddObject = (scene, object) => {
      withScene(scene, (next) => {
        const sprite = newSceneObject(object);
        if (!isScenePlayer(object)) sprite.flags |= SCENE_FLAG_HEIGHT;
        // Under DPC+ a player's Y is 2 * Y minus the tallest picture of the project in lines, so a project with a tall picture puts a new sprite above the
        // picture: its Y starts low enough for the sprite to show (the middle of the picture at most).
        if (isScenePlayer(object) && dpcPlus()) sprite.y = Math.min(150, Math.max(sprite.y, Math.ceil(tallestPicture() / 2) + 16));
        next.objects.push(sprite);
      });
      select(scene, object);
    };
    const handleRemoveObject = (scene) => {
      const sprite = selectedSprite(scene);
      if (!sprite) return;
      withScene(scene, (next) => {
        next.objects = next.objects.filter((candidate) => candidate.object !== sprite.object);
      });
      selected.value = null;
    };
    const changeSelected = (scene, change) => {
      const sprite = selectedSprite(scene);
      if (!sprite) return;
      withScene(scene, (next) => change(next.objects.find((candidate) => candidate.object === sprite.object)));
    };
    const handleField = (scene, field, value) => changeSelected(scene, (sprite) => {
      sprite[field] = Math.min(255, Math.max(0, Math.round(Number(value)) || 0));
    });
    const handleColor = (scene, value) => changeSelected(scene, (sprite) => {
      if (value === null || value === undefined) {
        sprite.flags &= ~SCENE_FLAG_COLOR;
      } else {
        sprite.color = value;
        sprite.flags |= SCENE_FLAG_COLOR;
      }
    });
    const handleWidth = (scene, value) => changeSelected(scene, (sprite) => {
      if (value < 0) {
        sprite.flags &= ~SCENE_FLAG_SIZE;
      } else {
        sprite.size = value;
        sprite.flags |= SCENE_FLAG_SIZE;
      }
    });
    const handleAnimation = (scene, value) => changeSelected(scene, (sprite) => {
      if (value < 0) {
        sprite.flags &= ~SCENE_FLAG_ANIMATION;
        sprite.animation = SCENE_NO_ANIMATION;
      } else {
        sprite.animation = value;
        sprite.flags |= SCENE_FLAG_ANIMATION;
      }
    });
    const handleFlag = (scene, flag, on) => changeSelected(scene, (sprite) => {
      sprite.flags = on ? sprite.flags | flag : sprite.flags & ~flag;
    });

    // ---- Drawing -------------------------------------------------------------------------------------------------------------------
    // Sprite positions are drawn the way the playfield conversions of the project place them (see utils/playfield-coords.js): the left
    // edge of a player is x minus its offset from the playfield's first column, and a y step is two lines.
    // Measured against the emulator (the preview of a scene) on both kernels: a sprite's left edge is its X minus an offset, and its Y is where its
    // BOTTOM edge is, in steps of two lines from the top of the playfield. A DPC+ missile or ball is the exception: its Y is its top edge in lines.
    const dpcPlus = () => config().kernel === 'dpcplus';
    const spriteLeft = (sprite) => {
      // (A DPC+ ball is 17 to the left of its X, a missile 14: measured with the ball, Missile 0 and Missile 1 of a scene on both kernels.)
      if (!isScenePlayer(sprite.object)) return PLAYFIELD_LEFT + sprite.x - (dpcPlus() ? (sprite.object === 12 ? 17 : 14) : 18);
      // (Under DPC+ Player 0 is 13 and the players after it 16 in the measurements.)
      return PLAYFIELD_LEFT + sprite.x - (dpcPlus() ? (sprite.object === 0 ? 13 : 16) : 17);
    };
    // Under DPC+ the Y of a player is converted with the height of the tallest picture of the project, not of the sprite itself (the Y blocks make
    // it 2 * Y minus that height in lines, see dpcPlusSpriteLines in the generator), so a sprite shorter than that one sits higher.
    const tallestPicture = () => Math.max(16, 2 * Math.max(0, ...animations().map((animation) =>
      Math.max(0, ...((animation && animation.frames) || []).map((frame) => frame.pixels.length)))));
    // How many lines a step of Y is.
    const linesPerY = (sprite) => (dpcPlus() && !isScenePlayer(sprite.object) ? 1 : 2);

    const frameOf = (sprite) => {
      const animation = hasFlag(sprite, SCENE_FLAG_ANIMATION) ? animations()[sprite.animation] : animations()[0];
      return animation && animation.frames && animation.frames[0] ? animation.frames[0] : null;
    };
    const colorOf = (sprite, row) => {
      if (hasFlag(sprite, SCENE_FLAG_COLOR)) return sprite.color;
      const frame = frameOf(sprite);
      const colors = frame && frame.rowColors;
      return colors && colors.length ? colors[Math.min(row, colors.length - 1)] : sprite.color;
    };

    // The rectangles a sprite covers, in pixels and lines, for drawing and for finding what the pointer is on.
    const spriteRects = (sprite) => {
      const left = spriteLeft(sprite);
      if (isScenePlayer(sprite.object)) {
        const frame = frameOf(sprite);
        const width = frame && frame.pixels[0] ? frame.pixels[0].length : 8;
        const rows = frame ? frame.pixels.length : 8;
        const size = hasFlag(sprite, SCENE_FLAG_SIZE) ? Math.min(7, sprite.size) : 0;
        const top = 2 * sprite.y - (dpcPlus() ? tallestPicture() : rows * 2);
        // (A player drawn double or quad wide starts a pixel to the right of where a normal one does, as on the TIA: measured on both kernels.)
        return COPY_OFFSETS[size].map((offset) => ({left: left + offset + (COPY_STRETCH[size] > 1 ? 1 : 0), top, width: width * COPY_STRETCH[size], height: rows * 2}));
      }
      const size = hasFlag(sprite, SCENE_FLAG_SIZE) ? Math.min(3, sprite.size) : 0;
      // Measured on both kernels: the standard kernel draws a missile or ball a row (2 lines) taller than its height says and starts it at 2 * Y - 2 * its
      // height (a line higher for Missile 0 and two for Missile 1); a DPC+ one is as many lines as its height, Missile 1 a line higher.
      const lines = dpcPlus() ? sprite.height : 2 * sprite.height + 2;
      const height = Math.max(2, lines);
      const top = dpcPlus() ? sprite.y - (sprite.object === 11 ? 1 : 0) :
        2 * sprite.y - 2 * sprite.height - (sprite.object === 10 ? 1 : sprite.object === 11 ? 2 : 0);
      return [{left, top, width: MISSILE_WIDTHS[size], height}];
    };

    const drawScene = (scene) => {
      const canvas = document.getElementById(`scene-canvas-${scene.table.id}`);
      if (!canvas) return;
      const context = canvas.getContext('2d');
      const cfg = config();
      context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_LINES);
      const background = backgrounds().find(({id}) => id === scene.background);
      // The solid colors a playfield can set (the Playfield tab, when it has no row colors of that kind).
      const solid = (key, noRows) => (background && noRows && background[key] !== undefined && background[key] !== null ?
        colorByteToCss(background[key]) : null);
      const rowColorsOfBackground = background ? backgroundRowColors(background, cfg) : {pf: null, bk: null};
      const solidPf = solid('playfieldColor', !rowColorsOfBackground.pf);
      const solidBk = solid('backgroundColor', !rowColorsOfBackground.bk);
      context.fillStyle = solidBk || '#000';
      context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_LINES);
      if (background && background.pixels && background.pixels.length) {
        // The rows and their height come from the playfield of the scene (its pfres), and the colors are the ones its card shows.
        const {rowLines} = backgroundLayout(background, cfg);
        const {pf, bk} = backgroundRowColors(background, cfg);
        const rows = background.pixels.length;
        const total = rows * rowLines;
        // A list of colors can have more or fewer colors than the picture has rows: each is drawn at the height it covers.
        for (let line = 0; line < Math.min(SCREEN_LINES, Math.ceil(total)); line++) {
          const row = Math.min(rows - 1, Math.floor(line / rowLines));
          const pfColor = pf ? colorAtHeight(pf, line + 0.5, total) : solidPf || PLAYFIELD_COLOR;
          const bkColor = bk ? colorAtHeight(bk, line + 0.5, total) : null;
          background.pixels[row].forEach((pixel, x) => {
            if (pixel) {
              context.fillStyle = pfColor;
            } else if (bkColor) {
              context.fillStyle = bkColor;
            } else {
              return;
            }
            context.fillRect(playfieldLeftOf(config()) + 4 * x, line, 4, 1);
          });
        }
      }
      // The offset areas: a tinted rectangle of cells with the way the pixels move in its middle.
      (scene.offsets || []).forEach((offset, index) => {
        const rect = offsetRect(scene, offset);
        const chosen = isOffsetSelected(scene, index);
        context.fillStyle = 'rgba(0, 188, 212, 0.28)';
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.strokeStyle = chosen ? '#00e676' : 'rgba(0, 188, 212, 0.95)';
        context.lineWidth = 1;
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.fillText(OFFSET_ARROWS[offset.direction] || '', rect.x + rect.width / 2, rect.y + rect.height / 2);
        context.textAlign = 'start';
        if (chosen && !offset.whole) {
          context.fillStyle = '#00e676';
          context.fillRect(rect.x - 1, rect.y - 1, 4, 4);
          context.fillRect(rect.x + rect.width - 3, rect.y + rect.height - 3, 4, 4);
        }
      });
      // The triggers are drawn over the playfield and under the sprites: a tinted rectangle, with its name when it is wide enough.
      (scene.triggers || []).forEach((trigger, index) => {
        const chosen = isTriggerSelected(scene, index);
        context.fillStyle = 'rgba(255, 64, 129, 0.32)';
        context.fillRect(trigger.left, trigger.top, trigger.width, trigger.height);
        context.strokeStyle = chosen ? '#00e676' : 'rgba(255, 64, 129, 0.95)';
        context.lineWidth = 1;
        context.strokeRect(trigger.left + 0.5, trigger.top + 0.5, trigger.width - 1, trigger.height - 1);
        if (trigger.width >= 24 && trigger.height >= 9) {
          context.font = '7px sans-serif';
          context.textBaseline = 'top';
          context.fillStyle = '#ffffff';
          context.fillText(trigger.name, trigger.left + 2, trigger.top + 2, trigger.width - 4);
        }
        if (chosen) {
          context.fillStyle = '#00e676';
          context.fillRect(trigger.left - 1, trigger.top - 1, 4, 4);
          context.fillRect(trigger.left + trigger.width - 3, trigger.top + trigger.height - 3, 4, 4);
        }
      });
      scene.objects.forEach((sprite) => {
        context.globalAlpha = hasFlag(sprite, SCENE_FLAG_HIDDEN) ? 0.35 : 1;
        const rects = spriteRects(sprite);
        if (isScenePlayer(sprite.object)) {
          const frame = frameOf(sprite);
          const size = hasFlag(sprite, SCENE_FLAG_SIZE) ? Math.min(7, sprite.size) : 0;
          const stretch = COPY_STRETCH[size];
          rects.forEach((rect) => {
            if (!frame) {
              context.fillStyle = colorByteToCss(sprite.color);
              context.fillRect(rect.left, rect.top, rect.width, rect.height);
              return;
            }
            const flipped = hasFlag(sprite, SCENE_FLAG_FLIPPED);
            frame.pixels.forEach((row, y) => {
              context.fillStyle = colorByteToCss(colorOf(sprite, y));
              row.forEach((pixel, x) => {
                if (!pixel) return;
                const column = flipped ? row.length - 1 - x : x;
                context.fillRect(rect.left + column * stretch, rect.top + 2 * y, stretch, 2);
              });
            });
          });
        } else {
          const owner = scene.objects.find((candidate) => candidate.object === sprite.object - 10);
          const color = hasFlag(sprite, SCENE_FLAG_COLOR) && cfg.kernel === 'dpcplus' ? sprite.color : owner ? owner.color : 0x0E;
          context.fillStyle = colorByteToCss(color);
          rects.forEach((rect) => context.fillRect(rect.left, rect.top, rect.width, rect.height));
        }
        context.globalAlpha = 1;
        if (selected.value && selected.value.scene === scene.table.id && selected.value.object === sprite.object) {
          context.strokeStyle = '#00e676';
          context.lineWidth = 1;
          rects.forEach((rect) => context.strokeRect(rect.left - 0.5, rect.top - 0.5, rect.width + 1, rect.height + 1));
        }
      });
    };
    // The grid of the playfield's cells over the picture, with the "X,Y" of each cell as the Playfield tab's grid has. It is a canvas at the
    // size it is shown at, so the lines and the numbers stay sharp at any zoom.
    const drawGrid = (scene) => {
      const canvas = document.getElementById(`scene-grid-${scene.table.id}`);
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      // The size the picture is shown at: the zoom's, or less when the card is narrower (several columns).
      const width = canvas.parentElement.clientWidth || 480 * zoom.value;
      const height = canvas.parentElement.clientHeight || width * 0.6;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      // (Its shown size follows the picture's in CSS; only the bitmap is sized here.)
      const context = canvas.getContext('2d');
      context.scale(ratio, ratio);
      const background = backgrounds().find(({id}) => id === scene.background);
      if (!background || !background.pixels || !background.pixels.length) return;
      const cfg = config();
      const {rowLines} = backgroundLayout(background, cfg);
      const rows = background.pixels.length;
      const columns = background.pixels[0] ? background.pixels[0].length : 32;
      const scaleX = width / SCREEN_WIDTH;
      const scaleY = height / SCREEN_LINES;
      const cellWidth = 4 * scaleX;
      const cellHeight = rowLines * scaleY;
      const left = playfieldLeftOf(cfg) * scaleX;
      context.strokeStyle = 'rgba(170, 170, 170, 0.5)';
      context.lineWidth = 1;
      context.beginPath();
      for (let column = 0; column <= columns; column++) {
        context.moveTo(Math.round(left + column * cellWidth) + 0.5, 0);
        context.lineTo(Math.round(left + column * cellWidth) + 0.5, Math.min(height, rows * cellHeight));
      }
      for (let row = 0; row <= rows; row++) {
        context.moveTo(left, Math.round(row * cellHeight) + 0.5);
        context.lineTo(left + columns * cellWidth, Math.round(row * cellHeight) + 0.5);
      }
      context.stroke();
      if (!showGridLabels.value) return;
      const fontSize = Math.min(cellHeight * 0.6, cellWidth * 0.35, 12);
      if (fontSize < 5) return;
      context.font = `${fontSize}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      // Each label is white or black, whichever reads best against the color of its cell, as on the Playfield tab.
      const rowColors = backgroundRowColors(background, cfg);
      const pfCss = rowColors.pf ? colorsAtRows(rowColors.pf, rows) : null;
      const bkCss = rowColors.bk ? colorsAtRows(rowColors.bk, rows) : null;
      const labelColors = new Map();
      const labelColorFor = (cssColor) => {
        if (!labelColors.has(cssColor)) labelColors.set(cssColor, contrastingLabelColor(cssColor));
        return labelColors.get(cssColor);
      };
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const on = background.pixels[row][column];
          context.fillStyle = labelColorFor(on ? (pfCss ? pfCss[row] : PLAYFIELD_COLOR) : (bkCss ? bkCss[row] : '#000000'));
          context.fillText(`${column},${row}`, left + (column + 0.5) * cellWidth, (row + 0.5) * cellHeight);
        }
      }
    };
    // The pictures change size with the zoom, the number of columns and the window, so the grid is drawn again whenever one does.
    const watchPictureSizes = () => {
      if (!window.ResizeObserver) return;
      if (!resizeObserver) resizeObserver = new ResizeObserver(() => scenes.value.forEach(drawGrid));
      resizeObserver.disconnect();
      instance.proxy.$el.querySelectorAll('.scene-canvas-wrap').forEach((wrap) => resizeObserver.observe(wrap));
    };
    const redraw = () => nextTick(() => {
      scenes.value.forEach((scene) => {
        drawScene(scene);
        drawGrid(scene);
      });
      watchPictureSizes();
    });
    watch([scenes, selected, zoom, showGrid, showGridLabels], redraw);

    // ---- Dragging ------------------------------------------------------------------------------------------------------------------
    let drag = null;
    const pointerAt = (canvas, event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        px: ((event.clientX - rect.left) / rect.width) * SCREEN_WIDTH,
        line: ((event.clientY - rect.top) / rect.height) * SCREEN_LINES,
      };
    };
    // The sprite under the pointer (the one drawn last when they overlap).
    const spriteAt = (scene, canvas, event) => {
      const {px, line} = pointerAt(canvas, event);
      return [...scene.objects].reverse().find((sprite) =>
        spriteRects(sprite).some((rect) => px >= rect.left && px < rect.left + rect.width && line >= rect.top && line < rect.top + rect.height));
    };
    // The trigger under the pointer (the one drawn last when they overlap), and which part of the selected one it is on: its corners resize it.
    const triggerAt = (scene, canvas, event) => {
      const {px, line} = pointerAt(canvas, event);
      const chosen = selectedTrigger(scene);
      if (chosen) {
        const near = (x, y) => Math.abs(px - x) <= 3 && Math.abs(line - y) <= 3;
        if (near(chosen.left + chosen.width, chosen.top + chosen.height)) return {index: selected.value.trigger, mode: 'br'};
        if (near(chosen.left, chosen.top)) return {index: selected.value.trigger, mode: 'tl'};
      }
      for (let index = scene.triggers.length - 1; index >= 0; index--) {
        const trigger = scene.triggers[index];
        if (px >= trigger.left && px < trigger.left + trigger.width && line >= trigger.top && line < trigger.top + trigger.height) {
          return {index, mode: 'move'};
        }
      }
      return null;
    };
    // The offset area under the pointer, and which part of the selected one it is on (its corners resize it, in cells).
    const offsetAt = (scene, canvas, event) => {
      const {px, line} = pointerAt(canvas, event);
      const chosen = selectedOffset(scene);
      if (chosen && !chosen.whole) {
        const rect = offsetRect(scene, chosen);
        const near = (x, y) => Math.abs(px - x) <= 3 && Math.abs(line - y) <= 3;
        if (near(rect.x + rect.width, rect.y + rect.height)) return {index: selected.value.offset, mode: 'br'};
        if (near(rect.x, rect.y)) return {index: selected.value.offset, mode: 'tl'};
      }
      for (let index = scene.offsets.length - 1; index >= 0; index--) {
        const rect = offsetRect(scene, scene.offsets[index]);
        if (px >= rect.x && px < rect.x + rect.width && line >= rect.y && line < rect.y + rect.height) {
          return {index, mode: scene.offsets[index].whole ? 'select' : 'move'};
        }
      }
      return null;
    };
    // The pointer is an arrow, and a hand over a sprite or a trigger (a closed one while it is dragged).
    const handlePointerHover = (scene, event) => {
      if (drag) return;
      const onSprite = !!spriteAt(scene, event.currentTarget, event);
      const trigger = onSprite ? null : triggerAt(scene, event.currentTarget, event);
      const offset = onSprite || trigger ? null : offsetAt(scene, event.currentTarget, event);
      event.currentTarget.style.cursor = onSprite ? 'grab' : trigger ? (trigger.mode === 'move' ? 'grab' : 'nwse-resize') :
        offset ? (offset.mode === 'move' ? 'grab' : offset.mode === 'select' ? 'pointer' : 'nwse-resize') : 'default';
    };
    const handlePointerDown = (scene, event) => {
      const canvas = event.currentTarget;
      const {px, line} = pointerAt(canvas, event);
      const hit = spriteAt(scene, canvas, event);
      if (!hit) {
        const trigger = triggerAt(scene, canvas, event);
        if (!trigger) {
          const area = offsetAt(scene, canvas, event);
          if (!area) {
            selected.value = null;
            return;
          }
          selectOffset(scene, area.index);
          if (area.mode === 'select') return;
          canvas.setPointerCapture(event.pointerId);
          const chosenArea = scene.offsets[area.index];
          drag = {scene, canvas, offset: area.index, mode: area.mode, startPx: px, startLine: line,
            start: {left: chosenArea.left, top: chosenArea.top, right: chosenArea.right, bottom: chosenArea.bottom}, moved: false};
          return;
        }
        selectTrigger(scene, trigger.index);
        canvas.setPointerCapture(event.pointerId);
        const chosen = scene.triggers[trigger.index];
        drag = {scene, canvas, trigger: trigger.index, mode: trigger.mode, startPx: px, startLine: line,
          start: {left: chosen.left, top: chosen.top, width: chosen.width, height: chosen.height}, moved: false};
        return;
      }
      select(scene, hit.object);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      drag = {scene, canvas, object: hit.object, startPx: px, startLine: line, startX: hit.x, startY: hit.y, moved: false};
    };
    const handleTriggerDrag = (event) => {
      const {px, line} = pointerAt(drag.canvas, event);
      const dx = Math.round(px - drag.startPx);
      const dy = Math.round(line - drag.startLine);
      const trigger = drag.scene.triggers[drag.trigger];
      if (!trigger) return;
      const start = drag.start;
      let {left, top, width, height} = start;
      if (drag.mode === 'move') {
        left = clampTo(start.left + dx, 0, SCENE_SCREEN_WIDTH - start.width);
        top = clampTo(start.top + dy, 0, SCENE_SCREEN_LINES - start.height);
      } else if (drag.mode === 'br') {
        width = clampTo(start.width + dx, 1, SCENE_SCREEN_WIDTH - start.left);
        height = clampTo(start.height + dy, 1, SCENE_SCREEN_LINES - start.top);
      } else {
        left = clampTo(start.left + dx, 0, start.left + start.width - 1);
        top = clampTo(start.top + dy, 0, start.top + start.height - 1);
        width = start.left + start.width - left;
        height = start.top + start.height - top;
      }
      if (trigger.left === left && trigger.top === top && trigger.width === width && trigger.height === height) return;
      Object.assign(trigger, {left, top, width, height});
      drag.moved = true;
      drawScene(drag.scene);
    };
    // An offset area is moved and resized a cell at a time.
    const handleOffsetDrag = (event) => {
      const {px, line} = pointerAt(drag.canvas, event);
      const grid = offsetGrid(drag.scene);
      const dc = Math.round((px - drag.startPx) / 4);
      const dr = Math.round((line - drag.startLine) / grid.rowLines);
      const offset = drag.scene.offsets[drag.offset];
      if (!offset) return;
      const start = drag.start;
      const first = {left: Math.min(start.left, start.right), right: Math.max(start.left, start.right), top: Math.min(start.top, start.bottom),
        bottom: Math.max(start.top, start.bottom)};
      let {left, right, top, bottom} = first;
      if (drag.mode === 'move') {
        const width = first.right - first.left;
        const height = first.bottom - first.top;
        left = clampTo(first.left + dc, 0, grid.columns - 1 - width);
        top = clampTo(first.top + dr, 0, grid.rows - 1 - height);
        right = left + width;
        bottom = top + height;
      } else if (drag.mode === 'br') {
        right = clampTo(first.right + dc, first.left, grid.columns - 1);
        bottom = clampTo(first.bottom + dr, first.top, grid.rows - 1);
      } else {
        left = clampTo(first.left + dc, 0, first.right);
        top = clampTo(first.top + dr, 0, first.bottom);
      }
      if (offset.left === left && offset.right === right && offset.top === top && offset.bottom === bottom) return;
      Object.assign(offset, {left, right, top, bottom});
      drag.moved = true;
      drawScene(drag.scene);
    };
    const handlePointerMove = (event) => {
      if (!drag) return;
      if (drag.offset !== undefined) {
        handleOffsetDrag(event);
        return;
      }
      if (drag.trigger !== undefined) {
        handleTriggerDrag(event);
        return;
      }
      const {px, line} = pointerAt(drag.canvas, event);
      const x = Math.min(255, Math.max(0, Math.round(drag.startX + px - drag.startPx)));
      const sprite = drag.scene.objects.find((candidate) => candidate.object === drag.object);
      if (!sprite) return;
      const y = Math.min(255, Math.max(0, Math.round(drag.startY + (line - drag.startLine) / linesPerY(sprite))));
      if (sprite.x === x && sprite.y === y) return;
      // The picture follows the pointer at once; the card is written when the button is let go.
      sprite.x = x;
      sprite.y = y;
      drag.moved = true;
      drawScene(drag.scene);
    };
    const handlePointerUp = () => {
      if (!drag) return;
      const finished = drag;
      drag = null;
      finished.canvas.style.cursor = 'grab';
      if (!finished.moved) return;
      const found = finished.offset !== undefined ? finished.scene.offsets[finished.offset] :
        finished.trigger !== undefined ? finished.scene.triggers[finished.trigger] :
          finished.scene.objects.find((candidate) => candidate.object === finished.object);
      if (found) {
        writeScene(finished.scene.table.id, {background: finished.scene.background, objects: finished.scene.objects, triggers: finished.scene.triggers,
          offsets: finished.scene.offsets});
      }
    };

    // The toolbar grows and gains a line once the tab is scrolled, as the Data tab's does.
    const isToolbarScrolled = ref(false);
    let scrollContainer = null;
    let resizeObserver = null;
    const handleScroll = (event) => {
      isToolbarScrolled.value = event.target.scrollTop > 0;
    };
    onMounted(() => {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('keydown', handleHistoryHotkey);
      window.addEventListener('keydown', handleArrowKeys);
      window.addEventListener('keydown', handleDeleteKey);
      window.addEventListener('resize', redraw);
      scrollContainer = instance.proxy.$el.querySelector('.editor-container');
      if (scrollContainer) scrollContainer.addEventListener('scroll', handleScroll);
      redraw();
    });
    onBeforeUnmount(() => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleHistoryHotkey);
      window.removeEventListener('keydown', handleArrowKeys);
      window.removeEventListener('keydown', handleDeleteKey);
      window.removeEventListener('resize', redraw);
      if (resizeObserver) resizeObserver.disconnect();
      if (scrollContainer) scrollContainer.removeEventListener('scroll', handleScroll);
    });

    return {
      scenes, selected, zoom, showGrid, showGridLabels, cardColumns, backgroundItems, animationItems, selectedCardId, selectedCardIds, selectCard, deleteQuestion, isCollapsed, handleToggle,
      visibleScenes, foldersOf, openFolderId, openFolder, refresh, handleAddFolder, handleDeleteFolder, handleDropCards, draggingCardIndex, cardHandleListeners,
      folderToolbar, folderToolbarHeight, folderToolbarPinned,
      tableIndex, dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners, selectedScene, canUndoScene, canRedoScene,
      handleUndo, handleRedo, reorderCanUndo, reorderCanRedo, UNDO_TITLE, REDO_TITLE, isToolbarScrolled, handleDuplicateScene,
      handleDeselect, testingId, buildInProgress, handleTestScene,
      objectLabel, spriteColor, isPlayer, hasFlag, hasColor, freeObjects, widthItems, selectedSprite, isSelected, select,
      selectedOffset, isOffsetSelected, selectOffset, offsetDirectionItems, offsetFrameItems, handleAddOffset, handleRemoveOffset, handleOffsetField,
      handleOffsetDirection, handleOffsetWhole, handleOffsetMask, handleOffsetDelta,
      triggerCallItems, triggerCallValue, triggerCallParams, handleTriggerCallOn, handleTriggerCallTarget, handleTriggerCallArg,
      triggerByOpen, selectedTrigger, isTriggerSelected, selectTrigger, triggerKindItems, triggerSceneItems, triggerObjects, handleAddTrigger, handleRemoveTrigger,
      handleTriggerField, handleTriggerName, handleTriggerKind, handleTriggerScene, handleTriggerMask, TRIGGER_MOVE: SCENE_TRIGGER_MOVE,
      TRIGGER_LOAD: SCENE_TRIGGER_LOAD,
      handleAddScene, handleRename, handleDeleteScene, handleBackground, handleAddObject, handleRemoveObject, handleField, handleColor,
      handleWidth, handleAnimation, handleFlag, handlePointerDown, handlePointerHover,
      COLOR_FLAG: SCENE_FLAG_COLOR, SIZE_FLAG: SCENE_FLAG_SIZE, ANIMATION_FLAG: SCENE_FLAG_ANIMATION, FLIPPED_FLAG: SCENE_FLAG_FLIPPED,
      HIDDEN_FLAG: SCENE_FLAG_HIDDEN,
    };
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

/* The same list and card layout as the Data tab's (see DataEditor.vue's comments on each rule). */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
  width: 100%;
}

.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

/* Several columns of cards when the window has room (the toggle in the toolbar), one full-width column otherwise. A column is as wide as the
   picture at the zoom, as the cards of the Playfield tab are as wide as their editors, and the fields go under the picture. */
.scene-list--columns {
  display: grid;
  align-items: start;
}

.scene-card {
  position: relative;
  width: 100%;
}

.scene-drag-handle {
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

.drag-reorder-side-before {
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.drag-reorder-side-after {
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

.scene-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

.scene-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

.scene-toolbar-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  z-index: 1;
}

.scene-name-section {
  padding-bottom: 0;
}

.scene-name-field {
  margin-top: 20px;
  margin-bottom: -13px;
  flex: 1 1 auto;
}

/* The playfield sits on the same row as the name, as Columns does on the Data tab. */
.scene-name-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  /* The same place as the name row of the Playfield cards. */
  margin-top: 6px;
  margin-bottom: -2px;
}

/* A closed card ends with the name row: 20px under its underline, as on the Playfield cards. */
.scene-card-collapsed .scene-name-section {
  padding-bottom: 12px;
}

.scene-background-field {
  flex: 0 1 260px;
  margin-top: 20px;
  margin-bottom: -13px;
}

.scene-body-section {
  padding-top: 0;
  /* 20px from the picture to the bottom of the card, as on the other tabs */
  padding-bottom: 19px;
}

.scene-caption-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

.scene-caption {
  font-size: 0.75rem;
  opacity: 0.6;
}

.scene-body {
  display: flex;
  gap: 16px;
  margin-top: 4px;
  flex-wrap: wrap;
}

/* The shape of the Playfield tab's picture: a step of Y (two lines) is as tall as a pixel is wide, so the 192 lines are 96 pixels high. */
.scene-canvas-wrap {
  position: relative;
  flex: 0 1 auto;
  /* The height follows the shape of the picture, not the height of the settings beside it (they grow when a sprite, a trigger or an area is selected). */
  align-self: flex-start;
  min-width: 0;
  max-width: 100%;
  /* 160 color clocks, each 1.82 times as wide as a line is tall (see utils/pixel-aspect.js), over 192 lines. */
  aspect-ratio: 291.2 / 192;
  outline: 1px solid rgba(0, 0, 0, 0.3);
}

.scene-grid-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.scene-canvas {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
  cursor: default;
  touch-action: none;
  background: #000;
}

.scene-properties {
  flex: 1 1 240px;
  min-width: 240px;
}

.scene-list--columns .scene-properties {
  flex-basis: 100%;
}

/* A sprite that is not selected has the color of its block as the outline only, so its name stays readable in every color setting. */
.scene-chips >>> .v-chip.scene-chip-idle {
  color: inherit !important;
  border-color: var(--scene-chip-colour) !important;
}

/* (8 pixels apart and from the left edge as they are: with the plain button look each has a background, so the -8 pixel margin that lined
   up a text-only button's words with the edge made them overlap.) */
.scene-add-sprite-btn {
  margin: 0 8px 8px 0;
}

.scene-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.scene-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  max-width: 360px;
}

/* What follows a selected trigger's or offset area's fields (the offset chips, the hint line) is kept 12 pixels below its Remove button, as
   the chips are from what follows them. */
.scene-fields + .scene-chips,
.scene-fields + .scene-empty {
  margin-top: 12px;
}

/* The first field of a selected sprite, trigger or offset area (outlined: its label sits on its top border, above the box) is kept 18 pixels
   below the chips, so its label is not right under them. */
.scene-chips + .scene-fields {
  margin-top: 18px;
}

.scene-number-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.scene-number-field {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  padding: 0;
}

.scene-select-field {
  width: 100%;
  margin: 0;
  padding: 0;
}

.scene-often-field {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}

.scene-delta-field {
  flex: 0 0 110px;
}

.scene-check-row {
  display: flex;
  gap: 24px;
}

/* A Function's arguments, three to a line. */
.scene-call-args {
  flex-wrap: wrap;
}

.scene-call-args .scene-number-field {
  flex: 0 0 calc((100% - 24px) / 3);
}

.scene-check {
  margin: 0;
  padding: 0;
}

.scene-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scene-trigger-checks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 12px;
}

.scene-trigger-checks >>> .v-input--selection-controls {
  margin: 0;
  padding: 0;
}

.scene-trigger-by {
  cursor: pointer;
  user-select: none;
}

.scene-empty,
.scene-label {
  opacity: 0.7;
}

/* The shared toolbar: the same sticky bar, line and spacing as the Data tab's. */
.scene-toolbar {
  position: sticky;
  top: var(--sticky-toolbar-offset, 0px);
  z-index: 2;
  background-color: #fff;
  padding-top: 4px;
  padding-bottom: 4px;
  transition: padding 0.15s ease;
  margin-left: -16px;
  margin-right: -16px;
  padding-left: 16px;
  padding-right: 16px;
  /* For the line inside it (see the Sprite tab's toolbar). */
  --toolbar-bleed: 16px;
}

/* The folders stay at the top of the tab when it scrolls, across its full width like the toolbars of the other tabs (the tab's 16px of padding is
   cancelled and put back); the toolbar under them sticks just under them. The same as the Sprite tab's. */
.scene-folder-toolbar {
  position: sticky;
  top: 0;
  z-index: 3;
  background-color: #fff;
  margin-left: -16px;
  margin-right: -16px;
  padding: 2px 16px 0;
  --toolbar-bleed: 16px;
}

.scene-folder-toolbar >>> .card-folder-bar {
  margin-top: 0;
}

.scene-folder-toolbar.folder-toolbar-pinned {
  padding-top: 10px;
}

.scene-folder-toolbar + .scene-toolbar {
  padding-top: 8px;
}
.scene-folder-toolbar + .scene-toolbar.scene-toolbar-scrolled {
  padding-top: 11px;
}

.desaturate-app-colors .scene-folder-toolbar {
  background-color: #e1e1e1;
}

.scene-divider {
  margin: 8px -16px 0;
  max-width: none;
}

/* The first button of the row starts at the left edge, where the first icon of the other tabs does. */
.scene-toolbar-row >>> .editor-zoom:first-child,
.scene-toolbar-row >>> .pixel-grid-toggle-btn:first-child {
  margin-left: 0;
}

.scene-toolbar-row {
  display: flex;
  align-items: center;
  min-height: 28px;
}

.desaturate-app-colors .scene-toolbar {
  background-color: #e1e1e1;
}

.scene-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

  /* The line at the bottom of the pinned toolbar takes the place of the toolbar's last divider (no double line). */
.scene-toolbar-scrolled .scene-divider {
  display: none;
}

/* The same dividers, spacing and icon colors as GraphicEditorToolbar.vue's. */
.scene-outer-divider {
  margin: 0 4px;
}

.scene-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.scene-tools >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
}

.scene-tools >>> .v-btn::before {
  display: none;
}

.scene-tools >>> .v-btn .v-icon {
  font-size: 19px;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.scene-tools >>> .v-btn--disabled .v-icon {
  color: rgba(0, 0, 0, 0.18) !important;
}

.scene-tools >>> .v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.scene-tools >>> .v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

.add-scene-button {
  bottom: 8px;
}
</style>
