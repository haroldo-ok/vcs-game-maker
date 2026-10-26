<template>
  <div>
    <v-card class="editor-container" :ripple="false" @click="handleDeselect">
      <v-card-title>Scene</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message scene-intro-paragraph">
          Set up a stage, a level or a menu here: choose a playfield, then drag the sprites that the project has onto it
          and give each its color, width and animation. Each scene is kept in a card on the Data tab, in a layout
          that works for any kind of game. The "Set scene" block picks a scene from a list and puts it on the screen;
          "Set scene by ID" does the same by the number of the scene's Data card.
        </p>

        <!-- Acts on whichever card is selected, the same shared toolbar as the Data tab's. -->
        <div class="scene-toolbar tight-under-intro" :class="{'scene-toolbar-scrolled': isToolbarScrolled}" @click.stop>
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
        </div>

        <v-list
          class="scene-list"
          :class="{'scene-list--columns': cardColumns}"
          :style="cardColumns ? {gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${480 * zoom + 34}px), ${480 * zoom + 34}px))`} : {}"
        >
          <v-list-item class="entry-list-item" v-for="scene in scenes" v-bind:key="scene.table.id">
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="scene-card"
                :class="[dragCardClass(tableIndex(scene)), {'scene-card-selected': selectedCardIds.includes(scene.table.id)}]"
                v-on="dragTargetListeners(tableIndex(scene))"
                @click.stop="(event) => selectCard(scene.table.id, event)"
              >
                <div
                  class="scene-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(tableIndex(scene))"
                  v-on="dragHandleListeners(tableIndex(scene))"
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
                  <v-btn
                    icon
                    small
                    title="Duplicate this scene"
                    class="titlescreen-play-btn scene-icon-btn-size"
                    @click.stop="() => handleDuplicateScene(scene)"
                  >
                    <v-icon>mdi-content-duplicate</v-icon>
                  </v-btn>
                  <confirm-delete-menu
                    :title="deleteQuestion(scene.table.id, 'scene')"
                    :selected="scene.table.id === selectedCardId && selectedCardIds.includes(scene.table.id)"
                    :activator-title="deleteQuestion(scene.table.id, 'scene').replace('?', '')"
                    icon-btn-class="scene-icon-btn-size"
                    @confirm="handleDeleteScene(scene)"
                  />
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
                      {{ scene.objects.length }} sprite{{ scene.objects.length === 1 ? '' : 's' }}
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
                      />
                      <canvas v-if="showGrid" :id="`scene-grid-${scene.table.id}`" class="scene-grid-canvas" />
                    </div>
                    <div class="scene-properties">
                      <v-menu offset-y>
                        <template v-slot:activator="{on, attrs}">
                          <v-btn text small class="scene-add-sprite-btn" :disabled="!freeObjects(scene).length" v-bind="attrs" v-on="on">
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
                      <div class="scene-chips">
                        <v-chip
                          v-for="sprite in scene.objects"
                          v-bind:key="sprite.object"
                          small
                          :outlined="!isSelected(scene, sprite.object)"
                          :color="isSelected(scene, sprite.object) ? 'primary' : null"
                          @click.stop="select(scene, sprite.object)"
                        >{{ objectLabel(sprite.object) }}</v-chip>
                        <span v-if="!scene.objects.length" class="scene-empty">No sprites yet: use Add sprite.</span>
                      </div>

                      <div v-if="selectedSprite(scene)" class="scene-fields" @click.stop>
                        <div class="scene-number-row">
                        <v-text-field
                          label="X" type="number" outlined dense hide-details class="scene-number-field"
                          :value="selectedSprite(scene).x"
                          @change="(value) => handleField(scene, 'x', value)"
                        />
                        <v-text-field
                          label="Y" type="number" outlined dense hide-details class="scene-number-field"
                          :value="selectedSprite(scene).y"
                          @change="(value) => handleField(scene, 'y', value)"
                        />
                        <v-text-field
                          v-if="!isPlayer(selectedSprite(scene).object)"
                          label="Height" type="number" outlined dense hide-details class="scene-number-field"
                          :value="selectedSprite(scene).height"
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
                        <v-btn text small @click.stop="handleRemoveObject(scene)">
                          <v-icon left small>mdi-minus</v-icon>
                          Remove sprite
                        </v-btn>
                      </div>
                      <div v-else-if="scene.objects.length" class="scene-empty">Click a sprite to change it, or drag it on the picture.</div>
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
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import EditorZoom from '../components/EditorZoom.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import {useEditorZoom} from '../hooks/zoom';
import {useBackgroundsStorage, useConfigurationStorage, useDataTablesStorage, usePixelGridLabelsStorage, usePixelGridOverlayStorage,
  usePlayerAnimationsStorage, useSceneCardColumnsStorage} from '../hooks/project';
