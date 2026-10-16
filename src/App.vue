<template>
  <v-app id="inspire" :class="{'hide-description-text': hideDescriptionText, 'hide-toolbar-labels': hideToolbarLabels, 'desaturate-app-colors': desaturateAppColors, 'dark-mode': darkMode, 'colorblind-mode': colorblindMode, 'no-top-toolbar': hideTopToolbar}">
    <div v-if="!hideTopToolbar" class="app-logo">
      <img src="./assets/logo.svg" alt="VCS Game Maker" class="app-logo-img" />
      <div class="app-logo-version">{{ version }}</div>
    </div>

    <v-app-bar
      v-if="!hideTopToolbar"
      app
      clipped-right
      flat
      height="72"
      color="white"
      class="navigation-list top-toolbar"
    >
        <v-btn to="/" link text class="actions-item" title="Actions" elevation="0">
          <v-icon>mdi-chart-scatter-plot</v-icon>
          <span class="top-toolbar-label">Actions</span>
        </v-btn>

        <v-btn to="/titlescreen" link text class="titlescreen-item" title="Title" elevation="0">
          <v-icon>mdi-image-frame</v-icon>
          <span class="top-toolbar-label">Title</span>
        </v-btn>

        <v-btn to="/player" link text class="player-item" title="Sprites" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
          <span class="top-toolbar-label">Sprites</span>
        </v-btn>

        <v-btn to="/background" link text class="background-item" title="Playfield" elevation="0">
          <v-icon>mdi-map</v-icon>
          <span class="top-toolbar-label">Playfield</span>
        </v-btn>

        <v-btn to="/soundfx" link text class="sound-item" title="Sound" elevation="0">
          <v-icon>mdi-waveform</v-icon>
          <span class="top-toolbar-label">Sound</span>
        </v-btn>

        <v-btn to="/music" link text class="music-item" title="Music" elevation="0">
          <v-icon>mdi-music-note</v-icon>
          <span class="top-toolbar-label">Music</span>
        </v-btn>

        <v-btn to="/scorefont" link text class="scorefont-item" title="Score" elevation="0">
          <v-icon>mdi-numeric</v-icon>
          <span class="top-toolbar-label">Score</span>
        </v-btn>

        <v-btn to="/text" link text class="text-tab-item" title="Text" elevation="0">
          <v-icon>mdi-card-text-outline</v-icon>
          <span class="top-toolbar-label">Text</span>
        </v-btn>

        <v-btn to="/data" link text class="data-item" title="Data" elevation="0">
          <v-icon>mdi-table</v-icon>
          <span class="top-toolbar-label">Data</span>
        </v-btn>

        <v-btn to="/generated" link text class="generated-item" title="Generated" elevation="0">
          <v-icon>mdi-card-text</v-icon>
          <span class="top-toolbar-label">Generated</span>
        </v-btn>

        <v-btn to="/configuration" link text class="configuration-item" title="Options" elevation="0">
          <v-icon>mdi-cog</v-icon>
          <span class="top-toolbar-label">Options</span>
        </v-btn>

        <v-btn to="/project" link text class="project-item" title="Project" elevation="0">
          <v-icon>mdi-pencil-ruler</v-icon>
          <span class="top-toolbar-label">Project</span>
        </v-btn>

        <v-btn to="/about" link text class="about-item" title="About" elevation="0">
          <v-icon>mdi-information-outline</v-icon>
          <span class="top-toolbar-label">About</span>
        </v-btn>
    </v-app-bar>

    <v-navigation-drawer
      v-if="!hideSidebar"
      v-model="drawer"
      app
      clipped
      :width="effectiveSidebarWidth"
      :mobile-breakpoint="0"
      class="nav-drawer"
      :class="{'sidebar-stacked': sidebarStacked}"
    >
      <div class="nav-drawer-inner" :style="{paddingBottom: errorHeight + 'px'}">
      <div v-if="hideTopToolbar && (hideToolbarLabels || sidebarStacked)" class="sidebar-logo">
        <img src="./assets/logo-circle.svg" alt="VCS Game Maker" class="sidebar-logo-img" />
        <div class="sidebar-logo-version">{{ version }}</div>
      </div>
      <div v-else-if="hideTopToolbar" class="sidebar-logo sidebar-logo-wide">
        <img src="./assets/logo.svg" alt="VCS Game Maker" class="sidebar-logo-wide-img" />
        <div class="app-logo-version">{{ version }}</div>
      </div>
      <v-list
        class="navigation-list"
      >
        <v-list-item
          to="/"
          link
          class="actions-item"
          :title="hideToolbarLabels ? 'Actions' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-chart-scatter-plot</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Actions</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/titlescreen"
          link
          class="titlescreen-item"
          :title="hideToolbarLabels ? 'Title α' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-image-frame</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Title α</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/player"
          link
          class="player-item"
          :title="hideToolbarLabels ? 'Sprites' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Sprites</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/background"
          link
          class="background-item"
          :title="hideToolbarLabels ? 'Playfield' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-map</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Playfield</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/soundfx"
          link
          class="sound-item"
          :title="hideToolbarLabels ? 'Sound' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-waveform</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Sound</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/music"
          link
          class="music-item"
          :title="hideToolbarLabels ? 'Music α' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-music-note</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Music α</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/scorefont"
          link
          class="scorefont-item"
          :title="hideToolbarLabels ? 'Score' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-numeric</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Score</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/text"
          link
          class="text-tab-item"
          :title="hideToolbarLabels ? 'Text' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-card-text-outline</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Text</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/data"
          link
          class="data-item"
          :title="hideToolbarLabels ? 'Data' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-table</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Data</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/generated"
          link
          class="generated-item"
          :title="hideToolbarLabels ? 'Generated' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-card-text</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Generated</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/configuration"
          link
          class="configuration-item"
          :title="hideToolbarLabels ? 'Options' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-cog</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Options</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/project"
          link
          class="project-item"
          :title="hideToolbarLabels ? 'Project' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-pencil-ruler</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Project</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/about"
          link
          class="about-item"
          :title="hideToolbarLabels ? 'About' : null"
        >
          <v-list-item-icon>
            <v-icon>mdi-information-outline</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>About</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
      </div>
    </v-navigation-drawer>

    <div
      v-if="!hideSidebar && !hideToolbarLabels"
      class="sidebar-resize-handle"
      title="Drag to resize the sidebar"
      :style="{left: (effectiveSidebarWidth - 5) + 'px', bottom: errorHeight + 'px'}"
      @mousedown.prevent="startResizeSidebar"
    ></div>

    <v-navigation-drawer
      v-model="emulatorVisible"
      app
      clipped
      right
      class="emulator-drawer"
      :width="emulatorWidth"
      :mobile-breakpoint="0"
    >
      <div class="emulator-drawer-inner" :style="{paddingBottom: errorHeight + 'px'}">
        <div class="emulator-toolbar-row" :class="{'emulator-toolbar-wrapped': emulatorToolbarWrapped}">
          <v-btn
            small
            class="emulator-refresh-button"
            title="Reload the page to fix the emulator preview if it has disappeared - you'll need to click Update ROM again afterward"
            @click="handleRefreshEmulator"
          >
            <v-icon left small>mdi-refresh</v-icon>
            Refresh emulator
          </v-btn>
          <div class="emulator-toolbar-icons">
            <v-btn
              icon
              small
              class="emulator-flat-icon-btn emulator-fullscreen-btn"
              title="Show the emulator full screen (Esc to leave)"
              @click="handleFullscreen"
            >
              <v-icon>mdi-fullscreen</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              class="emulator-flat-icon-btn emulator-screenshot-btn"
              title="Save a screenshot of the emulator screen as a PNG"
              @click="handleScreenshot"
            >
              <v-icon>mdi-camera-outline</v-icon>
            </v-btn>
            <v-divider class="emulator-toolbar-divider" vertical />
            <v-btn
              v-if="emulatorSettings.backend === 'stellerator'"
              icon
              small
              class="emulator-flat-icon-btn emulator-debug-btn"
              :class="{'emulator-debug-btn-on': emulatorSettings.debugOverlay}"
              :title="emulatorSettings.debugOverlay ? 'Hide the debug info over the emulator screen' : 'Show debug info (registers, program counter, scanlines, CPU cycles) over the emulator screen'"
              @click="handleToggleDebugOverlay"
            >
              <v-icon>mdi-bug-outline</v-icon>
            </v-btn>
            <debug-settings-dialog v-if="emulatorSettings.backend === 'stellerator'"></debug-settings-dialog>
            <key-mapping-dialog></key-mapping-dialog>
            <emulator-settings-dialog></emulator-settings-dialog>
          </div>
        </div>
        <div id="gopher2600-target-container" :style="emulatorScaleStyle">
          <div
            v-if="emulatorSettings.backend === 'stellerator' && emulatorSettings.debugOverlay && debugInfo"
            class="emulator-debug-overlay"
          >
            <pre>{{ debugText }}</pre>
            <table v-if="debugVariableRows.length" class="emulator-debug-table">
              <tr v-for="(row, rowIndex) in debugVariableRows" :key="rowIndex">
                <template v-for="(cell, cellIndex) in row">
                  <td :key="`n${cellIndex}`" class="emulator-debug-name">{{ cell.name }}</td>
                  <td :key="`v${cellIndex}`" class="emulator-debug-value">{{ cell.text }}</td>
                </template>
              </tr>
            </table>
          </div>
        </div>
        <div class="panel-switches-row mt-2">
          <v-btn
            small
            :color="emulatorPoweredOn ? 'green' : undefined"
            class="emulator-power-button"
            :class="{'emulator-power-button-on': emulatorPoweredOn}"
            title="Power the emulated console on or off"
            @click="handleTogglePower(!emulatorPoweredOn)"
          >
            <v-icon small>mdi-power</v-icon>
          </v-btn>
          <v-btn
            small
            :color="emulatorColorMode ? 'primary' : undefined"
            title="Color/B&W switch"
            @click="handleToggleColorMode(!emulatorColorMode)"
          >
            {{ emulatorColorMode ? 'Color' : 'B&W' }}
          </v-btn>
          <v-btn
            small
            :color="emulatorLeftDifficultyPro ? 'primary' : undefined"
            title="Left (Player 1) difficulty switch"
            @click="handleToggleDifficulty('left', !emulatorLeftDifficultyPro)"
          >
            P1: {{ emulatorLeftDifficultyPro ? 'A' : 'B' }}
          </v-btn>
          <v-btn
            small
            :color="emulatorRightDifficultyPro ? 'primary' : undefined"
            title="Right (Player 2) difficulty switch"
            @click="handleToggleDifficulty('right', !emulatorRightDifficultyPro)"
          >
            P2: {{ emulatorRightDifficultyPro ? 'A' : 'B' }}
          </v-btn>
          <div class="emulator-select-reset-group">
            <v-btn
              small
              class="emulator-select-button"
              title="Select switch - hold to select (e.g. cycle game variation)"
              @mousedown="handlePressSelect"
              @mouseup="handleReleaseSelect"
              @mouseleave="handleReleaseSelect"
            >
              Select
            </v-btn>
            <v-btn
              small
              class="emulator-reset-button"
              title="Reset switch - hold to reset the running game"
              @mousedown="handlePressReset"
              @mouseup="handleReleaseReset"
              @mouseleave="handleReleaseReset"
            >
              Reset
            </v-btn>
          </div>
        </div>
        <div class="rom-buttons-row mt-2">
          <v-btn
            :color="romOutdated ? 'warning' : 'primary'"
            :loading="building"
            :disabled="buildInProgress && !building"
            :title="buildInProgress && !building ?
              'A title screen preview is currently building - try again once it finishes' : undefined"
            @click="handleRomUpdate"
          >
            {{ romOutdated ? 'Update ROM' : 'ROM up to date' }}
          </v-btn>
          <v-btn
            v-if="isElectron"
            color="primary"
            :loading="launchingStella"
            :disabled="!hasCompiledRom"
            @click="handleTestInStella"
          >
            Test in Stella
          </v-btn>
          <v-menu v-model="romSaveMenuOpen" top offset-y>
            <template v-slot:activator="{ attrs }">
              <!-- Where the browser has a save dialog with a "Save as type" list, the button
                   opens that; otherwise it opens this small menu to pick .bin or .a26. -->
              <v-btn
                color="primary"
                :disabled="!hasCompiledRom"
                v-bind="attrs"
                @click="handleSaveRomClick"
              >
                Save ROM
              </v-btn>
            </template>
            <v-list dense>
              <v-list-item @click="handleRomDownload('bin')">
                <v-list-item-title>Save as .bin</v-list-item-title>
              </v-list-item>
              <v-list-item @click="handleRomDownload('a26')">
                <v-list-item-title>Save as .a26</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
        <div
          v-if="romCapacityText"
          class="rom-capacity"
          :class="romCapacityLow ? 'rom-capacity-low' : ''"
        >
          {{ romCapacityText }}
        </div>
        <v-progress-linear
          v-if="romCapacityText"
          :value="romCapacityPercentFilled"
          :color="romCapacityBarColor"
          height="6"
          rounded
          class="rom-capacity-bar"
        />
        <div class="rom-capacity-log">
          <div v-if="romCapacitySummary" class="rom-capacity-summary">{{ romCapacitySummary }}</div>
          <div v-if="romVariablesSummary" class="rom-capacity-summary"><strong>Total Variables:</strong> {{ romVariablesSummary }}</div>
          <div v-if="romDpcPlusRamText" class="rom-capacity-summary"><strong>DPC+ RAM:</strong> {{ romDpcPlusRamText }}</div>
          <div v-if="romDpcPlusRamItems.length" class="rom-capacity-variables">
            <div v-for="item in romDpcPlusRamItems" :key="item.name">{{ item.name }}: {{ item.bytes.toLocaleString() }} bytes</div>
          </div>
          <div v-if="romSystemVariableAssignments.length" class="rom-capacity-summary"><strong>System reserved:</strong></div>
          <div v-if="romSystemVariableAssignments.length" class="rom-capacity-variables">
            <div v-for="assignment in romSystemVariableAssignments" :key="assignment.slot">
              <strong>{{ assignment.slot }}:</strong> {{ assignment.name }}
            </div>
          </div>
          <div v-if="romBlockVariableAssignments.length" class="rom-capacity-summary"><strong>Required by blocks:</strong></div>
          <div v-if="romBlockVariableAssignments.length" class="rom-capacity-variables">
            <div v-for="assignment in romBlockVariableAssignments" :key="assignment.slot">
              <strong>{{ assignment.slot }}:</strong> {{ assignment.name }}<span
                v-if="assignment.sharedWith && assignment.sharedWith.length"
              >{{ ' / ' + assignment.sharedWith.join(' / ') }}</span>
            </div>
          </div>
          <div v-if="romUserVariableAssignments.length" class="rom-capacity-summary"><strong>User defined:</strong></div>
          <div v-if="romUserVariableAssignments.length" class="rom-capacity-variables">
            <div v-for="assignment in romUserVariableAssignments" :key="assignment.slot">
              <strong>{{ assignment.slot }}:</strong> {{ assignment.name }}<span
                v-if="assignment.sharedWith && assignment.sharedWith.length"
              >{{ ' / ' + assignment.sharedWith.join(' / ') }}</span>
            </div>
          </div>
          <div v-if="romCapacityBanks.length" class="rom-capacity-detail">
            <div v-for="bank in romCapacityBanks" :key="bank.number" class="rom-capacity-bank">
              <div class="rom-capacity-bank-header">
                <strong>Bank {{ bank.number }}:</strong> {{ bank.freeText }}
              </div>
              <div v-if="bank.contents.length" class="rom-capacity-bank-contents">
                <div v-for="part in bank.contents" :key="part.label">
                  <strong>{{ part.label }}{{ part.names ? ':' : '' }}</strong> {{ part.names }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </v-navigation-drawer>

    <div
      v-if="emulatorVisible"
      class="emulator-resize-handle"
      title="Drag to resize the emulator"
      :style="{right: (emulatorWidth - 5) + 'px', bottom: errorHeight + 'px'}"
      @mousedown.prevent="startResize"
    ></div>

    <v-btn
      v-if="emulatorVisible"
      fab
      x-small
      dark
      color="grey"
      title="Hide the emulator preview to free up more space for the block editor"
      class="emulator-hide-button emulator-toggle-button"
      :style="{right: emulatorWidth + 'px'}"
      @click="emulatorVisible = false"
    >
      <v-icon small>mdi-chevron-right</v-icon>
    </v-btn>

    <v-btn
      v-if="!emulatorVisible"
      fab
      x-small
      dark
      color="grey"
      title="Show the emulator preview"
      class="emulator-show-button emulator-toggle-button"
      @click="emulatorVisible = true"
    >
      <v-icon small>mdi-chevron-left</v-icon>
    </v-btn>

    <v-main class="app-main">
      <div class="app-main-inner" :style="{height: `calc(100% - ${errorHeight}px)`}">
        <router-view/>
      </div>
    </v-main>

    <v-dialog v-model="soundKernelNotice.open" max-width="520">
      <v-card>
        <v-card-title>{{ soundKernelNotice.title }}</v-card-title>
        <v-card-text>
          <p v-for="line in soundKernelNotice.lines" :key="line">{{ line }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="soundKernelNotice.open = false">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="tipOpen" max-width="520">
      <v-card v-if="tip">
        <v-card-title><v-icon :class="['tip-title-icon', 'mr-2', tip.tab.className]" :style="{top: tip.tab.offset + 'px'}">{{ tip.tab.icon }}</v-icon>Tip</v-card-title>
        <v-card-text>
          <p class="tip-message tip-text"><template v-for="(part, i) in tip.segments"><strong v-if="part.bold" :key="i">{{ part.text }}</strong><span v-else :key="i">{{ part.text }}</span></template></p>
          <p class="tip-message">
            Learn more:
            <template v-for="link in tip.links">
              <br :key="link.url + 'br'" />
              <a :key="link.url" :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
            </template>
          </p>
        </v-card-text>
        <div class="tip-message tip-footnote">
          <a :href="tip.wikiUrl" target="_blank" rel="noopener">Full documentation</a>
        </div>
        <v-card-actions>
          <v-checkbox
            v-model="tipDontShowAgain"
            label="Don't show again"
            dense
            hide-details
            class="tip-dont-show mt-0 pt-0"
          ></v-checkbox>
          <v-spacer></v-spacer>
          <div class="tip-arrows">
            <span class="tip-counter">Tip {{ tip.index + 1 }} / {{ tip.count }}</span>
            <v-btn icon small class="tip-arrow-btn" title="Previous tip" @click="tip = tipNear(tip, -1)">
              <v-icon>mdi-chevron-left</v-icon>
            </v-btn>
            <v-btn icon small class="tip-arrow-btn" title="Next tip" @click="tip = tipNear(tip, 1)">
              <v-icon>mdi-chevron-right</v-icon>
            </v-btn>
          </div>
          <v-btn text color="primary" @click="tipOpen = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="tipsOffNoticeOpen" max-width="520">
      <v-card>
        <v-card-title>Tips are turned off</v-card-title>
        <v-card-text>
          <p class="tip-message">
            You can turn them back on any time with the "Show Tips at startup" switch under VCSGM Options on the
            Options tab.
          </p>
          <p class="tip-message">
            <a href="#" @click.prevent="goToStartupTipsSetting">Go to VCSGM Options</a>
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text color="primary" @click="tipsOffNoticeOpen = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-footer class="error-message" :style="{height: errorHeight + 'px', maxHeight: errorHeight + 'px'}">
      <div
        class="error-resize-handle"
        title="Drag to resize the error pane"
        @mousedown.prevent="startResizeError"
      ></div>
      <div class="error-scroll-wrapper" ref="errorScrollWrapper">
        <div class="error-console-content">
          <div
            v-for="(entry, index) in compileLog"
            :key="index"
            class="compile-log-line"
            :class="entry.level === 'error' ? 'compile-log-error' : 'compile-log-info'"
            :style="entry.level === 'stage' ? {fontWeight: 'bold'} : {}"
          ><span v-if="entry.html" v-html="entry.text"></span><template v-else>{{ entry.text }}</template></div>
          <pre v-if="errorStorage" v-html="errorStorage"></pre>
          <div v-if="errorStorage && errorBannerHighlight" class="error-banner-highlight" v-html="errorBannerHighlight"></div>
        </div>
      </div>
    </v-footer>
  </v-app>
</template>

<script>
import {useColorblindModeStorage, useCompileLog, useConfigurationStorage, useDarkModeStorage, useDesaturateBlocklyColorsStorage, useErrorBannerHighlight, useErrorStorage,
  useAdaptiveFrameSkipStorage, useHideDescriptionTextStorage, useHideToolbarLabelsStorage, useHideSidebarStorage, useHideTopToolbarStorage, useShowStartupTipsStorage, useStellaPathStorage, useSoundEffectsStorage,
  markSkipLoadLastProjectCheckOnce} from './hooks/project';
import {buildRom, useRomCapacity, useRomOutdated, useHasCompiledRom, useCompiledRomBytes,
  useBuildInProgress} from './hooks/rom';
import {safeWithGopher2600} from './hooks/emulator';
import {useEmulatorSettings, saveEmulatorSettings} from './hooks/emulator-settings';
import {escapeHtml} from './utils/build-error';
import {captureEmulatorScreenshot} from './utils/emulator-screenshot';
import {sanitizeForFilename} from './utils/file';
import {syncExamples} from './hooks/examples';
import {startGamepadInput} from './hooks/gamepad';
import {startTapHold} from './hooks/tap-hold';
import {syncSoundBanks} from './hooks/soundbanks';
import {soundKernelNotice, syncSoundsToKernel} from './hooks/sound-kernel';
import {nextTip, tipNear} from './hooks/tips';
import {optionToReveal} from './hooks/option-reveal';
import KeyMappingDialog from './components/KeyMappingDialog.vue';
import EmulatorSettingsDialog from './components/EmulatorSettingsDialog.vue';
import DebugSettingsDialog from './components/DebugSettingsDialog.vue';
import {useDebugVariables} from './hooks/debug-symbols';
import pkg from '../package.json';
const {productName, version} = pkg;

// Below this fraction of the bank's usable space remaining, the capacity
// display switches to a warning color.
const ROM_CAPACITY_LOW_THRESHOLD = 0.1;

// The emulator canvas renders at a fixed pixel resolution (the real TIA's
// cropped picture size) and never reflows to fit its container, so it's
// scaled with a CSS transform instead - see emulatorScaleStyle/
// updateEmulatorScale. That resolution isn't known until the first frame
// renders, so it has to be measured rather than assumed.
const EMULATOR_DEFAULT_WIDTH = 256;
const EMULATOR_MIN_WIDTH = 200;
const EMULATOR_MAX_WIDTH = 900;
// Keep enough room for the editor when dragging on smaller screens.
const EDITOR_MIN_WIDTH = 320;
const EMULATOR_WIDTH_KEY = 'vcs-game-maker.emulatorWidth';
// The left sidebar is either wide (names beside the icons) or a narrow bar with each name under its icon.
// Expert mode takes the names away, which leaves just the icons.
const SIDEBAR_MAX_WIDTH = 200;
const SIDEBAR_MIN_WIDTH = 64;
const SIDEBAR_ICONS_ONLY_WIDTH = 56;
// Dragging the edge left of this makes the sidebar narrow, right of it wide.
const SIDEBAR_STACKED_WIDTH = 136;
const SIDEBAR_WIDTH_KEY = 'vcs-game-maker.sidebarWidth';
// Whether the emulator drawer is shown at all - separate from emulatorWidth
// (which only ever remembers its width while visible), so hiding it to free
// up space for the block editor survives a reload instead of resetting
// every time.
const EMULATOR_VISIBLE_KEY = 'vcs-game-maker.emulatorVisible';
// Matches the footer's old fixed "max-height: 7em" (at the default 16px root
// font size) as the default/minimum, so an unresized pane looks the same as
// before this was made resizable.
const ERROR_DEFAULT_HEIGHT = 112;
const ERROR_MIN_HEIGHT = 112;
// Leaves at least this much of the window for everything else (toolbar, main
// content) when dragging the error pane very tall.
const ERROR_MIN_REMAINING_HEIGHT = 150;
const ERROR_HEIGHT_KEY = 'vcs-game-maker.errorHeight';
// How long to keep waiting for the emulator canvas to lay out before giving
// up. A timer is used rather than an animation frame so this still settles
// when the window is in the background.
const EMULATOR_MEASURE_RETRIES = 60;
const EMULATOR_MEASURE_INTERVAL = 50;
// How often checkEmulatorCanvas looks for a vanished/mis-sized emulator canvas.
const EMULATOR_WATCHDOG_INTERVAL = 1000;

// Alphabetizes the "Variables" panel's  per-slot lists (a-z for a plain
// letter slot; numeric-aware for a Superchip "varN" slot, so var2 sorts
// before var10 rather than after it as a plain string compare would) -
// these arrive in RESERVATION order (whichever feature/user variable
// happened to route first), which is meaningless to a reader scanning for
// a specific letter/slot. localeCompare's {numeric: true} option
// handles both slot shapes with one comparator: plain single-letter slots
// (a, b, c...) collate alphabetically same as always, and multi-character
// "varN" slots collate by their embedded number instead of lexicographically.
const sortByAssignmentSlot = (assignments) =>
  [...assignments].sort((a, b) => a.slot.localeCompare(b.slot, undefined, {numeric: true}));

const readStoredWidth = () => {
  const stored = parseInt(localStorage.getItem(EMULATOR_WIDTH_KEY), 10);
  return Number.isFinite(stored) ? stored : EMULATOR_DEFAULT_WIDTH;
};

const readStoredSidebarWidth = () => {
  const stored = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
  return Number.isFinite(stored) && stored < SIDEBAR_STACKED_WIDTH ? SIDEBAR_MIN_WIDTH : SIDEBAR_MAX_WIDTH;
};

const readStoredErrorHeight = () => {
  const stored = parseInt(localStorage.getItem(ERROR_HEIGHT_KEY), 10);
  return Number.isFinite(stored) ? stored : ERROR_DEFAULT_HEIGHT;
};

// Stored as the raw string "false" (not JSON-encoded) - same convention as
// useLoadLastProjectStorage in hooks/project.js. Anything else, including
// never having been set, means "visible" (the default).
const readStoredEmulatorVisible = () => localStorage.getItem(EMULATOR_VISIBLE_KEY) !== 'false';

// The name the debug info gives to the player0size byte it reads to tell when the Title Screen Kernel runs.
const TITLE_KERNEL_WATCH_NAME = '__titleKernelRunning';
// The lines in a frame of both TV standards the project can use (NTSC and PAL60).
const NTSC_FRAME_SCANLINES = 262;

export default {
  components: {KeyMappingDialog, EmulatorSettingsDialog, DebugSettingsDialog},
  data: () => ({
    drawer: null,
    emulatorWidth: readStoredWidth(),
    emulatorToolbarWrapped: false,
    sidebarWidth: readStoredSidebarWidth(),
    resizingSidebar: false,
    emulatorVisible: readStoredEmulatorVisible(),
    emulatorScale: 1,
    emulatorHeight: null,
    debugInfo: null,
    resizing: false,
    errorHeight: readStoredErrorHeight(),
    resizingError: false,
    building: false,
    launchingStella: false,
    // Front-panel switch state. Power defaults on (matches the previous
    // Javatari preview always being "on"); the rest default to real Atari
    // 2600 power-on defaults (Color, both difficulties set to "A"/pro).
    emulatorPoweredOn: true,
    emulatorColorMode: true,
    emulatorLeftDifficultyPro: true,
    emulatorRightDifficultyPro: true,
  }),
  setup() {
    const errorStorage = useErrorStorage();
    const soundEffectsRef = useSoundEffectsStorage();
    const configurationRef = useConfigurationStorage();
    const syncSounds = () => syncSoundsToKernel(soundEffectsRef, configurationRef.value || {});
    console.info('Text', version);
    return {
      emulatorSettings: useEmulatorSettings(), debugSymbols: useDebugVariables(),
      errorStorage, errorBannerHighlight: useErrorBannerHighlight(),
      compileLog: useCompileLog(), romOutdated: useRomOutdated(), romCapacity: useRomCapacity(),
      hasCompiledRom: useHasCompiledRom(), compiledRomBytes: useCompiledRomBytes(),
      buildInProgress: useBuildInProgress(),
      productName, version, hideDescriptionTextStorage: useHideDescriptionTextStorage(),
      hideToolbarLabelsStorage: useHideToolbarLabelsStorage(),
      hideSidebarStorage: useHideSidebarStorage(),
      hideTopToolbarStorage: useHideTopToolbarStorage(),
      desaturateAppColorsStorage: useDesaturateBlocklyColorsStorage(),
      darkModeStorage: useDarkModeStorage(),
      colorblindModeStorage: useColorblindModeStorage(),
      adaptiveFrameSkipStorage: useAdaptiveFrameSkipStorage(),
      configurationStorage: useConfigurationStorage(),
      soundKernelNotice, soundEffectsStorage: soundEffectsRef, syncSounds,
      romSaveMenuOpen: false,
      showStartupTipsStorage: useShowStartupTipsStorage(), tipOpen: false, tip: null, tipDontShowAgain: false,
      tipNear, tipsOffNoticeOpen: false,
      stellaPathStorage: useStellaPathStorage(),
    };
  },
  mounted() {
    // A different tip shows on every start while the startup tips setting is on.
    if (this.showStartupTipsStorage) {
      this.tip = nextTip();
      this.tipOpen = !!this.tip;
    }
    // Once per page load: fetch new/changed example projects (see hooks/examples.js).
    syncExamples();
    syncSoundBanks();
    this.attachEmulator();
    this.applyAdaptiveFrameSkip();
    this.stopGamepadInput = startGamepadInput();
    this.stopTapHold = startTapHold();
    this.$vuetify.theme.dark = this.darkMode;
    window.addEventListener('resize', this.handleWindowResize);
    window.addEventListener('gopher2600-ready', this.handleGopher2600Ready);
    window.addEventListener('emulator-debug', this.handleEmulatorDebug);
    this.sendDebugWatch();
    this.emulatorWatchdogTimer = window.setInterval(this.checkEmulatorCanvas, EMULATOR_WATCHDOG_INTERVAL);
  },
  beforeDestroy() {
    this.stopResize();
    if (this.stopGamepadInput) this.stopGamepadInput();
    if (this.stopTapHold) this.stopTapHold();
    window.clearInterval(this.emulatorWatchdogTimer);
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('gopher2600-ready', this.handleGopher2600Ready);
    window.removeEventListener('emulator-debug', this.handleEmulatorDebug);
    if (this.emulatorResizeObserver) {
      this.emulatorResizeObserver.disconnect();
      this.emulatorResizeObserver = null;
    }
  },
  computed: {
    // See Configuration.vue's "Expert mode" switch - reads the same standing
    // app preference (useHideDescriptionTextStorage, see its  comment in
    // hooks/project.js - not part of the project itself, unlike the rest of
    // configurationState), bound as a class on the root v-app below so the
    // global ".hide-description-text .v-messages__message" CSS rule can
    // reach every hint/description paragraph in the app from one place,
    // now that they all consistently use that same class (see TextEditor.vue's
    // hint paragraph for the pattern every other tab's hint text follows).
    // Hiding the toolbar labels (an Expert mode option) leaves only the icons; otherwise the width the user dragged it to.
    effectiveSidebarWidth() {
      // The narrow sidebar is as wide as the icons-only one in Expert mode, where there is no color bar to leave room for.
      return (this.hideToolbarLabels || (this.hideDescriptionText && this.sidebarStacked)) ? SIDEBAR_ICONS_ONLY_WIDTH : this.sidebarWidth;
    },
    sidebarStacked() {
      return !this.hideToolbarLabels && this.sidebarWidth < SIDEBAR_STACKED_WIDTH;
    },
    // The names of the left and top toolbars are only hidden while Expert mode is on, whatever the switch under it was left at.
    hideToolbarLabels() {
      return this.hideDescriptionText && !!this.hideToolbarLabelsStorage;
    },
    hideDescriptionText() {
      // this.hideDescriptionTextStorage is a computed RETURNED from setup() -
      // Vue's Composition API auto-unwraps that when accessed through the
      // component instance (confirmed against this file's  romCapacityText
      // above, which reads "this.romCapacity" the same unwrapped way), so
      // it's already the plain boolean here, not a ref needing its
      // ".value".
      return !!this.hideDescriptionTextStorage;
    },
    // Same auto-unwrapping reasoning as hideDescriptionText just above - see
    // Configuration.vue's "Hide left toolbar" switch/
    // useHideSidebarStorage's  comment in hooks/project.js.
    hideSidebar() {
      return !!this.hideSidebarStorage;
    },
    hideTopToolbar() {
      return !!this.hideTopToolbarStorage;
    },
    // Same "Soft Colors" preference the Blockly canvas itself desaturates
    // by (see BlocklyComponent.vue's parseBlockColour patch) - bound as
    // a class on the root v-app below so the tab bar/nav-drawer's
    // hardcoded per-tab colors (.actions-item, .titlescreen-item, etc.)
    // mute along with the blocks instead of staying fully saturated.
    desaturateAppColors() {
      return !!this.desaturateAppColorsStorage;
    },
    // Bound as a class on the root v-app below (.dark-mode) - see that
    // class's CSS comment (right below the Subdued Palette :root rule in
    // the unscoped <style> block) for how it actually recolors the app.
    darkMode() {
      return !!this.darkModeStorage;
    },
    colorblindMode() {
      return !!this.colorblindModeStorage;
    },
    // Same "window.electronAPI's mere presence" check as Configuration.vue's
    // isElectron - see preload.js's  comment. Gates the "Test in
    // Stella" button's very existence (not just whether it's enabled),
    // since a plain web build has no way to launch a local program at all.
    isElectron() {
      return !!window.electronAPI;
    },
    debugText() {
      const info = this.debugInfo;
      if (!info) return '';
      const hex = (value, digits) => value.toString(16).toUpperCase().padStart(digits, '0');
      // P is shown as the flag letters that are set (N V - B D I Z C).
      const flagLetters = [[128, 'N'], [64, 'V'], [16, 'B'], [8, 'D'], [4, 'I'], [2, 'Z'], [1, 'C']]
          .map(([bit, letter]) => (info.flags & bit ? letter : '.')).join('');
      return `PC $${hex(info.pc, 4)}  A $${hex(info.a, 2)}  X $${hex(info.x, 2)}  Y $${hex(info.y, 2)}` +
        `  S $${hex(info.s, 2)}  ${flagLetters}\n` +
        `Scanlines ${info.scanlines} of ${NTSC_FRAME_SCANLINES}  Frame ${info.frame}\n` +
        (info.busyCycles === null ?
          `CPU cycles/frame ${info.cpuCycles}` :
          `CPU busy ${info.busyCycles} of ${info.cpuCycles} cycles/frame`);
    },
    // The watched variables' values as table rows, a few to a row: a cell is a name and its value in decimal
    // with hex beside it.
    debugVariableRows() {
      const reported = (this.debugInfo && this.debugInfo.variables) || [];
      // The Title Screen Kernel is running while the top bit of player0size is set (see TITLE_KERNEL_LOOP_BIT).
      const titleRunning = reported.some(([name, value]) => name === TITLE_KERNEL_WATCH_NAME && (value & 128));
      // A variable the title screen shares a slot with goes by the title screen's name while the kernel runs and
      // by the game's name the rest of the time.
      const shown = new Map();
      reported.filter(([name]) => name !== TITLE_KERNEL_WATCH_NAME).forEach(([name, value]) => {
        const symbol = this.debugSymbols.find((entry) => entry.name === name) || {};
        const displayName = titleRunning && symbol.sharedWith && symbol.sharedWith.length ? symbol.sharedWith[0] :
          !titleRunning && symbol.hostName ? symbol.hostName : name;
        if (!shown.has(displayName)) shown.set(displayName, value);
      });
      const variables = [...shown.entries()];
      if (!variables.length) return [];
      const columns = variables.length > 6 ? 3 : variables.length > 1 ? 2 : 1;
      const cells = variables.map(([name, value]) => ({
        name,
        text: `${value} ($${value.toString(16).toUpperCase().padStart(2, '0')})`,
      }));
      const rows = [];
      for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
      return rows;
    },
    // Names picked in the debug settings, with the address the last build gave each.
    debugWatch() {
      const chosen = this.emulatorSettings.debugVariables || [];
      const watch = this.debugSymbols.filter(({name}) => chosen.includes(name)).map(({name, address}) => ({name, address}));
      // player0size also goes along, to tell when the Title Screen Kernel is running.
      const titleFlag = this.debugSymbols.find(({name}) => name === 'player0size');
      return watch.length && titleFlag ? [...watch, {name: TITLE_KERNEL_WATCH_NAME, address: titleFlag.address}] : watch;
    },
    emulatorScaleStyle() {
      return {
        '--emulator-scale': this.emulatorScale,
        'height': this.emulatorHeight === null ? null : `${this.emulatorHeight}px`,
      };
    },
    // Reflects the last successful build, not necessarily the current
    // (possibly-edited-since) project - same staleness the "Update ROM"/"ROM
    // up to date" button above already has, so no separate warning for it.
    // Shows the total across every bank the ROM size actually provides (this
    // is the number that grows when you pick a bigger ROM size), while the
    // "low" warning still keys off bank 1 specifically - that's the one bank
    // that always holds the project's unrelocatable main body, so it's the
    // more actionable signal for "about to need relocation".
    // The DPC+ kernel's display RAM that nothing in the project has taken, as text.
    romDpcPlusRamItems() {
      return (this.romCapacity && this.romCapacity.dpcPlusRamItems) || [];
    },
    romDpcPlusRamText() {
      const free = this.romCapacity && this.romCapacity.dpcPlusRamFree;
      return free === undefined || free === null ? '' : `${free.toLocaleString()} bytes free`;
    },
    romCapacityText() {
      const capacity = this.romCapacity;
      if (!capacity) return '';
      return `${capacity.total.freeBytes.toLocaleString()} bytes free`;
    },
    // Feeds the progress bar right under the "bytes free" line above -
    // same total-across-every-bank figure that text is already built from,
    // just expressed as a 0-100 percentage instead of a byte count.
    romCapacityPercentFilled() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.total.usableBytes) return 0;
      const used = capacity.total.usableBytes - capacity.total.freeBytes;
      return (used / capacity.total.usableBytes) * 100;
    },
    // Plain, always-visible, selectable text (see the summary/per-bank
    // blocks right under the "bytes free" line in the template) rather than
    // a native title="..." tooltip - a browser tooltip can't be
    // selected/copied at all, which defeats the whole point of this existing
    // specifically to be pasted into a bug report or back into this
    // conversation.
    romCapacitySummary() {
      const capacity = this.romCapacity;
      if (!capacity) return '';
      const totalUsed = capacity.total.usableBytes - capacity.total.freeBytes;
      const bank1Used = capacity.bank1.usableBytes - capacity.bank1.freeBytes;
      return `${totalUsed.toLocaleString()} of ${capacity.total.usableBytes.toLocaleString()} bytes used ` +
        `across every bank (bank 1, which always holds your main code, is ` +
        `${bank1Used.toLocaleString()} of ${capacity.bank1.usableBytes.toLocaleString()} used)`;
    },
    // Variable-pool usage (see hooks/rom.js's computeVariableUsage) - shown
    // separately from the byte-capacity text above since these are a
    // completely different, hard-capped resource (25-55 slots project-wide
    // depending on Superchip, not bytes) that can run out well before ROM
    // space does. Superchip's  half is omitted entirely when it's off
    // (available is 0 then - see computeVariableUsage's  comment) rather
    // than shown as "0 of 0", which would read as broken rather than simply
    // not applicable yet.
    romVariablesSummary() {
      const usage = this.romCapacity && this.romCapacity.variableUsage;
      if (!usage) return '';
      const parts = [`${usage.letters.used} of ${usage.letters.available} letters`];
      if (usage.superchip.available) parts.push(`${usage.superchip.used} of ${usage.superchip.available} Superchip RAM`);
      // Superchip's  separate r/w pool (see computeVariableUsage's
      // comment in hooks/rom.js) - a completely different resource from the
      // "Superchip RAM" figure just above (that one shares the same 48-
      // byte-freed-playfield-plus-26-letter budget the plain letters figure
      // also draws from; this is its  distinct 128-byte region), so it's
      // its  clause here rather than folded into that count.
      if (usage.superchipRw.available) {
        parts.push(`${usage.superchipRw.used} of ${usage.superchipRw.available} Superchip read/write vars`);
      }
      // DPC+'s own always-on bonus RAM pool (var0-var8 - see
      // computeVariableUsage's own comment in hooks/rom.js) - no toggle to
      // gate on, so this simply doesn't show for non-DPC+ builds (available
      // is 0 then), same convention as the Superchip clauses above.
      if (usage.dpcPlus.available) {
        parts.push(`${usage.dpcPlus.used} of ${usage.dpcPlus.available} DPC+ bonus RAM (${usage.dpcPlus.available - usage.dpcPlus.used} bytes free)`);
      }
      // Variables that did not fit anywhere else and went in the display memory (DPC+ only, see displayRamVars in generators/bbasic.js).
      if (usage.displayRam && usage.displayRam.used) parts.push(`${usage.displayRam.used} in Display RAM`);
      return `${parts.join(', ')} used.`;
    },
    // System variables (player0frame, newbackground, etc. - see
    // SYSTEM_VARIABLES' comment in generators/bbasic.js) - a SEPARATE,
    // always-unconditional set of "dim" lines, deliberately NOT folded into
    // romVariableAssignments/romVariablesSummary below: those two describe the
    // competitive dev/user var pool specifically (14 letters without
    // Superchip, matching USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP - see its
    // comment in generators/bbasic.js for why system variables'  12
    // letters are excluded from that count), so merging system variables into
    // that same list would make "X of 14" look wrong the moment the list
    // shows more than 14 entries, even though nothing is actually broken.
    romSystemVariableAssignments() {
      const usage = this.romCapacity && this.romCapacity.variableUsage;
      return sortByAssignmentSlot((usage && usage.systemAssignments) || []);
    },
    // Per-slot breakdown of the competitive dev/user var pool (see bbasic.js's
    // letterVarAssignments/superchipVarAssignments and hooks/rom.js's
    // computeVariableUsage), split into two separate lists by each entry's
    // isUserVariable flag (see bbasic.js's  userVarNames comment) - a dev
    // var some block quietly needs (rand16, collision-move's  backtrack
    // bytes, missile fire's  fired-direction state, etc.) reads very
    // differently from a variable the user themselves created on the
    // Variables tab, even though both draw from the exact same letter/
    // Superchip budget and both count toward the summary line's "X of Y"
    // above. Letters first (the pool every project always has), Superchip
    // slots after - matches the summary line's "letters, ... Superchip
    // RAM" order; each half sorted independently (see sortByAssignmentSlot's
    // comment) so that grouping itself is preserved, only the ORDER
    // within each half changes.
    romBlockVariableAssignments() {
      return this.romVariableAssignmentsByOwner(false);
    },
    romUserVariableAssignments() {
      return this.romVariableAssignmentsByOwner(true);
    },
    // Per-bank breakdown (see computeRomCapacity's  perBank field) - the
    // summary above averages over every bank, which can look like there's
    // plenty of room even when a SPECIFIC bank (the one a new relocated unit
    // would actually need to land in) has almost none left. Each bank's
    // contents (see hooks/rom.js's computeBankContents) are rendered right
    // under its "free" line - covers every bank, not just ones something
    // got relocated INTO this build (the old autoRelocatedEventsText this
    // replaced only ever showed those).
    romCapacityBanks() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.perBank || !capacity.perBank.length) return [];
      return capacity.perBank.map((bank, i) => ({
        number: i + 1,
        freeText: `${bank.freeBytes.toLocaleString()} free`,
        contents: this.bankContentsParts(i + 1),
      }));
    },
    // Drives the "bytes free" text turning red, and the capacity bar's
    // red tier (see romCapacityBarColor) - keyed off the TOTAL across every
    // bank (matching what "bytes free" itself already shows), at the user's
    // explicit request, rather than bank 1 specifically.
    romCapacityLow() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.total.usableBytes) return false;
      return capacity.total.freeBytes / capacity.total.usableBytes < ROM_CAPACITY_LOW_THRESHOLD;
    },
    // Three-tier: red once genuinely close to full (romCapacityLow - same
    // threshold/text the "bytes free" line itself already turns red at),
    // orange past 80% as an earlier heads-up, otherwise the same blue
    // "primary" color used elsewhere in the app (e.g. the Update ROM
    // button).
    romCapacityBarColor() {
      if (this.romCapacityLow) return 'red';
      if (this.romCapacityPercentFilled > 80) return 'warning';
      return 'primary';
    },
  },
  watch: {
    // Closing the tip popup with the checkbox ticked turns the startup tips setting off.
    tipOpen(open) {
      if (open || !this.tipDontShowAgain) return;
      this.showStartupTipsStorage = false;
      this.tipDontShowAgain = false;
      // Opened once the tip popup and its dark backdrop have finished fading out, or the notice opens beneath them.
      setTimeout(() => {
        this.tipsOffNoticeOpen = true;
      }, 400);
    },
    // Sounds follow the kernel: Standard sounds become DPC+ sounds when DPC+ is chosen (and back again), including
    // sounds that arrive from an imported project or sound bank.
    'configurationStorage.kernel': {
      immediate: true,
      handler() {
        this.syncSounds();
      },
    },
    'soundEffectsStorage': {
      deep: true,
      handler() {
        this.syncSounds();
      },
    },
    // The addresses come from the last build, so a new build or a new choice sends the list again.
    debugWatch() {
      this.sendDebugWatch();
    },
    // The Options tab's adaptive frame skipping, passed on to the emulator whenever it changes.
    'adaptiveFrameSkipStorage'() {
      this.applyAdaptiveFrameSkip();
    },
    // Vuetify's dark theme (see the .dark-mode CSS comment).
    darkMode(value) {
      this.$vuetify.theme.dark = value;
    },
    emulatorWidth() {
      // Wait for the drawer's new width to reach the DOM before measuring.
      this.$nextTick(this.updateEmulatorScale);
    },
    emulatorVisible(value) {
      localStorage.setItem(EMULATOR_VISIBLE_KEY, value ? 'true' : 'false');
      // Re-measure once it's shown again - updateEmulatorScale's  retry
      // loop already tolerates being called before the drawer's slide-in
      // transition (transform/visibility - see .emulator-drawer's
      // transition-property) finishes, the same way it already tolerates a
      // width-drag mid-reflow.
      if (value) this.$nextTick(this.updateEmulatorScale);
    },
    // Keeps the bottom console pinned to its newest line as a build
    // progresses, rather than leaving it wherever it happened to be
    // scrolled (usually the top, showing only the earliest "Preprocessing
    // started..."-style lines) while new lines keep appending below the
    // visible area. compileLog gets a whole new array reference on every
    // append (see hooks/project.js's  appendCompileLog), so a plain
    // (non-deep) watcher already fires on every line, not just the first.
    compileLog() {
      this.$nextTick(this.scrollErrorConsoleToBottom);
    },
    // Same reasoning as compileLog above - a build's  final failure
    // message renders through this separate ref (see errorStorage's
    // comment in hooks/project.js), not as another compileLog line.
    errorStorage() {
      this.$nextTick(this.scrollErrorConsoleToBottom);
    },
  },
  methods: {
    // The link in the notice that follows turning tips off: opens the Options tab at the switch that turns them on.
    goToStartupTipsSetting() {
      this.tipsOffNoticeOpen = false;
      optionToReveal.value = 'show-startup-tips-option';
      if (this.$route.path !== '/configuration') this.$router.push('/configuration');
    },
    // Shared by romBlockVariableAssignments/romUserVariableAssignments above -
    // a plain method (not two near-identical computeds) since the only
    // difference between them is which side of isUserVariable they keep.
    romVariableAssignmentsByOwner(isUserVariable) {
      const usage = this.romCapacity && this.romCapacity.variableUsage;
      if (!usage) return [];
      const matches = (assignment) => !!assignment.isUserVariable === isUserVariable;
      return [
        ...sortByAssignmentSlot((usage.letterAssignments || []).filter(matches)),
        ...sortByAssignmentSlot((usage.superchipAssignments || []).filter(matches)),
        ...sortByAssignmentSlot((usage.dpcPlusAssignments || []).filter(matches)),
        ...sortByAssignmentSlot((usage.displayRamAssignments || []).filter(matches)),
        // Superchip's  r/w pool (see computeVariableUsage's  comment
        // in hooks/rom.js) - every entry here is isUserVariable: false, so
        // this only ever contributes to the block list, never the user one,
        // matching this pool's "never offered to the user" design.
        ...sortByAssignmentSlot((usage.superchipRwAssignments || []).filter(matches)),
      ];
    },
    // Scrolls the bottom console pane (see .error-scroll-wrapper's
    // ref) to its newest line - called after $nextTick from the
    // compileLog/errorStorage watchers above, so the DOM has already
    // grown to include whatever line just triggered this before the
    // scroll position is read/set.
    scrollErrorConsoleToBottom() {
      const el = this.$refs.errorScrollWrapper;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    },
    // Formats one bank's  contents (see hooks/rom.js's computeBankContents)
    // as a list of {label, names} entries for romCapacityBanks's  per-bank
    // entry - one entry per kind present (rather than one long comma-separated
    // line) so a bank holding several different kinds of content stays
    // scannable, and an empty array for a bank with nothing in it. Kept
    // structured (not pre-joined into one string) so the template can bold
    // just the label - see .rom-capacity-bank-contents in the template.
    bankContentsParts(bankNumber) {
      const contents = this.romCapacity && this.romCapacity.bankContents && this.romCapacity.bankContents[bankNumber];
      if (!contents) return [];
      const groups = [
        ['Events', contents.events],
        ['Backgrounds', contents.backgrounds],
        ['Player 0', contents.player0Sprites],
        ['Player 1', contents.player1Sprites],
        ['Music', contents.music],
        ['Subroutines', contents.subroutines],
        ['Functions', contents.functions],
        ['Data tables', contents.dataTables],
        ['Sound', contents.soundEffects],
      ];
      const parts = (contents.fixed || []).map((label) => ({label, names: ''}));
      groups.filter(([, names]) => names.length).forEach(([label, names]) => parts.push({label, names: names.join(', ')}));
      // First in its bank's list, ahead of everything else in it.
      if (contents.titleScreenKernel) parts.unshift({label: 'Title Screen Kernel', names: ''});
      if (contents.textMinikernel) parts.push({label: 'Text Minikernel', names: ''});
      if (contents.bankOverhead) parts.push({label: 'Bank switching overhead', names: ''});
      return parts;
    },
    // The canvas lives directly in public/index.html (see
    // tools/gopher2600-wasm), so unlike the old Javatari integration it
    // exists from page load rather than being asynchronously created and
    // placed by an external library - no retry-until-it-exists dance needed,
    // just move it into this component's container once and start
    // observing its size.
    sendDebugWatch() {
      safeWithGopher2600((gopher2600) => {
        if (typeof gopher2600.setDebugWatch === 'function') gopher2600.setDebugWatch(this.debugWatch);
      });
    },
    handleToggleDebugOverlay() {
      this.debugInfo = null;
      saveEmulatorSettings({...this.emulatorSettings, debugOverlay: !this.emulatorSettings.debugOverlay});
    },
    handleEmulatorDebug(event) {
      if (this.emulatorSettings.debugOverlay) this.debugInfo = event.detail;
    },
    attachEmulator() {
      const container = document.getElementById('gopher2600-target-container');
      // Falls back to the remembered element: if the canvas was ever removed
      // from the page along with a re-rendered container, it can't be found
      // by id any more but is still there to put back.
      const screen = document.getElementById('gopher2600-screen') || this.emulatorScreenEl ||
        window.gopher2600ScreenElement;
      if (!container || !screen) return;
      this.emulatorScreenEl = screen;
      container.appendChild(screen);
      screen.style.display = '';
      this.observeEmulatorSize(container, screen);
      this.updateEmulatorScale();
    },
    // Safety net for the emulator canvas vanishing (reported as happening
    // sometimes after a refresh, cause not pinned down): once a second,
    // checks that the canvas is still inside its container, shown, and that
    // the container's height matches the canvas's scaled height, and
    // repairs whichever is off. Logs what it found so a repeat can be traced.
    checkEmulatorCanvas() {
      const container = document.getElementById('gopher2600-target-container');
      const screen = document.getElementById('gopher2600-screen') || this.emulatorScreenEl ||
        window.gopher2600ScreenElement;
      if (!container || !screen || !container.clientWidth || document.hidden) return;
      const problems = [];
      if (screen.parentElement !== container) problems.push('canvas not in its container');
      if (screen.style.display === 'none') problems.push('canvas hidden');
      if (screen.offsetWidth && screen.offsetHeight) {
        const marginBottom = parseFloat(getComputedStyle(screen).marginBottom) || 0;
        const expected = Math.round((screen.offsetHeight + marginBottom) *
          (container.clientWidth / screen.offsetWidth));
        if (Math.abs(container.clientHeight - expected) > 2) {
          problems.push(`container height ${container.clientHeight}px, expected ${expected}px`);
        }
      } else {
        problems.push(`canvas size ${screen.offsetWidth}x${screen.offsetHeight}`);
      }
      if (!problems.length) return;
      console.warn('Emulator canvas problem, repairing:', problems.join('; '));
      this.attachEmulator();
    },
    // Fires on every 'gopher2600-ready' event - the real first page load,
    // a full "Refresh emulator" reload, and (see public/index.html's
    // error listener) an automatic reinstantiation after a fatal WASM trap.
    // A fresh instance resets the canvas to a small default size before its
    // first real frame renders (see gopher2600-wasm's newConsole), which is
    // exactly the transient-zero-size window updateEmulatorScale's
    // bounded retry budget can lose the race against - without re-running
    // this here, a crash-recovery landing in that window left the emulator
    // pane collapsed to 0px height with nothing left to ever re-measure it,
    // i.e. the reported "emulator preview sometimes disappears". Re-running
    // the same attach/observe logic used on mount and after a build is a
    // cheap, safe way to resync (re-attaching an already-attached element or
    // re-observing an already-observed one is a no-op).
    handleGopher2600Ready() {
      this.attachEmulator();
      this.applyAdaptiveFrameSkip();
    },
    applyAdaptiveFrameSkip() {
      const enabled = !!this.adaptiveFrameSkipStorage;
      safeWithGopher2600((gopher2600) => {
        if (typeof gopher2600.setAdaptiveFrameSkip === 'function') gopher2600.setAdaptiveFrameSkip(enabled);
      });
    },
    // A single measurement is fragile: if it runs while the container's width
    // has not settled to the drawer width yet, the scale comes out too large,
    // the fixed container height too tall, and the ROM buttons get pushed out
    // of the drawer. Re-measuring whenever the container's width actually
    // changes makes the height self-correct once layout settles, instead of
    // staying wrong until the user resizes.
    //
    // Also watches the canvas element itself, not just the container: the
    // emulator resizes the canvas's width/height attributes to match
    // the cropped picture it's rendering (see gopher2600-wasm's
    // onAnimationFrame, which can change size e.g. between NTSC/PAL), which
    // changes its *intrinsic* size (screen.offsetWidth/offsetHeight, what
    // the scale is computed from) without necessarily changing the
    // container's width - leaving the container-only check above blind
    // to it.
    observeEmulatorSize(container, screen) {
      if (this.emulatorResizeObserver || typeof ResizeObserver === 'undefined') {
        return;
      }
      // The callback sets the container's height, which the observer reports
      // back as a size change; reacting to that would loop. Only the width
      // matters for the scale and we never set it here, so ignore reports that
      // leave it unchanged, and defer to an animation frame so the measurement
      // never runs inside notification delivery.
      this.emulatorResizeObserver = new ResizeObserver(() => {
        if (this.emulatorResizePending) return;
        this.emulatorResizePending = true;
        window.requestAnimationFrame(() => {
          this.emulatorResizePending = false;
          const width = container.clientWidth;
          const screenWidth = screen.offsetWidth;
          const screenHeight = screen.offsetHeight;
          if (width === this.lastEmulatorWidth &&
              screenWidth === this.lastScreenWidth &&
              screenHeight === this.lastScreenHeight) {
            return;
          }
          this.lastEmulatorWidth = width;
          this.lastScreenWidth = screenWidth;
          this.lastScreenHeight = screenHeight;
          this.updateEmulatorScale();
        });
      });
      this.emulatorResizeObserver.observe(container);
      this.emulatorResizeObserver.observe(screen);
    },
    // Listener wrapper, so the event object is not taken as a retry count.
    handleWindowResize() {
      this.updateEmulatorScale();
    },
    // Whether the emulator's tool icons are on a line below the refresh button (the pane is too narrow for both on one line),
    // where they are centered instead of at the right.
    updateToolbarWrap() {
      const row = this.$el && this.$el.querySelector && this.$el.querySelector('.emulator-toolbar-row');
      const button = row && row.querySelector('.emulator-refresh-button');
      const icons = row && row.querySelector('.emulator-toolbar-icons');
      if (!button || !icons) return;
      this.emulatorToolbarWrapped = icons.offsetTop >= button.offsetTop + button.offsetHeight;
    },
    updateEmulatorScale(retriesLeft = EMULATOR_MEASURE_RETRIES) {
      this.updateToolbarWrap();
      if (document.fullscreenElement) this.syncFullscreenAspect();
      const container = document.getElementById('gopher2600-target-container');
      const screen = document.getElementById('gopher2600-screen');
      if (!container || !screen) return;
      // The canvas has no size until the emulator's first rendered frame
      // sets its width/height attributes (see gopher2600-wasm's
      // onAnimationFrame). Measuring before then would collapse the
      // container to zero height and clip the emulator away entirely. Also
      // guards the container's
      // width, not just the screen's - this is called synchronously right
      // after a ROM build finishes (see handleRomUpdate), which can land
      // before the drawer has laid out again since the last reflow, momentarily
      // reading clientWidth as 0. That zeroes emulatorScale, which both sets
      // this container's CSS height to a literal "0px" and (via
      // "transform: scale(var(--emulator-scale))") shrinks the emulator's
      // actual content to nothing - and since nothing else re-triggers a
      // recalculation afterward, it stayed that way instead of self-correcting.
      if (!container.clientWidth || !screen.offsetWidth || !screen.offsetHeight) {
        if (retriesLeft > 0) {
          window.setTimeout(
              () => this.updateEmulatorScale(retriesLeft - 1), EMULATOR_MEASURE_INTERVAL);
        }
        return;
      }
      const marginBottom = parseFloat(getComputedStyle(screen).marginBottom) || 0;
      this.emulatorScale = container.clientWidth / screen.offsetWidth;
      this.emulatorHeight =
        Math.round((screen.offsetHeight + marginBottom) * this.emulatorScale);
    },
    startResize() {
      this.resizing = true;
      window.addEventListener('mousemove', this.doResize);
      window.addEventListener('mouseup', this.stopResize);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    },
    doResize(event) {
      const maxWidth = Math.min(EMULATOR_MAX_WIDTH, window.innerWidth - EDITOR_MIN_WIDTH);
      const width = window.innerWidth - event.clientX;
      this.emulatorWidth = Math.round(
          Math.min(maxWidth, Math.max(EMULATOR_MIN_WIDTH, width)));
    },
    stopResize() {
      if (!this.resizing) return;
      this.resizing = false;
      window.removeEventListener('mousemove', this.doResize);
      window.removeEventListener('mouseup', this.stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(EMULATOR_WIDTH_KEY, String(this.emulatorWidth));
      // Nudge layout-sensitive widgets (the Blockly canvas sizes its SVG from
      // its container, and only reflows on a window resize). This has to wait
      // for the drawer's new width to be applied to the DOM, otherwise they
      // measure the previous layout.
      this.$nextTick(() => window.dispatchEvent(new Event('resize')));
    },
    startResizeSidebar() {
      this.resizingSidebar = true;
      window.addEventListener('mousemove', this.doResizeSidebar);
      window.addEventListener('mouseup', this.stopResizeSidebar);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    },
    doResizeSidebar(event) {
      // Only two sizes: wide (names beside the icons) or narrow (names under them), by which side of the middle the
      // pointer is on.
      this.sidebarWidth = event.clientX < SIDEBAR_STACKED_WIDTH ? SIDEBAR_MIN_WIDTH : SIDEBAR_MAX_WIDTH;
    },
    stopResizeSidebar() {
      if (!this.resizingSidebar) return;
      this.resizingSidebar = false;
      window.removeEventListener('mousemove', this.doResizeSidebar);
      window.removeEventListener('mouseup', this.stopResizeSidebar);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.sidebarWidth));
      // The editors size themselves from their container, which only changes once the drawer's width is applied.
      this.$nextTick(() => window.dispatchEvent(new Event('resize')));
    },
    startResizeError() {
      this.resizingError = true;
      window.addEventListener('mousemove', this.doResizeError);
      window.addEventListener('mouseup', this.stopResizeError);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
    },
    doResizeError(event) {
      const maxHeight = Math.max(
          ERROR_MIN_HEIGHT, window.innerHeight - ERROR_MIN_REMAINING_HEIGHT);
      const height = window.innerHeight - event.clientY;
      this.errorHeight = Math.round(
          Math.min(maxHeight, Math.max(ERROR_MIN_HEIGHT, height)));
    },
    stopResizeError() {
      if (!this.resizingError) return;
      this.resizingError = false;
      window.removeEventListener('mousemove', this.doResizeError);
      window.removeEventListener('mouseup', this.stopResizeError);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(ERROR_HEIGHT_KEY, String(this.errorHeight));
      // Same reflow nudge as stopResize() above, for the same reason: the
      // Blockly canvas only re-measures its container (which just changed
      // height) on a window resize event, not by itself.
      this.$nextTick(() => window.dispatchEvent(new Event('resize')));
    },
    // buildRom() compiles via WASM asynchronously now (the real bB 1.9
    // toolchain, run through an in-browser WASI shim - see hooks/bb-compiler.js),
    // but the button's progress state still needs a paint before that starts,
    // hence the same setTimeout(...,0) wrapper as when this was synchronous.
    handleRomUpdate() {
      if (this.building) return;
      this.building = true;
      window.setTimeout(() => {
        buildRom().finally(() => {
          this.building = false;
          // Re-running the same attach/observe logic used on mount is a
          // cheap, safe way to keep the canvas correctly placed and sized
          // after a build (re-finds the element fresh rather than trusting
          // a reference that may be stale; re-attaching an already-attached
          // element or re-observing an already-observed one is a no-op).
          this.attachEmulator();
        });
      }, 0);
    },
    // Manual fallback if the emulator preview ever gets into a bad state
    // this component's logic doesn't recover from by itself (e.g. the
    // WASM module itself crashing - see gopher2600-wasm's onAnimationFrame,
    // which recovers panics in the render loop but not a fatal WASM trap).
    // A full reload is the one guaranteed way to get a fresh instance.
    // Project data lives in localStorage and survives this. Whatever ROM
    // was actually showing on screen (a real "Update ROM" build or a Title
    // Screen preview build) survives too - see rom-status.js's
    // recordLoadedRomForRecovery/sessionStorage restore, and emulator.js's
    // 'gopher2600-ready' listener that re-flashes it into the fresh
    // instance - so the emulator picks back up showing the same graphics
    // instead of coming back up blank. Only the Generated tab's in-memory
    // code ref and the real build's Save ROM/Test in Stella state
    // (compiledRomBytes/hasCompiledRom - deliberately NOT persisted, since
    // after a reload there's no way to tell whether the last thing shown
    // was a real build or a synthetic preview) don't survive, so the user
    // needs to click "Update ROM" again to re-enable those specifically.
    // Re-flashing the same already-successfully-loaded bytes here (rather
    // than auto-rebuilding) is deliberate: if a bad ROM's RUNTIME behavior
    // is itself what crashed the emulator, re-running the compiler the
    // moment the page comes back up would risk re-triggering the same crash
    // immediately, soft-locking the user out of ever seeing a stable page
    // to fix the project from - reloading known-good bytes into a fresh
    // instance carries no such risk.
    handleRefreshEmulator() {
      markSkipLoadLastProjectCheckOnce();
      window.location.reload();
    },
    // Shows the emulator picture full screen: the canvas's container is what goes full screen
    // (see the #gopher2600-target-container:fullscreen rules), since the browser fixes the size
    // of the full screen element itself and the picture has to keep its aspect ratio.
    handleFullscreen() {
      const container = document.getElementById('gopher2600-target-container');
      if (!container || !container.requestFullscreen) return;
      this.syncFullscreenAspect();
      container.requestFullscreen().catch(() => {});
    },
    // The picture's width over its height, for the full screen rules to fit it to the display.
    syncFullscreenAspect() {
      const container = document.getElementById('gopher2600-target-container');
      const screen = document.getElementById('gopher2600-screen');
      if (!container || !screen) return;
      const width = parseFloat(screen.style.width) || screen.width;
      const height = parseFloat(screen.style.height) || screen.height;
      if (width && height) container.style.setProperty('--fullscreen-aspect', String(width / height));
    },
    // Saves what the emulator is showing as a PNG.
    handleScreenshot() {
      const shot = captureEmulatorScreenshot();
      if (!shot) {
        this.errorStorage = 'There is no emulator picture to capture yet.';
        return;
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      shot.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `screenshot-${stamp}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
      }, 'image/png');
    },
    // Opens the save dialog with a "Save as type" list (.bin or .a26 - the same raw
    // ROM image either way; a26 is the usual name for an Atari 2600 ROM) where the
    // browser has one (Chrome and Edge). Others download compiled-rom.bin or
    // compiled-rom.a26, picked from the menu on the button.
    // The ROM's file name (without the extension): the Project tab's Title followed
    // by its Version (0.0.0 when none is set), dots as dashes like the saved
    // project's name, e.g. My_Game_1-0-0. With no Title it is just compiled-rom.
    romBaseName() {
      const config = this.configurationStorage || {};
      const title = config.projectTitle && sanitizeForFilename(config.projectTitle);
      if (!title) return 'compiled-rom';
      const version = sanitizeForFilename(config.projectVersion || '0.0.0').replace(/\./g, '-');
      return `${title}_${version}`;
    },
    handleSaveRomClick() {
      if (window.showSaveFilePicker) this.handleRomDownload();
      else this.romSaveMenuOpen = !this.romSaveMenuOpen;
    },
    // extension: which one to download as when there is no save dialog with a type
    // list (see handleSaveRomClick); ignored when there is one.
    async handleRomDownload(extension = 'bin') {
      if (!this.compiledRomBytes) {
        this.errorStorage =
          'There is no compiled ROM yet; use "Update ROM" first.';
        return;
      }
      const blob = new Blob([this.compiledRomBytes.output], {type: 'application/octet-stream'});
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: `${this.romBaseName()}.bin`,
            // Each type has its own made-up MIME type. A shared one is merged into a
            // single entry, and a real one such as application/octet-stream is
            // expanded by the browser into every extension it knows for it (the
            // dialog then showed .bin on its own, or both extensions on each entry).
            types: [
              {description: 'Atari 2600 ROM (.bin)', accept: {'application/x-atari-2600-rom-bin': ['.bin']}},
              {description: 'Atari 2600 ROM (.a26)', accept: {'application/x-atari-2600-rom-a26': ['.a26']}},
            ],
            excludeAcceptAllOption: true,
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (e) {
          // Cancelling the dialog is not an error.
          if (e && e.name !== 'AbortError') this.errorStorage = `Could not save the ROM: ${e.message}`;
        }
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${this.romBaseName()}.${extension === 'a26' ? 'a26' : 'bin'}`;
      link.click();
    },
    // "Test in Stella" - launches the user's  local Stella install
    // (configured on the Options tab - see Configuration.vue's  Stella
    // field) with the just-compiled ROM, with no extra CLI flags ("default
    // settings", per the explicit request - Stella's  UI already
    // remembers whatever the user last configured there across runs). Only
    // reachable in the desktop build at all (see isElectron above) - a
    // browser tab has no way to launch a local program.
    async handleTestInStella() {
      if (!this.compiledRomBytes) {
        this.errorStorage = 'There is no compiled ROM yet; use "Update ROM" first.';
        return;
      }
      if (!this.stellaPathStorage) {
        this.errorStorage = 'Set the Stella installation location on the Options tab first.';
        return;
      }
      this.launchingStella = true;
      try {
        const result = await window.electronAPI.launchStella(this.stellaPathStorage, this.compiledRomBytes.output);
        if (!result.success) {
          // escapeHtml - errorStorage's <pre> renders via v-html now (see
          // showError's boldenErrorHeaders), so a raw '<'/'>'/'&' in a
          // Stella launch error would otherwise be parsed as real markup.
          this.errorStorage = `Couldn't launch Stella: ${escapeHtml(result.error)}`;
        }
      } finally {
        this.launchingStella = false;
      }
    },
    // Front-panel switches - Gopher2600 (unlike Javatari) draws no
    // console-panel graphic itself, so these are real UI, wired
    // directly to gopher2600-wasm's exposed API (tools/gopher2600-wasm/main.go).
    handleTogglePower(poweredOn) {
      this.emulatorPoweredOn = poweredOn;
      safeWithGopher2600((gopher2600) => {
        if (poweredOn) {
          gopher2600.powerOn();
          // A fresh VCS resets every switch to hardware defaults - restore
          // whatever position the UI currently shows for the persistent
          // (non-momentary) ones.
          gopher2600.setColorMode(this.emulatorColorMode);
          gopher2600.setDifficulty('left', this.emulatorLeftDifficultyPro);
          gopher2600.setDifficulty('right', this.emulatorRightDifficultyPro);
        } else {
          gopher2600.powerOff();
        }
      });
    },
    handlePressReset() {
      safeWithGopher2600((gopher2600) => gopher2600.pressReset());
    },
    handleReleaseReset() {
      safeWithGopher2600((gopher2600) => gopher2600.releaseReset());
    },
    handlePressSelect() {
      safeWithGopher2600((gopher2600) => gopher2600.pressSelect());
    },
    handleReleaseSelect() {
      safeWithGopher2600((gopher2600) => gopher2600.releaseSelect());
    },
    handleToggleColorMode(color) {
      this.emulatorColorMode = color;
      safeWithGopher2600((gopher2600) => gopher2600.setColorMode(color));
    },
    handleToggleDifficulty(port, pro) {
      if (port === 'left') this.emulatorLeftDifficultyPro = pro;
      else this.emulatorRightDifficultyPro = pro;
      safeWithGopher2600((gopher2600) => gopher2600.setDifficulty(port, pro));
    },
  },
};
</script>
<!-- Unscoped: #gopher2600-screen lives directly in public/index.html and is
     moved into this component's DOM by attachEmulator(), so it never
     carries this component's scope attribute. -->
