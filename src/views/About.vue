<template>
  <v-card flat class="about-card editor-container">
    <v-card-title>About</v-card-title>

    <v-divider class="my-0" />

    <v-card-text class="about-text">
      <div class="about-logo-block">
        <img src="../assets/logo.svg" alt="VCS Game Maker" class="about-logo" />
        <div class="about-version">{{ version }}</div>
      </div>

      <div class="about-website">
        <strong>Official:</strong> <a href="https://haroldo-ok.itch.io/vcs-game-maker" target="_blank" rel="noopener">haroldo-ok.itch.io/vcs-game-maker</a>
        <br />
        <strong>Experimental:</strong> <a href="https://abstractpolygon.github.io/vcs-game-maker-absply/" target="_blank" rel="noopener">abstractpolygon.github.io/vcs-game-maker-absply</a>
        <br />
        <strong>Documentation/Wiki:</strong> <a href="https://github.com/haroldo-ok/vcs-game-maker/wiki" target="_blank" rel="noopener">github.com/haroldo-ok/vcs-game-maker/wiki</a>
      </div>

      <p class="about-description">
        VCS Game Maker is a visual environment for building Atari 2600 games. Build your game's logic with <a href="https://www.blockly.com/" target="_blank" rel="noopener">Blockly</a> blocks, and behind the scenes VCSGM generates <a href="https://github.com/batari-Basic/batari-Basic" target="_blank" rel="noopener">batari Basic</a> source code (along with a bit of assembly), compiles it into an Atari 2600 ROM, and runs that ROM in a built-in emulator preview, using either <a href="https://github.com/6502ts/6502.ts" target="_blank" rel="noopener">6502.ts</a> or <a href="https://github.com/jetsetilly/gopher2600" target="_blank" rel="noopener">Gopher2600</a>.
      </p>

      <span class="text-subtitle-1 about-label">Contributors</span>
      <v-list dense class="about-list">
        <v-list-item @click="openInNewTab('https://github.com/haroldo-ok')">
          <v-list-item-content>
            <v-list-item-title>Haroldo de Oliveira Pinheiro</v-list-item-title>
            <v-list-item-subtitle>Creator of VCS Game Maker</v-list-item-subtitle>
            <v-list-item-subtitle>github.com/haroldo-ok</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item @click="openInNewTab('https://abstractpolygon.com')">
          <v-list-item-content>
            <v-list-item-title>Nick R. / AbstractPolygon</v-list-item-title>
            <v-list-item-subtitle>Designer/Developer</v-list-item-subtitle>
            <v-list-item-subtitle>abstractpolygon.com</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>

      <span class="text-subtitle-1 about-label">Supported Kernels/Minikernels</span>
      <v-list dense class="about-list">
        <v-list-item @click="openInNewTab('https://github.com/batari-Basic/batari-Basic')">
          <v-list-item-content>
            <v-list-item-title>Standard Kernel</v-list-item-title>
            <v-list-item-subtitle>batari Basic's built-in playfield/sprite kernel</v-list-item-subtitle>
            <v-list-item-subtitle>github.com/batari-Basic/batari-Basic</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item @click="openInNewTab('https://github.com/batari-Basic/batari-Basic')">
          <v-list-item-content>
            <v-list-item-title>DPC+ Kernel (Experimental)</v-list-item-title>
            <v-list-item-subtitle>batari Basic's DPC+ kernel, for the Harmony/Melody cartridge format</v-list-item-subtitle>
            <v-list-item-subtitle>github.com/batari-Basic/batari-Basic</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item @click="openInNewTab('https://forums.atariage.com/topic/169819-the-titlescreen-kernel/')">
          <v-list-item-content>
            <v-list-item-title>Titlescreen Kernel</v-list-item-title>
            <v-list-item-subtitle>By RevEng</v-list-item-subtitle>
            <v-list-item-subtitle>forums.atariage.com</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item @click="openInNewTab('https://forums.atariage.com/topic/287652-text-minikernel/')">
          <v-list-item-content>
            <v-list-item-title>Text Minikernel</v-list-item-title>
            <v-list-item-subtitle>Adapted from Karl G's Text Minikernel</v-list-item-subtitle>
            <v-list-item-subtitle>forums.atariage.com</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>

      <span class="text-subtitle-1 about-label">Licenses</span>
      <p class="about-description about-legal">
        VCS Game Maker was created by Haroldo de Oliveira Pinheiro under the <a href="https://github.com/haroldo-ok/vcs-game-maker/blob/master/LICENSE-MIT-haroldo" target="_blank" rel="noopener">MIT License</a>.
        <br />
        AbstractPolygon updates are released under the <a href="https://polyformproject.org/licenses/shield/1.0.0" target="_blank" rel="noopener">PolyForm Shield License 1.0.0</a>.
      </p>
    </v-card-text>
  </v-card>
