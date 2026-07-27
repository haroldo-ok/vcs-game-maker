<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Data</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item v-for="table in state.dataTables" v-bind:key="table.id">
            <v-list-item-content>
              <v-card outlined class="data-card">
                <v-menu
                  v-if="state.dataTables.length > 1"
                  top
                >
                  <template v-slot:activator="{ on, attrs }">
                    <v-btn
                      color="red"
                      title="Delete this table"
                      fab
                      small
                      absolute
                      top
                      right
                      class="data-delete-btn"
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

                <v-card-text>
                  <v-text-field
                    label="Table name"
                    v-model="table.name"
                    @change="handleChildChange"
                  />

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

import {useDataTablesStorage} from '../hooks/project';
import {DEFAULT_DATA_TABLES, MAX_DATA_TABLE_VALUES, processDataTablesStorageDefaults} from '../blocks/data';

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

    return {
      state, handleChildChange, handleAddTable, handleDeleteTable,
      handleAddValue, handleDeleteValue, handleValueChange,
      maxValues: MAX_DATA_TABLE_VALUES,
    };
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 3em;
  bottom: 0;
  width: 100%;
}

.data-card {
  position: relative;
  width: 100%;
  max-width: 640px;
}

/* Vuetify's fab+absolute+top combo centers the button on the card's top
   edge, poking half of it out (and clipped there); pull it down so the whole
   button sits inside the card instead. */
.data-delete-btn {
  top: 8px !important;
  box-shadow: none !important;
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
