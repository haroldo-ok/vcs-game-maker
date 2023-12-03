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
      <v-toolbar
        flat
        class="navigation-list"
      >
        <v-btn to="/" link class="actions-item" title="Actions" elevation="0">
          <v-icon>mdi-chart-scatter-plot</v-icon>
        </v-btn>

        <v-btn to="/player0" link class="player0-item" title="Player 0" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
        </v-btn>

        <v-btn to="/player1" link class="player1-item" title="Player 1" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
        </v-btn>

        <v-btn to="/background" link class="background-item" title="Background" elevation="0">
          <v-icon>mdi-map</v-icon>
        </v-btn>

        <v-btn to="/sound" link class="sound-item" title="Sound" elevation="0">
          <v-icon>mdi-speaker</v-icon>
        </v-btn>

        <v-btn to="/generated" link class="generated-item" title="Generated" elevation="0">
          <v-icon>mdi-card-text</v-icon>
        </v-btn>

        <v-btn to="/project" link class="project-item" title="Project" elevation="0">
          <v-icon>mdi-pencil-ruler</v-icon>
        </v-btn>
      </v-toolbar>
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
        class="navigation-list"
      >
        <v-list-item
          to="/"
          link
          class="actions-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-chart-scatter-plot</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Actions</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/player0"
          link
          class="player0-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Player 0</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/player1"
          link
          class="player1-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Player 1</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/background"
          link
          class="background-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-map</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Background</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/sound"
          link
          class="sound-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-speaker</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Sound</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/generated"
          link
          class="generated-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-card-text</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Generated</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/project"
          link
          class="project-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-pencil-ruler</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Project</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>

    </v-navigation-drawer>

    <v-navigation-drawer
      app
      clipped
      right
      permanent
    >
      <div id="javatari-target-container"></div>
      <v-btn block color="primary" @click="handleRomDownload">
        Get generated ROM
      </v-btn>
    </v-navigation-drawer>

    <v-main>
      <router-view/>
    </v-main>

    <v-footer class="error-message">
      aaaaaaaa
      bbbbb
      cccc
    </v-footer>
  </v-app>
</template>

<script>
export default {
  data: () => ({drawer: null}),
  mounted() {
    // Ugly hack in order to move the Javatari screen to a Vue component.
    const javatariScreen = document.getElementById('javatari-screen');
    document.getElementById('javatari-target-container').appendChild(javatariScreen);
    javatariScreen.style = '';
  },
  methods: {
    handleRomDownload() {
      const blob = new Blob([Javatari.compiledResult.output], {type: 'application/octet-stream'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'compiled-rom.bin';
      link.click();
    },
  },
};
</script>
<style scoped>
.v-list-item__icon {
  margin-right: 12px !important;
}

.navigation-list > .v-list-item:not(.v-list-item--active) {
  border-left: 8px solid;
}

.navigation-list > .v-list-item:not(.v-list-item--active) {
  opacity: 0.65;
}

.actions-item,
.actions-item > .v-list-item__icon > .theme--light.v-icon,
.actions-item > .v-list-item__content {
  color: rgb(76, 175, 80) !important;
  border-left-color: rgb(76, 175, 80) !important;
}

.player0-item,
.player0-item > .v-list-item__icon > .theme--light.v-icon,
.player0-item > .v-list-item__content {
  color: rgb(244, 67, 54) !important;
  border-left-color: rgb(244, 67, 54) !important;
}

.player1-item,
.player1-item > .v-list-item__icon > .theme--light.v-icon,
.player1-item > .v-list-item__content {
  color: rgb(33, 150, 243) !important;
  border-left-color: rgb(33, 150, 243) !important;
}

.background-item,
.background-item > .v-list-item__icon > .theme--light.v-icon,
.background-item > .v-list-item__content {
  color: rgb(255, 152, 0) !important;
  border-left-color: rgb(255, 152, 0) !important;
}

.sound-item,
.sound-item > .v-list-item__icon > .theme--light.v-icon,
.sound-item > .v-list-item__content {
  color: rgb(156, 39, 176) !important;
  border-left-color: rgb(156, 39, 176) !important;
}

.generated-item,
.generated-item > .v-list-item__icon > .theme--light.v-icon,
.generated-item > .v-list-item__content {
  color: rgb(39, 176, 136) !important;
  border-left-color: rgb(39, 176, 136) !important;
}

.project-item,
.project-item > .v-list-item__icon > .theme--light.v-icon,
.project-item > .v-list-item__content {
  color: rgb(39, 136, 176) !important;
  border-left-color: rgb(39, 136, 176) !important;
}

.error-message {
  z-index: 3;
}

.theme--light.v-footer.error-message {
  color: rgb(244, 67, 54);
}
</style>