<style>
/* The flat icon-button look of the emulator toolbar's screenshot and keyboard
   mapping buttons - the same flat-icon treatment as every other icon button
   in the app (e.g. Project.vue's .project-flat-icon-btn): transparent
   background (no Vuetify default hover circle), the icon fading from a faint
   grey to near-black on hover and flashing the app's blue on press. Unscoped
   because the keyboard button belongs to KeyMappingDialog.vue. */
.emulator-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.emulator-flat-icon-btn::before {
  display: none;
}

/* The icon colors are scoped under .v-application .emulator-toolbar-row so they outrank
   Soft Colors' blanket ".desaturate-app-colors .theme--light.v-icon" darkening
   (see further below), which otherwise holds these icons at a fixed dark grey
   with no hover change. */
.v-application .emulator-toolbar-row .emulator-flat-icon-btn.v-btn .v-icon {
  /* The graphic editor toolbar's icon size. */
  font-size: 19px;
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.v-application .emulator-toolbar-row .emulator-flat-icon-btn.v-btn:hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.v-application .emulator-toolbar-row .emulator-flat-icon-btn.v-btn:active .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* Dark Mode (see Configuration.vue's switch, bound to darkMode below) uses
   Vuetify's built-in dark theme (see the darkMode watcher: $vuetify.theme.dark),
   which switches every Vuetify component to its .theme--dark colors, plus the
   overrides below for this app's hardcoded colors. There is no filter on
   the app, so canvases, color swatches and the emulator screen are never
   recolored: they keep their true colors with no special handling. */
.dark-mode.v-application {
  background-color: #000 !important;
}

.dark-mode.desaturate-app-colors.v-application {
  background-color: #1e1e1e !important;
}

.dark-mode .emulator-drawer.theme--dark.v-navigation-drawer,
.dark-mode .nav-drawer.theme--dark.v-navigation-drawer,
.dark-mode .top-toolbar.theme--dark.v-app-bar.v-toolbar.v-sheet {
  background-color: #000 !important;
}

.dark-mode.desaturate-app-colors .emulator-drawer.theme--dark.v-navigation-drawer,
.dark-mode.desaturate-app-colors .nav-drawer.theme--dark.v-navigation-drawer,
.dark-mode.desaturate-app-colors .top-toolbar.theme--dark.v-app-bar.v-toolbar.v-sheet {
  background-color: #1e1e1e !important;
}

.dark-mode .emulator-drawer .v-navigation-drawer__border,
.dark-mode .nav-drawer .v-navigation-drawer__border {
  background-color: rgba(255, 255, 255, 0.24) !important;
}

.dark-mode.v-application .nav-drawer {
  border-top-color: rgba(255, 255, 255, 0.24) !important;
}

.dark-mode.v-application .top-toolbar {
  border-bottom-color: rgba(255, 255, 255, 0.24) !important;
}

/* Blockly keeps its light-theme colors for everything but the workspace
   background (blocks are darkened by BlocklyComponent.vue's darkenHex). */
.dark-mode .blocklySvg {
  background-color: #1e1e1e !important;
}

.dark-mode .blocklyDiv [id^="blocklyGridPattern"] line {
  stroke: #595959 !important;
}

.dark-mode .blocklyFlyoutBackground {
  fill: #1e1e1e !important;
}

.dark-mode .blocklyFlyoutLabelText {
  fill: #fff !important;
}

/* All gated behind "Soft Colors" (see Configuration.vue's switch,
   bound to desaturateAppColors below) - off means plain stock Vuetify
   white everywhere, on mutes both block/tab colors (see the filter rules
   further below) AND swaps every white surface for one of three
   progressively darker tiers: cards (lightest, so they still read as
   distinct surfaces), the app's chrome/background around them
   (darker), and the build/error console footer below that (darkest, so it
   reads as its panel). Each needs !important to beat Vuetify's
   base stylesheet (plain classes there, not inline styles, so a plain
   override without !important would otherwise just lose a specificity tie
   to a same-specificity rule that happens to be loaded after this one). */
/* 2% darker than the original #eeeeee, at the user's request. */
.desaturate-app-colors .theme--light.v-card {
  background-color: #e9e9e9 !important;
}

/* Vuetify's .theme--light.v-list default (white) isn't covered by the
   v-card rule above - a v-list nested inside a popup card (e.g. the Set
   height popup's title/slider rows - TitleScreenEditor.vue/PlayerEditor.vue/
   BackgroundEditor.vue's v-dialog, despite this rule's older comment
   describing it as a v-menu) kept a plain white background even with
   Subdued Palette on, while the rest of that same popup (rows with no
   v-list wrapper, e.g. the Cancel/Set height button row) correctly picked
   up the card's grey - confirmed as a real reported bug, visibly
   inconsistent within one popup ("popup colors should also be affected by
   subdued color toggle", "the bottom portion of the set height popup
   behind the cancel and set height buttons is the wrong color"). Scoped to
   .v-menu__content/.v-dialog__content specifically - every tab's card-list
   container (.background-list, .animation-list, .titlescreen-card-list,
   ...) is ALSO a v-list, and painting those the same grey showed as a
   stray light box sitting behind that tab's cards instead (also confirmed
   as a real reported bug once tried unscoped). */
.desaturate-app-colors .v-menu__content .theme--light.v-list,
.desaturate-app-colors .v-dialog__content .theme--light.v-list {
  background-color: #e9e9e9 !important;
}

.desaturate-app-colors.v-application,
.desaturate-app-colors .theme--light.v-app-bar.v-toolbar.v-sheet,
.desaturate-app-colors .theme--light.v-navigation-drawer,
.desaturate-app-colors .editor-container.theme--light.v-card {
  background-color: #e1e1e1 !important;
}

.desaturate-app-colors .error-message.theme--light.v-footer {
  background-color: #bdbdbd !important;
}

/* Darkens the error console's red text to match Soft Colors' desaturated
   palette - the plain Material red (rgb(244, 67, 54)) both .theme--light.
   v-footer.error-message (the blanket color errorStorage's <pre> inherits)
   and .compile-log-error use normally stood out as the one remaining bright,
   saturated color against every other darkened/desaturated element. */
.desaturate-app-colors .theme--light.v-footer.error-message,
.desaturate-app-colors .compile-log-error {
  color: #c62828 !important;
}

/* Dark Mode - the error/build console gets an explicit black background
   (not just whatever inverting its normal light background happens to
   produce) and keeps its red error text truly red, not hue-rotated into
   looking orange/cyan - a real reported requirement. .error-message is
   excluded from the blanket invert entirely now (see that rule's
   :not(.error-message) further up, added after a real reported "the
   console log is now all white" regression - once the blanket invert was
   scoped directly onto .v-application--wrap's children instead of their
   shared ancestor, this element started receiving that filter directly
   rather than cancelling an ancestor's copy of it, so the forced-black
   background below was getting inverted to white by this element's
   now-redundant copy of the exact same filter), so its light-mode text
   colors - including Subdued Palette's red/background overrides just
   above, when also active - already apply normally with no filter
   involved at all; the background is then forced black regardless (this
   rule's selector ties Subdued's background rule above on specificity, so
   it has to come AFTER it in source order to win when both are on), and
   the otherwise near-black info/stage text is brightened to stay readable
   against that new black background. */
.dark-mode .error-message.theme--light.v-footer {
  background-color: #000 !important;
}

.dark-mode .compile-log-info {
  color: rgba(255, 255, 255, 0.87) !important;
}

/* .error-message's border-top (rgba(0, 0, 0, 0.24), see its rule further
   below) goes invisible against the forced-black background above for the
   same reason the resize handle did - .error-message is excluded from the
   blanket invert entirely now (see the comment further up), so this plain
   color property needs an explicit value, not a filter to rely on. Matches
   the emulator pane's left border once that one got an explicit fix too
   (.emulator-drawer .v-navigation-drawer__border further below) - both
   ended up needing the identical direct value for the identical reason,
   now that neither lives inside the blanket invert anymore. */
.dark-mode .error-message {
  border-top-color: rgba(255, 255, 255, 0.24) !important;
}

/* Every v-switch's OFF-state thumb (the little knob) defaults to plain
   white, unlike its ON state (which gets a "primary--text" utility class
   added, tinting it the app's blue via currentColor) - same card color
   as the rest of this file's darker-than-white overrides above, so the knob
   doesn't stand out as the one leftover white dot against a switch's
   track and whatever card/background it's sitting on. Excludes the "on"
   variant (:not(.primary--text)) so the blue itself is untouched. */
.desaturate-app-colors .v-input--switch__thumb:not(.primary--text) {
  background-color: #ebebeb !important;
}

/* The ON-state's "primary--text" blue (see the comment above) - left
   untouched by the OFF-state rule above on purpose, but still one more
   fully-saturated color left on the page otherwise, confirmed directly as
   a real reported gap ("make the blue on toggles also be affected"). Same
   filter treatment as every other colored control under Subdued Palette. */
.desaturate-app-colors .v-input--switch__thumb.primary--text,
.desaturate-app-colors .v-input--switch__track.primary--text {
  filter: saturate(50%) brightness(0.85);
}

/* v-slider's filled AND unfilled track, plus the thumb (SoundFXEditor.vue's
   "DIM" slider, MusicEditor.vue/BackgroundEditor.vue/TitleScreenEditor.vue/
   PlayerEditor.vue's sliders) - all plain Vuetify "primary" background
   color utility classes (the unfilled side also gets Vuetify's
   "lighten-3"), same as the switch thumb/track above, just not named
   "primary--text" this time (it's a background-color, not a text/
   currentColor tint) - confirmed directly as a real reported gap ("slider
   colors should also update" - and, once the filled side was fixed, "the
   slider bar color should also get darker, not just the filled part").
   Same filter treatment as every other colored control under Subdued
   Palette. */
.desaturate-app-colors .v-slider__track-fill.primary,
.desaturate-app-colors .v-slider__track-background.primary,
.desaturate-app-colors .v-slider__thumb.primary {
  filter: saturate(50%) brightness(0.85);
}

/* Every solid-colored button throughout the app (color="primary"/"green"/
   etc, Vuetify's ".v-btn--has-bg" - the power button once on, "Update
   ROM", the P1/P2 difficulty and Color/B&W switches, every tab's
   selected-state toggle buttons, and so on) - same saturate+darken
   treatment as the top toolbar/sidebar tab icons above (see those rules'
   comments), so a colored button reads as muted/calmer under Soft
   Colors the same way everything else does, instead of standing out as the
   one remaining fully-saturated thing on the page. Unscoped (this file's
   FIRST <style> block, not the <style scoped> one below) since these
   buttons live in every tab's view component, not just App.vue's
   template. */
.desaturate-app-colors .theme--light.v-btn.v-btn--has-bg {
  filter: saturate(50%) brightness(0.85);
}

/* Same rule as above, for the floating circular "+" add buttons several
   tabs use (BackgroundEditor.vue/DataEditor.vue/MusicEditor.vue/etc's
   fab v-btns) - these pass Vuetify's "dark" prop (just to force their icon
   white against the colored background), which makes Vuetify give them
   ".theme--dark" instead of ".theme--light", so the rule above never
   matched them at all - confirmed directly as a real reported gap ("the
   floating + buttons don't desaturate"). */
.desaturate-app-colors .theme--dark.v-btn.v-btn--has-bg {
  filter: saturate(50%) brightness(0.85);
}

/* The "alpha"/experimental-feature warning banners (v-alert type="warning",
   e.g. MusicEditor.vue's .alpha-notice) - Vuetify's stock warning
   orange (#fb8c00, applied via its "warning--text" utility class here since
   these are all "outlined" alerts, text/border only, no filled background)
   stayed exactly as bright as ever even with every other color on the page
   muted, confirmed directly as a real reported gap. Darker (not just
   desaturated, unlike the button filter above) since the request was
   specifically for a darker orange, not a softer one. */
.desaturate-app-colors .warning--text {
  filter: brightness(0.75);
}

/* Each tab's card grid is wrapped in a v-list (titlescreen-list, text-list,
   soundfx-list, background-list, song-list, data-list, animation-list) -
   v-list is a v-sheet, not a v-card, so it fell through the .theme--light.
   v-card rule above and stayed Vuetify's default solid white, showing
   through as a white background behind/between the actual item cards.
   Transparent instead, so the surrounding .editor-container's
   background (set above) shows through there instead. Targeted by each
   tab's list class rather than a blanket ".v-list.v-sheet" rule, which
   would also hit dropdown/menu content that legitimately still needs an
   opaque background to stay readable over whatever's behind it. */
.desaturate-app-colors .titlescreen-list,
.desaturate-app-colors .titlescreen-card-list,
.desaturate-app-colors .text-list,
.desaturate-app-colors .soundfx-list,
.desaturate-app-colors .background-list,
.desaturate-app-colors .song-list,
.desaturate-app-colors .data-list,
.desaturate-app-colors .animation-list,
.desaturate-app-colors .animation-frame-list,
.desaturate-app-colors .about-list {
  background-color: transparent !important;
}

/* The app's  default font, as a custom property so switching it later
   (see public/index.html's <link> for the actual font file/weights)
   only means changing this one value, not hunting down every place that
   might otherwise hardcode a font name. .v-application is the exact
   selector Vuetify's bundled CSS itself uses for its default
   (Roboto) font-family - matching it here, with !important, is what lets
   this override win over that built-in rule instead of just adding a
   second, lower-priority one beside it. */
:root {
  --app-font-family: 'Inter', sans-serif;
  /* Blockly's  block/flyout text only - deliberately separate from
     --app-font-family above (the rest of the app, Vuetify panels included,
     stays on Inter) - see the .blocklyText/.blocklyFlyoutLabelText rule
     below and APP_BLOCKLY_THEME's fontStyle in ActionEditor.vue, which
     both have to agree on this exact font (that file's comment explains
     why: Blockly measures block width from its theme fontStyle, not
     from whatever CSS ends up applied, so the two have to be kept in sync
     by hand). public/index.html loads the actual font file for this. */
  --blockly-font-family: 'IBM Plex Mono', monospace;
}

/* Every scrollbar in the app (the left sidebar, the emulator column, each
   editor tab's scroll area, the error console) was previously left at
   the browser's default width/appearance - unstyled anywhere in this
   codebase (confirmed directly, no "::-webkit-scrollbar"/"scrollbar-width"
   rule existed before this one). Global rather than scoped to any one
   panel, so all of them read as one consistent, subdued design: a slim,
   low-opacity grey bar at rest (barely there until you actually look for
   it), a little darker on hover so it's still easy to find and grab. 16px
   gutter, 12px visible thumb - the thumb is narrower than the gutter via a
   transparent border + background-clip: content-box (the border eats into
   the thumb's box without changing the gutter it's laid out in, and
   clipping the background to content-box keeps that border area from
   getting painted over) - the standard trick for "thinner bar than its
   track." Firefox has no equivalent for a specific pixel gutter/thumb size
   (only the generic "scrollbar-width: thin/auto/none" keywords), so it only
   gets the color change here, not the exact sizing. */
/* Vuetify's default outlined-card border (rgba(0, 0, 0, 0.12)) reads as
   quite faint - darkened a bit here so card edges are easier to pick out
   from the page background. Targets each tab's MAIN per-entry card
   class by name (not a blanket .v-sheet--outlined rule, which is what
   v-card's "outlined" prop applies) specifically so this does NOT also
   darken a sub-frame nested inside one of these - PixelEditor.vue's
   outlined card (the sprite/background pixel art canvas, nested inside
   .animation-card/.background-card) and MusicEditor.vue's .pattern-card
   (nested inside .song-card) both stay at Vuetify's default lighter
   border, since each is a sub-frame within its main card rather than
   that main card's edge. */
.animation-card,
.background-card,
.data-card,
.soundfx-card,
.text-card,
.song-card,
.titlescreen-card,
.titlescreen-screen-card,
.example-card,
.sound-bank-card {
  border-color: rgba(0, 0, 0, 0.24) !important;
}

/* Popup cards (v-menu's Set height/import pickers/etc., and v-dialog's
   confirm/settings popups - e.g. KeyMappingDialog.vue) render as plain
   v-cards with no "outlined" prop, so they had no border at all - just
   elevation/shadow separating them from whatever's behind. Matches the
   same darkened border color as the main per-entry cards above, so any
   popup reads as consistent with the rest of the app instead of a
   borderless white/grey blob.
   box-shadow removed outright, in every mode, not just Dark Mode - Dark
   Mode's blanket filter was turning Vuetify's stock black-based
   elevation shadow into a glowing white halo, and CSS filter has no way to
   exempt just that one property from an ancestor's effect while still
   inverting the rest of the same popup - the only way to genuinely leave
   it unaffected was to not have one at all (a real, direct request after
   a pre-inverted "cancel it out" value still read as a visible glow once
   actually checked). The border above already gives every popup a visible
   edge in every mode, so nothing is left undefined without a shadow
   either.
   ".v-dialog" itself (not just ".v-dialog > .v-card" below) needs this
   same override too - confirmed live (getComputedStyle), a v-dialog popup's
   VISIBLE shadow actually comes from the ".v-dialog" wrapper's
   elevation (Vuetify defaults dialogs to elevation 24 - a much bigger
   blur/spread than a plain card's elevation 2), not from the ".v-card"
   inside it - the ".v-card" rule below was removing the wrong element's
   shadow this whole time, a real reported case of "the drop shadow is
   still here" after that fix alone.
   ".v-menu__content" needs the same thing for the identical reason - its
   card IS a direct child (confirmed earlier, unlike .v-dialog), but the
   VISIBLE shadow still turned out to live on ".v-menu__content" itself
   (elevation 10: "rgba(0, 0, 0, .2) 0px 5px 5px -3px, rgba(0, 0, 0, .14)
   0px 8px 10px 1px, rgba(0, 0, 0, .12) 0px 3px 14px 2px"), not on its
   ".v-card" - a real reported case of "delete popups still have a drop
   shadow" (every tab's "Delete this X?" confirm is a v-menu, not a
   v-dialog) after the ".v-card"/".v-dialog" fixes alone. */
.v-dialog,
.v-menu__content {
  box-shadow: none !important;
}

/* Menus that hold a bare list instead of a card (e.g. the Data tab's cell
   mode menu) get the same border. */
.data-format-menu {
  border: 1px solid rgba(0, 0, 0, 0.24);
}

/* A dropdown's list is narrower than its menu when the menu scrolls (the scrollbar takes the difference), and the
   menu itself had no background, so the scrollbar read as sitting outside the dropdown. With the list's
   color on the menu, the scrollbar sits inside it, on the right edge. */
.v-menu__content.theme--light {
  background-color: #fff;
}

.v-menu__content.theme--dark {
  background-color: #1e1e1e;
}

/* The same outline the popups get (a .v-card inside the menu carries theirs), for dropdown lists. */
.v-menu__content:has(> .v-select-list) {
  border: 1px solid rgba(0, 0, 0, 0.24);
}

/* The tip popup's previous/next arrows look and react like the graphic editor toolbar's icon buttons: no box, 26px
   squares 4px apart, a muted 19px icon that darkens on hover and shrinks a little while pressed. */
.tip-arrows {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}

/* "Tip X / Y" to the left of the arrows, in small type. */
.tip-counter {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.6);
  margin-right: 6px;
  white-space: nowrap;
}

.dark-mode.v-application .tip-counter {
  color: rgba(255, 255, 255, 0.7);
}

.tip-arrow-btn.v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
}

