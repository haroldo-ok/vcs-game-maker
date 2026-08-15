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
                <div class="data-id-badge">ID: {{ table.id }}</div>

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
                      title="How many value fields to show per row before wrapping to a new one"
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

                  <div class="data-values" :style="{gridTemplateColumns: `repeat(${tableColumns(table)}, minmax(0, 1fr))`}">
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
                      >[{{ index }}]</span>
                      <v-text-field
                        v-model.number="table.values[index]"
                        type="number"
                        min="0"
                        max="255"
                        dense
                        hide-details
                        @change="() => handleValueChange(table, index)"
                        class="data-value-field"
                      />
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
import {useDataTablesStorage} from '../hooks/project';
import {DEFAULT_DATA_TABLES, DEFAULT_DATA_TABLE_COLUMNS, MAX_DATA_TABLE_VALUES,
  processDataTablesStorageDefaults} from '../blocks/data';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';

// A data table is just a flat array of 0-255 bytes (see blocks/data.js), so
// its CSV form is a single row of comma-separated integers - no header, no
// columns, matching the table's own in-memory shape exactly.
const valueToCsvNumber = (value) => Math.min(255, Math.max(0, Math.round(value)));

// Purely a UI display cap (see table.columns/tableColumns) - past this many,
// each value field would need to shrink well past being usably clickable to
// keep them all fitting on screen without horizontal scrolling.
const MAX_DATA_TABLE_COLUMNS_DISPLAY = 8;

export default defineComponent({
  setup() {
    const dataTablesStorage = useDataTablesStorage();
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
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleValueChange = (table, index) => {
      const value = Number(table.values[index]);
      table.values[index] = Number.isFinite(value) ? Math.min(255, Math.max(0, Math.round(value))) : 0;
      handleChildChange();
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
      handleAddValue, handleDeleteValue, handleValueChange,
      handleExportCsv, handleImportCsv,
      tableColumns, handleColumnsInput, handleColumnsChange,
      isCollapsed, toggleCollapsed,
      maxValues: MAX_DATA_TABLE_VALUES,
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
  font-size: 0.7em;
  opacity: 0.7;
  text-align: right;
  cursor: grab;
}

/* 0-255 is at most 3 digits - widened twice now (from an original 34px,
   then a still-too-tight 42px) to comfortably fit all 3 digits of a value
   like 255 without them crowding the field's own edges. min-width: 0
   lets it shrink further still if a row ever has more columns than even
   this minimum comfortably fits. The deep selectors below strip Vuetify's
   own default input padding/alignment, which otherwise dominates the
   field's width far more than the 3-digit value itself does. */
.data-value-field {
  flex: 0 0 58px;
  min-width: 0;
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
.data-value-row .v-btn.v-btn--icon {
  min-width: 0;
  height: 20px;
  width: 20px;
  flex: 0 0 auto;
  margin-left: auto;
}

.data-value-row .v-btn.v-btn--icon >>> .v-icon {
  font-size: 16px !important;
}

.add-data-button {
  bottom: 8px;
}
</style>