</template>

<script>
import pkg from '../../package.json';
const {version} = pkg;

export default {
  data() {
    return {version};
  },
  methods: {
    // Opens a link in a new tab (no window features, which would make the browser open a separate window instead).
    openInNewTab(url) {
      window.open(url, '_blank', 'noopener');
    },
  },
};
</script>

<style scoped>
/* Fills .app-main-inner's  real, deterministic height (see its comment
   in App.vue) instead of just sizing to content - a flex column so
   .about-text below can claim the leftover space (flex: 1, after the
   title/divider's natural height) and vertically center its
   content within THAT, rather than only within its content height. */
.about-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Matches Project.vue's .project-settings-text - v-card-text's default
   top/bottom padding otherwise leaves a bigger gap than intended under the
   divider above. Flex column with align-items:center centers every direct
   child (the logo block, the description, the Contributors list) as its
   box in the middle of the page, not just the text within each one;
   flex: 1 + justify-content: center (with .about-card's height: 100%
   above) is what centers that whole column vertically too, not just
   horizontally. */
.about-text {
  padding-top: 10px;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
}

/* Flex column, centered on its  cross axis - shrinks to fit its widest
   child (the logo) so the version text below centers relative to the logo
   specifically. Already centered as a unit by .about-text's
   align-items above; this only needs to handle centering ITS children
   (the logo image and version text) against each other. */
.about-logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

/* The logo.svg asset itself has a fair amount of transparent padding baked
   into its bounding box (visible directly: the "VCS GAME MAKER" text
   inside it doesn't reach the SVG's edges) - a negative margin here
   pulls the version text up into that empty space instead of stacking a
   real gap on top of it, which otherwise reads as a much bigger gap than
   intended once the logo is scaled up to this page's 48px height. Kept
   small (not the App.vue sidebar's tighter fit) since the version text
   below is now normal body size, not that sidebar's small 11px label, and
   overlapped the logo's bottom edge at a larger negative value. */
.about-logo {
  display: block;
  height: 96px;
  margin-bottom: 0;
}

/* Same Dark Mode inversion and dimming as App.vue's .app-logo-img rule, for
   this page's second copy of the same logo. */
.dark-mode .about-logo {
  filter: invert(1) hue-rotate(180deg);
  opacity: 0.8;
}

.about-version {
  color: rgba(0, 0, 0, 0.6);
}

/* A real <a href target="_blank"> (not the openInNewWindow/window.open
   pattern the Contributors list below uses) - this one's meant to open as
   an ordinary new TAB, not a separate popup window, so a plain anchor is
   both simpler and the correct native behavior here. */
.about-website {
  margin-bottom: 24px;
}

.about-website a {
  color: var(--v-primary-base, #1976d2);
  text-decoration: underline;
}

.about-description {
  max-width: 640px;
  margin-bottom: 24px;
}

.about-legal {
  font-size: 0.75rem;
  line-height: 1.2;
}

.about-label {
  display: block;
  margin-bottom: 4px;
}

/* Centered as a block on the page (its parent, .about-text, already does
   that), and its item text centers too, matching the rest of the
   page's centered layout. */
.about-list {
  padding-top: 0;
  width: 100%;
  max-width: 640px;
  text-align: center;
}
</style>