.tip-arrow-btn.v-btn::before {
  display: none;
}

.tip-arrow-btn.v-btn .v-icon {
  font-size: 19px;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.tip-arrow-btn.v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.tip-arrow-btn.v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

.dark-mode.v-application .tip-arrow-btn.v-btn:not(.v-btn--disabled):hover .v-icon {
  color: #fff !important;
}

/* The icon in the tip popup's title is the icon of the tab the tip is about, in that tab's color. The tab classes (.actions-item
   and so on) set the color on the element itself, so they win here; the three pages that are not a tab have none and
   get the title's color. */
.tip-title-icon.v-icon {
  position: relative;
  /* Vuetify animates every change of a v-icon's position, which made the icon slide when the arrows change the tip. */
  transition: none;
}

.tip-title-icon.v-icon:not([class*="-item"]) {
  color: inherit !important;
}

/* A line break in a tip's text starts a new line, for lists such as hotkeys. */
.tip-text {
  white-space: pre-line;
}

/* The tip popup's text: the grey of the popups' helper text at a larger size. It does not use the helper text classes
   (.v-messages), which Expert mode hides. */
.tip-message {
  font-size: 1rem;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.6);
}

/* The checkbox square is smaller than the Close button beside it and sits centered with it, which leaves its bottom edge
   higher than the button's. Moving it (and its label) down 5px lines the two bottom edges up. */
