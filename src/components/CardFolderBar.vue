<template>
  <!-- The folder the cards below are in, as a path, with the folders inside it in the same row (see hooks/card-folders.js for what the tab
       does with them). A card dragged onto a folder here (a tile, or a folder of the path) is moved into it. A line under it, like the one
       under the row of tools above. -->
  <div>
  <div class="card-folder-bar">
    <template v-for="(crumb, crumbIndex) in folderPath()">
      <v-icon v-if="crumbIndex" :key="`sep-${crumb.id}`" small class="card-folder-separator">mdi-chevron-right</v-icon>
      <button
        v-if="!(crumb.folder && renamingId === crumb.id)"
        :key="`crumb-${crumb.id}`"
        type="button"
        class="card-folder-crumb"
        :class="{
          'card-folder-crumb-rename': crumb.id !== null && crumbIndex === folderPath().length - 1,
          'card-folder-drop-over': dropTarget === crumb.id,
        }"
        :title="crumb.id === null ? `All ${noun}s` : crumbIndex === folderPath().length - 1 ? 'Click to rename this folder' : `Open ${crumb.name}`"
        v-on="dropListeners(crumb.id)"
        @click="handleCrumbClick(crumb, crumbIndex === folderPath().length - 1)"
      >
        <v-icon class="card-folder-crumb-icon">{{ crumb.id === null ? 'mdi-home-outline' : 'mdi-folder-outline' }}</v-icon>
        {{ crumb.name }}
      </button>
      <v-text-field
        v-else
        :key="`crumb-field-${crumb.id}`"
        v-model="crumb.folder.name"
        class="card-folder-name-field"
        placeholder="Folder name"
        single-line
        dense
        hide-details
        autofocus
        @blur="finishRename"
        @keyup.enter="finishRename"
      />
    </template>
    <div v-if="childFolders().length" class="card-folder-list">
      <div
        v-for="folder in childFolders()"
        :key="`folder-${folder.id}`"
        class="card-folder-tile"
        :class="{'card-folder-drop-over': dropTarget === folder.id}"
        :title="`Open ${folder.name}`"
        v-on="dropListeners(folder.id)"
        @click.stop="$emit('update:current', folder.id)"
      >
        <v-icon small class="card-folder-tile-icon">mdi-folder</v-icon>
        <v-text-field
          v-if="renamingId === folder.id"
          v-model="folder.name"
          class="card-folder-name-field"
          placeholder="Folder name"
          single-line
          dense
          hide-details
          autofocus
          @click.stop
          @blur="finishRename"
          @keyup.enter="finishRename"
        />
        <span v-else class="card-folder-tile-name" title="Click to rename this folder" @click.stop="startRename(folder)">{{ folder.name }}</span>
        <confirm-delete-menu
          :title="`Delete this folder? Its ${noun}s and folders move out of it.`"
          :selected="false"
          :activator-title="`Delete this folder (its ${noun}s and folders move out of it)`"
          icon-btn-class="player-icon-btn-size card-folder-delete"
          @confirm="handleDeleteFolder(folder)"
        />
      </div>
    </div>
    <v-btn icon small title="New folder here" class="card-folder-new-btn" @click="handleAddFolder">
      <v-icon>mdi-folder-plus-outline</v-icon>
    </v-btn>
  </div>
  <v-divider class="card-folder-divider" />
  </div>
</template>

<script>
import ConfirmDeleteMenu from './ConfirmDeleteMenu.vue';

