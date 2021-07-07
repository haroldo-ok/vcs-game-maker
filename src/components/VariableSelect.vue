<template>
  <v-select
    :items="items"
    v-bind:value="value"
    v-on:input="$emit('input', $event)"
  >
    <template slot="selection" slot-scope="data">
      <v-icon :color="data.item.color">{{ data.item.icon }}</v-icon>
      <v-icon :color="data.item.color" v-if="data.item.subIcon">
        {{ data.item.subIcon }}
      </v-icon>
      {{ data.item.name }}
    </template>
    <template slot="item" slot-scope="data">
      <v-icon :color="data.item.color">{{ data.item.icon }}</v-icon>
      <v-icon :color="data.item.color" v-if="data.item.subIcon">
        {{ data.item.subIcon }}
      </v-icon>
      {{ data.item.name }}
    </template>
  </v-select>
</template>
<script>
import {defineComponent} from '@vue/composition-api';

export default defineComponent({
  props: ['items', 'value'],
});
</script>