.tip-dont-show {
  position: relative;
  top: 0;
  /* The checkbox square is drawn 3px inside its 24px icon box and the card's actions row is 8px less indented
     than the text above it, so this puts the square's left edge in line with the text's. */
  margin-left: 5px !important;
}

/* The line that goes to the front page of the documentation: the same text as the tip, smaller. */
/* It sits right above the bottom row of the popup, so it is the same distance from the checkbox and buttons whatever the
   tip above it is. */
.tip-message.tip-footnote {
  font-size: 0.8rem;
  line-height: 1.25;
  padding: 0 24px 6px;
}

.dark-mode.v-application .tip-message {
  color: rgba(255, 255, 255, 0.6);
}

/* Every checkbox's label sits closer to its box (Vuetify leaves 8px between the box's area and the label). */
.v-application--is-ltr .v-input--checkbox .v-input--selection-controls__input {
  margin-right: 2px;
}

/* The buttons in a popup's bottom row sit the same distance from the bottom edge as from the side edges (Vuetify's default
   leaves half as much below them as beside them). */
.v-dialog > .v-card > .v-card__actions {
  padding-bottom: 16px;
}

.v-menu__content > .v-card,
.v-dialog > .v-card {
  border: 1px solid rgba(0, 0, 0, 0.24);
  box-shadow: none !important;
  /* These cards default to overflow: visible, so a flush-edged child (e.g.
     the Set height popup's v-card-actions row) squares off past the
     card's rounded corners instead of being clipped to them - right at
     that corner, whatever's behind the popup shows through instead of the
     card's background color, reading as "the wrong color at the
     bottom" (confirmed as a real reported bug). */
  overflow: hidden;
}

/* Card-level click-to-select (see selectCard/selectedCardId/deselectCard in
   MusicEditor.vue/SoundFXEditor.vue) - shared here, once, the same way the
   border-color darkening just above and .editor-container squaring below
   already are, rather than duplicating this same CSS in every tab that
   adds the feature. Suppresses every v-card--link side effect (Vuetify's
   default for ANY v-card with a click listener - a pointer cursor,
   ripple, and a hover/focus/active darkening overlay via ::before) on both
   a selectable card AND its tab's outer editor-container (whose
   click clears the selection - see deselectCard) - the ONLY visual effect
   either should have is the selected card's outline below, nothing
   else. Add a tab's MAIN card class (matching the list just above) to
   both selector groups here when wiring up a new tab. */
.soundfx-card.v-card--link,
.song-card.v-card--link,
.text-card.v-card--link,
.data-card.v-card--link,
.animation-card.v-card--link,
.background-card.v-card--link,
.titlescreen-card.v-card--link,
.titlescreen-screen-card.v-card--link,
.editor-container.v-card--link {
  cursor: default;
}
.soundfx-card.v-card--link::before,
.song-card.v-card--link::before,
.text-card.v-card--link::before,
.data-card.v-card--link::before,
.animation-card.v-card--link::before,
.background-card.v-card--link::before,
.titlescreen-card.v-card--link::before,
.titlescreen-screen-card.v-card--link::before,
.editor-container.v-card--link::before {
  display: none !important;
}
.soundfx-card.v-card--link:hover,
.song-card.v-card--link:hover,
.text-card.v-card--link:hover,
.data-card.v-card--link:hover,
.animation-card.v-card--link:hover,
.background-card.v-card--link:hover,
.titlescreen-card.v-card--link:hover,
.titlescreen-screen-card.v-card--link:hover,
.editor-container.v-card--link:hover {
  box-shadow: none !important;
}

/* Recolors a selected card's  border to the app's primary blue, plus a
   2px outline (drawn outside the border edge, never part of layout/box-
   sizing, so a card's content never shifts when selected) for extra
   visual weight. Both need !important: border-color beats v-sheet--
   outlined's rule on specificity, and outline-style needs to beat
   Vuetify's base stylesheet, which resets "outline: 0" on .v-card -
   without it, only outline-color/outline-width actually applied (confirmed
   directly: outline-STYLE stayed "none", so nothing ever painted) and the
   selected card visually looked like nothing but the border-color change
   had happened at all. */
.soundfx-card-selected,
.song-card-selected,
.text-card-selected,
.data-card-selected,
.animation-card-selected,
.background-card-selected,
.titlescreen-card-selected,
.titlescreen-screen-card-selected {
  border-color: var(--v-primary-base, #1976d2) !important;
  outline: 2px solid var(--v-primary-base, #1976d2) !important;
}

/* Every tab's  main window card shares this exact class name
   (PlayerEditor/BackgroundEditor/SoundFXEditor/TextEditor/DataEditor.vue,
   among others) - squared off globally here rather than per-file, so it
   reads consistently with Options/Music (which use v-card's "flat"
   prop, no shadow, so their rounding was never visible either way) and
   Generated Code (which already squares this exact class off itself, for
   an unrelated clipping reason - see its comment - and would otherwise
   have been the only tab actually SHOWING Vuetify's default rounding,
   simply because nothing else here had squared it off yet). */
.editor-container {
  border-radius: 0 !important;
}

/* Vuetify's  default drawer border (an internal 1px div it renders, not
   a CSS border property) for both the tool sidebar (.nav-drawer) and the
   emulator pane (.emulator-drawer) - darkened here to match the same
   .v-sheet--outlined border color above rather than Vuetify's default
   rgba(0, 0, 0, 0.12). Both drawers share this exact class, so one rule
   covers both dividers. Has to live in this unscoped <style> block, not
   the <style scoped> block below (where every other App.vue rule targeting
   Vuetify's drawer classes lives) - this particular div is rendered by
   Vuetify's internal render function rather than this component's
   template, so it never receives this component's scope attribute, and a
   scoped version of this exact rule silently never matched it at all. */
.v-navigation-drawer__border {
  background-color: rgba(0, 0, 0, 0.24) !important;
}

/* Every tab's intro paragraph (DataEditor.vue/MusicEditor.vue/ScoreFontEditor.vue/
   SoundFXEditor.vue/TextEditor.vue/TitleScreenEditor.vue) shares this exact
   class already - one shared rule here instead of each tab guessing its
   margin-top (TextEditor.vue's .text-intro-paragraph once had a -5px
   override, landing it visibly closer to its title than every other tab's -
   confirmed directly as a real reported inconsistency). Explicit margin-top:
   0 - matches Vuetify's default v-card-title/v-card-text spacing (what
   every tab actually gets with no override at all), made explicit and
   centralized here rather than "correct by nobody having touched it yet". */
.v-messages__message {
  margin-top: 0;
}

/* Shared by every alpha-stage tab's warning banner, directly under its
   v-card-title (Music, Title) - shrinks to fit the warning text itself
   instead of stretching the full card width (Vuetify's v-alert default);
   width: fit-content keeps its internal padding symmetric left/right
   either way, so this doesn't need any padding override to
   match. Moved here (not left as a MusicEditor.vue-only scoped rule) once
   a second tab needed the exact same treatment - see .tab-intro-section's
   comment just below for the same "duplicated, then shared" history. */
.alpha-notice {
  width: fit-content;
  margin: 0 16px 0;
}

/* Tightens the gap specifically when a .tab-intro-section (and its
   description paragraph) follows an .alpha-notice warning (Music, Title) -
   confirmed as a real reported case of "too much space" between the two:
   .tab-intro-section's default v-card-text padding-top (16px, left
   un-overridden - see that rule's comment below) stacked on top of this
   alert's former 8px margin-bottom, 24px total. Scoped to this
   adjacent-sibling case only, not a blanket .tab-intro-section change,
   since every other tab's intro paragraph sits directly under its
   v-card-title with no alert in between and still wants the full 16px. */
.alpha-notice + .tab-intro-section {
  padding-top: 8px;
}

/* The v-card-text wrapping every tab's intro paragraph (Background/Sprites/
   Title screen/Sound/Music/Score/Text/Data/Project/Generated) - one shared
   class/rule here instead of each tab picking its padding-bottom to
   fight its next-element's padding-top (Sound/Music/Generated each
   independently zeroed this same way after being reported as "too much
   space" before the content below - confirmed as a real reported
   inconsistency once every tab was compared side by side). Zeroed so the
   paragraph's 16px margin-bottom (see .v-messages__message above) is
   the ONLY thing setting that gap, everywhere, at exactly the same value. */
.tab-intro-section {
  padding-bottom: 0;
}

/* Pulls a toolbar up close under its tab's intro text (Sound, Data, Sprites,
   Background). The paragraph's 16px bottom margin collapses with this
   negative one, leaving a 6px gap, and the same 6px remains with the
   description text hidden (Expert mode). */
.v-application .tight-under-intro {
  margin-top: -10px;
}


/* Vuetify assigns v-menu/v-dialog overlay content its  z-index
   dynamically at open time (computed from whatever's already on the page,
   not a fixed CSS value - there's nothing to override in its
   stylesheet), and that computed value routinely lands below this app's
   chrome-level z-index: 20 rules (.emulator-resize-handle,
   .error-resize-handle's z-index: 2 sits inside .error-message's
   z-index: 10 stacking context, .emulator-hide-button, etc - see their
   comments). Confirmed as a real bug: the sidebar/console drag handles
   rendered on top of popup menus (e.g. a sound effect's delete
   confirmation) instead of under them. Pushed well above every one of
   those instead of tuning each one down, so no future chrome-level z-index
   added here needs to keep this in mind too. */
/* Was pinned to a fixed 30 - too low. .v-overlay (Vuetify's  generic
   modal-backdrop wrapper - shared by v-dialog, v-menu, AND a temporary
   v-navigation-drawer's scrim, e.g. the emulator sidebar) gets its
   z-index assigned dynamically by Vuetify, unrelated to this stylesheet,
   and it climbs over a long session as more menus/dialogs open - confirmed
   directly, it drifted to 201, well above this fixed 30, putting a
   dialog's scrim on top of its content and making the dialog's buttons
   unclickable (document.elementFromPoint() at their center returned the
   scrim, not the button - reported as "Create New Project" doing nothing
   when clicked).
   An earlier fix for this pinned .v-overlay itself below 30 instead of
   raising this - wrong, since .v-overlay isn't dialog-specific: capping it
   also capped the emulator sidebar's drawer scrim, breaking ITS
   stacking (reported directly: "the emulator sidebar is now behind the
   overlay"). Raised high enough here instead that it stays above .v-overlay
   regardless of how far that drifts, without touching .v-overlay at all -
   the fix stays scoped to dialogs/menus, the only things that were ever
   actually broken. */
.v-menu__content,
.v-dialog__content {
  z-index: 300 !important;
}

* {
  scrollbar-color: rgba(0, 0, 0, 0.25) transparent;
  scrollbar-width: thin;
}

/* 10px wide with a 2px margin each side leaves a 6px thumb; the Blockly scrollbars use the same width
   (Blockly.Scrollbar.scrollbarThickness in BlocklyComponent.vue). */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.25);
  background-clip: content-box;
  border: 2px solid transparent;
  border-radius: 8px;
}

::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.4);
}

/* Blockly draws its  scrollbars as SVG rects (.blocklyScrollbarHandle),
   not real browser scrollbars, so the ::-webkit-scrollbar rules above never
   reach them - overridden here with the same rest/hover colors so they read
   as the same design instead of Blockly's default light grey.
   Blockly's stock stylesheet (node_modules/blockly/core/css.js) already
   has a ".blocklyFlyout .blocklyScrollbarHandle"/"...:hover" pair (two
   classes) specifically for flyout scrollbars, darkened for its grey
   background - that beats a plain ".blocklyScrollbarHandle" rule on
   specificity regardless of source order, so the flyout's scrollbar was
   still showing Blockly's stock grey (#bbb/#aaa) instead of this app's
   rgba(0,0,0,0.25/0.4), particularly obvious on hover. Repeating the
   ".blocklyFlyout" prefix here matches that specificity so this app's colors
   win in the flyout too, not just the main workspace. */
.blocklyScrollbarHandle,
.blocklyFlyout .blocklyScrollbarHandle {
  fill: rgba(0, 0, 0, 0.25);
}

.blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.blocklyScrollbarHandle:hover,
.blocklyFlyout .blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.blocklyFlyout .blocklyScrollbarHandle:hover {
  fill: rgba(0, 0, 0, 0.4);
}

