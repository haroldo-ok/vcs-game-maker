<template>
  <v-card flat class="about-card">
    <v-card-title>About</v-card-title>

    <v-divider class="my-0" />

    <v-card-text class="about-text">
      <div class="about-logo-block">
        <img src="../assets/logo.svg" alt="VCS Game Maker" class="about-logo" />
        <div class="about-version">{{ version }}</div>
      </div>

      <a
        class="about-website"
        href="https://haroldo-ok.itch.io/vcs-game-maker"
        target="_blank"
        rel="noopener"
      >
        haroldo-ok.itch.io/vcs-game-maker
      </a>

      <p class="about-description">
        VCS Game Maker is a no-code environment for building Atari 2600 games. Build your game's logic with
        Blockly blocks, and behind the scenes VCSGM generates batari Basic source code (along with a bit of
        assembly), compiles it into a real Atari 2600 ROM and runs that ROM in a built-in Javatari emulator
        preview.
      </p>

      <span class="text-subtitle-1 about-label">Contributors</span>
      <v-list dense class="about-list">
        <v-list-item @click="openInNewWindow('https://github.com/haroldo-ok')">
          <v-list-item-content>
            <v-list-item-title>Haroldo de Oliveira Pinheiro</v-list-item-title>
            <v-list-item-subtitle>Creator of VCS Game Maker &middot; github.com/haroldo-ok</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <v-list-item @click="openInNewWindow('https://abstractpolygon.com')">
          <v-list-item-content>
            <v-list-item-title>Nick R. / AbstractPolygon</v-list-item-title>
            <v-list-item-subtitle>Contributor &middot; abstractpolygon.com</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script>
import {version} from '../../package.json';

export default {
  data() {
    return {version};
  },
  methods: {
    // A plain <a target="_blank"> just opens another TAB in most browsers
    // (tab-vs-window is the browser's own tabbed-browsing preference, not
    // something an anchor's target can force) - passing explicit window
    // features (width/height/etc, same as any classic popup call) is what
    // actually makes window.open() open a separate, real window instead.
    // "noopener" still keeps the new window from getting a handle back to
    // this one, matching the rel="noopener" every other outbound link in
    // this app already uses.
    openInNewWindow(url) {
      window.open(url, '_blank', 'noopener,width=1024,height=768');
    },
  },
};
</script>

<style scoped>
/* Fills .app-main-inner's own real, deterministic height (see its comment
   in App.vue) instead of just sizing to content - a flex column so
   .about-text below can claim the leftover space (flex: 1, after the
   title/divider's own natural height) and vertically center its own
   content within THAT, rather than only within its own content height. */
.about-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Matches Project.vue's own .project-settings-text - v-card-text's default
   top/bottom padding otherwise leaves a bigger gap than intended under the
   divider above. Flex column with align-items:center centers every direct
   child (the logo block, the description, the Contributors list) as its
   own box in the middle of the page, not just the text within each one;
   flex: 1 + justify-content: center (with .about-card's own height: 100%
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

/* Flex column, centered on its own cross axis - shrinks to fit its widest
   child (the logo) so the version text below centers relative to the logo
   specifically. Already centered as a unit by .about-text's own
   align-items above; this only needs to handle centering ITS OWN children
   (the logo image and version text) against each other. */
.about-logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

/* The logo.svg asset itself has a fair amount of transparent padding baked
   into its own bounding box (visible directly: the "VCS GAME MAKER" text
   inside it doesn't reach the SVG's own edges) - a negative margin here
   pulls the version text up into that empty space instead of stacking a
   real gap on top of it, which otherwise reads as a much bigger gap than
   intended once the logo is scaled up to this page's 48px height. Kept
   small (not the App.vue sidebar's own tighter fit) since the version text
   below is now normal body size, not that sidebar's small 11px label, and
   overlapped the logo's own bottom edge at a larger negative value. */
.about-logo {
  display: block;
  height: 96px;
  margin-bottom: 0;
}

.about-version {
  color: rgba(0, 0, 0, 0.6);
}

/* A real <a href target="_blank"> (not the openInNewWindow/window.open
   pattern the Contributors list below uses) - this one's meant to open as
   an ordinary new TAB, not a separate popup window, so a plain anchor is
   both simpler and the correct native behavior here. */
.about-website {
  display: block;
  margin-bottom: 24px;
  color: var(--v-primary-base, #1976d2);
  text-decoration: underline;
}

.about-description {
  max-width: 640px;
  margin-bottom: 24px;
}

.about-label {
  display: block;
  margin-bottom: 4px;
}

/* Centered as a block on the page (its parent, .about-text, already does
   that), and its own item text centers too, matching the rest of the
   page's centered layout. */
.about-list {
  padding-top: 0;
  width: 100%;
  max-width: 640px;
  text-align: center;
}
</style>