// The folders as a bar: the path of the open folder, and the folders inside it. `folders` is the tab's list of {id, name, parent} (changed
// here: folders are renamed and, through the tab, added and deleted), `current` the open folder (null for the top level, sync it), `accept`
// whether a card is being dragged (only then are the folders drop targets), `noun` what the folders hold ("sprite", "sound").
// Events: update:current (a folder was opened), add-folder (a new folder: the tab adds it to the list), change (a folder was renamed: store
// them), delete-folder (the tab moves what is in the
// folder out of it and takes it from the list), drop-cards (a card was dropped on a folder; null is the top level).
export default {
  components: {ConfirmDeleteMenu},
  props: {
    folders: {type: Array, required: true},
    current: {type: Number, default: null},
    rootLabel: {type: String, default: 'All'},
    noun: {type: String, default: 'card'},
    accept: {type: Boolean, default: false},
  },
  data() {
    return {renamingId: null, renameOriginalName: '', dropTarget: undefined};
  },
  methods: {
    parentOf(folder) {
      return folder.parent === undefined ? null : folder.parent;
    },
    openId() {
      return this.folders.some(({id}) => id === this.current) ? this.current : null;
    },
    folderPath() {
      const path = [];
      let folder = this.folders.find(({id}) => id === this.openId());
      while (folder && path.length < 50) {
        path.unshift({id: folder.id, name: folder.name || 'Folder', folder});
        const parent = this.parentOf(folder);
        folder = parent === null ? null : this.folders.find(({id}) => id === parent);
      }
      return [{id: null, name: this.rootLabel}, ...path];
    },
    // The folders of the open folder in alphabetical order (numbers in order too: "Folder 2" before "Folder 10"). One being renamed stays
    // where it was until the name is done, so it does not jump about while it is typed.
    childFolders() {
      const keyOf = (folder) => (folder.id === this.renamingId ? this.renameOriginalName : folder.name || '');
      return this.folders.filter((folder) => this.parentOf(folder) === this.openId())
          .sort((a, b) => keyOf(a).localeCompare(keyOf(b), undefined, {numeric: true, sensitivity: 'base'}));
    },
    startRename(folder) {
      this.renameOriginalName = folder.name || '';
      this.renamingId = folder.id;
    },
    // The name is stored when the typing is done.
    finishRename() {
      this.renamingId = null;
      this.$emit('change');
      this.$forceUpdate();
    },
    // A click on a folder of the path opens it; a click on the open folder (the last of the path) renames it.
    handleCrumbClick(crumb, isCurrent) {
      if (isCurrent && crumb.folder) this.startRename(crumb.folder);
      else this.$emit('update:current', crumb.id);
    },
    handleAddFolder() {
      const id = (Math.max(0, ...this.folders.map((folder) => folder.id))) + 1;
      const folder = {id, name: `Folder ${id}`, parent: this.openId()};
      this.$emit('add-folder', folder);
      this.startRename(folder);
      this.$forceUpdate();
    },
    handleDeleteFolder(folder) {
      this.$emit('delete-folder', folder);
      this.$forceUpdate();
    },
    dropListeners(target) {
      return {
        dragover: (event) => {
          if (!this.accept) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          this.dropTarget = target;
        },
        dragleave: () => {
          if (this.dropTarget === target) this.dropTarget = undefined;
        },
        drop: (event) => {
          if (!this.accept) return;
          event.preventDefault();
          event.stopPropagation();
          this.dropTarget = undefined;
          this.$emit('drop-cards', target);
        },
      };
    },
  },
};
</script>

<style scoped>
.card-folder-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  min-height: 30px;
  margin-top: 4px;
}

/* The line at the bottom of the pinned toolbar takes the place of this one (no double line). */
.graphic-editor-toolbar-scrolled .card-folder-divider,
.soundfx-toolbar-scrolled .card-folder-divider,
.data-toolbar-scrolled .card-folder-divider {
  display: none;
}

.card-folder-divider {
  /* No room below it: the cards are as far under it as they are from the sides of the tab. */
  margin: 8px calc(-1 * var(--toolbar-bleed, 0px)) 0;
  max-width: none;
}

/* The new folder button looks like the buttons of the graphic editor toolbar (see its .get-tools rules): the same size, rest color, hover and press. */
.card-folder-new-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
}

.card-folder-new-btn::before {
  display: none;
}

.card-folder-new-btn >>> .v-icon {
  font-size: 19px;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.card-folder-new-btn:not(.v-btn--disabled):hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.card-folder-new-btn:not(.v-btn--disabled):active >>> .v-icon {
  transform: scale(0.82);
}

.card-folder-crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.card-folder-crumb-rename {
  cursor: text;
}

.card-folder-crumb:hover {
  text-decoration: underline;
}

.card-folder-crumb .card-folder-crumb-icon {
  font-size: 20px;
}

.card-folder-separator {
  opacity: 0.5;
}

/* A path item and a folder's name are the same text (a button does not take the page's font and color by itself). */
.card-folder-crumb,
.card-folder-tile-name {
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.1px;
  color: inherit;
}

.card-folder-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-left: 12px;
}

.card-folder-tile {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 1px;
  border-radius: 4px;
  cursor: pointer;
}

.card-folder-tile:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.card-folder-tile-name {
  flex: 0 1 auto;
  cursor: text;
}

.card-folder-tile-name:hover {
  text-decoration: underline;
}

.card-folder-tile >>> .card-folder-delete .v-icon {
  font-size: 16px !important;
}

.card-folder-name-field {
  flex: 0 0 160px;
  margin: 0;
  padding: 0;
}

/* A folder is flush with the left of its box, so the outline of a card dragged over it is drawn outside the box, clear of the icon. */
.card-folder-tile.card-folder-drop-over {
  outline-offset: 3px;
}

.card-folder-drop-over {
  outline: 2px solid var(--v-primary-base, #1976d2);
  outline-offset: -2px;
  opacity: 1;
}
</style>