/* White-based, not filter-based (unlike .blocklyDiv's blanket exclusion
   above) - a real reported requirement ("Blockly scrollbars need to be
   inverted to match the other app scrollbars"): same black-based-rgba-
   reads-as-invisible-on-a-now-dark-surface issue already fixed for the
   console log's resize handle, same direct-fill-override fix (Blockly's
   scrollbars are SVG rects, not real browser scrollbars - the app-wide
   ::-webkit-scrollbar rules this is meant to visually match never reach
   them either, which is why this app's rgba(0,0,0,...) override just
   above exists in the first place). */
.dark-mode .blocklyScrollbarHandle,
.dark-mode .blocklyFlyout .blocklyScrollbarHandle {
  fill: rgba(255, 255, 255, 0.25);
}

.dark-mode .blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.dark-mode .blocklyScrollbarHandle:hover,
.dark-mode .blocklyFlyout .blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.dark-mode .blocklyFlyout .blocklyScrollbarHandle:hover {
  fill: rgba(255, 255, 255, 0.4);
}

/* Matches the grid-snap icon's rest/hover/press opacity steps (see
   ActionEditor.vue's setupGridSnapZoomButton) - overrides Blockly's
   stock ".blocklyZoom>image"/"...:hover"/"...:active" rule (css.js,
   .4/.6/.8), which is the SAME selector this app's stylesheet uses, so
   which one wins is otherwise just a source-order coin flip (Blockly injects
   its CSS at runtime, after this file's compiled <style> tag) -
   !important makes this app's values win unconditionally instead.
   filter: brightness(0) matches the REST of grid-snap/multiselect's look
   too, not just their opacity curve - a real reported gap ("give the
   blockly zoom control buttons the same styles as the multiselect and grid
   snap buttons... every button state, not just some"): opacity alone was
   already identical (confirmed live, both read 0.25 at rest), but the zoom
   icons are a raster clipped from Blockly's media/sprites.png, which
   bakes in Blockly's stock icon colour - not the near-black grid-snap's
   hand-drawn glyph and multiselect's recoloured SVG both use instead (see
   MULTISELECT_ICON_INACTIVE/_ACTIVE in BlocklyComponent.vue). brightness(0)
   zeroes every RGB channel while leaving alpha untouched, forcing the
   raster to solid black regardless of its original colour - the same
   "force a uniform icon colour Blockly doesn't expose a setting for"
   problem multiselect already solved, just via a filter here instead of a
   recoloured source image, since this one has no plugin option to swap the
   source for. Applies uniformly to rest/hover/press alike (not a per-state
   rule), so there's no separate copy needed on the :hover/:active rules
   below - once the icon itself is black, the existing opacity steps alone
   already reproduce grid-snap/multiselect's exact look at every state. */
.blocklyZoom > image,
.blocklyZoom > svg > image {
  filter: brightness(0) !important;
  opacity: .25 !important;
}

.blocklyZoom > image:hover,
.blocklyZoom > svg > image:hover {
  opacity: .5 !important;
}

.blocklyZoom > image:active,
.blocklyZoom > svg > image:active {
  opacity: .75 !important;
}

/* Same reasoning/values as .blocklyZoom above, now for the multiselect
   plugin's toggle icon (BlocklyComponent.vue's mounted()) sitting right
   next to the grid-snap icon (ActionEditor.vue's setupGridSnapZoomButton) -
   overrides the plugin's injected .blocklyMultiselect rule (multiselect
   _controls.js's Blockly.Css.register call, .2/.4/.6) so the two icons read
   as one consistent set instead of two different opacity curves sitting
   side by side - confirmed as a real reported mismatch. The icon's color
   match (black at rest, the app's primary blue once active) comes from
   BlocklyComponent.vue's MULTISELECT_ICON_INACTIVE/_ACTIVE data URIs
   instead of a CSS filter here - <image> elements have no fill to override
   directly, so recoloring the source SVGs themselves was the only way to
   match grid-snap's hand-drawn glyph exactly. */
.blocklyMultiselect > image,
.blocklyMultiselect > svg > image {
  opacity: .25 !important;
}

.blocklyMultiselect > image:hover,
.blocklyMultiselect > svg > image:hover {
  opacity: .5 !important;
}

.blocklyMultiselect > image:active,
.blocklyMultiselect > svg > image:active {
  opacity: .75 !important;
}

/* Matches grid-snap's "active (toggled on) is always full opacity,
   regardless of hover" rule exactly (see ActionEditor.vue's
   setupGridSnapZoomButton's render()) - blockly-multiselect-active is
   toggled by BlocklyComponent.vue's wrapped updateMultiselectIcon, the
   only hook this plugin exposes for "the mode just changed." Higher
   specificity (two classes) than the plain rest/hover/press rules above
   would already win without !important, but every other rule here uses it
   for the same guaranteed-precedence reason (see .blocklyZoom's comment
   above on Blockly injecting its CSS at runtime), so this stays
   consistent with them. */
.blocklyMultiselect.blockly-multiselect-active > image,
.blocklyMultiselect.blockly-multiselect-active > svg > image {
  opacity: 1 !important;
}

/* The handle's exact 12px width/inset (matching the app's global scrollbar
   thumb) is set directly on the SVG attributes in BlocklyComponent.vue's
   createDom_ patch, not here - CSS geometry-property support for SVG
   width/x/rx isn't reliable enough across browsers for something this
   visible. */

/* Overrides Vuetify's  bundled reset (ress.css), which sets
   "html { overflow-y: scroll }" deliberately (its comment: "All
   browsers without overlaying scrollbars") to reserve scrollbar space
   up front and avoid a width shift on pages that sometimes need to
   scroll and sometimes don't. Confirmed directly (via computed style
   and a search of every loaded stylesheet's rules) as the actual
   source of an always-present, non-functional scrollbar flush against
   the browser's right edge - not a bug in this app's layout,
   and not something overflowing. This app's design already has
   every panel (nav drawer, emulator sidebar, each editor tab, the
   error console) scroll internally by itself, so the document itself
   is never actually meant to scroll at all - Vuetify's "always
   reserve the gutter" tradeoff has nothing real to protect against
   here, just an inert scrollbar with no content to scroll to. */
html {
  overflow-y: auto !important;
}

/* Vuetify's .v-application--wrap (the flex column that lays out the
   app-bar/v-main/footer) only sets "min-height: 100vh" - a FLOOR, not a
   fixed size. flex-shrink only ever kicks in when a flex CONTAINER's
   main-size is definite/fixed and smaller than its children's combined
   hypothetical sizes; with only a min-height, the browser instead just
   grows this container to fit whatever its children want, so .app-main's
   "flex: 1 1 auto; min-height: 0" override (see that rule's
   comment) never actually had a reason to shrink anything - there was
   never a real space shortage for it to respond to, just an ever-growing
   container. height: 100vh makes this a genuinely fixed-size flex
   container, which is what actually makes .app-main shrink to fit instead
   of dictating the page's height - confirmed as the real remaining
   piece after the flex-shrink change alone turned out not to be enough on
   its. v-app's auto-generated v-application--wrap div is rendered
   by the v-app COMPONENT itself, not written in App.vue's template, so
   (like .v-main__wrap elsewhere in this file) this has to live in this
   UNSCOPED block rather than the scoped one below - a scoped version
   matches nothing here, the same reason the fab z-index rule above had to
   move. */
.v-application--wrap {
  height: 100vh;
}

/* Keeps every tab's floating "+" fab (Background, Player0/1, Sound, Music,
   Data) above .error-message's fixed, viewport-pinned footer (see that
   rule, in this file's scoped style block below - .error-message is in
   App.vue's template, so scoped CSS reaches it fine). This rule has to
   live in this UNSCOPED block instead, even though it's right next to
   .error-message conceptually: every one of those fab buttons is rendered
   by a CHILD component's template (PlayerEditor.vue, BackgroundEditor.vue,
   etc.), and Vue's scoped CSS only ever auto-attaches its scope attribute to
   elements written directly in THIS component's template - a scoped
   version of this exact rule silently matched nothing at all in any other
   component, confirmed directly as why the fabs went missing again even
   after this same fix was already applied once (it just never actually
   ran). z-index: 20 matches the same value already used for
   .emulator-hide-button/.emulator-show-button, the other controls in this
   app that already needed to sit above ordinary app chrome. */
.v-btn--absolute.v-btn--fab {
  z-index: 20;
}

.v-application {
  font-family: var(--app-font-family) !important;
}

/* Blockly ships its  bundled CSS (font: 11pt sans-serif on these exact
   selectors) rather than inheriting the page's font-family, so the
   block canvas/flyout text stayed in the browser's generic sans-serif even
   after .v-application above switched everywhere else - confirmed directly
   by inspecting Blockly's injected stylesheet. font-family only (not
   the shorthand font: ... property) so this doesn't also touch the 11pt
   size Blockly itself sets. Deliberately its --blockly-font-family (see
   that variable's comment above), not --app-font-family - only the
   block/flyout text itself uses this font, everything else in the app
   stays on Inter. [class*="-theme"] (not a fixed ".app-theme") because
   Blockly's injected theme class is literally that theme's NAME +
   "-theme" (see Theme.prototype.getClassName) - confirmed as the reason an
   earlier version of this rule (".classic-theme", copied from Blockly's
   default theme name rather than the actual "app-theme" class this
   project's custom theme produces) never matched anything at all.
   [class*="-renderer"] the same way, for the exact same reason - Blockly's
   injected renderer class is that renderer's name + "-renderer" (see
   renderers/common/renderer.js), and this app has already switched which
   renderer it uses more than once (geras -> zelos -> thrasos), so a fixed
   class here would go stale again the next time it does. */
/* The editing box that opens over a block's text field (comment blocks, number
   fields...) has no background of its own here, so the field's text stayed
   visible underneath and the two overlapped while typing. Give it a solid
   one so it covers that text. */
.blocklyWidgetDiv .blocklyHtmlInput {
  background-color: #fff;
}

/* The multiline (comment block) editing box is sized to the block's text,
   which is drawn in the block font, but Blockly's textarea defaults to
   monospace - wider characters - so what was being typed got cropped. Use
   the block font so the box and the text agree. */
.blocklyWidgetDiv .blocklyHtmlTextAreaInput {
  font-family: var(--blockly-font-family) !important;
  /* The box is sized to the longest line as it is typed, so a line must never wrap
     inside it (a wrap shows the words jumping to the next line mid-typing). */
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: hidden;
}

[class*="-renderer"][class*="-theme"] .blocklyText,
[class*="-renderer"][class*="-theme"] .blocklyFlyoutLabelText {
  font-family: var(--blockly-font-family) !important;
}

/* The color picker (field_grid_dropdown, see blocks/color.js's
   color_get) - white background + rounded corners instead of Blockly's
   default (the block's colour, purple here, tinting the whole flyout -
   set directly as an inline style by DropDownDiv.setColour(), hence
   !important to win over it). :has(.fieldGridDropDownContainer) scopes this
   to only the grid-dropdown color picker specifically - .blocklyDropDownDiv
   is a single shared singleton every ordinary (non-grid) dropdown field
   also reuses, so a blanket override here would have re-colored every
   plain dropdown's flyout too. */
.blocklyDropDownDiv:has(.fieldGridDropDownContainer) {
  background-color: #fff !important;
  border-radius: 8px !important;
}

/* The dropdown is attached to the page body, outside the app root that carries the theme classes, so the
   themes are found from the body: the color picker takes the same colors as the popup cards (Subdued
   Palette, Dark Mode, and both together). */
body:has(#inspire.desaturate-app-colors) .blocklyDropDownDiv:has(.fieldGridDropDownContainer) {
  background-color: #e9e9e9 !important;
}

body:has(#inspire.dark-mode) .blocklyDropDownDiv:has(.fieldGridDropDownContainer) {
  background-color: #000 !important;
  border: 1px solid rgba(255, 255, 255, 0.24) !important;
}

body:has(#inspire.dark-mode.desaturate-app-colors) .blocklyDropDownDiv:has(.fieldGridDropDownContainer) {
  background-color: #2a2a2a !important;
}

/* @blockly/field-grid-dropdown's  default 7px grid-gap between cells -
   with the border/padding shrink below already making each cell mostly
   just its swatch, that gap read as a wide, oddly deliberate-looking
   gutter between adjacent colors rather than the label-affording spacing
   it was originally sized for. */
.fieldGridDropDownContainer.blocklyMenu {
  grid-gap: 0 !important;
}

/* Each swatch cell's  bordered frame, shrunk to match blocks/color.js's
   28x28 swatch images (up from an original 16x16) - @blockly/field-
   grid-dropdown's default padding-left:15px is leftover checkmark
   space (this app already hides the checkmark itself, see that package's
   CSS), which otherwise left every swatch floating off-center in a
   much bigger, mostly-empty cell instead of filling it. That same package's
   default 1px dark border around every cell is dropped too (border:
   none) - once the swatch itself fills the whole cell (padding above), that
   border just drew a visible dark line on top of/around the color square
   rather than framing empty space the way it did before. */
.fieldGridDropDownContainer.blocklyMenu .blocklyMenuItem {
  padding: 4px !important;
  border: none !important;
}

/* The swatch <img> itself is a default INLINE element, which (like any
   inline element) reserves descender space below its baseline within
   its containing block - confirmed directly by measuring the two rects:
   the image sat flush against its cell's top with the entire gap
   sitting underneath it, exactly the classic "inline image leaves a sliver
   of empty space below it" quirk, not a padding/centering issue. display:
   block removes it from the inline flow entirely, closing that gap. */
.fieldGridDropDownContainer.blocklyMenu .blocklyMenuItem img {
  display: block !important;
}

/* The currently-selected swatch (whichever color this field is already set
   to) - @blockly/field-grid-dropdown's default is a translucent dark
   overlay wash across the whole cell (background-color: rgba(1,1,1,.25)),
   muddying the actual color underneath rather than clearly marking it as
   selected. A 2px solid black INSET box-shadow instead - inset (not a
   plain border) so it draws inside the cell's existing bounds rather than
   adding to them, which would otherwise shift/shrink the swatch image
   relative to every other (unselected) cell's size. */
.fieldGridDropDownContainer.blocklyMenu .blocklyMenuItemSelected {
  background-color: transparent !important;
  box-shadow: inset 0 0 0 2px #000 !important;
}

/* A white frame instead in Dark Mode, where the popup is dark (the dropdown sits outside the app root, so the
   theme is found from the body). */
body:has(#inspire.dark-mode) .fieldGridDropDownContainer.blocklyMenu .blocklyMenuItemSelected {
  box-shadow: inset 0 0 0 2px #fff !important;
}

/* Vuetify's  hint/error text under a field (e.g. the description under
   the "Enable Superchip RAM..." switch on the Options tab) - default
   line-height (12px, exactly matching its 12px font-size, i.e. no
   leading at all) reads as cramped once a hint runs to more than one line.
   Global (not scoped to one field) since every hint/detail message in the
   app uses this same class. */
.v-messages__message {
  line-height: 1.4 !important;
}

/* See Configuration.vue's "Hide small description text" switch (VCSGM
   Options) and this file's hideDescriptionText computed, bound as a
   class on the root v-app above - hides every hint/description paragraph
   app-wide from one place, now that they all consistently share this same
   Vuetify class (see TextEditor.vue's hint paragraph for the pattern).
   Left targeting the plain class (not "v-messages" too) since a field's
   validation/error messages also render through the same DOM structure
   and use ".v-messages__message" too - scoping any tighter would need
   distinguishing "hint" text from "error" text, which Vuetify itself
   doesn't expose a separate class for. */
.hide-description-text .v-messages__message {
  display: none;
}

/* Vuetify gives every ".v-messages" wrapper its  14px min-height
   regardless of whether a message is actually rendered inside it (reserved
   so a validation error popping in/out doesn't shift surrounding layout) -
   hiding just the text above still left that empty 14px box behind, so
   fields/switches whose spacing (e.g. Configuration.vue's
   ".option-switch + .option-switch"/".pfres-field" rules) assumes the hint
   text is fully gone still sat farther apart than intended. */
.hide-description-text .v-messages {
  min-height: 0;
}

#gopher2600-target-container {
  position: relative;
  overflow: hidden;
  /* This sits inside .emulator-drawer-inner's flex column, at a fixed
     JS-computed height (see App.vue's updateEmulatorScale) - without
     this, once the ROM capacity bank-contents text below it (see
     .rom-capacity-detail) grew long enough after a build that everything in
     the column no longer fit, the flex column's default flex-shrink: 1
     would silently compress this container below its real height instead
     of leaving it alone, clipping the bottom of the emulator canvas behind
     whatever sits right after it - the panel switches/Update ROM/Get
     generated ROM buttons - instead of showing it. That text block already
     has overflow-y: auto (see its flex: 1 1 auto) specifically
     to absorb space shortages like this by itself, so nothing above it -
     this container, the buttons, the summary text - should ever need to
     shrink at all.
  */
  flex-shrink: 0;
}

/* The debug info sits over the top left of the picture. */
.emulator-debug-overlay {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
  margin: 0;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font: 11px/1.3 monospace;
  pointer-events: none;
  white-space: pre;
}

.emulator-debug-overlay pre {
  margin: 0;
  font: inherit;
}

.emulator-debug-table {
  margin-top: 4px;
  border-collapse: collapse;
}

.emulator-debug-table td {
  padding: 0 6px 0 0;
  white-space: pre;
}

.emulator-debug-table .emulator-debug-name {
  opacity: 0.75;
}

.emulator-debug-table .emulator-debug-value {
  padding-right: 14px;
  text-align: right;
}

.emulator-debug-table tr td:last-child {
  padding-right: 0;
}

/* Switched on: the blue the graphic editor toolbar's active tool has, at rest and on hover. The
   extra class beats the dim-at-rest and hover rules above and the dark-mode ones. */
.v-application .emulator-toolbar-row .emulator-flat-icon-btn.emulator-debug-btn-on.v-btn .v-icon,
.v-application .emulator-toolbar-row .emulator-flat-icon-btn.emulator-debug-btn-on.v-btn:hover .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

.dark-mode.v-application .emulator-toolbar-row .emulator-flat-icon-btn.emulator-debug-btn-on.v-btn .v-icon,
.dark-mode.v-application .emulator-toolbar-row .emulator-flat-icon-btn.emulator-debug-btn-on.v-btn:hover .v-icon {
  color: var(--v-primary-lighten1, #2196f3) !important;
}

/* Full screen: the container fills the display (the browser sets that) and the canvas, which
   keeps the picture's aspect ratio, is the largest size that fits, centered. */
#gopher2600-target-container:fullscreen {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

#gopher2600-target-container:fullscreen > #gopher2600-screen {
  transform: none;
  margin: 0;
  width: min(100vw, calc(100vh * var(--fullscreen-aspect, 1.333))) !important;
  height: min(100vh, calc(100vw / var(--fullscreen-aspect, 1.333))) !important;
}

#gopher2600-target-container > #gopher2600-screen {
  transform: scale(var(--emulator-scale, 1));
  transform-origin: top left;
  image-rendering: pixelated;
}


/* App-wide: no drop shadow on any button or switch toggle - flat, matching
   the outlined-card style used elsewhere, instead of Vuetify's default
   elevated look. Global (not scoped) so it reaches every view/component's
   buttons and switches without editing each one individually. */
.v-btn {
  box-shadow: none !important;
}

.v-input--switch__thumb {
  box-shadow: none !important;
}

/* Shrinks the handle to the same diameter as the track's  height (14px,
   giving it the same 7px radius as the track/channel), instead of
   Vuetify's default handle (20px) sticking out past both edges of the
   track. top is re-centered to match (Vuetify's rule computes it as
   half the DEFAULT 20px handle - "calc(50% - 10px)" - which no longer
   centers a 14px one). */
.v-input--switch__thumb {
  width: 18px !important;
  height: 18px !important;
  top: calc(50% - 9px) !important;
  margin-left: 1px;
}

/* App-wide, every tab: Vuetify's default track width (36px, see
   .v-input--switch__track in node_modules/vuetify/dist/vuetify.css) shrunk
   to 32px - this used to be scoped to just the Options tab's
   .option-switch class, so every OTHER tab's switches (Sound's DIM/
   Columns, Text/Data's Columns, etc.) stayed at the wider default
   instead of matching it (a real reported inconsistency). Made global,
   here, instead of copy-pasting the same rule's scoped class onto every
   other view. */
.v-input--switch__track {
  width: 32px !important;
}

/* Vuetify's "on" position (translate(20px, 0), see its
   .v-input--switch.v-input--is-dirty rule) was tuned for the DEFAULT 20px
   handle - shrinking the handle to 14px above (a 6px smaller diameter,
   3px off each edge) left it 3px short of the track's right edge once
   turned on, reported as looking not far enough right. +3px restores the
   same reach the original, larger handle had. Then shortened another 4px
   (22px -> 18px), same reasoning as the track-width rule just above: this
   value has to stay in sync with the 36px -> 32px track shrink (both now
   app-wide, not just Options-tab-scoped), so the thumb still lands flush
   against the track's right edge instead of overshooting it once
   checked. */
.v-application--is-ltr .v-input--switch.v-input--is-dirty .v-input--switch__thumb {
  transform: translate(18px, 0) !important;
}

/* App-wide: lighter underline for a text field (or a v-select/v-combobox,
   which are both built on top of v-text-field in this Vuetify version - the
   same class carries their underline too) while it's NOT focused -
   Vuetify's default resting-state color (rgba(0,0,0,.42), see
   node_modules/vuetify/dist/vuetify.css's ".theme--light.v-text-field >
   .v-input__control > .v-input__slot:before" rule) reads as fairly dark/
   prominent even on a field nobody's currently using. Only the plain
   ":before" (resting) rule below is touched - the focused state (its
   ":after" rule, which Vuetify animates in via a separate scaleX
   transform - untouched here) still gets the normal, full-strength primary-
   color underline, so a focused field still reads clearly as active. Every
   field in this app already uses the default (non-outlined/filled/solo)
   style that actually shows this underline at all - confirmed via a
   project-wide grep - so no variant exclusion is needed here.

   :not(:hover) keeps this from also flattening Vuetify's hover-darken
   rule (its ".theme--light.v-text-field:not(.v-input--has-state):hover
   > ... :before", rgba(0,0,0,.87)) - that rule and this one both target the
   same ::before, so without this exclusion the !important below (needed to
   beat Vuetify's un-!important resting rule) was winning on hover too,
   silently killing the hover feedback instead of just lightening the
   resting state. Letting Vuetify's already-tuned hover rule apply
   unopposed here is simpler than duplicating/guessing a new hover value. */
.theme--light.v-text-field:not(:hover) > .v-input__control > .v-input__slot:before {
  border-color: rgba(0, 0, 0, 0.15) !important;
}

/* A switch that's off gets a grey outline on its thumb, the same grey as an
   outlined card's border, so it doesn't read as a flat white blob against
   the page background. */
input[type='checkbox']:not(:checked) ~ .v-input--switch__thumb {
  border: thin solid rgba(0, 0, 0, 0.12);
}

/* Shared with the pixel editor toolbar's icons (see PixelEditor.vue) so a
   delete button's rest state matches them, instead of standing out as an
   always-red trash can.

   --v-primary-base backs every "active/selected" blue accent across the
   app (active toolbar icons, drag-reorder highlights, focused pixel
   editor borders, etc.) that already referenced
   var(--v-primary-base, #1976d2) defensively, as if it were a real
   Vuetify theme variable - Vuetify itself never actually defines that
   variable (confirmed directly - absent from its compiled CSS), so
   every one of those rules was silently just using the literal #1976d2
   fallback, un-themeable. Defining it for real here activates all of them
   at once, and lets Subdued Palette override just this one variable
   below instead of every individual rule that references it - the
   plain-hardcoded "#1976d2 !important" rules elsewhere in the app were
   switched to reference this same variable+fallback for the same reason,
   see e.g. GraphicEditorToolbar.vue's .v-btn--active rule.

   --destructive-color is the same idea for red "this deletes something"
   accents (the delete button's hover color below, the Quick Colors
   palette's delete-armed swatch outline/X icon in QuickColorPalette.vue) -
   confirmed directly as a real reported gap ("red delete hover color
   should also update"). */
:root {
  --editor-icon-rest-color: rgba(0, 0, 0, 0.38);
  --v-primary-base: #1976d2;
  --destructive-color: red;
}

/* Desaturated/darkened equivalents of the two variables above
   (saturate(50%) brightness(85%), the same transform every other colored
   control under Subdued Palette uses via filter - precomputed here
   instead, since CSS filters can't be applied to a custom property's
   color value directly). Retroactively darkens every rule that references
   either variable with zero changes needed at each individual call site. */
.desaturate-app-colors {
  --v-primary-base: #3e668d;
  --destructive-color: #c62828;
}

/* Delete buttons (trash icon, top-right of a graphics/data/sound card): the
   same muted grey as the pixel editor toolbar icons at rest, turning red
   only on hover - and never a filled circle behind it, at rest or on
   hover (Vuetify's default hover/focus overlay is suppressed here). */
.delete-icon-btn {
  color: var(--editor-icon-rest-color) !important;
}

.delete-icon-btn:hover {
  color: var(--destructive-color, red) !important;
}

.delete-icon-btn::before {
  background-color: transparent !important;
}

/* Import buttons (e.g. PlayerEditor.vue's "Import animation frames",
   TitleScreenEditor.vue's "Import card frames"): same muted-grey-at-rest/
   no-filled-circle treatment as .delete-icon-btn above, just not red - these
   aren't destructive, so they darken to near-black on hover instead, the
   same neutral hover convention MusicEditor.vue's .music-flat-icon-btn
   uses for its non-destructive icon buttons. */
.import-icon-btn {
  color: var(--editor-icon-rest-color) !important;
}

.import-icon-btn:hover {
  color: rgba(0, 0, 0, 0.87) !important;
}

.import-icon-btn::before {
  background-color: transparent !important;
}

