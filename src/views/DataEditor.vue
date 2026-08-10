<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Data</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item class="entry-list-item" v-for="table in state.dataTables" v-bind:key="table.id">
            <v-list-item-content>
              <v-card outlined class="data-card">
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
                  <v-text-field
                    class="data-name-field"
                    label="Table name"
                    v-model="table.name"
                    @change="handleChildChange"
                  />
                </v-card-text>

                <v-card-text v-if="!isCollapsed(table)" class="data-values-section">
                  <div class="data-caption">
                    {{ table.values.length }} / {{ maxValues }} values (0-255 each)
                  </div>

                  <div class="data-values">
                    <div
                      v-for="(value, index) in table.values"
                      v-bind:key="index"
                      class="data-value-row"
                    >
                      <span class="data-value-index">[{{ index }}]</span>
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
import {computed, defineComponent, getCurrentInstance} from '@vue/composition-api';
import {max} from 'lodash';
import {saveAs} from 'file-saver';

import {useCollapsedIds} from '../hooks/collapse';
import {useDataTablesStorage} from '../hooks/project';
import {DEFAULT_DATA_TABLES, MAX_DATA_TABLE_VALUES, processDataTablesStorageDefaults} from '../blocks/data';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';

// A data table is just a flat array of 0-255 bytes (see blocks/data.js), so
// its CSV form is a single row of comma-separated integers - no header, no
// columns, matching the table's own in-memory shape exactly.
const valueToCsvNumber = (value) => Math.min(255, Math.max(0, Math.round(value)));

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

    const instance = getCurrentInstance();
    const handleAddTable = () => {
      const dataTables = state.value.dataTables;
      const maxId = max(dataTables.map((o) => o.id)) || 0;
      const newTable = {
        id: maxId + 1,
        name: `Table ${maxId + 1}`,
        values: [0],
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
      state, handleChildChange, handleAddTable, handleDeleteTable,
      handleAddValue, handleDeleteValue, handleValueChange,
      handleExportCsv, handleImportCsv,
      isCollapsed, toggleCollapsed,
      maxValues: MAX_DATA_TABLE_VALUES,
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

/* v-list-item's own default left padding stacks on top of v-card-text's,
   pushing the data table card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. */
.entry-list-item {
  padding-left: 0;
}

.data-card {
  position: relative;
  width: 100%;
  max-width: 640px;
}

/* Same placement/style as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - data tables are referenced by this same numeric id
   (see dataTableSymbolName in blocks/data.js). Shifted right to clear
   .data-collapse-btn, which sits in the same row to its left. */
.data-id-badge {
  position: absolute;
  top: 8px;
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
  top: 0 !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same 12px reserved below the badge as the SoundFX tab's
   .soundfx-name-field. */
.data-name-field {
  margin-top: 12px;
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

.data-caption {
  font-size: 0.8em;
  opacity: 0.7;
  margin-bottom: 8px;
}

.data-values {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.data-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-value-index {
  flex: 0 0 48px;
  font-family: monospace;
  opacity: 0.7;
  text-align: right;
}

.data-value-field {
  flex: 0 0 100px;
}

.add-data-button {
  bottom: 8px;
}
</style>
