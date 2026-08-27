<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Data</v-card-title>
      <v-card-text>
        <v-list class="data-list">
          <v-list-item class="entry-list-item" v-for="(table, index) in state.dataTables" v-bind:key="table.id">
            <v-list-item-content>
              <v-card outlined class="data-card" :class="dragCardClass(index)" v-on="dragTargetListeners(index)">
                <div
                  class="data-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-btn
                  :title="isCollapsed(table) ? 'Expand this table' : 'Collapse this table'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="data-collapse-btn"
                  @click="() => toggleCollapsed(table)"
                >
                  <v-icon>{{ isCollapsed(table) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="data-id-badge">ID:{{ table.id }}</div>

                <div class="data-toolbar-top-right">
                  <v-btn
                    icon
                    small
                    title="Duplicate this table"
                    class="data-flat-icon-btn data-icon-btn-size"
                    @click="() => handleDuplicateTable(table)"
                  >
                    <v-icon>mdi-content-duplicate</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Copy this table's contents (values, columns, and value formats)"
                    class="data-flat-icon-btn data-icon-btn-size"
                    @click="() => handleCopyTable(table)"
                  >
                    <v-icon>mdi-content-copy</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :disabled="!copiedTableData"
                    title="Paste copied contents onto this table"
                    class="data-flat-icon-btn data-icon-btn-size"
                    @click="() => handlePasteTable(table)"
                  >
                    <v-icon>mdi-content-paste</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Export to .CSV"
                    class="data-flat-icon-btn data-icon-btn-size"
                    @click="() => handleExportCsv(table)"
                  >
                    <v-icon>mdi-export</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Import from .CSV"
                    class="data-flat-icon-btn data-icon-btn-size"
                    @click="() => handleImportCsv(table)"
                  >
                    <v-icon>mdi-import</v-icon>
                  </v-btn>

                  <v-menu
                    v-if="state.dataTables.length > 1"
                    top
                  >
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        title="Delete this table"
                        icon
                        small
                        class="delete-icon-btn data-icon-btn-size"
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon>mdi-delete</v-icon>
                      </v-btn>
                    </template>

                    <v-card>
                      <v-card-title>Delete this table?</v-card-title>
                      <v-list>
                        <v-list-item @click="handleDeleteTable(table)">
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

                <v-card-text class="data-name-section">
                  <div class="data-name-row">
                    <v-text-field
                      class="data-name-field"
                      label="Table name"
                      v-model="table.name"
                      @change="handleChildChange"
                    />
                    <v-text-field
                      :value="tableColumns(table)"
                      @input="(v) => handleColumnsInput(table, v)"
                      @change="() => handleColumnsChange(table)"
                      type="number"
                      min="1"
                      :max="maxColumns"
                      dense
                      hide-details
                      label="Columns"
                      title="The most value fields to show per row before wrapping to a new one - fewer show automatically if the window's too narrow to fit this many at a legible width"
                      class="data-columns-field"
                    />
                  </div>
                </v-card-text>

                <v-card-text v-if="!isCollapsed(table)" class="data-values-section">
                  <div class="data-caption-row">
                    <div class="data-caption">
                      {{ table.values.length }} / {{ maxValues }} values (0-255 each)
                    </div>
                  </div>

                  <div class="data-values" :style="{gridTemplateColumns:
                    `repeat(auto-fit, minmax(max(calc((100% - ${tableColumns(table) - 1 + DATA_VALUES_EXTRA_SLACK_PX}px) / ${tableColumns(table)}), ${DATA_VALUE_CELL_MIN_PX}px), 1fr))`}">
                    <div
                      v-for="(value, index) in table.values"
                      v-bind:key="index"
                      class="data-value-row"
                      :class="valueDragClass(table, index)"
                      v-on="valueRowListeners(table, index)"
                    >
                      <span
                        class="data-value-index"
                        draggable="true"
                        title="Drag to reorder"
                        v-on="valueHandleListeners(table, index)"
                      >{{ index }}</span>
                      <color-swatch-picker
                        v-if="valueFormat(table, index) === 'color'"
                        class="data-value-color-picker"
                        :value="table.values[index]"
                        :allow-clear="false"
                        title="Click to change this value's color"
                        @input="(byte) => handleColorValueInput(table, index, byte)"
                      />
                      <v-select
                        v-else-if="dropdownOptionsFor(valueFormat(table, index))"
                        :value="table.values[index]"
                        :items="dropdownOptionsFor(valueFormat(table, index)).value"
                        item-text="text"
                        item-value="value"
                        dense
                        hide-details
                        class="data-value-field data-value-dropdown-select"
                        @change="(value) => handleDropdownValueInput(table, index, value)"
                        @focus="() => handleSelectValue(table, index)"
                      />
                      <v-text-field
                        v-else
                        :value="displayValue(table, index)"
                        @input="(v) => handleValueInput(table, index, v)"
                        :type="valueFormat(table, index) === 'dec' ? 'number' : 'text'"
                        :min="valueFormat(table, index) === 'dec' ? 0 : undefined"
                        :max="valueFormat(table, index) === 'dec' ? 255 : undefined"
                        :maxlength="valueFormat(table, index) === 'bin' ? 8 : valueFormat(table, index) === 'hex' ? 2 : undefined"
                        dense
                        hide-details
                        @change="() => handleValueChange(table, index)"
                        @focus="() => handleSelectValue(table, index)"
                        class="data-value-field"
                        :class="{'data-value-field-binary': valueFormat(table, index) !== 'dec'}"
                      />
                      <v-btn
                        icon
                        :title="FORMAT_TOGGLE_TITLES[valueFormat(table, index)]"
                        class="data-format-toggle-btn data-flat-icon-btn"
                        @click="() => toggleValueFormat(table, index)"
                      >
                        <v-icon
                          size="22"
                          :class="{
                            'data-format-icon-background': valueFormat(table, index) === 'background',
                            'data-format-icon-player0': valueFormat(table, index) === 'player0',
                            'data-format-icon-player1': valueFormat(table, index) === 'player1',
                            'data-format-icon-sound': valueFormat(table, index) === 'sound',
                            'data-format-icon-text': valueFormat(table, index) === 'text',
                          }"
                        >{{ FORMAT_ICONS[valueFormat(table, index)] }}</v-icon>
                      </v-btn>
                      <v-btn
                        icon
                        small
                        title="Remove this value"
                        :disabled="table.values.length <= 1"
                        @click="() => handleDeleteValue(table, index)"
                      >
                        <v-icon small>mdi-close</v-icon>
                      </v-btn>
                    </div>
                  </div>

                  <v-btn
                    text
                    small
                    title="Removes the value cell last clicked into, or the table's own last value if none has been"
                    :disabled="table.values.length <= 1"
                    @click="() => handleSubtractValue(table)"
                  >
                    <v-icon left small>mdi-minus</v-icon>
                    Subtract value
                  </v-btn>
                  <v-btn
                    text
                    small
                    :disabled="table.values.length >= maxValues"
                    @click="() => handleAddValue(table)"
                  >
                    <v-icon left small>mdi-plus</v-icon>
                    Add value
                  </v-btn>
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-data-button"
      color="primary"
      title="Add data table"
      dark
      absolute
      right
      fab
      @click="handleAddTable"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';