/* Shared 26x26 flat icon-button sizing, moved here once it turned up
   byte-identical under 6 different per-tab class names (PlayerEditor.vue's
   .player-icon-btn-size, reused verbatim as-is by BackgroundEditor.vue;
   TitleScreenEditor.vue's .titlescreen-icon-btn-size; DataEditor.vue's
   .data-icon-btn-size; SoundFXEditor.vue's .soundfx-icon-btn-size;
   MusicEditor.vue's .music-icon-btn-size) - scoped CSS can't share a rule
   across components even under the exact same class name (each component's
   <style scoped> only ever matches elements IT rendered), so every one of
   those tabs had independently copy-pasted this same recipe into its
   local stylesheet. Kept as two groups (not one) since the two real
   differences that exist are margin (Player/Background/Title use a plain
   0; Data/Sound/Music use 0 1px, each tuned for how tightly packed that
   tab's toolbar row is) and whether a disabled button dims via opacity
   (only Player/Background/Title ever needed that fix - see the next rule
   below). Every tab keeps its original class name in its template;
   only the duplicated DECLARATIONS moved here. */
.player-icon-btn-size,
.titlescreen-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0;
}

.data-icon-btn-size,
.soundfx-icon-btn-size,
.music-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

/* No ">>>" here (unlike every per-tab scoped copy this replaced) -
   deep-combinator syntax only means anything inside a component's
   <style scoped> block (where it pierces that component's scoping
   attribute boundary); this is a plain unscoped block with no such
   boundary to pierce in the first place. ">>>" was mistakenly kept when
   these rules were first moved here - a bare ">>>" is not valid CSS syntax
   outside Vue's scoped-style preprocessing, so every selector using it
   failed to parse and the browser silently dropped the whole rule,
   confirmed directly against the compiled output - a real reported bug
   ("the import/export buttons on the music tab look larger than they do
   on the graphic editor toolbar" - actually every tab's icons silently
   losing this sizing, not just Music's). */
.player-icon-btn-size .v-icon,
.titlescreen-icon-btn-size .v-icon,
.data-icon-btn-size .v-icon,
.soundfx-icon-btn-size .v-icon,
.music-icon-btn-size .v-icon {
  font-size: 19px !important;
}

/* Vuetify's disabled styling normally dims a button's icon color, but the
   icon's rest-state color elsewhere is forced with !important (matching
   PixelEditor.vue's toolbar icons), which also blocks Vuetify's disabled
   color from ever showing through - confirmed as a real reported bug (a
   disabled Paste button read as clickable, no different from the enabled
   Copy button next to it). Opacity reaches it without needing to fight
   that !important. Only Player/Background/Title ever hit this specific bug
   (Data/Sound/Music's disabled buttons weren't reported this way) -
   left scoped to just those two class names rather than widening it to
   every icon-btn-size tab speculatively. */
.player-icon-btn-size.v-btn--disabled,
.titlescreen-icon-btn-size.v-btn--disabled {
  opacity: 0.35;
}

/* mdi-delete's glyph sits smaller within its icon box than this
   app's other toolbar icons at the same font-size (more built-in padding
   around the trash-can shape), reading noticeably smaller alongside them -
   bumped a couple pixels past the shared 19px above so a delete button
   reads as the same visual size as its neighbors at a glance. Same
   Player/Background/Title-only scope as the disabled-opacity rule above. */
.delete-icon-btn.player-icon-btn-size .v-icon,
.delete-icon-btn.titlescreen-icon-btn-size .v-icon {
  font-size: 21px !important;
}

/* Flat, fade-in-on-hover icon-button treatment (no grey box/elevation, dim
   at rest, darker on hover) instead of Vuetify's default hover circle -
   moved here once MusicEditor.vue's .music-flat-icon-btn and
   TitleScreenEditor.vue's .titlescreen-play-btn turned up byte-identical
   for these 4 rules (confirmed directly against compiled CSS - see
   TitleScreenEditor.vue's comment). Each file's "currently active/
   playing" persistent tint (:active, loading, or an explicit active class)
   stays local to that file - those trigger conditions genuinely differ per
   tab, even though they land on the same blue. */
.music-flat-icon-btn,
.titlescreen-play-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.music-flat-icon-btn::before,
.titlescreen-play-btn::before {
  display: none;
}

/* transition includes "transform 0.08s ease" (not just "color") to exactly
   match GraphicEditorToolbar.vue's .get-tools >>> .v-btn .v-icon rule -
   MusicEditor.vue's :active rule (its <style scoped> block) applies
   a transform: scale() press effect that needs this same transition to
   animate smoothly, the same way Graphic's buttons do. Harmless on
   titlescreen-play-btn, which never sets a transform. */
.music-flat-icon-btn .v-icon,
.titlescreen-play-btn .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.music-flat-icon-btn:hover .v-icon,
.titlescreen-play-btn:hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}
/* Dark Mode overrides for this app's hardcoded light-theme colors (every
   rule is prefixed with .dark-mode.v-application and uses !important so it
   outranks the component's scoped rule it replaces). Grouped by what they
   are: icon button colors, dividers/borders, and the light surfaces
   (toolbars, cards inside editors, rows). */
.dark-mode {
  --editor-icon-rest-color: rgba(255, 255, 255, 0.5);
}

/* The colors-only copy/paste buttons in a frame's corner (Sprites and Title Screen tabs) look
   and react like the copy/paste buttons in the frame's toolbar: no box, a muted icon that
   darkens on hover and shrinks a little while pressed, and dimmed when disabled. */
.copy-paste-color-btn.v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.copy-paste-color-btn.v-btn::before {
  display: none;
}

.copy-paste-color-btn.v-btn .v-icon {
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.copy-paste-color-btn.v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.copy-paste-color-btn.v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

.dark-mode.v-application .copy-paste-color-btn.v-btn:not(.v-btn--disabled):hover .v-icon {
  color: #fff !important;
}

/* Icon buttons: dim at rest, bright on hover, dimmer still when disabled. */
.dark-mode.v-application .emulator-toolbar-row .emulator-flat-icon-btn.v-btn .v-icon,
.dark-mode.v-application .get-tools .v-btn .v-icon,
.dark-mode.v-application .pixel-editor-tools .v-btn .v-icon,
.dark-mode.v-application .pixel-grid-toggle-btn .v-icon,
.dark-mode.v-application .pixel-grid-toggle-label,
.dark-mode.v-application .unified-toolbar-height-btn,
.dark-mode.v-application .reset-to-defaults-btn.v-btn,
.dark-mode.v-application .data-toolbar-row .v-btn .v-icon,
.dark-mode.v-application .data-flat-icon-btn .v-icon,
.dark-mode.v-application .generated-code-toolbar-row .v-btn .v-icon,
.dark-mode.v-application .generated-code-flat-icon-btn .v-icon,
.dark-mode.v-application .project-toolbar-row .v-btn .v-icon,
.dark-mode.v-application .soundfx-bank-btn .v-icon,
.dark-mode.v-application .soundfx-instrument-btn .v-icon,
.dark-mode.v-application .soundfx-stop-btn .v-icon,
.dark-mode.v-application .soundfx-play-btn .v-icon,
.dark-mode.v-application .music-flat-icon-btn .v-icon,
.dark-mode.v-application .titlescreen-play-btn .v-icon {
  color: rgba(255, 255, 255, 0.5) !important;
}

.dark-mode.v-application .emulator-toolbar-row .emulator-flat-icon-btn.v-btn:hover .v-icon,
.dark-mode.v-application .get-tools .v-btn:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .pixel-editor-tools .v-btn:hover .v-icon,
.dark-mode.v-application .pixel-grid-toggle-btn:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .pixel-grid-toggle-btn:not(.v-btn--disabled):hover .pixel-grid-toggle-label,
.dark-mode.v-application .unified-toolbar-height-btn:not(.v-btn--disabled):hover,
.dark-mode.v-application .reset-to-defaults-btn.v-btn:hover,
.dark-mode.v-application .data-toolbar-row .v-btn:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .data-flat-icon-btn:hover .v-icon,
.dark-mode.v-application .generated-code-toolbar-row .v-btn:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .generated-code-flat-icon-btn:hover .v-icon,
.dark-mode.v-application .project-toolbar-row .v-btn:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .soundfx-bank-btn:hover .v-icon,
.dark-mode.v-application .soundfx-instrument-btn:hover .v-icon,
.dark-mode.v-application .soundfx-stop-btn:hover .v-icon,
.dark-mode.v-application .soundfx-play-btn:hover .v-icon,
.dark-mode.v-application .music-flat-icon-btn:hover .v-icon,
.dark-mode.v-application .titlescreen-play-btn:hover .v-icon,
.dark-mode.v-application .import-icon-btn:hover {
  color: #fff !important;
}

.dark-mode.v-application .get-tools .v-btn--disabled .v-icon,
.dark-mode.v-application .data-toolbar-row .v-btn--disabled .v-icon,
.dark-mode.v-application .project-toolbar-row .v-btn--disabled .v-icon,
.dark-mode.v-application .music-flat-icon-btn.v-btn--disabled .v-icon {
  color: rgba(255, 255, 255, 0.2) !important;
}

.dark-mode.v-application .emulator-toolbar-row .emulator-flat-icon-btn.v-btn:active .v-icon,
.dark-mode.v-application .titlescreen-play-btn:active .v-icon,
.dark-mode.v-application .titlescreen-play-btn.v-btn--loading .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

.dark-mode.v-application .pixel-grid-toggle-btn-active .pixel-grid-toggle-label {
  color: #fff !important;
}

/* Active (selected or switched-on) icon buttons keep the blue the light theme gives them. The
   dim-at-rest rules above are as specific and !important, so without these every active
   icon went back to the dim grey and nothing showed which button was selected. The extra
   class in each selector makes them win. */
.dark-mode.v-application .project-toolbar-row .v-btn.project-flat-icon-btn-active .v-icon,
.dark-mode.v-application .get-tools .v-btn.v-btn--active .v-icon,
.dark-mode.v-application .pixel-grid-toggle-btn.pixel-grid-toggle-btn-active .v-icon,
.dark-mode.v-application .music-flat-icon-btn.v-btn.music-icon-btn-active .v-icon,
.dark-mode.v-application .soundfx-arpeggio-btn.v-btn.soundfx-arpeggio-btn-active .v-icon {
  color: var(--v-primary-lighten1, #2196f3) !important;
}

/* The text buttons at the bottom of a popup (Cancel, Close, Clear...) and the emulator pane's Refresh,
   Select and Reset buttons share one look: small, the theme's plain button background and text color,
   no primary-blue text (hard to see in dark mode and with Subdued Colors). */
.v-card__actions .v-btn.v-btn--text:not(.v-btn--icon),
.emulator-select-button.v-btn,
.emulator-reset-button.v-btn,
.emulator-refresh-button.v-btn {
  height: 28px;
  min-width: 50px;
  padding: 0 12.4px !important;
  font-size: 0.75rem;
  box-shadow: none !important;
  background-color: #f5f5f5 !important;
  color: rgba(0, 0, 0, 0.87) !important;
  caret-color: rgba(0, 0, 0, 0.87) !important;
}

.v-card__actions .v-btn.v-btn--text.v-btn--disabled:not(.v-btn--icon),
.emulator-select-button.v-btn.v-btn--disabled,
.emulator-reset-button.v-btn.v-btn--disabled,
.emulator-refresh-button.v-btn.v-btn--disabled {
  background-color: rgba(0, 0, 0, 0.12) !important;
  color: rgba(0, 0, 0, 0.26) !important;
}

.dark-mode .v-card__actions .v-btn.v-btn--text:not(.v-btn--icon),
.dark-mode .emulator-select-button.v-btn,
.dark-mode .emulator-reset-button.v-btn,
.dark-mode .emulator-refresh-button.v-btn {
  background-color: #272727 !important;
  color: #fff !important;
  caret-color: #fff !important;
}

.dark-mode .v-card__actions .v-btn.v-btn--text.v-btn--disabled:not(.v-btn--icon),
.dark-mode .emulator-select-button.v-btn.v-btn--disabled,
.dark-mode .emulator-reset-button.v-btn.v-btn--disabled,
.dark-mode .emulator-refresh-button.v-btn.v-btn--disabled {
  background-color: rgba(255, 255, 255, 0.12) !important;
  color: rgba(255, 255, 255, 0.3) !important;
}

/* Subdued Colors mutes every filled button the same way (see the rules for .v-btn--has-bg above). */
.desaturate-app-colors .v-card__actions .v-btn.v-btn--text:not(.v-btn--icon),
.desaturate-app-colors .emulator-select-button.v-btn,
.desaturate-app-colors .emulator-reset-button.v-btn,
.desaturate-app-colors .emulator-refresh-button.v-btn {
  filter: saturate(50%) brightness(0.85);
}

/* Active icons keep the blue on hover too. */
.dark-mode.v-application .project-toolbar-row .v-btn.project-flat-icon-btn-active:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .get-tools .v-btn.v-btn--active:not(.v-btn--disabled):hover .v-icon,
.dark-mode.v-application .pixel-grid-toggle-btn.pixel-grid-toggle-btn-active:not(.v-btn--disabled):hover .v-icon {
  color: var(--v-primary-lighten1, #2196f3) !important;
}

/* The tab area and the sticky toolbars above each editor: black like the
   sidebar (cards inside the tab stay #1e1e1e so they stand out). */
.dark-mode.v-application .graphic-editor-toolbar,
.dark-mode.v-application .data-toolbar,
.dark-mode.v-application .generated-code-toolbar,
.dark-mode.v-application .generated-code-search-dock,
.dark-mode.v-application .music-toolbar,
.dark-mode.v-application .piano-roll-zoom-row,
.dark-mode.v-application .piano-roll-step-header,
.dark-mode.v-application .piano-roll-label-spacer,
.dark-mode.v-application .project-toolbar,
.dark-mode.v-application .soundfx-toolbar,
.dark-mode.v-application .editor-container.theme--dark.v-card {
  background-color: #000 !important;
}

.dark-mode.v-application .data-value-row {
  background-color: #1e1e1e !important;
}

/* With Subdued Palette the tab area is the same softer #1e1e1e as the rest. */
.dark-mode.desaturate-app-colors.v-application .graphic-editor-toolbar,
.dark-mode.desaturate-app-colors.v-application .data-toolbar,
.dark-mode.desaturate-app-colors.v-application .generated-code-toolbar,
.dark-mode.desaturate-app-colors.v-application .generated-code-search-dock,
.dark-mode.desaturate-app-colors.v-application .music-toolbar,
.dark-mode.desaturate-app-colors.v-application .piano-roll-zoom-row,
.dark-mode.desaturate-app-colors.v-application .piano-roll-step-header,
.dark-mode.desaturate-app-colors.v-application .piano-roll-label-spacer,
.dark-mode.desaturate-app-colors.v-application .project-toolbar,
.dark-mode.desaturate-app-colors.v-application .soundfx-toolbar,
.dark-mode.desaturate-app-colors.v-application .editor-container.theme--dark.v-card {
  background-color: #1e1e1e !important;
}

/* Dividers and outlines that were a dark line on white. */
.dark-mode.v-application .graphic-editor-toolbar-scrolled,
.dark-mode.v-application .data-toolbar-scrolled,
.dark-mode.v-application .generated-code-toolbar-scrolled,
.dark-mode.v-application .music-toolbar-scrolled,
.dark-mode.v-application .project-toolbar-scrolled,
.dark-mode.v-application .soundfx-toolbar-scrolled {
  border-bottom-color: rgba(255, 255, 255, 0.24) !important;
}

.dark-mode.v-application .soundfx-envelope-graph-toolbar,
.dark-mode.v-application .generated-code-search-dock {
  border-top-color: rgba(255, 255, 255, 0.24) !important;
}

.dark-mode.v-application .animation-card,
.dark-mode.v-application .background-card,
.dark-mode.v-application .data-card,
.dark-mode.v-application .soundfx-card,
.dark-mode.v-application .text-card,
.dark-mode.v-application .song-card,
.dark-mode.v-application .titlescreen-card,
.dark-mode.v-application .titlescreen-screen-card,
.dark-mode.v-application .example-card,
.dark-mode.v-application .sound-bank-card,
.dark-mode.v-application .data-format-menu,
.dark-mode.v-application .v-menu__content:has(> .v-select-list),
.dark-mode.v-application .v-menu__content > .v-card,
.dark-mode.v-application .v-dialog > .v-card,
.dark-mode.v-application .error-message {
  border-color: rgba(255, 255, 255, 0.24) !important;
}

.dark-mode.v-application .data-values {
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.12);
}

/* Text that was dark grey. */
.dark-mode.v-application .about-version,
.dark-mode.v-application .app-logo-version,
.dark-mode.v-application .sidebar-logo-version,
.dark-mode.v-application .quick-color-section-label,
.dark-mode.v-application .music-section-label,
.dark-mode.v-application .generated-code-search-count,
.dark-mode.v-application .titlescreen-add-limit-note,
.dark-mode.v-application .compile-log-info {
  color: rgba(255, 255, 255, 0.7) !important;
}

.dark-mode.v-application .copy-paste-color-badge {
  background: #1e1e1e;
  color: rgba(255, 255, 255, 0.7);
}

/* The thin scrollbars and resize handles. */
.dark-mode * {
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.dark-mode ::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.3);
}

.dark-mode ::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.5);
}

/* Help text: several templates put .theme--light on a .v-messages paragraph. */
.dark-mode.v-application .v-messages.theme--light,
.dark-mode.v-application .theme--light.v-messages {
  color: rgba(255, 255, 255, 0.6) !important;
}

/* The expand/collapse arrow of the Examples category in the Blockly toolbox: a thin chevron (instead of Blockly's sprite
   arrow) in the color of the category's name, pointing right when closed and down when open. */
.blocklyToolboxDiv .blocklyTreeIcon {
  background-image: none !important;
  position: relative;
  filter: none !important;
}
.blocklyToolboxDiv .blocklyTreeIcon::before {
  content: '';
  position: absolute;
  /* 2px to the right of the icon's box, which the label's position depends on. */
  inset: 0 -2px 0 2px;
  background-color: currentColor;
  -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z'/></svg>") center / 18px 18px no-repeat;
  mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z'/></svg>") center / 18px 18px no-repeat;
}
.blocklyToolboxDiv .blocklyTreeIconOpen::before {
  transform: rotate(90deg);
}

/* A line down the right edge of the Blockly toolbox, in the color of the toolbars' borders (drawn inside the box, so the
   toolbox keeps its width and the flyout its position). */
.blocklyToolboxDiv {
  box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.24);
}
.dark-mode .blocklyToolboxDiv {
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.24);
}

/* Blockly's toolbox and its small control icons (which are dark images). */
.dark-mode .blocklyToolboxDiv {
  background-color: #1e1e1e !important;
}

/* The block search field in the toolbox: its typed text is the browser's black, which cannot be read on the dark
   toolbox, so it is a light grey (the same one the toolbox's category names have), with a lighter placeholder. */
.dark-mode .blocklyToolboxDiv input[type="search"] {
  color: #e0e0e0;
  caret-color: #e0e0e0;
}
.dark-mode .blocklyToolboxDiv input[type="search"]::placeholder {
  color: rgba(255, 255, 255, 0.6);
}


/* With Subdued Palette on as well, the toolbox's text is the same softer grey the About tab has there, not bright white. */
.dark-mode.desaturate-app-colors .blocklyToolboxDiv .blocklyTreeRow,
.dark-mode.desaturate-app-colors .blocklyToolboxDiv .blocklyTreeLabel,
.dark-mode.desaturate-app-colors .blocklyToolboxDiv input[type="search"] {
  color: #b0b0b0 !important;
}
.dark-mode.desaturate-app-colors .blocklyToolboxDiv input[type="search"] {
  caret-color: #b0b0b0;
}
.dark-mode.desaturate-app-colors .blocklyToolboxDiv input[type="search"]::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.dark-mode .blocklyTreeRow:hover,
.dark-mode .blocklyTreeSelected {
  background-color: rgba(255, 255, 255, 0.12) !important;
}

.dark-mode.v-application .blocklyZoom > image,
.dark-mode.v-application .blocklyZoom > svg > image {
  filter: brightness(0) invert(1) !important;
}

.dark-mode.v-application .blocklyMultiselect:not(.blockly-multiselect-active) > image,
.dark-mode.v-application .blocklyMultiselect:not(.blockly-multiselect-active) > svg > image {
  filter: invert(1);
}
/* The Music tab's piano roll and the sound envelope graph: faint dark lines
   and shading on white become faint light ones on dark. */
/* Step cells: a cell a note can go in is a lighter grey (alternate steps a
   touch lighter again), a cell it can't (a row the active track can't play, or
   a step another channel's note covers) is solid black. The
   cells holding a note keep the instrument color they are painted with. */
.dark-mode.v-application .piano-roll-cell:not(.piano-roll-cell-active),
.dark-mode.v-application .piano-roll-volume-cell {
  background-color: rgba(255, 255, 255, 0.16);
}

.dark-mode.v-application .piano-roll-cell:not(.piano-roll-cell-active):nth-child(even),
.dark-mode.v-application .piano-roll-volume-cell:nth-child(even) {
  background-color: rgba(255, 255, 255, 0.21);
}

.dark-mode.v-application .piano-roll-row:nth-child(odd) {
  background-color: rgba(255, 255, 255, 0.03) !important;
}

/* The note names down the left of the piano roll read like a keyboard: light
   keys with dark text for natural notes, darker keys with white text for sharps
   and flats, and the same two shades, dimmed, for a row the active track can't play. */
.dark-mode.v-application .piano-roll-label {
  background-color: #cfcfcf !important;
  color: #111 !important;
  opacity: 1;
}

.dark-mode.v-application .piano-roll-label.piano-roll-label-black-key {
  background-color: #5c5c5c !important;
  color: #fff !important;
}

.dark-mode.v-application .piano-roll-label.piano-roll-label-row-unavailable {
  background-color: #707070 !important;
  color: rgba(255, 255, 255, 0.85) !important;
}

.dark-mode.v-application .piano-roll-label.piano-roll-label-black-key.piano-roll-label-row-unavailable {
  background-color: #383838 !important;
  color: rgba(255, 255, 255, 0.7) !important;
}

.dark-mode.v-application .piano-roll-cell,
.dark-mode.v-application .piano-roll-volume-cell {
  border-left-color: rgba(255, 255, 255, 0.22) !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.dark-mode.v-application .piano-roll-volume-row {
  border-top-color: rgba(255, 255, 255, 0.22) !important;
}

.dark-mode.v-application .piano-roll-step-number {
  border-left-color: rgba(255, 255, 255, 0.12) !important;
}

.dark-mode.v-application .piano-roll-volume-resize-handle,
.dark-mode.v-application .piano-roll-height-resize-handle {
  background-color: rgba(255, 255, 255, 0.08) !important;
  border-top-color: rgba(255, 255, 255, 0.12) !important;
  border-bottom-color: rgba(255, 255, 255, 0.12) !important;
}

.dark-mode.v-application .piano-roll-volume-resize-handle:hover,
.dark-mode.v-application .piano-roll-height-resize-handle:hover {
  background-color: rgba(255, 255, 255, 0.16) !important;
}

.dark-mode.v-application .piano-roll-cell-row-unavailable,
.dark-mode.v-application .piano-roll-cell-disabled,
.dark-mode.v-application .piano-roll-cell-disabled:hover,
.dark-mode.v-application .piano-roll-cell-length-disabled,
.dark-mode.v-application .piano-roll-cell-length-disabled:hover {
  background-color: #000 !important;
}

.dark-mode.v-application .piano-roll-scroll,
.dark-mode.v-application .piano-roll-volume-scroll,
.dark-mode.v-application .instrument-color-dot,
.dark-mode.v-application .envelope-graph {
  border-color: rgba(255, 255, 255, 0.24) !important;
}

.dark-mode.v-application .envelope-graph-scale-tick,
.dark-mode.v-application .envelope-graph-stage-label,
.dark-mode.v-application .envelope-graph-frame-label {
  color: rgba(255, 255, 255, 0.6) !important;
  -webkit-text-stroke-color: #1e1e1e !important;
}

.dark-mode.v-application .envelope-graph-snap-line-vertical {
  background: rgba(255, 255, 255, 0.1) !important;
}

.dark-mode.v-application .instrument-summary-chip-active,
.dark-mode.v-application .sequence-chip-wrap-playing {
  box-shadow: 0 0 0 2px #1e1e1e, 0 0 0 4px var(--v-primary-base, #1976d2) !important;
}
/* Dark Mode keeps the tab colors of the top toolbar and sidebar as they are in light
   mode. With Subdued Palette they are muted (saturation halved) but not also
   darkened, which light mode does (brightness .7) and which read as too dull on the
   dark background. Top toolbar and sidebar get the same single filter. */
.dark-mode.desaturate-app-colors.v-application .top-toolbar .actions-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .titlescreen-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .player-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .background-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .sound-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .music-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .text-tab-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .data-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .scorefont-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .configuration-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .generated-item,
.dark-mode.desaturate-app-colors.v-application .top-toolbar .project-item {
  filter: saturate(50%);
}

.dark-mode.desaturate-app-colors.v-application .nav-drawer .v-list-item__content,
.dark-mode.desaturate-app-colors.v-application .nav-drawer .v-list-item__icon {
  filter: none;
}

/* The About tab has no color of its own, so Dark Mode shows it in plain white, which
   next to the muted tab colors of Subdued Palette is too bright: a softer grey
   for its label, icon and left edge, in both the sidebar and the top toolbar. */
.dark-mode.desaturate-app-colors.v-application .about-item,
.dark-mode.desaturate-app-colors.v-application .about-item .v-icon,
.dark-mode.desaturate-app-colors.v-application .about-item .v-list-item__title {
  color: #b0b0b0 !important;
  border-left-color: #b0b0b0 !important;
}

/* The sidebar's icons take the tab's text color (Vuetify's dark theme makes
   them white). */
.dark-mode.v-application .nav-drawer .v-list-item__icon .v-icon {
  color: inherit !important;
}
/* The list behind each tab's cards shows the tab's black (Vuetify's dark
   theme paints every v-list #1e1e1e). */
.dark-mode.v-application .titlescreen-list,
.dark-mode.v-application .titlescreen-card-list,
.dark-mode.v-application .text-list,
.dark-mode.v-application .soundfx-list,
.dark-mode.v-application .background-list,
.dark-mode.v-application .song-list,
.dark-mode.v-application .data-list,
.dark-mode.v-application .animation-list,
.dark-mode.v-application .animation-frame-list,
.dark-mode.v-application .about-list {
  background-color: transparent !important;
}
/* With Subdued Palette the tab area is #1e1e1e, so its cards (and popup cards)
   are a step lighter to stand out from it. */
.dark-mode.desaturate-app-colors.v-application .theme--dark.v-card:not(.editor-container) {
  background-color: #2a2a2a !important;
}
/* Without Subdued Palette the tab area is black and its cards are black too
   (their borders set them apart). */
.dark-mode:not(.desaturate-app-colors).v-application .theme--dark.v-card:not(.editor-container) {
  background-color: #000 !important;
}
/* A list inside a popup card (the delete confirmations, Set height...) takes the
   card's color instead of Vuetify's list color, which left it a
   different shade from the rest of the popup. */
.dark-mode.v-application .v-menu__content > .v-card .theme--dark.v-list,
.dark-mode.v-application .v-dialog > .v-card .theme--dark.v-list {
  background-color: transparent !important;
}
/* The build/error console: error text stays red (Vuetify's dark footer would
   make it white), on the same black as the sidebar. */
.dark-mode.v-application .theme--dark.v-footer.error-message {
  background-color: #000 !important;
  color: rgb(244, 67, 54);
}

.dark-mode.v-application .compile-log-error {
  color: rgb(244, 67, 54) !important;
}

.dark-mode.desaturate-app-colors.v-application .theme--dark.v-footer.error-message {
  background-color: #1e1e1e !important;
  color: #e05555;
}

.dark-mode.desaturate-app-colors.v-application .compile-log-error {
  color: #e05555 !important;
}
/* A short name under each icon of the top toolbar, in a smaller font than the sidebar's and the color of its icon.
   The name is placed under the icon without taking any width, so the buttons keep the spacing they have without
   names (neighbors' names are narrower than the gap). Hiding the toolbar labels (an Expert mode option, the root's hide-toolbar-labels class) takes the
   names away and the buttons go back to icon height. */
.v-application .top-toolbar.v-app-bar .v-btn {
  height: 52px !important;
  /* As wide as the space between two icons, so the highlight of the current tab covers even the widest name and the
     icons are evenly 54px apart. */
  min-width: 54px !important;
  margin: 0 !important;
}
.top-toolbar .v-btn .v-btn__content {
  padding-bottom: 16px;
}
.top-toolbar .top-toolbar-label {
  position: absolute;
  left: 50%;
  bottom: 1px;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 10px;
  line-height: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: inherit;
}
.hide-toolbar-labels .top-toolbar .top-toolbar-label {
  display: none;
}
.v-application.hide-toolbar-labels .top-toolbar.v-app-bar .v-btn {
  height: 36px !important;
  min-width: 36px !important;
  margin: 0 4px !important;
}
.hide-toolbar-labels .top-toolbar .v-btn .v-btn__content {
  padding-bottom: 0;
}
/* The left sidebar's drag handle: the same strip and grip as the emulator's, on the sidebar's right edge. */
.sidebar-resize-handle {
  position: fixed;
  top: 72px;
  width: 10px;
  cursor: ew-resize;
  z-index: 20;
}
.sidebar-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}
.sidebar-resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 40px;
  border-radius: 2px;
  background-color: #bdbdbd;
}
.sidebar-resize-handle:hover::after {
  background-color: #757575;
}
.nav-drawer .nav-drawer-inner {
  overflow-x: hidden;
}
.nav-drawer .v-list-item {
  overflow: hidden;
  white-space: nowrap;
}
/* Narrowed: each name goes under its icon, small like the top toolbar's. The icons stay exactly where they are in the
   wide sidebar (8px color bar, 16px, icon), and each name is centered under its icon. */
