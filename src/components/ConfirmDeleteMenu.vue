<template>
  <v-menu v-model="open" top :absolute="!!anchor" :position-x="anchor ? anchor.x : 0" :position-y="anchor ? anchor.y : 0">
    <template v-slot:activator="{ on, attrs }">
      <v-btn
        :title="activatorTitle"
        icon
        small
        :class="['delete-icon-btn', iconBtnClass]"
        v-bind="{...attrs, ...$attrs}"
        v-on="on"
      >
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </template>

    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-list>
        <v-list-item @click="handleConfirm">
          <v-list-item-icon>
            <v-icon>mdi-check</v-icon>
          </v-list-item-icon>
          <v-list-item-title>Yes, delete</v-list-item-title>
        </v-list-item>
        <v-list-item @click="open = false">
          <v-list-item-icon>
            <v-icon>mdi-cancel</v-icon>
          </v-list-item-icon>
          <v-list-item-title>No, don't delete</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>
<script>
// Shared by every tab's "Delete this X?" confirm popup (Backgrounds,
// Sprites, Title screens, Sound, Music, Data, Text) - previously each tab
// duplicated a near-identical inline v-menu block. A real v-menu
// (not a v-dialog, tried first) - a real reported requirement ("the popup
// should still appear near where the delete button is, like the old
// version"): v-dialog always centres itself in the viewport regardless of
// its activator's position, losing the anchored-right-next-to-the-button
// placement every inline version already had.
import {registerDeleteMenu, unregisterDeleteMenu} from '../hooks/delete-shortcut';

export default {
  // Any attribute a caller passes that isn't one of the declared props below
  // (e.g. TextEditor.vue's "absolute top right" positioning props on its
  // activator button) lands in $attrs instead - false here stops Vue from
  // also dumping those onto this component's root element (the v-dialog,
  // where an "absolute"/"top"/"right" prop would mean something entirely
  // different, or nothing at all), so they can be forwarded deliberately
  // (see the activator v-btn's "v-bind" below) to the one element they're
  // actually meant for instead.
  inheritAttrs: false,
  props: {
    // The confirmation question, e.g. "Delete this frame?".
    title: {type: String, required: true},
    // Tooltip on the trash-can activator button, e.g. "Delete this frame".
    activatorTitle: {type: String, required: true},
    // Extra class(es) for the activator button, matching whatever per-tab
    // icon-size class its other corner buttons already use (e.g.
    // "titlescreen-icon-btn-size").
    iconBtnClass: {type: String, default: ''},
    // Whether what this deletes is the selected card or frame, which makes the Delete key open the
    // confirmation (see hooks/delete-shortcut.js); selectPriority lets a frame win over its card.
    selected: {type: Boolean, default: false},
    selectPriority: {type: Number, default: 0},
  },
  data() {
    return {
      open: false,
      // Where the pointer was when the Delete key opened the confirmation; null when the button was clicked.
      anchor: null,
    };
  },
  watch: {
    open(value) {
      if (!value) this.anchor = null;
    },
  },
  mounted() {
    registerDeleteMenu(this);
  },
  beforeDestroy() {
    unregisterDeleteMenu(this);
  },
  methods: {
    openAtPointer(pointer) {
      this.anchor = {x: pointer.x, y: pointer.y};
      this.$nextTick(() => {
        this.open = true;
      });
    },
    handleConfirm() {
      this.open = false;
      this.$emit('confirm');
    },
  },
};
</script>