import {saveAs} from 'file-saver';

import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder, CSS_CLASS_DRAGGING} from '../hooks/drag-reorder';
import {useBackgroundsStorage, useDataTablesStorage, usePlayer0Storage, usePlayer1Storage,
  useSoundEffectsStorage, useSongsStorage, useTextStringsStorage} from '../hooks/project';
import {DEFAULT_DATA_TABLES, DEFAULT_DATA_TABLE_COLUMNS, MAX_DATA_TABLE_VALUES,
  processDataTablesStorageDefaults} from '../blocks/data';
import {processBackgroundStorageDefaults} from '../blocks/background';
import {processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {processSongsStorageDefaults} from '../blocks/music';
import {processTextStringsStorageDefaults} from '../blocks/text-strings';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';

// A data table is just a flat array of 0-255 bytes (see blocks/data.js), so
// its CSV form is a single row of comma-separated integers - no header, no
// columns, matching the table's own in-memory shape exactly.
const valueToCsvNumber = (value) => Math.min(255, Math.max(0, Math.round(value)));

// Purely a UI display cap (see table.columns/tableColumns) - past this many,
// each value field would need to shrink well past being usably clickable to
// keep them all fitting on screen without horizontal scrolling.
const MAX_DATA_TABLE_COLUMNS_DISPLAY = 8;

// The narrowest a single value cell (index label + field + format toggle +
// delete button) can get before it stops being usable - matches
// .data-value-field's own min-width (46px) plus its neighbors/gaps/padding,
// with a little headroom. Used as the grid's own auto-fit floor (see
// .data-values' inline gridTemplateColumns below): each column's own
// minimum width is max(its fair share at the table's own Columns setting,
// this floor) - on a wide enough window, "fair share" is already bigger
// than this floor, so auto-fit still lands on exactly Columns tracks
// (nothing else fits, since each one's already sized to fill its own equal
// share); once the window's too narrow for that fair share to clear this
// floor, this floor wins instead, and auto-fit settles on however many
// FEWER columns actually fit at that width, wrapping the rest onto
// additional rows - never letting any cell (not just however many happen
// to overflow the last row) get squeezed narrower than this.
// min() instead of max() here was tried first and was actually backwards:
// on a wide window, "fair share at Columns" is the LARGER number, so min()
// picked this floor instead - a value smaller than fair share, which let
// auto-fit fit MORE than Columns-many tracks into a wide row and only
// wrapped whatever didn't divide evenly onto its own final row, confirmed
// directly as the cause of a real "only the last cell wraps oddly" bug.
// "Fair share" itself is calc((100% - (Columns-1)*1px) / Columns), not a
// plain 100%/Columns - a plain percentage split leaves NO room for the
// (Columns-1) 1px column-gaps between tracks (see .data-values' own
// column-gap), so Columns tracks at exactly 100%/Columns each need
// (Columns-1)px MORE than the container actually has once gaps are added
// in - auto-fit correctly (if confusingly) responds by dropping to
// Columns-1 tracks instead. Confirmed directly: Columns set to 2/3/8
// rendered as 1/2/7 actual columns, always exactly one short, until this
// calc() started subtracting the gap total before dividing.
// DATA_VALUES_EXTRA_SLACK_PX below folds in the SAME reasoning for two more
// things this original fix didn't yet account for: .data-values' own 1px
// border on each side (2px total, inside the same 100% this percentage is
// measured against), and ordinary floating-point rounding in the percentage
// division itself (100%/3, .../7, etc. don't divide evenly) - either one on
// its own can still tip an exact-fit row back into the same "one column
// short" symptom this comment already fixed once, just by a sub-pixel
// margin this time rather than a whole gap's worth. Reproduced directly:
// Columns tracks still rendering as Columns-1 at specific window widths
// even with the gap subtraction above already in place.
const DATA_VALUES_EXTRA_SLACK_PX = 3;
const DATA_VALUE_CELL_MIN_PX = 120;

// Module-scope (not a ref inside setup()) - same reasoning as
// BackgroundEditor.vue's own copiedBackgroundData/copiedBackgroundRowColors:
// keeps the clipboard alive across navigating away from and back to this
// tab (Vue Router destroys and recreates this component each time).
const copiedTableData = ref(null);

export default defineComponent({
  components: {ColorSwatchPicker},
  setup() {
    const dataTablesStorage = useDataTablesStorage();
    const backgroundsStorage = useBackgroundsStorage();
    // {text, value} pairs for the 'background' format's dropdown (see
    // valueFormat/FORMAT_CYCLE below) - same {id, name} source
    // blocks/background.js's own buildBackgroundOptions reads for the
    // Blockly "Background:" field dropdown, just as a plain reactive
    // computed instead of a FieldDropdown options-generator function.
    const backgroundOptions = computed(() =>
      processBackgroundStorageDefaults(backgroundsStorage).backgrounds
          .map(({id, name}) => ({text: name || `Unnamed ${id}`, value: id})));
    const player0Storage = usePlayer0Storage();
    const player1Storage = usePlayer1Storage();
    // Same {text, value} shape as backgroundOptions above, but the VALUE is
    // each animation's own INDEX in the list, not an id - matching
    // blocks/sprites.js's own buildAnimationOptions exactly (see its
    // comment: the generated code dispatches on "player0animation = N"
    // against the animation's position in the list, not any stored id, so
    // that's what a data table value needs to hold too for this to mean
    // anything once read back by a Data block).
    const playerAnimationOptions = (playerStorage) => computed(() =>
      processPlayerStorageDefaults(playerStorage).animations
          .map((animation, index) => ({text: animation.name || `Unnamed ${index + 1}`, value: index})));
    const player0Options = playerAnimationOptions(player0Storage);
    const player1Options = playerAnimationOptions(player1Storage);
    // Same {id, name} -> {text, value} shape as backgroundOptions - sound
    // effects/songs/text strings are all referenced by their own stored id
    // (not a list position, unlike player animations above), matching
    // buildSoundEffectOptions/buildSongOptions/buildTextStringOptions'
    // own dropdowns in blocks/soundfx.js, blocks/music.js, and
    // blocks/text-strings.js respectively.
    const soundEffectsStorage = useSoundEffectsStorage();
    const soundOptions = computed(() =>
      processSoundEffectsStorageDefaults(soundEffectsStorage).soundEffects
          .map(({id, name}) => ({text: name || `Unnamed ${id}`, value: id})));
    const songsStorage = useSongsStorage();
    const musicOptions = computed(() =>
      processSongsStorageDefaults(songsStorage).songs
          .map(({id, name}) => ({text: name || `Unnamed ${id}`, value: id})));
    const textStringsStorage = useTextStringsStorage();
    const textOptions = computed(() =>
      processTextStringsStorageDefaults(textStringsStorage).textStrings
          .map(({id, name}) => ({text: name || `Unnamed ${id}`, value: id})));
    const state = computed({
      get() {
        try {
          return processDataTablesStorageDefaults(dataTablesStorage);
        } catch (e) {
          console.error('Error loading data tables from local storage', e);
          return DEFAULT_DATA_TABLES;
        }
      },

      set(newState) {
        dataTablesStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    const {isCollapsed, toggleCollapsed} = useCollapsedIds('data');

    // Card reordering (see hooks/drag-reorder.js and TextEditor.vue/
    // SoundFXEditor.vue/MusicEditor.vue's own uses of this same hook) -
    // tables are already referenced everywhere by their own permanent id
    // (see dataTableSymbolName/buildDataTableOptions in blocks/data.js),
    // never by array position, so reordering the display order here is
    // already safe.
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners: rawDragTargetListeners} =
      useDragReorder(
          () => state.value.dataTables,
          (items) => {
            state.value.dataTables = items;
            handleChildChange();
          },
      );

    const instance = getCurrentInstance();
    const handleAddTable = () => {
      const dataTables = state.value.dataTables;
      const maxId = max(dataTables.map((o) => o.id)) || 0;
      const newTable = {
        id: maxId + 1,
        name: `Table ${maxId + 1}`,
        values: [0],
        columns: DEFAULT_DATA_TABLE_COLUMNS,
      };

      state.value.dataTables.push(newTable);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteTable = (table) => {
      state.value.dataTables = state.value.dataTables.filter(({id}) => id != table.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Inserted right after the source table (not just appended to the end)
    // so the copy shows up exactly where a user would expect it, next to
    // the table they just duplicated - matches handleDuplicatePattern's own
    // placement convention in MusicEditor.vue. structuredClone (not a
    // shallow spread) since values/columns are the table's own real data,
    // not just a reference the copy should keep sharing with the original.
    const handleDuplicateTable = (table) => {
      const dataTables = state.value.dataTables;
      const maxId = max(dataTables.map((o) => o.id)) || 0;
      const newTable = {
        ...structuredClone(table),
        id: maxId + 1,
        name: `${table.name || 'Table'} copy`,
      };
      const sourceIndex = dataTables.findIndex(({id}) => id === table.id);
      dataTables.splice(sourceIndex + 1, 0, newTable);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Copy/paste the full contents (values/columns/valueFormats) of one
    // table onto a DIFFERENT existing one - unlike handleDuplicateTable
    // above (which always creates a brand new table), this overwrites
    // whatever table you paste it onto, id/name left alone, same "copy the
    // real content, not the identity" split BackgroundEditor.vue's own
    // handleCopyBackground/handlePasteBackground already establishes for an
    // identical copy-onto-an-existing-entry use case.
    const handleCopyTable = (table) => {
      copiedTableData.value = {
        columns: structuredClone(table.columns),
        values: structuredClone(table.values),
        valueFormats: structuredClone(table.valueFormats || null),
      };
    };
    // $set (not plain assignment) for columns/valueFormats - same reason as
    // handleColumnsInput's own comment just below: a table saved before
    // either field existed can't pick up a brand new property through a
    // plain assignment, Vue 2 never notices it. values is already always a
    // real property on every table (see DEFAULT_DATA_TABLES/
    // processDataTablesStorageDefaults in blocks/data.js), so a plain
    // reassignment of it is fine.
    const handlePasteTable = (table) => {
      if (!copiedTableData.value) return;
      table.values = structuredClone(copiedTableData.value.values);
      instance.proxy.$set(table, 'columns', structuredClone(copiedTableData.value.columns));
      instance.proxy.$set(table, 'valueFormats', structuredClone(copiedTableData.value.valueFormats));
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Falls back to the shared default for a table saved before this feature
    // existed (no "columns" of its own yet) - same reasoning as
    // buildSongOptions/DEFAULT_FADE_LENGTH elsewhere in this app.
    const tableColumns = (table) => {
      const value = Number(table.columns);
      return Number.isInteger(value) && value >= 1 ? Math.min(value, MAX_DATA_TABLE_COLUMNS_DISPLAY) :
        DEFAULT_DATA_TABLE_COLUMNS;
    };

    // Plain assignment (table.columns = ...) doesn't work for a table saved
    // before this feature existed - Vue 2 can't detect a brand new property
    // being added to an already-reactive object that way, so the grid's own
    // :style binding (which reads table.columns via tableColumns above)
    // never re-evaluates. $set (same fix every other structural change in
    // this file already uses - see handleAddValue/handleDeleteValue/
    // handleAddTable) plus $forceUpdate is what actually makes the change
    // visible immediately, confirmed directly as the cause of "changing the
    // Columns field doesn't update the table."
    const handleColumnsInput = (table, rawValue) => {
      instance.proxy.$set(table, 'columns', rawValue);
      instance.proxy.$forceUpdate();
    };

    const handleColumnsChange = (table) => {
      const value = Number(table.columns);
      const clamped = Number.isFinite(value) && value >= 1 ?
        Math.min(Math.round(value), MAX_DATA_TABLE_COLUMNS_DISPLAY) : DEFAULT_DATA_TABLE_COLUMNS;
      instance.proxy.$set(table, 'columns', clamped);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleAddValue = (table) => {
      if (table.values.length >= MAX_DATA_TABLE_VALUES) return;
      table.values.push(0);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteValue = (table, index) => {
      if (table.values.length <= 1) return;
      table.values.splice(index, 1);
      // Kept aligned with values above - same reasoning as the drag-reorder
      // drop handler's own identical splice.
      if (table.valueFormats) table.valueFormats.splice(index, 1);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Which value cell (by index) was last clicked into, per table (keyed by
    // table.id, a page-local UI-only concern, not project data) - what the
    // "- Subtract value" button below deletes, so it acts on whichever cell
    // the user was just working with rather than always the last one. Set
    // on focus (see the value field's own @focus in the template) - simply
    // clicking into a field to edit it is enough to "select" it here, no
    // separate selection affordance needed.
    const selectedValueIndex = ref({});
    const handleSelectValue = (table, index) => {
      instance.proxy.$set(selectedValueIndex.value, table.id, index);
    };
    // Deletes whichever cell was last focused in THIS table (see
    // selectedValueIndex above), or the table's own last value if nothing's
    // been focused yet (or the previously-selected index no longer exists -
    // e.g. it was already removed some other way) - reuses handleDeleteValue
    // itself, so this shares its exact same "never delete the last
    // remaining value" guard and valueFormats bookkeeping.
    const handleSubtractValue = (table) => {
      const selected = selectedValueIndex.value[table.id];
      const index = Number.isInteger(selected) && selected < table.values.length ?
        selected : table.values.length - 1;
      handleDeleteValue(table, index);
    };

    const handleValueChange = (table, index) => {
      const value = Number(table.values[index]);
      table.values[index] = Number.isFinite(value) ? Math.min(255, Math.max(0, Math.round(value))) : 0;
      handleChildChange();
    };

    // Per-value display/entry format - 'dec' (default, including any table
    // saved before this existed), 'bin' (an 8-digit 0/1 string), or 'hex' (a
    // 2-digit 0-F string). Purely a UI/generator-output concern: the
    // underlying value (table.values[index]) is always the same 0-255 number
    // either way, this only changes how it's typed/shown and which literal
    // form generateDataTables (bbasic.js) emits for it - confirmed directly
    // that batari Basic's own "data" statement accepts a plain %-prefixed
    // binary literal mixed freely with decimal ones in the same table
    // (compiled a real ROM with both in one row before building this); $-
    // prefixed hex literals are DASM's own standard numeric-literal syntax
    // (the same one math_number's own hex support already relies on - see
    // generators/bbasic/math.js), so the same "data" statement accepts those
    // too.
    // mdi-binary doesn't actually exist in this app's bundled MDI icon set
    // (confirmed directly - it rendered as a blank glyph) - these three use
    // the same "boxed letter" icon language as the Music tab's Mute/Solo
    // toggles instead (mdi-alpha-*-box), which does exist.
    // 'color' reuses the same TIA color BYTE convention as every other color
    // picker in this app (see utils/palette.js's own comment) - the stored
    // value is still a plain 0-255 number, this only swaps the text field
    // for a ColorSwatchPicker (see the template) and skips straight to a
    // valid byte on click rather than typing digits.
    // 'background' is the same idea applied to a background's own numeric id
    // (see backgroundOptions above and blocks/background.js's own
    // buildBackgroundOptions, which this reads the exact same {id, name}
    // list from) - a dropdown of every background in the project instead of
    // a color swatch, storing whichever id is picked.
    // 'player0'/'player1' are the same idea as 'background', applied to
    // each player's own animation list (see player0Options/player1Options
    // above) - stores whichever animation INDEX is picked.
    const FORMAT_CYCLE = ['dec', 'bin', 'hex', 'color', 'background', 'player0', 'player1',
      'sound', 'music', 'text'];
    const FORMAT_ICONS = {
      dec: 'mdi-alpha-d-box', bin: 'mdi-alpha-b-box', hex: 'mdi-alpha-h-box', color: 'mdi-palette',
      background: 'mdi-map', player0: 'mdi-human-handsup', player1: 'mdi-human-handsup',
      sound: 'mdi-waveform', music: 'mdi-music-note', text: 'mdi-card-text-outline',
    };
    const FORMAT_TOGGLE_TITLES = {
      dec: 'Decimal entry (click to switch to 8-bit binary)',
      bin: 'Binary entry (click to switch to hex)',
      hex: 'Hex entry (click to switch to a color swatch)',
      color: 'Color swatch entry (click to switch to a background)',
      background: 'Background entry (click to switch to a Player 0 animation)',
      player0: 'Player 0 animation entry (click to switch to a Player 1 animation)',
      player1: 'Player 1 animation entry (click to switch to a sound effect)',
      sound: 'Sound effect entry (click to switch to a song)',
      music: 'Song entry (click to switch to a text string)',
      text: 'Text string entry (click to switch to decimal)',
    };
    const valueFormat = (table, index) => (table.valueFormats && table.valueFormats[index]) || 'dec';
    // $set (not plain assignment) for the same reason handleColumnsInput's
    // own comment gives - valueFormats doesn't exist at all on a table saved
    // before this feature existed, and Vue 2 can't detect a brand new
    // property being added to an already-reactive object any other way.
    // Which dropdown-backed format each of these three shares - keyed here
    // once so toggleValueFormat's own defaulting below (and
    // dropdownOptionsFor, used by the template) don't have to repeat the
    // same three-way branch.
    const DROPDOWN_OPTIONS_BY_FORMAT = {
      background: backgroundOptions,
      player0: player0Options,
      player1: player1Options,
      sound: soundOptions,
      music: musicOptions,
      text: textOptions,
    };
    const dropdownOptionsFor = (format) => DROPDOWN_OPTIONS_BY_FORMAT[format];
    const toggleValueFormat = (table, index) => {
      if (!table.valueFormats) instance.proxy.$set(table, 'valueFormats', []);
      const next = FORMAT_CYCLE[(FORMAT_CYCLE.indexOf(valueFormat(table, index)) + 1) % FORMAT_CYCLE.length];
      instance.proxy.$set(table.valueFormats, index, next);
      // Whatever this cell's value happened to be before (a decimal digit,
      // a color byte, ...) is unlikely to also be a valid option in
      // whichever dropdown it's about to switch to - defaults to that
      // dropdown's first entry instead of leaving it on a value nothing in
      // its own options actually matches (which Vuetify's own v-select just
      // renders blank). Left alone if the value already IS a real option
      // (e.g. toggling away from 'background' and back), so a deliberate
      // choice isn't clobbered.
      const options = dropdownOptionsFor(next);
      if (options && options.value.length &&
          !options.value.some((option) => option.value === table.values[index])) {
        instance.proxy.$set(table.values, index, options.value[0].value);
      }
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // What the value field itself actually displays - a plain decimal
    // number, or that same number's own 8-digit binary/2-digit hex form,
    // per valueFormat above.
    const displayValue = (table, index) => {
      const raw = Number(table.values[index]) || 0;
      const clamped = Math.min(255, Math.max(0, Math.round(raw)));
      const format = valueFormat(table, index);
      if (format === 'bin') return clamped.toString(2).padStart(8, '0');
      if (format === 'hex') return clamped.toString(16).padStart(2, '0').toUpperCase();
      return clamped;
    };

    // Parses whatever the field's own current format expects - lenient the
    // same way handleValueChange already is (a stray non-numeric/non-binary/
    // non-hex entry falls back to 0 rather than rejecting the keystroke
    // outright), since this fires on every keystroke (see the template's own
    // @input), not just on blur/change.
    const handleValueInput = (table, index, rawInput) => {
      const format = valueFormat(table, index);
      if (format === 'bin') {
        // Strips anything that isn't a literal 0/1 (a pasted "0b..." prefix,
        // stray whitespace, etc.) before parsing, and caps at 8 digits (a
        // 9th+ digit would silently overflow a byte) - maxlength on the
        // field itself (see the template) already stops most of this at
        // input time, this is the belt-and-suspenders parse-time guard.
        const bits = String(rawInput).replace(/[^01]/g, '').slice(0, 8);
        instance.proxy.$set(table.values, index, bits ? parseInt(bits, 2) : 0);
      } else if (format === 'hex') {
        // Same belt-and-suspenders shape as binary above - strips anything
        // that isn't 0-9/A-F (a pasted "0x"/"$" prefix, stray whitespace,
        // lowercase letters) and caps at 2 digits (a byte's own max).
        const digits = String(rawInput).replace(/[^0-9a-fA-F]/g, '').slice(0, 2);
        instance.proxy.$set(table.values, index, digits ? parseInt(digits, 16) : 0);
      } else {
        const value = Number(rawInput);
        instance.proxy.$set(table.values, index, Number.isFinite(value) ? value : 0);
      }
    };

    // ColorSwatchPicker's own @input already hands back a valid TIA color
    // byte (an even 0-254 number, see utils/palette.js) picked straight from
    // the palette grid - no parsing/clamping needed the way the typed
    // formats above need, this can go straight into the table.
    const handleColorValueInput = (table, index, byte) => {
      instance.proxy.$set(table.values, index, byte);
      handleValueChange(table, index);
    };

    // Same shape as handleColorValueInput above - shared by all three
    // dropdown-backed formats (background/player0/player1, see the
    // template), whose own v-select already hands back a valid id/index
    // straight from its own options list, so no parsing is needed here
    // either.
    const handleDropdownValueInput = (table, index, value) => {
      instance.proxy.$set(table.values, index, value);
      handleValueChange(table, index);
    };

    // Drag-and-drop reordering for one table's own value fields - not built
    // on hooks/drag-reorder.js's own useDragReorder (already used above for
    // reordering whole TABLES), since that hook's draggedIndex/dragOverIndex
    // refs assume exactly one reorderable list exists at a time. Every table
    // on this tab has its OWN independent values array, so the dragged/
    // drag-over state here is keyed by table id as well as index, to keep
    // dragging a value in one table from being misread as a drag-over hit
    // in a different table's identically-indexed value - same reasoning
    // MusicEditor.vue's own sequenceChipListeners already documents for its
    // near-identical per-song drag state. [index] (not the value itself) is
    // the drag handle, not the whole row - matches this file's own
    // .data-drag-handle convention for table cards, and keeps the number
    // field's own click-and-drag text selection working.
    const draggedValue = ref(null);
    // Wraps each of the table CARD's own drop-target handlers (not just
    // conditionally swapping the whole listeners object the way a naive
    // guard might) so the real "is a value drag in progress" check happens
    // synchronously at the moment an event actually fires, not only after
    // Vue's own (batched, async) re-render has had a chance to re-evaluate
    // this v-on binding. Confirmed directly as a real bug otherwise, the
    // exact same class MusicEditor.vue's own dragTargetListeners wrapper
    // documents for its identical chip-vs-card conflict: dragging a value
    // sets draggedValue synchronously, but the browser can still dispatch a
    // dragover (or even drop) on the table CARD before Vue's next tick
    // actually detaches its old listeners, since HTML5 drag events aren't
    // batched the way Vue's own reactivity is - letting the card's own
    // reorder highlight/drop briefly fire mid-value-drag despite
    // stopPropagation on the value row's own handlers (stopPropagation only
    // stops BUBBLED events from reaching the card, not a dragover the
    // browser dispatches DIRECTLY on the card whenever the pointer crosses
    // any part of its own bounding box that isn't precisely covered by a
    // child's own listener, e.g. the gaps between value cells).
    const dragTargetListeners = (index) => {
      const raw = rawDragTargetListeners(index);
      const guarded = {};
      Object.keys(raw).forEach((eventName) => {
        guarded[eventName] = (event) => {
          if (draggedValue.value) return;
          raw[eventName](event);
        };
      });
      return guarded;
    };
    // {tableId, index, side} - side is 'before' or 'after', which HALF of
    // cell `index` the pointer is currently over (see dragOverSideFor
    // below). Unlike a single-column list (see hooks/drag-reorder.js's own
    // top-border convention), this grid wraps into multiple COLUMNS per
    // row, so the meaningful drop-target edge is left/right (which cell
    // this lands before/after in reading order), not top/bottom.
    const dragOverValue = ref(null);
    const isValueDragging = (table, index) =>
      !!draggedValue.value && draggedValue.value.tableId === table.id && draggedValue.value.index === index;
    const isValueDragOver = (table, index) =>
      !!dragOverValue.value && dragOverValue.value.tableId === table.id && dragOverValue.value.index === index &&
      !isValueDragging(table, index);
    const valueDragOverSide = (table, index) =>
      isValueDragOver(table, index) ? dragOverValue.value.side : null;
    const valueDragClass = (table, index) => ({
      [CSS_CLASS_DRAGGING]: isValueDragging(table, index),
      'data-value-drag-over-before': valueDragOverSide(table, index) === 'before',
      'data-value-drag-over-after': valueDragOverSide(table, index) === 'after',
    });
    // Left half of the cell's own bounding box means "insert before it",
    // right half means "insert after it" - same halfway-point convention
    // MusicEditor.vue's own dragOverSideFor uses for its horizontal
    // sequence chip list.
    const dragOverSideFor = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    };
    const valueHandleListeners = (table, index) => ({
      dragstart: (event) => {
        // Stops this drag from ALSO being seen by the table card's own
        // dragTargetListeners (see dragAttrs/dragHandleListeners above,
        // bound to the whole .data-card every value row sits inside) -
        // without this, dragging a value would also trigger the CARD's own
        // "drag a table here" reorder highlight, since it has no way to
        // tell a bubbled value-drag apart from an actual table-card drag.
        event.stopPropagation();
        draggedValue.value = {tableId: table.id, index};
        event.dataTransfer.effectAllowed = 'move';
        // Same Firefox requirement as hooks/drag-reorder.js's own
        // dragHandleListeners - the value itself is never read back.
        event.dataTransfer.setData('text/plain', String(index));
      },
      dragend: (event) => {
        event.stopPropagation();
        draggedValue.value = null;
        dragOverValue.value = null;
      },
    });
    const valueRowListeners = (table, index) => ({
      dragover: (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        const side = dragOverSideFor(event);
        const current = dragOverValue.value;
        if (!current || current.tableId !== table.id || current.index !== index || current.side !== side) {
          dragOverValue.value = {tableId: table.id, index, side};
        }
      },
      dragleave: (event) => {
        event.stopPropagation();
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (isValueDragOver(table, index) || isValueDragging(table, index)) dragOverValue.value = null;
      },
      drop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = draggedValue.value;
        draggedValue.value = null;
        dragOverValue.value = null;
        if (!from || from.tableId !== table.id || from.index === index) return;
        // Computed fresh off the actual drop event's own pointer position
        // (not read back off dragOverValue) so the drop always matches
        // exactly what the highlight it lands on last showed - see
        // MusicEditor.vue's own sequenceChipListeners drop handler for the
        // identical reasoning.
        const side = dragOverSideFor(event);
        let insertAt = side === 'after' ? index + 1 : index;
        if (from.index < insertAt) insertAt--;
        if (insertAt === from.index) return;
        const values = table.values.slice();
        const [moved] = values.splice(from.index, 1);
        values.splice(insertAt, 0, moved);
        table.values = values;
        // Kept aligned with the reordered values above - without this, a
        // reordered value would silently pick up whatever format (decimal/
        // binary) used to belong to a DIFFERENT value now sitting at its old
        // index, rather than following the value it's actually attached to.
        if (table.valueFormats) {
          const formats = table.valueFormats.slice();
          const [movedFormat] = formats.splice(from.index, 1);
          formats.splice(insertAt, 0, movedFormat);
          table.valueFormats = formats;
        }
        handleChildChange();
      },
    });

    const handleExportCsv = (table) => {
      const csv = table.values.map(valueToCsvNumber).join(',') + '\n';
      const blob = new Blob([csv], {type: 'text/csv'});
      const filename = (table.name || `table-${table.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `${filename}-${getDateInfix()}.csv`);
    };

    const handleImportCsv = (table) => {
      openFileDialog('.csv,text/csv')
          .then((file) => file.text())
          .then((text) => {
            // Lenient the same way handleValueChange is: a stray non-numeric
            // cell becomes 0 rather than aborting the whole import, since a
            // single bad value shouldn't force the user to fix the file
            // externally and re-import from scratch.
            const values = text.split(/[,\s]+/)
                .map((cell) => cell.trim())
                .filter((cell) => cell.length > 0)
                .slice(0, MAX_DATA_TABLE_VALUES)
                .map((cell) => {
                  const value = Number(cell);
                  return Number.isFinite(value) ? valueToCsvNumber(value) : 0;
                });
            if (!values.length) return;
            table.values = values;
            handleChildChange();
            instance.proxy.$forceUpdate();
          })
          .catch((e) => console.error('Failed to import CSV', e));
    };

    return {
      state, handleChildChange, handleAddTable, handleDeleteTable, handleDuplicateTable,
      copiedTableData, handleCopyTable, handlePasteTable,
      handleAddValue, handleDeleteValue, handleValueChange, handleSelectValue, handleSubtractValue,
      valueFormat, toggleValueFormat, displayValue, handleValueInput, handleColorValueInput,
      handleDropdownValueInput, dropdownOptionsFor,
      FORMAT_ICONS, FORMAT_TOGGLE_TITLES,
      handleExportCsv, handleImportCsv,
      tableColumns, handleColumnsInput, handleColumnsChange,
      isCollapsed, toggleCollapsed,
      maxValues: MAX_DATA_TABLE_VALUES,
      DATA_VALUE_CELL_MIN_PX,
      DATA_VALUES_EXTRA_SLACK_PX,
      maxColumns: MAX_DATA_TABLE_COLUMNS_DISPLAY,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
      valueDragClass, valueHandleListeners, valueRowListeners,
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

/* v-list-item's own default 0 16px padding stacks on top of v-card-text's,
   pushing the data table card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. Zeroing both sides
   (not just left, as this used to) keeps the card's right edge from sitting
   16px further in than its left edge. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

/* Same fix, and matching 8px/12px values, as BackgroundEditor.vue's own
   .background-list/.entry-list-item rules - v-list-item__content's default
   12px top/bottom padding was adding extra space between cards beyond
   anything explicitly set (there was no explicit gap here at all before),
   so this tab's own card spacing didn't match the Background tab's.
   flex+gap plays the role .background-list's own CSS grid gap does (this
   tab stays single-column); margin-top puts back the space above the FIRST
   card that zeroing v-list-item__content's own padding would otherwise
   have also removed. */
.data-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.entry-list-item >>> .v-list-item__content {
  padding: 0;
}

/* No max-width (used to cap at 640px) - a table with many columns needs the
   full width of the data area to keep them all visible at once without
   shrinking each one down too far (see .data-values/.data-value-field). */
.data-card {
  position: relative;
  width: 100%;
}

/* Same reasoning/placement as TextEditor.vue's .text-drag-handle (see
   hooks/drag-reorder.js's own comment) - only this top strip is actually
   draggable, so click-and-drag still selects text everywhere else in the
   card. */
.data-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* Same two classes/reasoning as hooks/drag-reorder.js's own comment and
   TextEditor.vue's identical rules (its own first use of this hook). */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Same placement/style as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - data tables are referenced by this same numeric id
   (see dataTableSymbolName in blocks/data.js). Shifted right to clear
   .data-collapse-btn, which sits in the same row to its left. */
.data-id-badge {
  position: absolute;
  top: 10px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same top-edge fix as .data-delete-btn, positioned at the opposite corner -
   a smaller top offset than .data-delete-btn's, since this one has to line
   up against .data-id-badge's own text baseline right next to it, not just
   sit inside the card. */
.data-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same 20px reserved below the badge as the SoundFX tab's own
   .soundfx-name-field - was 12px, visibly tighter than that reference
   spacing once actually compared side by side. */
.data-name-field {
  margin-top: 20px;
  flex: 1 1 auto;
}

/* Columns sits on the SAME row as Table name (rather than down with the
   values grid it actually controls) - keeps the card's own header
   compact, and matches .data-caption-row's own flex-end alignment so
   both fields' input boxes line up evenly regardless of Table name's
   own floated label pushing it taller. */
.data-name-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

/* Split from the rest of the card's content (data-values-section) so the
   name field can stay visible while collapsed - v-card-text's own default
   padding-bottom would otherwise open a gap between them that the original,
   single v-card-text never had. */
.data-name-section {
  padding-bottom: 0;
}

.data-values-section {
  padding-top: 0;
}

/* Groups Export/Import/Delete into one row in the card's top-right corner,
   same corner (and offset) .data-collapse-btn uses for the top-left, instead
   of each button separately fighting over "absolute top right". */
.data-toolbar-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  z-index: 1;
}

/* Same icon/button sizing as the Player Sprite tab's toolbar icons
   (PixelEditor.vue's .pixel-editor-tools rules) - split out from
   .data-flat-icon-btn below so it can also apply to the Delete button
   without pulling in that class's own hover colour, which would override
   .delete-icon-btn's red-on-hover convention. Use this same sizing for any
   new icon buttons added elsewhere going forward. */
.data-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

.data-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

/* Same flat icon-button treatment as the Player Sprite tab's Export/Import
   image buttons (PixelEditor.vue's .pixel-editor-tools rules): no grey box,
   no elevation, dim at rest and darker on hover instead of Vuetify's default
   hover circle. Use this same treatment for any new (non-delete) icon
   buttons added elsewhere going forward. */
.data-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

.data-flat-icon-btn::before {
  display: none;
}

.data-flat-icon-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.data-flat-icon-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

/* Same red/blue/orange App.vue's own .player0-item/.player1-item/
   .background-item sidebar tabs use for their identical icons - overrides
   .data-flat-icon-btn's own dim grey above (both rest and hover) so this
   toggle button's icon reads as "Player 0"/"Player 1"/"Background" by color
   the same way the sidebar already does, not just by title text on hover.
   Dimmed via opacity at rest, same as every other format icon here dims via
   a lower rgba alpha (.data-flat-icon-btn's own 0.38 rest / 0.87 hover,
   above) - opacity is used instead of another rgba tint (which would just
   fade toward white/grey, not this icon's own color) so it fades toward
   transparent instead, dimming without ever losing that color identity.
   Selectors deliberately repeat .data-flat-icon-btn's own full prefix
   (rather than a shorter, more "obvious" selector) so each stays a strict
   superset of - and so always wins specificity over - the plain .v-icon
   rules above, regardless of source order. A shorter selector here was
   tried first and confirmed to lose that fight, leaving these stuck on
   .data-flat-icon-btn's own dim grey no matter what color was set. */
.data-flat-icon-btn >>> .v-icon.data-format-icon-background,
.data-flat-icon-btn >>> .v-icon.data-format-icon-player0,
.data-flat-icon-btn >>> .v-icon.data-format-icon-player1,
.data-flat-icon-btn >>> .v-icon.data-format-icon-sound,
.data-flat-icon-btn >>> .v-icon.data-format-icon-text {
  opacity: 0.4;
  color: rgb(244, 67, 54) !important;
}

.data-flat-icon-btn >>> .v-icon.data-format-icon-background {
  color: rgb(255, 152, 0) !important;
}

.data-flat-icon-btn >>> .v-icon.data-format-icon-player1 {
  color: rgb(33, 150, 243) !important;
}

.data-flat-icon-btn >>> .v-icon.data-format-icon-sound {
  color: rgb(156, 39, 176) !important;
}

.data-flat-icon-btn >>> .v-icon.data-format-icon-text {
  color: rgb(233, 30, 99) !important;
}

.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-background,
.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-player0,
.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-player1,
.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-sound,
.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-text {
  opacity: 1;
  color: rgb(244, 67, 54) !important;
}

.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-background {
  color: rgb(255, 152, 0) !important;
}

.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-player1 {
  color: rgb(33, 150, 243) !important;
}

.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-sound {
  color: rgb(156, 39, 176) !important;
}

.data-flat-icon-btn:hover >>> .v-icon.data-format-icon-text {
  color: rgb(233, 30, 99) !important;
}

.data-caption-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.data-caption {
  font-size: 0.8em;
  opacity: 0.7;
  margin-bottom: 8px;
}

/* How many value fields to show per row before wrapping - see tableColumns.
   Deliberately narrow: this is a display preference, not a value itself.
   margin-bottom compensates for hide-details/dense (no reserved hint-line
   space below its own input, unlike Table name's plain v-text-field) -
   without this, .data-name-row's own align-items: flex-end lines up the
   two fields' OUTER boxes, but Table name's own reserved (empty) hint-line
   space below its visible input pushes that input's own bottom edge
   noticeably higher than this field's, leaving the two input boxes
   visibly misaligned despite the row itself being bottom-aligned. */
.data-columns-field {
  flex: 0 0 72px;
  margin-bottom: 22px;
}

/* grid-template-columns is set inline per table (see tableColumns) since the
   column count is a per-table preference, not fixed - grid wraps extra
   values onto new rows on its own once a row's own column count is full,
   the same way flex-wrap would, but keeps every column's own width aligned
   across rows instead of each row sizing independently. Each column is
   minmax(0, 1fr), not auto - auto lets a row's own natural content width
   push the grid wider than its container (forcing horizontal scrolling once
   there are enough columns); 1fr instead divides whatever width IS
   available evenly and lets .data-value-row's own children (below) shrink
   to fit, so every column - however many there are - stays visible without
   scrolling sideways (see the card's own width, uncapped for the same
   reason).
   No max-height/internal scroll either (used to cap at 320px) - a table
   with several rows should grow the card tall enough to show all of them
   at once instead of hiding rows behind their own separate scrollbar;
   .editor-container's own page-level scroll still applies once the whole
   page is taller than the window.
   Divider lines between cells are drawn without knowing the column count:
   the grid's own background shows through a 1px gap as a line between
   every cell, on all four sides at once, rather than needing to
   conditionally border just the cells that aren't in the last row/column
   (not straightforward in pure CSS when the column count itself is set via
   an inline style, not a fixed class). */
.data-values {
  display: grid;
  column-gap: 1px;
  row-gap: 1px;
  background-color: rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.12);
  margin-bottom: 8px;
}

/* min-width: 0 overrides flex's own default (min-width: auto), which would
   otherwise refuse to shrink this row below its children's natural combined
   width - exactly the overflow .data-values' own 1fr columns are trying to
   avoid. Its own background covers the grid's own (the divider-line colour)
   everywhere except the 1px gap between cells, which is what actually draws
   the lines. */
.data-value-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  background-color: white;
  padding: 1px 2px;
}

/* Which side of THIS cell a dragged value would land on (see
   valueDragOverSide/dragOverSideFor) - left/right, not hooks/
   drag-reorder.js's own top-border convention, since this grid wraps into
   multiple columns per row, and left/right is what actually reflects
   reading-order position within it. */
.data-value-drag-over-before {
  border-left: 3px solid var(--v-primary-base, #1976d2);
}

.data-value-drag-over-after {
  border-right: 3px solid var(--v-primary-base, #1976d2);
}

/* The drag handle for reordering this value within its own table (see
   valueHandleListeners) - cursor: grab signals that, same as
   .data-drag-handle does for a whole table card. */
.data-value-index {
  flex: 0 0 auto;
  font-family: monospace;
  /* Matches .data-id-badge's own font-size (the "ID: N" badge on each data
     table card) rather than this row's own relative 0.7em, which came out
     visibly smaller. */
  font-size: 0.75rem;
  opacity: 0.7;
  text-align: right;
  cursor: grab;
  /* Nudged down 1px - .data-value-row's own align-items: center still left
     this sitting a pixel too high next to the value field beside it, likely
     the monospace font's own metrics not centering quite the same as the
     field's text. */
  position: relative;
  top: 1px;
  margin-left: 5px;
}

/* One shared sizing rule for every format (decimal, binary, hex) - it used
   to be a fixed 58px for decimal but a separately shrinkable 92px basis for
   binary/hex (see .data-value-field-binary below, which now only handles
   font styling), so toggling format changed this field's own rendered
   width, which visibly shifted the delete button next to it (that button's
   own margin-left: auto repositions it based on how much space this field
   is actually taking up) - confirmed directly as a real bug. Same
   flex-basis/min-width for every format fixes that at the root, rather than
   trying to compensate for the width change elsewhere. min-width (46px, not
   0) keeps at least most of an 8-digit binary/2-digit hex value legible -
   safe against ever overflowing into the next cell now that .data-values'
   own grid (see its inline gridTemplateColumns) guarantees each cell at
   least DATA_VALUE_CELL_MIN_PX (120px) of real room, wrapping extra columns
   onto new rows instead of ever squeezing a cell smaller than that. A
   hard-coded min-width here WITHOUT that grid-level floor previously let
   this field's own minimum genuinely exceed a many-column table's actual
   per-cell width, spilling into the neighboring cell - confirmed directly
   as a real bug, fixed at the grid level rather than by removing this
   field's own min-width again. The deep selectors below strip
   Vuetify's own default input padding/alignment, which otherwise dominates
   the field's width far more than the (up to 3-digit decimal/8-digit
   binary/2-digit hex) value itself does. */
.data-value-field {
  flex: 1 1 84px;
  min-width: 46px;
  margin-left: 4px;
}

/* Vuetify's v-menu renders its activator slot content as a SIBLING of its
   own (empty, zero-size) root element, not nested inside it (same gotcha
   SoundFXEditor.vue's own .soundfx-name-row >>> .color-swatch-picker-dot
   documents) - a class on <color-swatch-picker> itself lands on that
   invisible marker, so the actual visible swatch (.color-swatch-picker-dot)
   is its own separate flex item in this row, styled directly here instead.
   Same flex-basis/min-width/margin as .data-value-field so the toggle/
   delete buttons next to it don't shift position switching in/out of color
   mode, stretched wider (overriding its own default 14x14 dot size) to
   actually fill that space rather than sitting small inside it. */
.data-value-row >>> .color-swatch-picker-dot {
  flex: 1 1 84px;
  min-width: 46px;
  margin-left: 4px;
  width: auto;
  /* Matches the toggle/delete buttons' own 26px height (see
     .data-value-row .v-btn.v-btn--icon below) - this was 24px, a leftover
     mismatch from before those two were unified, which could still grow a
     row when a color-format cell shared a grid row with one of the other
     dropdown formats. */
  height: 26px;
  border-radius: 4px;
}

/* A plain (not solo/filled/outlined) v-select still shares .data-value-
   field's own >>> .v-input__slot rule above (underline/box-shadow removal),
   since this reuses that same class - only the extra bits specific to a
   select (rather than a bare <input>, which that rule's own padding/margin
   tuning targets) need overriding here: the selection text's own vertical
   offset and the dropdown arrow icon, both trimmed down so this row isn't
   any taller than a plain number cell next to it. */
.data-value-dropdown-select >>> .v-select__selection {
  /* No explicit font-size - matches .data-value-field's own decimal input,
     which also leaves this at Vuetify's default rather than overriding it,
     so the two read as the same size next to each other. */
  margin: 0;
  /* .v-select__selections is already centered via flex align-items (below),
     but the text itself still reads slightly low next to it - the dropdown
     arrow (.v-input__append-inner), not affected by this rule, is already
     correctly placed. */
  position: relative;
  top: -2px;
  /* A background/sound effect/song/text string with a long enough name
     otherwise wraps onto a second line inside this narrow a cell, growing
     ITS OWN row - and since every row in .data-values' grid stretches to
     match its own tallest cell, that one long name was enough to grow the
     WHOLE grid, not just the row it's actually in (same class of bug the
     dropdown arrow icon's own height caused above, confirmed directly the
     same way: reproduced only with a long enough name, hence "sometimes").
     Truncated with an ellipsis instead of ever wrapping. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  /* A flex item's default min-width is "auto" (its own natural content
     width), which overrides max-width/overflow above and lets it keep
     forcing its flex container wider instead of ever actually truncating -
     same fix .data-value-row itself already needed for the same reason
     (see that rule's own min-width: 0). */
  min-width: 0;
}

/* The dropdown arrow icon's own default size (24px) is taller than this
   row's own 28px height minus .data-value-row's vertical padding leaves
   room for - since .data-value-row sizes itself to fit its own tallest
   child (a plain flex row, height: auto), that alone was enough to grow
   EVERY row in the whole grid by 4px the moment any ONE cell anywhere used
   this format, not just the row the select itself sits in (confirmed
   directly: all 8 rows read 28px with no select present anywhere, 32px the
   moment even one cell switched to 'background'). Capped to font-size (the
   same 16px .v-select__selection is already left at) so the icon can never
   be the tallest thing in the row again. */
.data-value-dropdown-select >>> .v-input__append-inner {
  margin-top: 0 !important;
  padding-left: 0 !important;
  height: 16px;
  min-width: 16px;
}

.data-value-dropdown-select >>> .v-input__append-inner .v-icon {
  font-size: 16px !important;
}

.data-value-dropdown-select >>> .v-input__control,
.data-value-dropdown-select >>> .v-input__slot {
  min-height: 0 !important;
}

/* Vuetify's own v-select__selections (a plain block-level div, unlike a
   bare <input>) doesn't otherwise center its own text against this row's
   other compact content - collapsing to min-height above left it sitting
   noticeably low, so it's made its own flex row here to center vertically
   the same way .data-value-row centers everything else in it. */
.data-value-dropdown-select >>> .v-select__selections {
  display: flex;
  align-items: center;
  min-height: 0 !important;
}

/* Monospace keeps every digit a consistent width instead of drifting as
   0s/1s (or hex digits) are typed/deleted - sizing itself is shared with
   plain decimal now (see .data-value-field's own comment on why). */
.data-value-field-binary {
  /* Empty on purpose (was width) - kept as its own class since the
     template still needs somewhere to hang the font-family override
     below, scoped to binary/hex only (a 3-digit decimal value reads fine
     in the default font). */
}

.data-value-field-binary >>> input {
  font-family: monospace;
}

.data-value-field >>> input {
  padding: 0;
  text-align: center;
  /* Nudged up slightly - Vuetify's own default line-height/padding leaves
     the digits sitting a little low relative to the row's own other
     content ([index] label, delete button), once the underline below is
     gone and there's no floating label pushing it down to make room for. */
  margin-top: -5px;
}

.data-value-field >>> .v-input__slot {
  padding: 0 2px !important;
  /* Removes Vuetify's own default underline (the ::before/::after border
     pair below) - this field has no label and sits in a dense grid of
     bare number boxes, where a full-width line under every single cell
     reads as visual noise rather than a real field boundary indicator. */
  box-shadow: none !important;
  /* Matches every other format's own 26px height (the toggle/delete
     buttons, the color swatch, the dropdown select below) - left
     unspecified before, this plain text field's natural height (21px) was
     the one holdout still shorter than the rest, so a row could still grow
     switching between a typed format and a dropdown/color one even after
     every OTHER element in this row was unified to 26px. */
  height: 26px;
}

.data-value-field >>> .v-input__slot::before,
.data-value-field >>> .v-input__slot::after {
  border: none !important;
}

/* Same size/flat treatment as .data-icon-btn-size elsewhere in this app,
   just without that class's own hover colour override (this button's
   default red-on-hover, from the "delete" styling below, should stay).
   Pushed to the right edge of the row (margin-left: auto) - the [index]
   label and value field stay left-aligned together as one group, with
   the delete button visually separated at the opposite end rather than
   sitting right up against the value field. */
/* 26x26 (not the smaller 20x20 this row's icon buttons started at) -
   matches .data-format-toggle-btn's own explicit override below, which
   needs the extra room for its "D"/"B"/"H"/etc glyphs (see FORMAT_ICONS) to
   stay legible. Sized the SAME here, rather than leaving the delete button
   smaller, so every row's own natural height is identical regardless of
   which format is active anywhere in it - a mismatched delete button was
   confirmed directly as the real cause of rows growing specifically when a
   dropdown/color format was in play: CSS Grid stretches every row in a
   shared physical grid row to match its tallest cell, and the (bigger)
   toggle button was that tallest cell the whole time, not anything actually
   format-specific. */
.data-value-row .v-btn.v-btn--icon {
  min-width: 0;
  height: 26px;
  width: 26px;
  flex: 0 0 auto;
  margin-left: auto;
}

.data-value-row .v-btn.v-btn--icon >>> .v-icon {
  font-size: 16px !important;
}

/* The button itself is now sized the same 26x26 as every other icon button
   in this row (see .data-value-row .v-btn.v-btn--icon above) - only the
   icon GLYPH inside needs its own bigger override, since the blanket
   16px font-size above still reads too small for this one's "D"/"B"/"H"/
   etc letters (see FORMAT_ICONS). */
.data-value-row .v-btn.v-btn--icon.data-format-toggle-btn >>> .v-icon {
  font-size: 22px !important;
}

.add-data-button {
  bottom: 8px;
}
</style>