.nav-drawer.sidebar-stacked .v-list-item {
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 4px 0;
  /* The same row height as the full width sidebar. */
  min-height: 56px;
}
.nav-drawer.sidebar-stacked .v-list-item::after {
  /* Vuetify's min-height spacer would become a second row in a column. */
  display: none;
}
.nav-drawer.sidebar-stacked .v-list-item .v-list-item__icon {
  margin: 0 0 0 16px !important;
  align-self: flex-start;
}
.nav-drawer.sidebar-stacked .v-list-item .v-list-item__content {
  flex: 0 0 auto;
  align-self: flex-start;
  width: 24px;
  margin-left: 16px;
  padding: 0;
  overflow: visible;
}
.nav-drawer.sidebar-stacked .v-list-item .v-list-item__title {
  /* Centered on the 24px box under the icon, however wide the name is. */
  position: relative;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  flex: none;
  overflow: visible;
  font-size: 10px;
  line-height: 12px;
  font-weight: 400;
}
/* The current tab has no color bar (the inactive ones have an 8px one), so it gets the same width as padding: the icons
   are in the same place on every row, in the wide, narrow and icon-only sidebars. */
.nav-drawer .v-list-item.v-list-item--active {
  padding-left: 24px;
}
.nav-drawer.sidebar-stacked .v-list-item.v-list-item--active {
  padding-left: 8px;
}
/* The narrow and icon-only sidebars scroll without a scrollbar, so their width is the same on every row. */
.nav-drawer.sidebar-stacked .nav-drawer-inner,
.hide-toolbar-labels .nav-drawer .nav-drawer-inner {
  scrollbar-width: none;
}
.nav-drawer.sidebar-stacked .nav-drawer-inner::-webkit-scrollbar,
.hide-toolbar-labels .nav-drawer .nav-drawer-inner::-webkit-scrollbar {
  display: none;
}
/* Hiding the toolbar labels: no names in the sidebar at all, just the icons, in the same place as in the wide sidebar. */
.hide-toolbar-labels .nav-drawer .v-list-item .v-list-item__content {
  display: none;
}
.hide-toolbar-labels .nav-drawer .v-list-item {
  justify-content: flex-start;
  padding: 0 0 0 16px;
  /* The same row height as the other sidebar sizes. */
  min-height: 56px;
}
.hide-toolbar-labels .nav-drawer .v-list-item.v-list-item--active {
  padding-left: 16px;
}
/* Expert mode: no color bars beside the sidebar's options, so no room is kept for them either: the icons are 16px from the edge
   on every row (the same as with the names hidden), in the wide sidebar and the narrow one. */
.hide-description-text .nav-drawer .v-list-item:not(.v-list-item--active) {
  border-left: 0 !important;
}
.hide-description-text .nav-drawer .v-list-item.v-list-item--active {
  padding-left: 16px;
}
.hide-description-text .nav-drawer.sidebar-stacked .v-list-item.v-list-item--active {
  padding-left: 0;
}
/* No color bars beside the icons when the labels are hidden, so the icons are centered in the bar. */
.hide-toolbar-labels .nav-drawer .v-list-item:not(.v-list-item--active) {
  border-left: 0 !important;
}
.hide-toolbar-labels .nav-drawer .v-list-item .v-list-item__icon {
  margin: 0 !important;
  align-self: center;
}
/* High Contrast: the icons (and their names) of the left and top toolbars are black, or white in Dark Mode, instead
   of a color for each tab. */
.v-application.colorblind-mode .top-toolbar .v-btn,
.v-application.colorblind-mode .top-toolbar .v-btn .v-icon,
.v-application.colorblind-mode .top-toolbar .v-btn .top-toolbar-label,
.v-application.colorblind-mode .nav-drawer .v-list-item,
.v-application.colorblind-mode .nav-drawer .v-list-item > .v-list-item__icon > .v-icon,
.v-application.colorblind-mode .nav-drawer .v-list-item > .v-list-item__content {
  color: #000 !important;
  filter: none !important;
}
.v-application.colorblind-mode.dark-mode .top-toolbar .v-btn,
.v-application.colorblind-mode.dark-mode .top-toolbar .v-btn .v-icon,
.v-application.colorblind-mode.dark-mode .top-toolbar .v-btn .top-toolbar-label,
.v-application.colorblind-mode.dark-mode .nav-drawer .v-list-item,
.v-application.colorblind-mode.dark-mode .nav-drawer .v-list-item > .v-list-item__icon > .v-icon,
.v-application.colorblind-mode.dark-mode .nav-drawer .v-list-item > .v-list-item__content {
  color: #fff !important;
}
/* With Subdued Palette on as well, the white is the same softer grey the About tab has there. */
.v-application.colorblind-mode.dark-mode.desaturate-app-colors .top-toolbar .v-btn,
.v-application.colorblind-mode.dark-mode.desaturate-app-colors .top-toolbar .v-btn .v-icon,
.v-application.colorblind-mode.dark-mode.desaturate-app-colors .top-toolbar .v-btn .top-toolbar-label,
.v-application.colorblind-mode.dark-mode.desaturate-app-colors .nav-drawer .v-list-item,
.v-application.colorblind-mode.dark-mode.desaturate-app-colors .nav-drawer .v-list-item > .v-list-item__icon > .v-icon,
.v-application.colorblind-mode.dark-mode.desaturate-app-colors .nav-drawer .v-list-item > .v-list-item__content {
  color: #b0b0b0 !important;
}
/* Without the top toolbar (Options: Hide top toolbar) the sidebar and the emulator pane start at the top of the
   window, so what is placed below the toolbar moves up with them. */
.v-application.no-top-toolbar .sidebar-resize-handle,
.v-application.no-top-toolbar .emulator-resize-handle {
  top: 0;
}
.v-application.no-top-toolbar .emulator-hide-button,
.v-application.no-top-toolbar .emulator-show-button {
  top: 8px;
}
</style>
<style scoped>
/* Vuetify animates the drawer's width over 200ms, but the emulator's scale is
   applied instantly, so the two visibly drift apart while dragging. This drawer
   is permanent and never slides open, so the width transition serves no
   purpose; dropping it keeps the column and the emulator in lockstep. */
.emulator-drawer {
  transition-property: transform, visibility;
}

/* Separates the top toolbar from everything below it (the middle pane AND
   the emulator column) with one continuous line, rather than adding the
   same border separately to each pane below it (tried first - two
   separately-bordered panes, each only as wide as its column, instead
   of one line spanning the full width in one place). !important because
   the v-app-bar's "color=white" prop applies Vuetify's ".white" color
   utility class, which sets "border-color: #fff !important" - confirmed
   directly (computed style showed this border rendering solid white,
   invisible against the toolbar's white background) rather than assumed. */
.top-toolbar {
  /* Matches the darkened .v-sheet--outlined card border color (see that
     comment) rather than Vuetify's default rgba(0, 0, 0, 0.12). Spans the
     toolbar's full width (see "left"/"width"/"padding-left" below), so this
     single border now reads as one continuous line under both the logo and
     the toolbar's content - no separate divider element needed to fake
     that continuity (see the removed .app-logo-divider, replaced by this). */
  border-bottom: 1px solid rgba(0, 0, 0, 0.24) !important;
  /* Vuetify's .v-app-bar base styles already transition left/right/
     width/max-width/transform (its built-in slide when $vuetify.
     application.left changes, e.g. when a drawer opens/closes) - removing
     the drawer element entirely via v-if (see "Never show the left
     sidebar") changes that same tracked value, so the toolbar visibly
     animated into place even after removing this rule's padding-left
     transition (confirmed directly - the animation was Vuetify's,
     not this file's). !important overrides Vuetify's class-level
     transition declaration. */
  transition: none !important;
  /* Always spans the full window width, starting at x: 0, rather than
     Vuetify's "app" positioning (which normally offsets this past
     a present drawer's width automatically, via $vuetify.application.left,
     and falls back to x: 0 only once the drawer's gone - see the removed
     .top-toolbar-no-drawer, which used to force that same x: 0 case back to
     x: 200 to avoid sitting underneath .app-logo). Unconditionally
     overriding "left"/"width" instead, in both the drawer-present and
     drawer-absent cases alike, means the toolbar's box (so its
     background and the border-bottom above) always extends under
     .app-logo's reserved 200px corner too, instead of stopping at its
     edge - letting the logo and the toolbar share one border instead of
     needing a second element to visually continue it. padding-left keeps
     the toolbar's actual content (the tab buttons) clear of that same
     200px corner, same value .app-logo reserves, regardless of whether a
     drawer happens to be present. !important is required to win over
     Vuetify's inline "left"/"width" styles - inline styles normally
     beat stylesheet rules, but never ones marked !important. */
  left: 0 !important;
  width: 100% !important;
  padding-left: 200px;
}

/* Vuetify's  default v-btn sizing (min-width: 64px, 0 16px padding) is
   meant for a TEXT button - applied here to plain icon-only buttons (no
   "icon" prop, since these need to stay clickable/keyboard-focusable
   v-btn-with-text, not the smaller round "icon" button variant elsewhere
   in this app), it leaves each one a 64x36 rectangle around a ~24px icon,
   which reads as an odd wide rectangle on hover/focus instead of a square
   matching the icon's proportions. min-width dropped to the same 36px
   as the button's (unchanged) 36px height, padding dropped to just
   enough to keep the icon centered, so the hover/focus overlay itself
   comes out square. margin adds explicit breathing room back between
   buttons now that min-width no longer does that as a side effect - kept
   separate from the sizing above so the hover/focus square itself
   (36x36) stays exactly that size regardless of how far apart the
   buttons themselves sit. */
.top-toolbar .v-btn {
  min-width: 36px !important;
  padding: 0 6px !important;
  margin: 0 4px !important;
}

/* Sits in the empty top-left corner, above the drawer itself (which is
   "clipped" and starts at y: 72px, see the template) and on top of
   .top-toolbar's box (which, since .top-toolbar's "left"/"width"/
   "padding-left" above now span its full width unconditionally, extends
   underneath this same corner too - the logo just paints over it, via a
   higher z-index below). Fixed positioning (not part of any Vuetify "app"
   element's flow) since none of the surrounding chrome has a slot for it. */
.app-logo {
  position: fixed;
  top: 0;
  left: 8px;
  width: 184px;
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
  pointer-events: none;
}

.app-logo-img {
  /* height: auto (not a fixed box with object-fit) so the image's real
     rendered height matches its aspect ratio exactly, with no leftover
     whitespace inside a taller box pushing the version text below it away. */
  width: 100%;
  height: auto;
}

/* The logo is inverted under Dark Mode (invert + hue-rotate keeps its hues,
   the same look the old whole-app filter gave it), and dimmed a bit: at full
   brightness it read as too stark against the dark UI. */
.dark-mode .app-logo-img,
.dark-mode .sidebar-logo-img,
.dark-mode .sidebar-logo-wide-img {
  filter: invert(1) hue-rotate(180deg);
  opacity: 0.8;
}

/* The round logo and the version under it, at the top of the sidebar when it shows icons only and the top toolbar (which has the
   full logo) is hidden. Colored like the logo in the toolbar: the same black, and the same Dark Mode treatment above. */
.sidebar-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 4px;
  pointer-events: none;
}

.sidebar-logo-img {
  width: 36px;
  height: 36px;
}

/* The full logo of the top toolbar and its version, when the sidebar is wide (the same look as in the toolbar). */
.sidebar-logo-wide {
  padding: 12px 8px 8px;
}

.sidebar-logo-wide-img {
  width: 100%;
  max-width: 184px;
  height: auto;
}

.sidebar-logo-version {
  margin-top: 4px;
  font-size: 9px;
  color: rgba(0, 0, 0, 0.6);
  line-height: 1;
}

.app-logo-version {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.6);
  line-height: 1;
}

/* Same color, on the sidebar's top edge - now that the
   drawer is "clipped" (starts below the app-bar instead of the system-bar
   above it, see the template), this lines up exactly with .top-toolbar's
   border-bottom above (which now spans under the logo too, see that
   comment), reading as one continuous line across the whole window instead
   of two separate borders that happen to match colors. */
/* margin-top: -1px nudges the border up a hair from where it'd otherwise
   land - even though the drawer's top (now "clipped" below the app-bar,
   see the template) and .top-toolbar's bottom edge compute to the exact
   same y-coordinate, the two borders still rendered a device pixel apart at
   this window's 1.5x scale factor, a common sub-pixel rounding artifact
   between two independently-positioned elements whose edges only coincide
   in CSS px, not real device px. */
.nav-drawer {
  margin-top: -1px;
  border-top: 1px solid rgba(0, 0, 0, 0.24) !important;
}

/* Vuetify offsets the main content with an animated padding matching the
   drawer width, which makes the Blockly canvas ease into its new size while
   the column and emulator resize instantly. It also means the canvas is
   measured mid-animation when it reflows. Both drawers here are permanent, so
   nothing needs to animate. */
.app-main {
  transition: none;
  /* Vuetify's .v-main is "flex: 1 0 auto" - flex-shrink: 0 means it
     NEVER shrinks below its content's natural height, regardless of how
     little space v-application--wrap (min-height: 100vh, otherwise
     content-driven) actually has left for it - so a tab with enough content
     to be genuinely taller than the viewport (16 score-font glyph cards,
     for instance) grew the WHOLE PAGE taller instead of ever reaching
     .app-main-inner's overflow-y: auto at all, which only ever gets a
     chance to clip/scroll content that doesn't already fit within the
     height this element itself was already given. flex-shrink: 1
     (overriding Vuetify's 0) lets this actually shrink to fit its real
     allocated space instead of dictating the page's height upward, and
     min-height: 0 removes flexbox's separate "never shrink below
     content size" default floor (distinct from flex-shrink, and it applies
     even with flex-shrink: 1 unless overridden) that would otherwise still
     block the same thing from working. Confirmed directly as the real root
     cause of a "phantom" scrollbar appearing at the literal browser window
     edge (not this app's internal panel scrollbars) specifically on
     tabs with enough content to actually be taller than one viewport. */
  flex: 1 1 auto;
  min-height: 0;
}

/* Vuetify's .v-main is "flex: 1 0 auto" (flex-shrink: 0) with no fixed
   height - a paddingBottom bound directly to it (an earlier
   version of this) just grew that box past whatever space the outer
   v-application--wrap flex column actually had left, overflowing the
   whole page (a real, new scrollbar this time, not the inert forced-
   scrollbar case fixed elsewhere) instead of being absorbed anywhere. This
   inner div is a plain block, not a flex item with its shrink-doesn't-
   happen behavior - height: calc(100% - Npx) takes exactly whatever height
   v-main's flex-grow already resolved (stretched across via v-main's
   default row-direction align-items: stretch on its real single child,
   .v-main__wrap, which this sits inside), reduced by errorHeight to reserve
   room for .error-message's fixed footer (which isn't an "app" element
   Vuetify lays out room for).
   position: relative makes THIS the containing block for any
   position: absolute descendant a routed view renders (e.g.
   ActionEditor.vue's "#blockly2 { position: absolute; bottom: 0; }",
   which sizes the whole Blockly canvas including its toolbox/flyout, or
   GeneratedCode.vue's ".editor-container", same pattern) - without it,
   such a descendant skips past this div (position: static doesn't
   establish a containing block) straight to the next actual positioned
   ancestor up the tree, Vuetify's .v-main__wrap, which still extends
   all the way to the TRUE viewport bottom.
   A PADDING-based version of this (height: 100% + padding-bottom: Npx +
   box-sizing: border-box, matching .nav-drawer-inner/.emulator-drawer-inner's
   pattern) was tried here first and confirmed NOT equivalent for this
   specific job: a position: absolute child's "bottom: 0" aligns with
   its containing block's PADDING-box edge, which is the same as the
   border-box edge (the outermost edge, padding included) whenever there's
   no border - so "bottom: 0" landed exactly at this div's OUTER edge,
   completely ignoring the padding meant to hold it back, and every
   position: absolute view (ActionEditor's Blockly canvas, GeneratedCode's
   whole editor pane including its search dock) kept rendering straight
   through .error-message's fixed footer regardless. Actually reducing the
   HEIGHT itself (not padding it) is what genuinely moves this div's
   bottom edge - and so its padding-box edge too - up above the footer, the
   only version of this fix confirmed (via direct getBoundingClientRect
   measurement) to actually change where "bottom: 0" resolves to. */
.app-main-inner {
  position: relative;
  overflow-y: auto;
}

/* A sibling of the drawer (see the template), NOT a child of it - same
   reasoning as .emulator-hide-button below: v-navigation-drawer sets
   overflow: hidden on itself, which clipped away the left half of this
   handle's straddle when it lived inside the drawer as an absolutely-
   positioned child, so the hover highlight never actually spilled onto the
   content to its left the way .error-resize-handle's does (that one lives in
   a v-footer, which doesn't clip). Fixed to the window instead, with "right"
   bound inline to emulatorWidth so it still tracks the drawer's left
   edge as it's resized. */
.emulator-resize-handle {
  position: fixed;
  /* 72px clears the fixed chrome above the drawer (the app-bar's
     height, see .emulator-hide-button's comment below) - this used to
     be a plain 0, which ran the handle up over that chrome instead of
     starting at the drawer's clipped top edge. */
  top: 72px;
  /* bottom is set inline (bound to errorHeight, see the template) rather
     than a plain 0 here - this handle used to run the full viewport height,
     rendering on top of the console footer (a sibling, not a descendant, so
     the console's z-index couldn't help) instead of stopping above it
     the way the emulator drawer itself already does. */
  /* Straddles the drawer's  left edge (-5px to +5px, via the "right"
     style bound to emulatorWidth - 5 in the template), matching
     .error-resize-handle's straddle - a plain 6px strip fully inside
     the drawer was too easy to miss by a pixel and land on the emulator
     content instead. */
  width: 10px;
  cursor: ew-resize;
  /* Same z-index the toggle buttons below use to sit above the drawer -
     without this, the drawer (a higher-z-index Vuetify "app" element)
     painted over the right half of this straddle and ate its hover/clicks,
     leaving only the left half interactive - looked both shrunken and
     shifted left of where it used to sit. */
  z-index: 20;
}

.emulator-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}

/* A visible grip bar centered in the drag strip - same rest/hover grey as
   the scrollbar thumbs and .error-resize-handle's grip below, so all of
   the app's draggable handles read as one consistent design instead of
   being invisible until hovered. */
.emulator-resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 40px;
  border-radius: 2px;
  background-color: #bdbdbd;
}

.emulator-resize-handle:hover::after {
  background-color: #757575;
}

.emulator-toolbar-row {
  display: flex;
  align-items: center;
  /* A pane too narrow for the tool icons next to the refresh button puts all of them together on a line below it. */
  flex-wrap: wrap;
  row-gap: 2px;
  margin-top: 8px;
  margin-bottom: 4px;
}
.emulator-toolbar-row .emulator-refresh-button {
  flex: 0 0 auto;
}

/* Holds the screenshot and keyboard-mapping buttons together at the row's far
   right - the keyboard button's own auto left margin (KeyMappingDialog.vue)
   then has no spare room to take inside this shrink-wrapped group. */
.emulator-toolbar-icons {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 4px;
  margin-left: auto;
}
.emulator-toolbar-wrapped .emulator-toolbar-icons {
  margin-right: auto;
}
/* Both lines are centered when the icons are on a line below the button. */
.emulator-toolbar-wrapped {
  justify-content: center;
}

.emulator-toolbar-divider {
  margin: 0;
}

/* "Refresh emulator" plus both icon buttons have to fit the drawer's default
   256 px width (240 px row): trimmed padding on Refresh and 26 px icon
   buttons (the keyboard one included, so the two match) make that fit. */
.emulator-refresh-button.v-btn {
  padding: 0 8px !important;
}

.emulator-toolbar-icons >>> .v-btn.v-btn--icon {
  width: 26px !important;
  height: 26px !important;
  min-width: 0 !important;
  margin: 0 !important;
}

/* A sibling of the drawer (see the template), NOT a child of it - v-
   navigation-drawer sets overflow: hidden on itself (to mask its slide
   transition), which was clipping away the left half of this button when it
   lived inside the drawer as an absolutely-positioned child straddling its
   edge. Fixed to the window instead, with "right" bound inline to
   emulatorWidth (see the template) so it still tracks the drawer's left
   edge as it's resized. top: 80px clears the fixed chrome above the drawer
   (the app-bar's 72px, plus a little breathing room), putting this at
   the top of the emulator column instead of vertically centered on it.
   z-index bumped well past Vuetify's app-bar/navigation-drawer chrome,
   which otherwise sat on top of and ate clicks meant for this button. */
.emulator-hide-button {
  position: fixed;
  top: 80px;
  /* Its right edge 8px from the emulator pane, the same as the space above it (80px down, 72px toolbar). */
  transform: translateX(-8px);
  /* Above the toolbox and its drawer of blocks (the toolbox is 70), which reach over to this edge. */
  z-index: 80;
  box-shadow: none !important;
}

/* right: 16px (not flush against the window's  edge) - flush placement
   sat exactly where the browser's native scrollbar renders, which (unlike
   the DOM z-index fix .emulator-hide-button needed) can't be fixed with
   z-index at all: an OS/browser-drawn scrollbar always paints on top of
   page content regardless, and was silently eating clicks (starting a
   scroll drag instead) meant for this button. Clearing that strip entirely,
   rather than straddling it, is the only real fix. */
.emulator-show-button {
  position: fixed;
  top: 80px;
  right: 21px;
  z-index: 80;
  box-shadow: none !important;
}

/* Faded and grey at rest (see color="grey" in the template) - a quieter
   default than the app's usual blue "primary" accent, since this floats
   over whatever tab is open rather than living inside a toolbar/panel with
   other controls, and shouldn't compete for attention until the user is
   actually reaching for it. Full opacity plus the app's primary blue on
   hover together read as "now active"/clickable. */
.emulator-toggle-button {
  opacity: 0.5;
}

