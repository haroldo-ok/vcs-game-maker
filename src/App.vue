<template>
  <v-app id="inspire">
    <v-system-bar app>
      <v-spacer></v-spacer>

      <v-icon>mdi-square</v-icon>

      <v-icon>mdi-circle</v-icon>

      <v-icon>mdi-triangle</v-icon>
    </v-system-bar>

    <v-app-bar
      app
      clipped-right
      flat
      height="72"
    >
      <v-spacer></v-spacer>

      <v-responsive max-width="156">
        <v-text-field
          dense
          flat
          hide-details
          rounded
          solo-inverted
        ></v-text-field>
      </v-responsive>
    </v-app-bar>

    <v-navigation-drawer
      v-model="drawer"
      app
      width="200"
    >
      <v-sheet
        color="grey lighten-5"
        height="128"
        width="100%"
      ></v-sheet>

      <v-list
        shaped
      >
        <v-list-item
          to="/"
          link
        >
          <v-list-item-icon>
            <v-icon>mdi-chart-scatter-plot</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Actions</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/about"
          link
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Player 0</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/about"
          link
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Player 1</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/about"
          link
        >
          <v-list-item-icon>
            <v-icon>mdi-map</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Background</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/about"
          link
        >
          <v-list-item-icon>
            <v-icon>mdi-speaker</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Sound</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>

    </v-navigation-drawer>

    <v-navigation-drawer
      app
      clipped
      right
    >
      <v-list>
        <v-list-item
          v-for="n in 5"
          :key="n"
          link
        >
          <v-list-item-content>
            <v-list-item-title>Item {{ n }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view/>
    </v-main>

    <v-footer
      app
      color="transparent"
      height="72"
      inset
    >
      <v-text-field
        background-color="grey lighten-1"
        dense
        flat
        hide-details
        rounded
        solo
      ></v-text-field>
    </v-footer>
  </v-app>
</template>

<script>
export default {
  data: () => ({drawer: null}),
};
</script>
<style scoped>
.v-list-item__icon {
  margin-right: 12px !important;
}
</style>