import {processDataTablesStorageDefaults} from '../blocks/data';
import {processBackgroundStorageDefaults, colorsAtPixelRows, DEFAULT_ROW_COLOR, DEFAULT_BK_ROW_COLOR} from '../blocks/background';
import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {insertCardAfter, remapKeyed, removeCards} from '../utils/card-refs';
import {useCollapsedIds} from '../hooks/collapse';
import {useCardSelection} from '../hooks/card-selection';
import {useDragReorder} from '../hooks/drag-reorder';
import {canRedoReorder, canUndoReorder, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';
import {REDO_TITLE, UNDO_TITLE, undoRedoKind} from '../utils/undo-hotkey';
import {colorByteToCss} from '../utils/palette';
import {pfRowDivisorFor, backgroundRowLinesFor, playerPfXOffset, missileBallPfXOffset} from '../utils/playfield-coords';
import {
  SCENE_FLAG_ANIMATION, SCENE_FLAG_COLOR, SCENE_FLAG_FLIPPED, SCENE_FLAG_HEIGHT, SCENE_FLAG_HIDDEN, SCENE_FLAG_SIZE, SCENE_NO_ANIMATION,
  MISSILE_WIDTHS, availableSceneObjects, decodeScene, encodeScene, isScenePlayer, isSceneTable, newSceneObject, sceneObjectLabel,
  sceneValueFormats, sceneValueNotes,
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

const SCREEN_WIDTH = 160;
const SCREEN_LINES = 192;
// The playfield is 128 pixels wide, centered on the 160 pixel screen.
const PLAYFIELD_LEFT = 16;
// Where each copy of a player is, in pixels from the first (the number of the width/quantity option is the index).
const COPY_OFFSETS = [[0], [0, 16], [0, 32], [0, 16, 32], [0, 64], [0], [0, 32, 64], [0]];
const COPY_STRETCH = [1, 1, 1, 1, 1, 2, 1, 4];
const PLAYER_WIDTH_LABELS = ['1 copy', '2 copies, close', '2 copies, medium', '3 copies, close', '2 copies, wide', 'Double-sized',
  '3 copies, medium', 'Quad-sized'];

export default defineComponent({
  components: {ColorSwatchPicker, ConfirmDeleteMenu, EditorZoom, PixelGridToggle},
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

    const scenes = computed(() => tables.value.filter(isSceneTable).map((table) => ({table, ...decodeScene(table.values)})));
    const instance = getCurrentInstance();

    // The cards are selected, collapsed and reordered the way the other tabs' are. The scenes are cards among the Data tab's
    // tables, so the ones that move are the tables and a scene's place is its place in the whole list.
    const selectedCardId = ref(null);
    const {selectedCardIds, selectCard, deselectCard, getSelectedIndices, idsToDelete, deleteQuestion, remapIds: remapSelectedIds} =
      useCardSelection(() => tables.value.filter(isSceneTable).map(({id}) => id), selectedCardId);
    const {isCollapsed, toggleCollapsed, collapseAll, ensureExpanded, remapIds: remapCollapsedIds} = useCollapsedIds('scene', true);
    collapseAll();
    const selectedScene = computed(() => scenes.value.find(({table}) => table.id === selectedCardId.value) || null);
    const tableIndex = (scene) => tables.value.indexOf(scene.table);

    const backgrounds = () => processBackgroundStorageDefaults(backgroundsStorage).backgrounds;
    const animations = () => processPlayerAnimationsStorageDefaults(animationsStorage).animations || [];
    const backgroundItems = computed(() => [{text: 'Leave the playfield as it is', value: 0},
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
      valueNotes: (table.valueNotes || []).slice()});
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
        () => {
          const sceneTables = tables.value.filter(isSceneTable);
          return getSelectedIndices().map((index) => tables.value.indexOf(sceneTables[index]));
        },
        {sideBySide: () => cardColumns.value, renumber: {kind: 'datatable', onRenumbered: renumbered}},
    );

    const writeScene = (id, scene) => {
      recordChange(id);
      save((data) => {
        const table = data.dataTables.find((candidate) => candidate.id === id);
        if (!table) return;
        table.values = encodeScene(scene);
        table.valueFormats = sceneValueFormats(scene.objects.length);
        table.valueNotes = sceneValueNotes(scene.objects);
      });
    };
    const withScene = (scene, change) => {
      const next = {background: scene.background, objects: scene.objects.map((sprite) => ({...sprite}))};
      change(next);
      writeScene(scene.table.id, next);
    };

    const objectLabel = sceneObjectLabel;
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

    const handleAddScene = () => {
      let newId = 0;
      save((data) => {
        const id = (max(data.dataTables.map((table) => table.id)) || 0) + 1;
        newId = id;
        const number = data.dataTables.filter(isSceneTable).length + 1;
        const first = backgrounds()[0];
        data.dataTables.push({
          id,
          name: `Scene ${number}`,
          values: encodeScene({background: first ? first.id : 0, objects: []}),
          valueFormats: sceneValueFormats(0),
          valueNotes: sceneValueNotes([]),
          columns: 8,
          scene: true,
        });
      });
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
      save((data) => {
        const source = data.dataTables.find((candidate) => candidate.id === scene.table.id);
        if (!source) return;
        const copy = {...structuredClone(source), name: `${source.name || 'Scene'} copy`};
        const idMap = insertCardAfter('datatable', data.dataTables, source, copy);
        if (idMap) renumbered(idMap);
        copyId = copy.id;
      });
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
    const spriteLeft = (sprite) => PLAYFIELD_LEFT + sprite.x - (isScenePlayer(sprite.object) ? playerPfXOffset(config()) : missileBallPfXOffset(config()));
    const spriteTop = (sprite) => 2 * sprite.y;

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
      const top = spriteTop(sprite);
      if (isScenePlayer(sprite.object)) {
        const frame = frameOf(sprite);
        const width = frame && frame.pixels[0] ? frame.pixels[0].length : 8;
        const rows = frame ? frame.pixels.length : 8;
        const size = hasFlag(sprite, SCENE_FLAG_SIZE) ? Math.min(7, sprite.size) : 0;
        return COPY_OFFSETS[size].map((offset) => ({left: left + offset, top, width: width * COPY_STRETCH[size], height: rows * 2}));
      }
      const size = hasFlag(sprite, SCENE_FLAG_SIZE) ? Math.min(3, sprite.size) : 0;
      return [{left, top, width: MISSILE_WIDTHS[size], height: Math.max(2, 2 * sprite.height)}];
    };

    const drawScene = (scene) => {
      const canvas = document.getElementById(`scene-canvas-${scene.table.id}`);
      if (!canvas) return;
      const context = canvas.getContext('2d');
      const cfg = config();
      context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_LINES);
      context.fillStyle = '#000';
      context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_LINES);
      const background = backgrounds().find(({id}) => id === scene.background);
      if (background && background.pixels) {
        const rowLines = cfg.kernel === 'dpcplus' ? backgroundRowLinesFor(background, cfg) : 2 * pfRowDivisorFor(cfg);
        const pfColors = colorsAtPixelRows(background, 'pf') || [];
        const bkColors = colorsAtPixelRows(background, 'bk') || [];
        background.pixels.forEach((row, y) => {
          const top = Math.round(y * rowLines);
          const height = Math.round((y + 1) * rowLines) - top;
          const bk = bkColors[y];
          if (bk !== undefined && bk !== DEFAULT_BK_ROW_COLOR) {
            context.fillStyle = colorByteToCss(bk);
            context.fillRect(0, top, SCREEN_WIDTH, height);
          }
          context.fillStyle = colorByteToCss(pfColors[y] !== undefined ? pfColors[y] : DEFAULT_ROW_COLOR);
          row.forEach((pixel, x) => {
            if (pixel) context.fillRect(PLAYFIELD_LEFT + 4 * x, top, 4, height);
          });
        });
      }
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
          context.strokeStyle = '#ffeb3b';
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
      const height = canvas.parentElement.clientHeight || width * 0.8;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      // (Its shown size follows the picture's in CSS; only the bitmap is sized here.)
      const context = canvas.getContext('2d');
      context.scale(ratio, ratio);
      const background = backgrounds().find(({id}) => id === scene.background);
      if (!background || !background.pixels || !background.pixels.length) return;
      const cfg = config();
      const rowLines = cfg.kernel === 'dpcplus' ? backgroundRowLinesFor(background, cfg) : 2 * pfRowDivisorFor(cfg);
      const rows = background.pixels.length;
      const columns = background.pixels[0] ? background.pixels[0].length : 32;
      const scaleX = width / SCREEN_WIDTH;
      const scaleY = height / SCREEN_LINES;
      const cellWidth = 4 * scaleX;
      const cellHeight = rowLines * scaleY;
      const left = PLAYFIELD_LEFT * scaleX;
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
      const pfColors = colorsAtPixelRows(background, 'pf') || [];
      const bkColors = colorsAtPixelRows(background, 'bk') || [];
      const labelColors = new Map();
      const labelColorFor = (cssColor) => {
        if (!labelColors.has(cssColor)) labelColors.set(cssColor, contrastingLabelColor(cssColor));
        return labelColors.get(cssColor);
      };
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const on = background.pixels[row][column];
          const byte = on ? (pfColors[row] !== undefined ? pfColors[row] : DEFAULT_ROW_COLOR) : bkColors[row];
          context.fillStyle = labelColorFor(byte === undefined ? '#000000' : colorByteToCss(byte));
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
    const handlePointerDown = (scene, event) => {
      const canvas = event.currentTarget;
      const {px, line} = pointerAt(canvas, event);
      const hit = [...scene.objects].reverse().find((sprite) =>
        spriteRects(sprite).some((rect) => px >= rect.left && px < rect.left + rect.width && line >= rect.top && line < rect.top + rect.height));
      if (!hit) {
        selected.value = null;
        return;
      }
      select(scene, hit.object);
      canvas.setPointerCapture(event.pointerId);
      drag = {scene, canvas, object: hit.object, startPx: px, startLine: line, startX: hit.x, startY: hit.y, moved: false};
    };
    const handlePointerMove = (event) => {
      if (!drag) return;
      const {px, line} = pointerAt(drag.canvas, event);
      const x = Math.min(255, Math.max(0, Math.round(drag.startX + px - drag.startPx)));
      const y = Math.min(255, Math.max(0, Math.round(drag.startY + (line - drag.startLine) / 2)));
      const sprite = drag.scene.objects.find((candidate) => candidate.object === drag.object);
      if (!sprite || (sprite.x === x && sprite.y === y)) return;
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
      if (!finished.moved) return;
      const sprite = finished.scene.objects.find((candidate) => candidate.object === finished.object);
      if (sprite) writeScene(finished.scene.table.id, {background: finished.scene.background, objects: finished.scene.objects});
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
      window.removeEventListener('resize', redraw);
      if (resizeObserver) resizeObserver.disconnect();
      if (scrollContainer) scrollContainer.removeEventListener('scroll', handleScroll);
    });

    return {
      scenes, selected, zoom, showGrid, showGridLabels, cardColumns, backgroundItems, animationItems, selectedCardId, selectedCardIds, selectCard, deleteQuestion, isCollapsed, handleToggle,
      tableIndex, dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners, selectedScene, canUndoScene, canRedoScene,
      handleUndo, handleRedo, reorderCanUndo, reorderCanRedo, UNDO_TITLE, REDO_TITLE, isToolbarScrolled, handleDuplicateScene,
      handleDeselect,
      objectLabel, isPlayer, hasFlag, hasColor, freeObjects, widthItems, selectedSprite, isSelected, select,
      handleAddScene, handleRename, handleDeleteScene, handleBackground, handleAddObject, handleRemoveObject, handleField, handleColor,
      handleWidth, handleAnimation, handleFlag, handlePointerDown,
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
  top: 10px;
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
  flex: 1 1 auto;
}

/* The playfield sits on the same row as the name, as Columns does on the Data tab. */
.scene-name-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.scene-background-field {
  flex: 0 1 260px;
  margin-top: 20px;
}

.scene-body-section {
  padding-top: 0;
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

/* Three screen pixels across and two high per line, the shape of the emulator's picture. */
.scene-canvas-wrap {
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  aspect-ratio: 5 / 4;
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
  cursor: grab;
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

.scene-add-sprite-btn {
  margin: 0 0 8px -8px;
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

.scene-check-row {
  display: flex;
  gap: 24px;
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

.scene-empty,
.scene-label {
  opacity: 0.7;
}

/* The shared toolbar: the same sticky bar, line and spacing as the Data tab's. */
.scene-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
  padding-top: 4px;
  padding-bottom: 4px;
  transition: padding 0.15s ease;
  margin-left: -16px;
  margin-right: -16px;
  padding-left: 16px;
  padding-right: 16px;
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

/* The same dividers, spacing and icon colors as GraphicEditorToolbar.vue's. */
.scene-outer-divider {
  margin: 0 6px;
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