.emulator-toggle-button:hover {
  opacity: 1;
  background-color: var(--v-primary-base, #1976d2) !important;
}

/* Flex column so .rom-capacity-detail (the last child) can grow to fill
   whatever vertical space the emulator/buttons/summary line above it don't
   use, instead of sizing to its content and leaving dead space below.
   box-sizing: border-box makes the padding-bottom below (which reserves room
   for the error console footer, which overlaps the bottom of this drawer
   since it isn't an "app" element Vuetify reserves layout space for) count
   against this 100% height, instead of being added on top of it - otherwise
   the flex children size themselves as if the footer weren't there, and
   .rom-capacity-detail's scrollbar never kicks in until content is
   pushed further down than the footer already covers. */
.emulator-drawer-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  /* The "Refresh emulator"/"Update ROM"/"Get generated ROM" buttons are all
     "block" (100% width of this container), which previously ran them
     flush edge to edge with no breathing room. #gopher2600-target-container
     (the emulator screen itself) also ends up very slightly narrower as a
     result, rather than compensating it back out with its negative
     margin - that container's width feeds a live ResizeObserver-driven
     scale calculation (see updateEmulatorScale/observeEmulatorSize below),
     and a negative margin there risks that measurement disagreeing with
     what's actually laid out, for a fix this small. */
  padding: 0 8px;
}

/* "Update ROM"/"Get generated ROM" side by side in one row (used to each be
   a separate "block" full-width v-btn, stacked) - each sized to its
   label's natural width (not stretched to fill/split the row) and the pair
   centered as a group. Front-panel switches use the same layout. */
.rom-buttons-row,
.panel-switches-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* Select/Reset as one indivisible unit within .panel-switches-row's
   flex-wrap, rather than two separate flex items - a plain flex-wrap row
   wraps items ONE AT A TIME as space runs out, which could leave Select on
   the previous row and Reset alone on the next. Grouping them into their
   nested flex container (itself a single flex item as far as the outer
   row is concerned) makes the pair wrap down together or not at all. */
.emulator-select-reset-group {
  display: flex;
  gap: 8px;
}

/* Vuetify's "color" prop doesn't compute a contrasting icon/text color
   from the color itself (that only happens via the app's overall light/
   dark THEME, not per-button) - without this, the power icon stayed its
   usual dark grey on top of the now-green filled button once powered on,
   reading as low-contrast/hard to see instead of a clear white icon on a
   solid green background. No ">>> " deep-combinator here (tried first) -
   this v-icon is written directly in THIS component's template (unlike
   e.g. Blockly's injected SVG text elsewhere in this file), so it already
   carries this component's scope attribute like any other element
   here, and gets matched by a plain scoped selector same as they would -
   using >>> would have stripped that attribute-selector specificity back
   off again, losing a specificity tie against the app-wide "Soft Colors"
   icon-darkening rule (.desaturate-app-colors .theme--light.v-icon, itself
   3 classes) instead of comfortably beating it. */
.panel-switches-row .emulator-power-button.emulator-power-button-on.green .v-icon {
  color: #fff !important;
}

/* Same reasoning as .emulator-drawer-inner above: the error console footer
   overlaps the bottom of this drawer too (it isn't an "app" element Vuetify
   reserves layout space for), so a plain height: 100% scroll area would let
   the last couple of tabs end up hidden behind it. box-sizing: border-box
   makes the reactive padding-bottom count against the 100% height instead of
   adding to it, so the scrollbar appears in time to reach everything above
   the footer. */
.nav-drawer-inner {
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* Vuetify's v-list has an 8px top/bottom padding by default, which left a
   gap between the Actions tab and the top of the drawer that the top
   toolbar's tab row doesn't have. Removed so the first tab sits flush
   with the drawer's top edge. */
.navigation-list.v-list {
  padding-top: 0;
}

.v-list-item__icon {
  margin-right: 12px !important;
}

.navigation-list > .v-list-item:not(.v-list-item--active) {
  border-left: 8px solid;
}

/* REMOVED: "opacity: 0.65" on every inactive sidebar item - the top bar's
   tab buttons have no equivalent dimming (always full-strength color,
   active or not), so this was the actual source of the sidebar's icon/text
   colors looking washed out compared to the top bar's for any tab that
   wasn't the current page - confirmed directly via computed style: both
   already resolved to the exact same "color: rgb(...)" (the shared
   .actions-item/.player-item/etc rules below already cover both bars
   identically), it was purely this element-wide opacity multiplying that
   same color down for the sidebar alone. */

/* The top v-app-bar's  tab buttons (.actions-item/.player-item/etc,
   the exact same class names as the sidebar's v-list-item entries just
   above - see the rules right below this one) used to render with
   Vuetify's default v-btn appearance, a solid light grey fill
   (".theme--light.v-btn.v-btn--has-bg { background-color: #f5f5f5 }" - see
   node_modules/vuetify/dist/vuetify.css), unlike the sidebar's
   v-list-item entries, which have no background fill at all -
   confirmed as the actual source of the two navigation bars visibly not
   matching. The "text" prop (added on each of these v-btn in the template)
   is what removes that default fill, the same way it would for any other
   Vuetify text-style button - no CSS override needed here for that part.
   Once that grey fill is gone, the hover/active TINT COLOR already matches
   the sidebar for free: Vuetify's v-btn already uses
   "background-color: currentColor" for its built-in hover/focus/active
   overlay (".v-btn:before"/".v-btn--active::before" in the same vuetify.css),
   and the color rules below already force "color: rgbX !important" on
   these exact same classes. The tint's STRENGTH still didn't match
   though (confirmed directly against vuetify.css) - v-list-item's
   overlay opacities (hover 0.04, active 0.12) are roughly HALF v-btn's
   (hover 0.08, active 0.18), which read as visibly lighter/washed-out on
   the sidebar than the same color looked on the top bar even once both
   used the same base color. The override right below brings the sidebar's
   v-list-item opacities UP to match the top bar's v-btn values
   exactly, scoped to just these nav items (not every v-list-item
   app-wide). */
.navigation-list.v-list .v-list-item:hover::before {
  opacity: 0.08 !important;
}
.navigation-list.v-list .v-list-item:focus::before {
  opacity: 0.24 !important;
}
.navigation-list.v-list .v-list-item--active:hover::before,
.navigation-list.v-list .v-list-item--active::before {
  opacity: 0.18 !important;
}
.navigation-list.v-list .v-list-item--active:focus::before {
  opacity: 0.16 !important;
}

/* "Soft Colors" (see Configuration.vue) - these tab colors are plain
   hardcoded rgb() values, not run through Blockly's HSL-based
   parseBlockColour patch (see BlocklyComponent.vue), so there's no single
   funnel to desaturate them through the way every block color has. A CSS
   filter, same mechanism already used for the blockly text/emoji desaturation,
   covers both the icon and label text (and the border-left indicator) of
   each tab in one rule, with no per-tab color duplication. */
.desaturate-app-colors .actions-item,
.desaturate-app-colors .titlescreen-item,
.desaturate-app-colors .player-item,
.desaturate-app-colors .background-item,
.desaturate-app-colors .sound-item,
.desaturate-app-colors .music-item,
.desaturate-app-colors .text-tab-item,
.desaturate-app-colors .data-item,
.desaturate-app-colors .scorefont-item,
.desaturate-app-colors .configuration-item,
.desaturate-app-colors .generated-item,
.desaturate-app-colors .project-item {
  filter: saturate(50%);
}

/* The left-hand nav-drawer's tab labels/icons AND the top toolbar's
   matching tab icons - desaturating alone (see the filter rule just above)
   left them a similar lightness to before, which read as harder to read
   against both bars' darkened backgrounds (see the app-wide
   .desaturate-app-colors background tiers). Darkened on top of that same
   desaturation (filters compose) by the same amount in both places, so a
   given tab's icon reads as the exact same color whether it's clicked in
   the top bar or the sidebar - confirmed as a real reported mismatch when
   only the sidebar had this. */
/* Only brightness here (not saturate too) - the ANCESTOR .actions-item/etc
   already gets its saturate(50%) (see that rule further below), which
   composites over its entire rendered box including these two children, so
   adding a second saturate() here would double it up (effectively ~25%,
   not 50%) rather than matching the top toolbar's single combined
   "saturate(50%) brightness(0.7)" value (see that rule further below - the
   top toolbar's icon has no such ancestor filter to compose with, since it
   sits directly inside the v-btn with no v-list-item wrapper, so it needs
   the full combined value declared directly on itself instead). */
.desaturate-app-colors .nav-drawer .v-list-item__content,
.desaturate-app-colors .nav-drawer .v-list-item__icon {
  filter: brightness(0.7);
}

/* Same rule as just above, for the top toolbar's matching tab icons - kept
   as its rule (rather than one shared selector list) so the brightness
   filter here can be combined with the saturate(50%) filter every top-
   toolbar/sidebar tab icon already gets (see that rule further below) into
   ONE filter value. A second, separate "filter: brightness(0.7)" rule of
   equal-or-higher specificity targeting the SAME element would have just
   replaced that saturate() entirely instead of composing with it - CSS
   filter doesn't merge across separate declarations the way e.g. transform
   sometimes can be reasoned about; only the highest-specificity single
   declaration wins. */
.desaturate-app-colors .top-toolbar .actions-item,
.desaturate-app-colors .top-toolbar .titlescreen-item,
.desaturate-app-colors .top-toolbar .player-item,
.desaturate-app-colors .top-toolbar .background-item,
.desaturate-app-colors .top-toolbar .sound-item,
.desaturate-app-colors .top-toolbar .music-item,
.desaturate-app-colors .top-toolbar .text-tab-item,
.desaturate-app-colors .top-toolbar .data-item,
.desaturate-app-colors .top-toolbar .scorefont-item,
.desaturate-app-colors .top-toolbar .configuration-item,
.desaturate-app-colors .top-toolbar .generated-item,
.desaturate-app-colors .top-toolbar .project-item {
  filter: saturate(50%) brightness(0.7);
}

/* Every OTHER icon/text in the app (not the left nav-drawer's tab
   icons/labels, already darkened above, or the top toolbar's colored per-
   tab icons, restored below) - Vuetify's default light-theme text/icon
   opacities (rgba(0,0,0,.87) for body text, .54 for icons, lighter still
   for hints/secondary text) were tuned against a plain white background.
   Against the darker card/app-bg tiers those same alpha values read as
   noticeably lower-contrast, so both are bumped darker here. color (not
   filter) - filter would also darken whatever background is BEHIND the
   element, since it applies to the full rendered box, not just the text/
   icon glyph itself. */
.desaturate-app-colors.theme--light {
  color: rgba(0, 0, 0, 0.95) !important;
}

.desaturate-app-colors .theme--light.v-icon {
  color: rgba(0, 0, 0, 0.75) !important;
}

/* The top toolbar's tab icons (.actions-item/.titlescreen-item/etc,
   directly <v-icon> inside the v-btn - no .v-list-item__icon wrapper the
   way the sidebar's matching entries have, see those rules further below)
   otherwise matched the blanket darkening rule just above with nothing
   more specific to beat it, flattening every tab's distinct color
   (green/purple/blue/etc) down to plain dark grey - confirmed as a real
   reported bug. Restores each one back to its per-tab color (already
   forced onto the parent .actions-item/etc button - see those rules) via
   plain inheritance. */
.desaturate-app-colors .top-toolbar .theme--light.v-icon {
  color: inherit !important;
}

/* Vuetify's hover overlay (".v-btn:before", tinted by the button's
   currentColor at ~8% opacity) barely showed up on a plain grey-background
   button like "Reset to Defaults"/"Refresh emulator" - "Reset to Defaults"
   forces its resting text color to a faint rgba(0,0,0,.38)-ish grey
   (see Configuration.vue's rule), unlike the other three here, which
   left ITS hover overlay noticeably fainter than the rest even though
   all four are meant to read as the same style of button - confirmed as a
   real reported mismatch. One explicit, shared hover background instead of
   relying on that per-button overlay math, so all four always match
   exactly regardless of each button's resting text color. */
.v-card__actions .v-btn.v-btn--text:not(.v-btn--icon):not(.v-btn--disabled):hover,
.reset-to-defaults-btn.v-btn:hover,
.emulator-refresh-button.v-btn:hover,
.palette-clear-btn.v-btn:hover,
.emulator-select-button.v-btn:hover,
.emulator-reset-button.v-btn:hover {
  background-color: #e0e0e0 !important;
}

/* Same explicit-hover-color reasoning as just above, darker to match Soft
   Colors' darker background tiers (see the app-wide
   .desaturate-app-colors rules) - overrides the plain-theme value above. */
.desaturate-app-colors .v-card__actions .v-btn.v-btn--text:not(.v-btn--icon):not(.v-btn--disabled):hover,
.desaturate-app-colors .reset-to-defaults-btn.v-btn:hover,
.desaturate-app-colors .emulator-refresh-button.v-btn:hover,
.desaturate-app-colors .palette-clear-btn.v-btn:hover,
.desaturate-app-colors .emulator-select-button.v-btn:hover,
.desaturate-app-colors .emulator-reset-button.v-btn:hover {
  background-color: #d0d0d0 !important;
}

/* The dark theme's hover for the same buttons (the light greys above would wash out the white text). */
.dark-mode .v-card__actions .v-btn.v-btn--text:not(.v-btn--icon):not(.v-btn--disabled):hover,
.dark-mode .emulator-refresh-button.v-btn:hover,
.dark-mode .emulator-select-button.v-btn:hover,
.dark-mode .emulator-reset-button.v-btn:hover,
.dark-mode.desaturate-app-colors .v-card__actions .v-btn.v-btn--text:not(.v-btn--icon):not(.v-btn--disabled):hover,
.dark-mode.desaturate-app-colors .emulator-refresh-button.v-btn:hover,
.dark-mode.desaturate-app-colors .emulator-select-button.v-btn:hover,
.dark-mode.desaturate-app-colors .emulator-reset-button.v-btn:hover {
  background-color: #3a3a3a !important;
}

.actions-item,
.actions-item > .v-list-item__icon > .theme--light.v-icon,
.actions-item > .v-list-item__content {
  color: rgb(76, 175, 80) !important;
  border-left-color: rgb(76, 175, 80) !important;
}

/* Never had a color rule - fell back to the same unstyled
   default the About tab (also with no rule) renders with,
   making the two tabs look identically colored despite being unrelated.
   Deep purple isn't used by any other tab. */
.titlescreen-item,
.titlescreen-item > .v-list-item__icon > .theme--light.v-icon,
.titlescreen-item > .v-list-item__content {
  color: rgb(103, 58, 183) !important;
  border-left-color: rgb(103, 58, 183) !important;
}

.player-item,
.player-item > .v-list-item__icon > .theme--light.v-icon,
.player-item > .v-list-item__content {
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

/* Never had a color rule of its  before this - fell back to the same
   unstyled default color the About tab (also with no rule)
   happens to render with, making the two tabs look identically colored
   even though they're unrelated. */
.music-item,
.music-item > .v-list-item__icon > .theme--light.v-icon,
.music-item > .v-list-item__content {
  color: rgb(0, 188, 212) !important;
  border-left-color: rgb(0, 188, 212) !important;
}

.text-tab-item,
.text-tab-item > .v-list-item__icon > .theme--light.v-icon,
.text-tab-item > .v-list-item__content {
  color: rgb(233, 30, 99) !important;
  border-left-color: rgb(233, 30, 99) !important;
}

.data-item,
.data-item > .v-list-item__icon > .theme--light.v-icon,
.data-item > .v-list-item__content {
  color: rgb(121, 85, 72) !important;
  border-left-color: rgb(121, 85, 72) !important;
}

.scorefont-item,
.scorefont-item > .v-list-item__icon > .theme--light.v-icon,
.scorefont-item > .v-list-item__content {
  color: #f2691e !important;
  border-left-color: #f2691e !important;
}

.configuration-item,
.configuration-item > .v-list-item__icon > .theme--light.v-icon,
.configuration-item > .v-list-item__content {
  color: rgb(96, 96, 244) !important;
  border-left-color: rgb(96, 96, 244) !important;
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

/* Vuetify's "block" prop sets flex: 1 0 auto on a v-btn (so a full-width
   button behaves inside a flex row) - inside .emulator-drawer-inner's flex
   COLUMN that instead makes every block button grow to fill the leftover
   vertical space whenever .rom-capacity-detail isn't rendered yet (no ROM
   built yet), stretching them tall. Buttons should only ever size to their
   content here. */
.emulator-drawer-inner .v-btn {
  flex: 0 0 auto !important;
}

/* Everything from the "Total Variables"/"System reserved" summary lines down
   through the per-bank breakdown is ONE scrollable region now (previously
   only .rom-capacity-detail, the per-bank breakdown, scrolled by itself -
   once the System reserved/Required by blocks/User defined lists above it
   grew past a project's available drawer height, THEY had nowhere to shrink
   (flex-shrink: 0, sized to content), so the overflow spilled out of
   .emulator-drawer-inner entirely and the WHOLE drawer started scrolling
   instead, a real reported regression). The "bytes free" line and its
   progress bar (.rom-capacity/.rom-capacity-bar) stay OUTSIDE this, as their
   fixed (flex-shrink: 0) siblings, same as the emulator/buttons above
   them - always visible, never pushed off by a long variable/bank list.
   flex: 1 (with the drawer content column above) lets this grow to fill
   whatever room those fixed elements don't use, instead of staying a fixed
   height, with its scrollbar (min-height: 0 is required for a flex
   child to be allowed to shrink below its content size and actually scroll
   instead of overflowing the drawer). Every child inside it (rom-capacity-
   summary/-variables/-detail) is plain in-flow content, not itself a flex
   item, so no flex-shrink is needed. */
.rom-capacity-log {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.rom-capacity {
  text-align: center;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  margin-top: 6px;
  padding: 0 8px;
  flex-shrink: 0;
}

.rom-capacity-low {
  opacity: 1;
  color: rgb(244, 67, 54);
  font-weight: bold;
}

.rom-capacity-bar {
  margin: 4px 8px 8px;
  width: auto;
  flex-shrink: 0;
}

.rom-capacity-summary {
  font-size: 0.75em;
  opacity: 0.6;
  text-align: left;
  margin: 2px 0 0;
  padding: 0 8px;
  user-select: text;
}

/* The "Variables:" summary line's  per-slot breakdown - same sizing as
   .rom-capacity-summary just above (it reads as a continuation of that line,
   not a new section), indented like .rom-capacity-bank-contents' list
   items so each "letter: name" pair reads as a sub-item of the summary. */
.rom-capacity-variables {
  font-size: 0.75em;
  opacity: 0.6;
  text-align: left;
  margin: 2px 0 0;
  padding: 0 8px;
  user-select: text;
}

.rom-capacity-variables > div {
  padding-left: 1em;
  white-space: pre-wrap;
}

.rom-capacity-detail {
  font-size: 0.75em;
  opacity: 0.6;
  text-align: left;
  margin: 6px 0 0;
  padding: 0 8px;
  user-select: text;
}

.rom-capacity-bank {
  margin-bottom: 6px;
}

.rom-capacity-bank-header {
  white-space: pre-wrap;
}

.rom-capacity-bank-contents {
  padding-left: 1em;
  opacity: 0.85;
}

.rom-capacity-bank-contents > div {
  white-space: pre-wrap;
}

/* position: fixed pins this to the viewport bottom so it can't scroll away
   with page content. This previously covered every tab's floating "+"
   button (Background, Player0/1, Sound, Music, Data - all use Vuetify's
   "absolute right fab" pattern with no z-index) since a fab
   with no explicit z-index loses the stacking fight against this footer's
   z-index: 10. Fixed for real this time, rather than reverting again, by
   giving those fabs their explicit z-index above this footer's (see
   the .v-btn--absolute.v-btn--fab rule below) instead of just removing the
   fixed positioning that was the actual point of this rule. */
.error-message {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  /* Matches the darkened .v-sheet--outlined card border color (see its
     comment) rather than Vuetify's default rgba(0, 0, 0, 0.12). */
  border-top: 1px solid rgba(0, 0, 0, 0.24);
}

.theme--light.v-footer.error-message {
  color: rgb(244, 67, 54);
}

/* The actual scroll container - moved here from .error-message itself
   (which used to have overflow-y: scroll directly) so .error-resize-handle
   (a sibling of this, not a descendant) never scrolls along with the log
   content: .error-resize-handle's position: absolute is anchored to
   .error-message, which is also where a scrollbar's scroll OFFSET used to
   be tracked - a still-scrolling ancestor drags an absolutely-positioned
   child's rendered position along with it exactly like any other content,
   confirmed directly as why the handle became unreachable (scrolled out
   of view along with the log text) once there was enough log content to
   scroll at all.
   Absolutely positioned (inset: 0 within .error-message's
   position: relative, its top-8px left free for the resize handle's
   strip) rather than sized through flexbox (a v-footer's row-direction
   flex layout makes height the CROSS axis, which turned out to still let
   this grow to fit its content instead of actually clipping to the
   footer's fixed height even with align-self: stretch + flex +
   min-height: 0 all set - confirmed directly: scrollHeight kept exactly
   matching clientHeight, i.e. never actually overflowing/scrolling
   internally at all, which spilled the overflow out into the page's
   document flow instead, making the WHOLE PAGE scroll to reveal it - this
   sidesteps that flexbox cross-axis sizing question entirely with a hard,
   unambiguous 0/0/0/0 inset instead of a size that has to be derived. */
/* overflow-y: auto (not "scroll") - "scroll" unconditionally reserves a
   scrollbar track even when the log has too few lines to actually need
   one, which renders as an inert, un-draggable scrollbar (no real content
   to scroll to) flush against the browser's right edge, confirmed as
   a real, confusing bug by itself (looked like something was broken,
   since dragging it did nothing) rather than an intentional "always show
   the gutter to avoid layout shift" choice - nothing in this rule's
   history documented that as the reason "scroll" was used here. */
.error-scroll-wrapper {
  position: absolute;
  top: 8px;
  left: 0;
  right: 0;
  bottom: 0;
  overflow-y: auto;
}

/* v-footer's  default is a row-direction flex container (fine for a
   single <pre>, wrong once this holds many stacked lines) - column instead,
   with no gap, so spacing between lines comes only from
   .compile-log-line's tight line-height below. */
.error-console-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 8px;
}

/* Every browser's UA stylesheet sets <pre> { font-family: monospace } by
   default - never explicitly overridden here before, so errorStorage's
   <pre> (the error banner's plain-text body) has always silently rendered
   in a different font than the .compile-log-line entries above it (plain
   <div>s, which inherit the app's regular font normally) - confirmed
   directly as a real, pre-existing mismatch, not something introduced this
   session. Unified here rather than on the <pre> element itself so a
   future addition to this panel doesn't need to remember to repeat it. */
.error-console-content pre {
  font-family: inherit;
}

/* Live progress feed for the build pipeline (see hooks/rom.js's buildRom())
   - overrides the footer's blanket red (meant for errorStorage's actual
   error banner just below it) back to ordinary text color for anything that
   isn't itself an error-level entry. margin: 0 and a tight line-height keep
   many lines from spreading out - the default paragraph-like spacing looked
   like a blank line between every single message. */
.compile-log-line {
  white-space: pre-wrap;
  margin: 0;
  line-height: 1.3;
  padding-left: 8px;
}

.compile-log-info {
  color: rgba(0, 0, 0, 0.87);
}

.compile-log-error {
  color: rgb(244, 67, 54);
  font-weight: bold;
}

/* showError's optional highlightHtml (see utils/build-error.js) - rendered
   right after the plain-text error banner, in the same red that banner
   already inherits from .theme--light.v-footer.error-message. Deliberately
   NOT bold itself (only whichever inline <b> tags the HTML content brings
   with it are) - this div previously set font-weight: bold on the whole
   paragraph, which made the intended "just this phrase" <b> inside it
   render even heavier ("bolder" relative to an already-bold parent) while
   the surrounding plain sentence wrongly looked bold too - confirmed
   directly as a real reported "everything looks bold, and the bytes text
   looks extra bold" bug. padding-left matches .compile-log-line's, so this
   lines up with the log text above it instead of sitting flush left. */
.error-banner-highlight {
  padding-left: 8px;
  padding-top: 4px;
}


.error-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  /* Straddles the footer's  top edge (-5px to +5px) rather than sitting
     entirely inside it - a plain 6px strip fully inside the panel was too
     easy to miss by a pixel and land on the error text right below it
     instead, starting a text selection instead of a resize drag. */
  top: -5px;
  height: 10px;
  cursor: ns-resize;
  z-index: 2;
}

.error-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}

/* Matches .emulator-resize-handle's  grip bar above - same rest/hover
   grey, just rotated for this handle's horizontal drag axis. */
.error-resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background-color: #bdbdbd;
}

.error-resize-handle:hover::after {
  background-color: #757575;
}

/* White-based, not the plain black-based rgba() every rest-state rule above
   uses - a real reported bug ("the console log top handle and border is
   disappearing"): unlike .emulator-resize-handle (which sits over a
   background that never gets specially darkened, so the same black-based
   rgba() stays visible under both Dark Mode and Subdued Palette with no
   override needed), .error-message's background gets explicitly forced
   much darker under both (see its rules elsewhere in this file) -
   black-based "darken for contrast against a light surface" rgba() reads
   as invisible once that surface is dark/black itself. Flipped to the same
   rest/hover/grip values the black-based version uses, just inverted to
   white, so this handle reads exactly as visibly as .emulator-resize-handle's
   does, regardless of which of the two is actually on. The emulator pane's
   handle takes the very same values (rest, hover and grip), so the two match
   in Dark Mode (with or without Subdued Palette). With Subdued Palette alone the
   surfaces stay light grey, so the black-based rest-state values above apply. */
.dark-mode .error-resize-handle:hover,
.dark-mode .emulator-resize-handle:hover,
.dark-mode .sidebar-resize-handle:hover {
  background-color: rgba(255, 255, 255, 0.15);
}

.dark-mode .error-resize-handle::after,
.dark-mode .emulator-resize-handle::after,
.dark-mode .sidebar-resize-handle::after {
  background-color: #606060;
}

.dark-mode .error-resize-handle:hover::after,
.dark-mode .emulator-resize-handle:hover::after,
.dark-mode .sidebar-resize-handle:hover::after {
  background-color: #a8a8a8;
}
</style>
