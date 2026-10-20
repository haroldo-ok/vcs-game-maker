<template>
  <div>
    <v-card flat class="editor-container" :ripple="false" @click="deselectCard">
      <v-card-title>Title (alpha 0.75)</v-card-title>
      <v-alert type="warning" dense outlined :icon="false" class="alpha-notice">
        This feature is in alpha. Things may change or break. You've been warned!
      </v-alert>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message titlescreen-intro-paragraph">
          Compose a title screen from stacked image strips (top to bottom). 48x1 images are
          single-color, half-height pixels (the sharpest option); 48x2/96x2 support a color per
          row at normal proportions. Show it with a "Draw title screen" block (Actions tab),
          called in a loop for as long as you want it up.
        </p>
        <p class="v-messages theme--light v-messages__message titlescreen-intro-paragraph">
          All pages share one bank of ROM: keep the total stacked height under about 85 rows of
          48x2/96x2 images, or 170 rows of 48x1 images, across every page combined - each card
          adds a little overhead too, so stay comfortably under that.
        </p>

        <graphic-editor-toolbar class="tight-under-intro" :active-editor="effectiveFrameEditor" @height-hotkey="handleSetHeightHotkey">
          <template v-slot:before-tools>
            <editor-zoom v-model="zoom" :levels="titlescreenZoomLevels" />
            <pixel-grid-toggle v-model="showPixelGrid" />
          </template>
          <template v-slot:after-tools>
            <div class="text-center">
              <v-dialog
                v-model="heightMenuVisible"
                width="480"
              >
                <template v-slot:activator="{ on, attrs }">
                  <v-btn
                    text
                    small
                    class="unified-toolbar-height-btn"
                    title="Set height (H)"
                    :disabled="!selectedGraphicCard"
                    v-bind="attrs"
                    v-on="on"
                    @click="openHeightMenu"
                  >
                    <v-icon>mdi-human-male-height-variant</v-icon>
                  </v-btn>
                </template>

                <v-card>
                  <v-list>
                    <v-list-item>
                      <v-list-item-content>
                        <v-list-item-title>Set height for every frame on this card</v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>

                  <v-divider></v-divider>

                  <v-list>
                    <v-list-item>
                      <v-list-item-action>

                        <v-slider
                          v-model="heightMenuValue"
                          :min="1"
                          :max="64"
                          label="Height"
                          class="align-center"
                          style="width: 400px"
                        >
                          <template v-slot:append>
                            <v-text-field
                              v-model="heightMenuValue"
                              class="mt-0 pt-0"
                              type="number"
                              style="width: 60px"
                            ></v-text-field>
                          </template>
                        </v-slider>

                      </v-list-item-action>
                    </v-list-item>
                  </v-list>

                  <div class="unified-toolbar-scale-checkbox">
                    <v-checkbox
                      v-model="heightMenuScaleContents"
                      label="Scale existing contents (nearest neighbor)"
                      hide-details
                      dense
                    />
                  </div>

                  <v-card-actions>
                    <v-spacer></v-spacer>

                    <v-btn
                      text
                      @click="heightMenuVisible = false"
                    >
                      Cancel
                    </v-btn>
                    <v-btn
                      color="primary"
                      text
                      @click="handleUnifiedSetHeight()"
                    >
                      Set height
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
            </div>
          </template>
          <template v-slot:extra-tools>
            <v-menu
              top
              :close-on-content-click="false"
              v-model="asepriteImportMenuOpen"
            >
              <template v-slot:activator="{ on, attrs }">
                <v-btn
                  icon
                  small
                  title="Import from Aseprite (sprite strip + .json) into the selected card"
                  :disabled="!selectedGraphicCard"
                  v-bind="attrs"
                  v-on="on"
                >
                  <v-icon>mdi-file-import-outline</v-icon>
                </v-btn>
              </template>

              <v-card>
                <v-card-text class="import-frames-menu import-aseprite-menu">
                  <v-btn
                    color="primary"
                    block
                    @click="() => { asepriteImportMenuOpen = false; handleImportAsepriteCardFrames(); }"
                  >
                    Choose .json + image&hellip;
                  </v-btn>
                  <v-switch
                    v-model="replaceFramesOnImport"
                    label="Replace frames"
                    hide-details
                  />
                  <v-switch
                    v-model="keepColorsOnImport"
                    label="Keep row and box colors"
                    :disabled="!replaceFramesOnImport"
                    hide-details
                  />
                </v-card-text>
              </v-card>
            </v-menu>
            <v-divider class="get-inner-divider" vertical />
            <v-btn
              icon
              small
              title="Export the selected title screen to a .vcstitle file"
              :disabled="!exportableScreen"
              @click="handleExportTitleScreen"
            >
              <v-icon :size="16">mdi-application-export</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Import a title screen from a .vcstitle file (added as a new title screen)"
              :disabled="!exportableScreen"
              @click="handleImportTitleScreen"
            >
              <v-icon :size="16">mdi-application-import</v-icon>
            </v-btn>
          </template>
          <template v-slot:below-tools>
            <quick-color-palette v-model="selectedQuickColor" :active-editor="effectiveFrameEditor" />
          </template>
        </graphic-editor-toolbar>

        <v-list class="titlescreen-list">
          <v-list-item
            class="entry-list-item"
            v-for="(screen, screenIndex) in state.screens"
            v-bind:key="screen.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="titlescreen-screen-card"
                :class="[screenDragCardClass(screenIndex), {'titlescreen-screen-card-selected': selectedScreenIds.includes(screen.id)}]"
                v-on="screenDragTargetListeners(screenIndex)"
                @click.stop="selectScreen(screen.id, $event)"
              >
                <div
                  class="titlescreen-drag-handle"
                  title="Drag to reorder"
                  v-bind="screenDragAttrs(screenIndex)"
                  v-on="screenDragHandleListeners(screenIndex)"
                />
                <v-list-item-title class="titlescreen-header-title">
                  <v-btn
                    :title="isScreenCollapsed(screen) ? 'Expand this title screen' : 'Collapse this title screen'"
                    icon
                    small
                    absolute
                    top
                    left
                    class="titlescreen-collapse-btn"
                    @click="() => toggleScreenCollapsed(screen)"
                  >
                    <v-icon>{{ isScreenCollapsed(screen) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                  </v-btn>
                  <div class="titlescreen-id-badge">ID:{{ screen.id }}</div>

                  <div class="titlescreen-screen-title-row">
                    <v-text-field
                      class="titlescreen-screen-name-field"
                      label="Page name"
                      v-model="screen.name"
                      @change="handleChildChange"
                    />

                    <color-swatch-picker
                      :value="screen.backgroundColor || 0"
                      :allow-clear="false"
                      square
                      title="Click to set this title screen page's background color"
                      @input="(byte) => handleSetBackgroundColor(screen, byte)"
                    />
                    <span class="titlescreen-bg-color-label">Background color</span>
                  </div>

                  <div class="titlescreen-corner-toolbar">
                    <v-btn
                      :title="canDuplicateScreen(screen) ? 'Duplicate this title screen, with all its cards' :
                        'Duplicate this title screen (not enough copies of its card kinds are left)'"
                      icon
                      small
                      class="import-icon-btn titlescreen-icon-btn-size"
                      :disabled="!canDuplicateScreen(screen)"
                      @click.stop="() => handleDuplicateScreen(screen)"
                    >
                      <v-icon>mdi-content-duplicate</v-icon>
                    </v-btn>
                    <confirm-delete-menu
                      v-if="state.screens.length > 1"
                      :title="screenSelection.deleteQuestion(screen.id, 'title screen', 1)"
                      :selected="screenSelection.isDeleteTarget(screen.id, selectedScreenId)"
                      :activator-title="screenSelection.deleteQuestion(screen.id, 'title screen', 1).replace('?', '')"
                      icon-btn-class="titlescreen-icon-btn-size"
                      @confirm="handleDeleteScreen(screen)"
                    />
                    <v-btn
                      :title="testingScreenId === screen.id ? 'Building...' :
                        buildInProgress ? 'Another build is already running - try again once it finishes' :
                        'Test this title screen in the emulator'"
                      icon
                      small
                      :disabled="buildInProgress && testingScreenId !== screen.id"
                      :loading="testingScreenId === screen.id"
                      class="titlescreen-play-btn titlescreen-icon-btn-size"
                      @click.stop="() => handleTestTitleScreen(screen)"
                    >
                      <v-icon>mdi-play</v-icon>
                    </v-btn>
                  </div>
                </v-list-item-title>

                <div v-if="!isScreenCollapsed(screen)" class="titlescreen-screen-body">
                  <v-list class="titlescreen-card-list">
                    <v-list-item
                      class="entry-list-item"
                      v-for="(card, index) in screen.cards"
                      v-bind:key="card.id"
                    >
                      <v-list-item-content>
                        <v-card
                          outlined
                          :ripple="false"
                          class="titlescreen-card"
                          :class="[cardDragCardClass(screen, index), {'titlescreen-card-selected': isCardSelected(screen, card)}]"
                          v-on="cardDragTargetListeners(screen, index)"
                          @click.stop="selectCard(card.id, screen.id, $event)"
                        >
                          <div
                            class="titlescreen-drag-handle"
                            title="Drag to reorder"
                            v-bind="cardDragAttrs(screen, index)"
                            v-on="cardDragHandleListeners(screen, index)"
                          />
                          <v-list-item-title class="titlescreen-header-title">
                            <v-btn
                              :title="isCollapsed(cardCollapseKey(screen, card)) ? 'Expand this card' : 'Collapse this card'"
                              icon
                              small
                              absolute
                              top
                              left
                              class="titlescreen-collapse-btn"
                              @click="() => toggleCollapsed(cardCollapseKey(screen, card))"
                            >
                              <v-icon>{{ isCollapsed(cardCollapseKey(screen, card)) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                            </v-btn>
                            <div class="titlescreen-id-badge">ID:{{ card.id }} &middot; {{ cardTypeLabel(card) }}</div>

                            <div class="titlescreen-corner-toolbar">
                              <v-menu
                                  v-if="card.frames"
                                  top
                                  :close-on-content-click="false"
                                  :value="importMenuOpenCardRef === `${screen.id}:${card.id}`"
                                  @input="(open) => { if (!open) importMenuOpenCardRef = null; }"
                                >
                                <template v-slot:activator="{ attrs }">
                                  <v-btn
                                    title="Import card frames from image files"
                                    icon
                                    small
                                    class="import-icon-btn titlescreen-icon-btn-size"
                                    v-bind="attrs"
                                    @click="importMenuOpenCardRef = `${screen.id}:${card.id}`"
                                  >
                                    <v-icon>mdi-image-multiple</v-icon>
                                  </v-btn>
                                </template>

                                <v-card>
                                  <v-card-text class="import-frames-menu">
                                    <v-btn
                                      color="primary"
                                      block
                                      @click="() => { importMenuOpenCardRef = null; handleImportCardFrames(card); }"
                                    >
                                      Choose images&hellip;
                                    </v-btn>
                                    <v-switch
                                      v-model="replaceFramesOnImport"
                                      label="Replace frames"
                                      hide-details
                                    />
                                    <v-switch
                                      v-model="keepColorsOnImport"
                                      label="Keep row and box colors"
                                      :disabled="!replaceFramesOnImport"
                                      hide-details
                                    />
                                  </v-card-text>
                                </v-card>
                              </v-menu>

                              <v-btn
                                :title="canAddCardType(card.type) ? 'Duplicate this card' :
                                  'Duplicate this card (no copies of this kind of card are left)'"
                                icon
                                small
                                class="import-icon-btn titlescreen-icon-btn-size"
                                :disabled="!canAddCardType(card.type)"
                                @click.stop="() => handleDuplicateCard(screen, card)"
                              >
                                <v-icon>mdi-content-duplicate</v-icon>
                              </v-btn>

                              <confirm-delete-menu
                                :title="cardDeleteQuestion(screen, card)"
                                :selected="card.id === selectedCardId && isCardSelected(screen, card)"
                                :select-priority="1"
                                :activator-title="cardDeleteQuestion(screen, card).replace('?', '')"
                                icon-btn-class="titlescreen-icon-btn-size"
                                @confirm="handleDeleteCard(screen, card)"
                              />
                            </div>
                          </v-list-item-title>

                          <div v-if="!isCollapsed(cardCollapseKey(screen, card))" class="titlescreen-card-body">
                            <template v-if="card.type === 'space'">
                              <v-text-field
                                label="Blank scanlines"
                                v-model.number="card.lines"
                                type="number"
                                min="1"
                                hide-details
                                @change="handleChildChange"
                              />
                            </template>

                            <template v-else-if="card.type === 'score'">
                              <p class="v-messages theme--light v-messages__message titlescreen-player-hint">
                                Shows the game's score (6 digits), using the same font currently selected
                                on the Score tab and colored via the Score category's "Score set color to"
                                block (Actions tab) - nothing to configure here. The Options tab's "Show
                                remaining CPU cycles as the score" has no effect here - it only overlays the
                                standard game kernel's score drawing, which a title screen never calls.
                              </p>
                            </template>

                            <template v-else-if="card.type === 'player'">
                              <div class="titlescreen-player-row">
                                <v-select
                                  label="Player 0 animation"
                                  :items="playerAnimationOptions()"
                                  v-model="card.player0Animation"
                                  hide-details
                                  class="titlescreen-player-select"
                                  @change="handleChildChange"
                                />
                                <playfield-color-strip
                                  class="titlescreen-player-color"
                                  :value="[card.player0Color || 0]"
                                  :quickColors="quickColorPalette"
                                  :activeQuickColor="selectedQuickColor"
                                  @input="(colors) => handleSetPlayerColor(card, 'player0Color', colors[0])"
                                />
                                <span class="titlescreen-player-color-label">Fallback color</span>
                              </div>
                              <div class="titlescreen-player-row">
                                <v-select
                                  label="Player 1 animation"
                                  :items="playerAnimationOptions()"
                                  v-model="card.player1Animation"
                                  hide-details
                                  class="titlescreen-player-select"
                                  @change="handleChildChange"
                                />
                                <playfield-color-strip
                                  class="titlescreen-player-color"
                                  :value="[card.player1Color || 0]"
                                  :quickColors="quickColorPalette"
                                  :activeQuickColor="selectedQuickColor"
                                  @input="(colors) => handleSetPlayerColor(card, 'player1Color', colors[0])"
                                />
                                <span class="titlescreen-player-color-label">Fallback color</span>
                              </div>
                              <p class="v-messages theme--light v-messages__message titlescreen-player-hint">
                                "Fallback color" is only used when the chosen animation doesn't have its
                                per-row sprite colors (Options tab). Position with the normal "Player 0/1 set
                                X/Y" blocks, and pick a starting frame with "Set title screen player sprite
                                frame to" (Actions tab).
                              </p>
                              <div class="titlescreen-player-row">
                                <v-text-field
                                  label="Window height"
                                  title="How tall the whole player minikernel's draw region is, in scanlines - independent of either player's sprite height."
                                  v-model.number="card.windowHeight"
                                  type="number"
                                  min="1"
                                  hide-details
                                  class="titlescreen-player-window-field"
                                  @change="handleChildChange"
                                />
                                <v-select
                                  label="Scanlines per pixel row"
                                  title="1 = half-height pixels (sharper), 2 = roughly square pixels."
                                  :items="[{text: '1 (sharper)', value: 1}, {text: '2 (square pixels)', value: 2}]"
                                  v-model.number="card.kernelLines"
                                  hide-details
                                  class="titlescreen-player-window-field"
                                  @change="handleChildChange"
                                />
                              </div>
                            </template>

                            <template v-else>
                              <p v-if="card.frames.length > 1" class="v-messages theme--light v-messages__message titlescreen-player-hint">
                                Plays back automatically (each frame's Duration is in real frame ticks,
                                same as a Player sprite animation) - no trigger block needed.
                              </p>
                              <v-text-field
                                class="titlescreen-scroll-window-field"
                                label="Window height (0 = no scrolling)"
                                title="How many rows show at once - leave at 0 (or at/above one frame's full height) to show the whole current frame with no scrolling. Once set smaller, use the Set title screen scroll position block (Actions tab) to scroll within whichever frame is currently showing."
                                v-model.number="card.scrollWindow"
                                type="number"
                                min="0"
                                :max="cardFrameHeight(card)"
                                hide-details
                                @change="handleChildChange"
                              />
                              <v-switch
                                v-if="card.frames.length > 1"
                                v-model="card.playOnce"
                                label="Play animation once"
                                title="Off: the animation loops. On: it plays through once and stays on its last frame (Set title screen graphic frame blocks can still change it)."
                                hide-details
                                class="titlescreen-play-once-switch"
                                @change="handleChildChange"
                              />
                              <div class="titlescreen-frame-list">
                                <div
                                  v-for="(frame, frameIndex) in card.frames"
                                  :key="frame.id"
                                  class="pixel-editor-parent-container"
                                  :class="frameDrag(screen, card).dragCardClass(frameIndex)"
                                  v-on="frameDrag(screen, card).dragTargetListeners(frameIndex)"
                                >
                                  <div
                                    class="pixel-editor-container"
                                    :draggable="armedFrameKey === frameKey(card, frame)"
                                    v-on="frameHandleListeners(screen, card, frameIndex)"
                                    @mousedown="(event) => armFrameDrag(event, card, frame)"
                                    @mouseup="armedFrameKey = null"
                                    :class="{
                                      'pixel-editor-container-active': frameHighlightState(screen, card, frame) === 'blue',
                                      'pixel-editor-container-active-grey': frameHighlightState(screen, card, frame) === 'grey',
                                    }"
                                    :style="{width: editorWidth(card), maxWidth: editorWidth(card)}"
                                  >
                                    <v-text-field
                                      v-if="card.frames.length > 1"
                                      label="Duration"
                                      v-model.number="frame.duration"
                                      hide-details
                                      type="number"
                                      min="1"
                                      step="1"
                                      @change="() => handleFrameDurationChange(frame)"
                                    />
                                    <pixel-editor
                                      :ref="pixelEditorRefKey(screen, card, frame)"
                                      :width="cardWidth(card)"
                                      :height="frame.pixels.length || 1"
                                      :aspectRatio="cardAspectRatio(card, frame.pixels.length)"
                                      v-model="frame.pixels"
                                      :fgColor="editorFgColor(card)"
                                      :rowColors="editorRowColors(card, frame)"
                                      :columnBackdrop="cardBackdrop(screen, card, frame)"
                                      :showClearButton="true"
                                      :showGrid="showPixelGrid"
                                      :name="`titlescreen-${screen.id}-${card.id}`"
                                      :hideToolbar="true"
                                      @input="() => handleFramePixelsInput(card, frame)"
                                      @resize="() => handleFramePixelsInput(card, frame)"
                                      @clear="() => handleClearCardColors(card)"
                                      @clear-colors="() => handleClearCardColors(card)"
                                      @move-rows="(move) => handleMoveRows(card, frame, move)"
                                      @activate="(editorInstance) => setActiveFrame(editorInstance, card.id, frame.id, screen.id)"
                                    >
                                      <template v-if="cardHasRowColors(card)" v-slot:sidebar>
                                        <playfield-color-strip
                                          :value="frame.rowColors"
                                          :quickColors="quickColorPalette"
                                          :activeQuickColor="selectedQuickColor"
                                          @input="(colors) => handleRowColorsInput(frame, colors)"
                                        />
                                      </template>
                                      <template v-else v-slot:sidebar>
                                        <playfield-color-strip
                                          :value="[card.color || 0]"
                                          :quickColors="quickColorPalette"
                                          :activeQuickColor="selectedQuickColor"
                                          @input="(colors) => handleSetCardColor(card, colors[0])"
                                        />
                                      </template>
                                      <template v-if="cardWidth(card) === 48" v-slot:below-sidebar>
                                        <playfield-color-strip
                                          class="titlescreen-frame-box-color"
                                          :value="[frameBoxColor(screen, card, frame)]"
                                          :quickColors="quickColorPalette"
                                          :activeQuickColor="selectedQuickColor"
                                          @input="(colors) => handleSetFrameBoxColor(screen, card, frame, colors[0])"
                                        />
                                      </template>
                                      <template v-if="cardWidth(card) === 48" v-slot:below>
                                        <div class="titlescreen-frame-box-cells">
                                          <button
                                            v-for="cell in frameBoxCells(screen, card, frame)"
                                            :key="cell.index"
                                            type="button"
                                            class="titlescreen-frame-box-cell"
                                            :style="{backgroundColor: cell.color}"
                                            :title="`${cell.on ? 'Drawn in the picture background color' : 'Drawn in the page color'} - click to switch`"
                                            @click="() => handleToggleFrameBoxCell(screen, card, frame, cell)"
                                          />
                                        </div>
                                      </template>
                                      <template v-slot:toolbar-end>
                                        <v-btn
                                          icon
                                          small
                                          title="Copy this frame's image (and row colors, if any)"
                                          class="titlescreen-icon-btn-size"
                                          @click="() => handleCopyFrame(frame)"
                                        >
                                          <v-icon>mdi-content-copy</v-icon>
                                        </v-btn>
                                        <v-btn
                                          icon
                                          small
                                          :disabled="!copiedFrameData"
                                          title="Paste copied image (and row colors, if any) onto this frame"
                                          class="titlescreen-icon-btn-size"
                                          @click="() => handlePasteFrame(card, frame)"
                                        >
                                          <v-icon>mdi-content-paste</v-icon>
                                        </v-btn>
                                      </template>
                                      <template v-slot:badge>
                                        <div class="frame-number-badge">ID:{{ frameIndex + 1 }}</div>
                                        <div class="frame-corner-toolbar">
                                          <v-btn
                                            v-if="cardHasRowColors(card)"
                                            icon
                                            small
                                            title="Copy this frame's row colors only"
                                            class="titlescreen-icon-btn-size copy-paste-color-btn"
                                            @click="() => handleCopyRowColors(frame)"
                                          >
                                            <v-icon>mdi-content-copy</v-icon>
                                            <span class="copy-paste-color-badge">C</span>
                                          </v-btn>
                                          <v-btn
                                            v-if="cardHasRowColors(card)"
                                            icon
                                            small
                                            :disabled="!copiedFrameRowColors"
                                            title="Paste copied row colors only onto this frame"
                                            class="titlescreen-icon-btn-size copy-paste-color-btn"
                                            @click="() => handlePasteRowColors(frame)"
                                          >
                                            <v-icon>mdi-content-paste</v-icon>
                                            <span class="copy-paste-color-badge">C</span>
                                          </v-btn>
                                          <confirm-delete-menu
                                            v-if="card.frames.length > 1"
                                            title="Delete this frame?"
                                            :selected="frameHighlightState(screen, card, frame) === 'blue'"
                                            :select-priority="2"
                                            activator-title="Delete this frame"
                                            icon-btn-class="titlescreen-icon-btn-size"
                                            @confirm="handleDeleteFrame(card, frame)"
                                          />
                                        </div>
                                      </template>
                                    </pixel-editor>
                                  </div>
                                </div>
                                <div class="titlescreen-add-frame-list-item">
                                  <v-btn
                                    class="titlescreen-add-frame-buttom"
                                    color="primary"
                                    title="Add animation frame"
                                    dark
                                    fab
                                    @click="handleAddFrame(card)"
                                  >
                                    <v-icon>mdi-plus</v-icon>
                                  </v-btn>
                                </div>
                              </div>


                              <div v-if="showPictureBackgroundControls && cardWidth(card) === 48" class="titlescreen-box">
                                <div class="titlescreen-box-heading">Picture background</div>
                                <p class="v-messages theme--light v-messages__message titlescreen-player-hint">
                                  Colors the area behind the picture, separately for each frame: the swatch under the
                                  color bar sets its color, and the blocks under the graphic switch the color on (dark)
                                  or off behind the picture. The right half of the screen mirrors the left.
                                </p>
                                <div class="titlescreen-box-row">
                                  <v-btn small text title="Switch on exactly the blocks behind the picture, in every frame" @click="() => handleFitBox(screen, card)">
                                    Fit all frames to picture
                                  </v-btn>
                                  <v-btn small text title="Switch every block off, in every frame" @click="() => handleClearBox(screen, card)">
                                    Clear all frames
                                  </v-btn>
                                </div>
                              </div>
                            </template>
                          </div>
                        </v-card>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>

                  <v-menu top>
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        class="add-titlescreen-card-buttom"
                        color="primary"
                        title="Add a card"
                        small
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon left>mdi-plus</v-icon>
                        Add graphic
                      </v-btn>
                    </template>
                    <v-card>
                      <v-list>
                        <v-list-item
                          v-for="option in addCardOptions"
                          :key="option.type"
                          :disabled="!canAddCardType(option.type)"
                          @click="() => handleAddCard(screen, option.type)"
                        >
                          <v-list-item-title>
                            {{ option.label }}
                            <span v-if="!canAddCardType(option.type)" class="titlescreen-add-limit-note">
                              (max {{ maxCopiesForType(option.type) }} reached)
                            </span>
                          </v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-card>
                  </v-menu>
                </div>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-frame-buttom"
      color="primary"
      title="Add a new title screen page"
      dark
      absolute
      right
      fab
      @click="handleAddScreen"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {recordReorder} from '../hooks/reorder-history';
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {chunk, max} from 'lodash';

import {colorByteToCss} from '../utils/palette';
import {resizePixelMatrixHeight, scaleRowColors, carryOverFrameColors} from '../utils/pixels';
import {rowColorsForMove} from '../utils/row-color-move';
import {saveAs} from 'file-saver';
import {getDateInfix} from '../utils/date';
import {loadImageFromFile, openFileDialog, openFileDialogMultiple, sortImportedAnimationFrameFiles} from '../utils/file';
import {createCroppedResizedCanvas, createResizedCanvas} from '../utils/image';
import {parseAsepriteSheet} from '../utils/aseprite';
import {escapeHtml} from '../utils/build-error';

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import EditorZoom from '../components/EditorZoom.vue';
import GraphicEditorToolbar from '../components/GraphicEditorToolbar.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import QuickColorPalette from '../components/QuickColorPalette.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {recordCardDeletion} from '../hooks/card-delete-undo';
import {useDragReorder} from '../hooks/drag-reorder';
import {insertCardAfter, REMOVED, remapCardReferences, removeCards} from '../utils/card-refs';
import {useCardSelection} from '../hooks/card-selection';
import {recordFieldsChange, recordRowColorsChange} from '../utils/row-color-history';
import {useTitleScreenStorage, useErrorStorage, usePixelGridOverlayStorage,
  usePlayerAnimationsStorage, useColorPaletteStorage} from '../hooks/project';
import {useEditorZoom, ZOOM_LEVELS} from '../hooks/zoom';

// A 96-wide card at 50% (the lowest level every other tab offers) can still
// run wider than the editor column, needing its horizontal scrollbar
// (see .titlescreen-card-body's comment) - 25% added here, scoped to
// just this tab (see useEditorZoom/stepZoom's "levels" param), so a
// wide card can be zoomed out small enough to see the whole thing at once
// without scrolling.
const TITLESCREEN_ZOOM_LEVELS = [0.25, ...ZOOM_LEVELS];
import {buildTitleScreenPreviewRom, useBuildInProgress} from '../hooks/rom';
import {clampFrameDuration} from '../utils/duration';
import {DEFAULT_ROW_COLOR, clearRowColors} from '../blocks/background';
import {TITLE_SCREEN_KERNEL_TYPES, MAX_KERNEL_COPIES_PER_TYPE, MAX_PLAYER_CARDS, MAX_SCORE_CARDS,
  blankTitleScreenPixels, migrateCardFrames, processTitleScreenStorageDefaults, cardFrameHeight,
  titleFrameBox} from '../blocks/titlescreen';
import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {appVersionField} from '../utils/app-version';

// Same "module-scope ref, not per-instance state" reasoning as
// PlayerEditor.vue's copiedFrameData - a copied frame survives
// navigating away from this tab and back (this component is destroyed/
// recreated on navigation - see hooks/collapse.js's comment on that
// lifecycle).
const copiedFrameData = ref(null);
// The same for one frame's row colors alone (the "C" copy/paste pair).
const copiedFrameRowColors = ref(null);

export default defineComponent({
  name: 'TitleScreenEditor',
  components: {ColorSwatchPicker, ConfirmDeleteMenu, EditorZoom, GraphicEditorToolbar, PixelEditor,
    PixelGridToggle, PlayfieldColorStrip, QuickColorPalette},
  setup() {
    const instance = getCurrentInstance();
    const titleScreenStorage = useTitleScreenStorage();
    const zoom = useEditorZoom('titlescreen', undefined, TITLESCREEN_ZOOM_LEVELS);
    const showPixelGrid = usePixelGridOverlayStorage();

    // Read-only here - components/QuickColorPalette.vue (mounted below)
    // owns writing to this same shared storage; this component only needs
    // the list itself, to pass into PlayfieldColorStrip's  quickColors
    // prop (same mechanism as PlayerEditor.vue/BackgroundEditor.vue).
    const colorPaletteStorage = useColorPaletteStorage();
    const quickColorPalette = computed(() => colorPaletteStorage.value || []);

    // Which quick color is currently "armed" for painting a color swatch
    // directly - v-model'd to QuickColorPalette below, and passed into every
    // PlayfieldColorStrip instance's activeQuickColor prop.
    const selectedQuickColor = ref(null);

    const state = computed({
      get() {
        return processTitleScreenStorageDefaults(titleScreenStorage);
      },
      set(newState) {
        titleScreenStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    // A frame lasts at least one video frame, however many are typed in.
    const handleFrameDurationChange = (frame) => {
      frame.duration = clampFrameDuration(frame.duration);
      handleChildChange();
    };

    // Which screen's preview build is currently running, if any - drives
    // the Play button's :loading state (see the template) so it's clear a
    // click actually did something during however long the compile takes,
    // rather than the button just sitting there looking unpressed.
    // buildInProgress (shared with App.vue's "Update ROM" button, and
    // with buildTitleScreenPreviewRom's hard guard) disables every OTHER
    // card's Play button (and this same card's, mid-build) while any build
    // - real or preview - is already running, since running two of either
    // kind concurrently corrupted BOTH builds' output before that guard
    // existed (see buildInProgress's comment in hooks/rom.js).
    const testingScreenId = ref(null);
    const buildInProgress = useBuildInProgress();
    const handleTestTitleScreen = async (screen) => {
      if (buildInProgress.value) return;
      testingScreenId.value = screen.id;
      try {
        await buildTitleScreenPreviewRom(screen.id);
      } finally {
        testingScreenId.value = null;
      }
    };

    const getMaxId = (entries) => max(entries.map(({id}) => id)) || 0;

    const handleAddScreen = () => {
      const maxId = getMaxId(state.value.screens);
      const newScreen = {id: maxId + 1, name: `Title Screen ${maxId + 1}`, backgroundColor: 0, cards: []};
      state.value.screens.push(newScreen);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Whether the kernel has enough copies of each kind of card left (it has a fixed number
    // across every screen) for another screen with the same cards.
    const canDuplicateScreen = (screen) => [...new Set(screen.cards.map((card) => card.type))]
        .filter((type) => type !== 'space')
        .every((type) => countOfType(type) + screen.cards.filter((card) => card.type === type).length <=
          maxCopiesForType(type));

    // A copy of a title screen (its name with " copy", background color and every card with its
    // frames) placed right after it, under a new id. Card ids only have to be unique within their
    // screen, so they stay as they are.
    const handleDuplicateScreen = (screen) => {
      if (!canDuplicateScreen(screen)) return;
      const copy = JSON.parse(JSON.stringify(screen));
      copy.name = `${screen.name || 'Title screen'} copy`;
      const idMap = insertCardAfter('titlescreen', state.value.screens, screen, copy);
      if (idMap) screensRenumbered(idMap);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteScreen = (screen) => {
      if (state.value.screens.length <= 1) return;
      const doomed = screenSelection.idsToDelete(screen.id, 1);
      const {remaining, idMap} = removeCards('titlescreen', state.value.screens, doomed);
      state.value.screens = remaining;
      if (idMap) screensRenumbered(idMap);
      if (doomed.length > 1) screenSelectionRef.value.deselectCard();
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const cardWidth = (card) => (TITLE_SCREEN_KERNEL_TYPES[card.type] || {width: 48}).width;
    // Matches BackgroundEditor.vue's  per-column pixel scale reasoning
    // (a fixed on-screen size per source pixel) - without this, the pixel
    // editor's canvas (see PixelEditor.vue's  aspectRatio/proportion-
    // wrapper trick) stretches to fill whatever width its flex parent
    // happens to have, rendering way oversized/undersized instead of at a
    // consistent, legible scale.
    const TITLESCREEN_PIXEL_SCALE = 14;
    const editorWidth = (card) => `${Math.round(cardWidth(card) * TITLESCREEN_PIXEL_SCALE * zoom.value)}px`;
    // On the emulator's screen a TIA color clock is 160 wide and the picture about 212 lines tall
    // at 4:3, so one source pixel (one clock wide) is about 1.77 times as wide as one scanline is
    // tall. A 48x2/96x2 card's rows are 2 scanlines tall, a 48x1 card's rows 1 scanline, so a pixel
    // is 1.77 / (scanlines per row) as wide as it is tall: a bit narrower than square for x2 cards,
    // wider than square for 48x1.
    const CLOCK_TO_SCANLINE_RATIO = 4 / 3 * 212 / 160;
    const cardAspectRatio = (card, rowCount) => {
      const isDoubleLine = !!(TITLE_SCREEN_KERNEL_TYPES[card.type] || {}).doubleLine;
      const ratio = cardWidth(card) / (rowCount || 1);
      return ratio * CLOCK_TO_SCANLINE_RATIO / (isDoubleLine ? 2 : 1);
    };
    const cardHasRowColors = (card) => !!(TITLE_SCREEN_KERNEL_TYPES[card.type] || {}).hasRowColors;
    const cardTypeLabel = (card) => {
      if (card.type === 'space') return 'Space';
      if (card.type === 'player') return 'Player sprites';
      if (card.type === 'score') return 'Score';
      return card.type;
    };

    // Same reasoning as BackgroundEditor.vue's  editorRowColors - without
    // this, PixelEditor.vue's  canvas always draws "on" pixels in the
    // single fgColor regardless of a card's  row colors, which only ever
    // showed up in the sidebar strip, never the actual drawing preview
    // (confirmed as a real, reported bug). A pure black row ($00) is nudged
    // to near-black so the editor still counts those pixels as "on" rather
    // than reading them as the black background.
    const editorRowColors = (card, frame) => {
      if (!cardHasRowColors(card) || !frame.rowColors) return null;
      return frame.rowColors.map((byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      });
    };

    // A 48x1 card (no row colors) has its  single fixed color
    // (card.color) instead - PixelEditor.vue only ever falls back to its
    // fgColor prop when rowColors is null (see its "(this.rowColors
    // && this.rowColors[y]) || this.fgColor"), which this used to hardcode
    // to plain white regardless of card.color - a real reported bug (48x1
    // cards never previewed their  picked color, always drawing white).
    // Irrelevant for a row-color card (editorRowColors above always wins
    // there), but still needs SOME value - white matches the old hardcoded
    // default for that case. Same black-nudge as editorRowColors above, for
    // the same reason.
    const editorFgColor = (card) => {
      if (cardHasRowColors(card)) return '#ffffff';
      const css = colorByteToCss(card.color || 0);
      return css === '#000000' ? '#010101' : css;
    };

    const addCardOptions = [
      {type: '48x1', label: '48x1 image (single color, half-height pixels)'},
      {type: '48x2', label: '48x2 image (per-row color, square pixels)'},
      {type: '96x2', label: '96x2 image (per-row color, wider, more ROM)'},
      {type: 'player', label: 'Player sprites (existing Player 0/1 animations)'},
      {type: 'score', label: 'Score (the game\'s score)'},
      {type: 'space', label: 'Space (blank gap)'},
    ];

    // The kernel ships exactly MAX_KERNEL_COPIES_PER_TYPE pre-built copies of
    // each bitmap type (see public/bb19/titlescreen/*_kernel.asm) - "space"
    // has no such limit, it's just a plain WSYNC loop. That pool is shared
    // across EVERY title screen page in the project (see
    // generators/bbasic/titlescreen.js's  assignKernelSlots), not one
    // pool per page, so this counts cards on every page, not just the one
    // currently being edited. "player"/"score" have their, much smaller
    // limits (MAX_PLAYER_CARDS/MAX_SCORE_CARDS - see their  comments in
    // blocks/titlescreen.js) since there's only ever one of each minikernel
    // project-wide, not a numbered pool of 8.
    const countOfType = (type) => state.value.screens
        .reduce((total, screen) => total + screen.cards.filter((card) => card.type === type).length, 0);
    const maxCopiesForType = (type) => type === 'player' ? MAX_PLAYER_CARDS :
      type === 'score' ? MAX_SCORE_CARDS : MAX_KERNEL_COPIES_PER_TYPE;
    const canAddCardType = (type) => type === 'space' || countOfType(type) < maxCopiesForType(type);
    const maxCopies = MAX_KERNEL_COPIES_PER_TYPE;

    const handleAddCard = (screen, type) => {
      if (!canAddCardType(type)) return;
      const maxId = getMaxId(screen.cards);
      const newCard = (() => {
        if (type === 'space') return {id: maxId + 1, type, lines: 10};
        if (type === 'score') return {id: maxId + 1, type};
        if (type === 'player') {
          return {
            id: maxId + 1, type,
            windowHeight: 50, kernelLines: 1,
            player0Animation: '', player1Animation: '',
            player0Color: 0x0e, player1Color: 0x0e,
          };
        }
        const pixels = blankTitleScreenPixels(TITLE_SCREEN_KERNEL_TYPES[type].width);
        return {
          id: maxId + 1,
          type,
          color: 0x0f,
          frames: [{
            id: 1,
            duration: 10,
            pixels,
            rowColors: TITLE_SCREEN_KERNEL_TYPES[type].hasRowColors ?
              pixels.map(() => DEFAULT_ROW_COLOR) : undefined,
          }],
        };
      })();
      screen.cards.push(newCard);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Animation dropdown options for a "player" card's  Player 0/1
    // fields - both dropdowns share the same pool of animations now (see
    // hooks/project.js's usePlayerAnimationsStorage), same "index into the
    // pool, storage read fresh every call" convention as blocks/sprites.js's
    // buildAnimationOptions (see its  comment), so a renamed/added
    // animation shows up here without a reload. An empty option lets a card
    // draw just one of the two players, falling back to a single blank row
    // for the other (see resolvePlayerSlotFrames in generators/bbasic/
    // titlescreen.js).
    const playerAnimationOptions = () => {
      const player = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage());
      return [
        {text: 'None', value: ''},
        ...player.animations.map((animation, index) =>
          ({text: animation.name || `Unnamed ${index + 1}`, value: `${index}`})),
      ];
    };

    // A copy of a card (every frame, with its pixels, row colors and durations) placed right after
    // it, under a new id that is unique within the screen. The kernel has a fixed number of
    // copies of each kind of card, so it is only offered while one is left.
    const handleDuplicateCard = (screen, card) => {
      if (!canAddCardType(card.type)) return;
      const copy = JSON.parse(JSON.stringify(card));
      const idMap = insertCardAfter('titlecard', screen.cards, card, copy, {screenId: screen.id});
      if (idMap) cardsRenumbered(screen, idMap);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // With several cards of a page selected, deleting one of them deletes them all.
    const cardIdsToDelete = (screen, card) =>
      (screen.id === selectedCardScreenId.value ? cardSelection.idsToDelete(card.id) : [card.id]);
    const cardDeleteQuestion = (screen, card) => {
      const count = cardIdsToDelete(screen, card).length;
      return count > 1 ? `Delete these ${count} cards?` : 'Delete this card?';
    };
    const handleDeleteCard = (screen, card) => {
      const doomed = cardIdsToDelete(screen, card);
      const original = screen.cards.slice();
      const oldIds = new Map(original.map((each) => [each, each.id]));
      const {remaining, idMap} = removeCards('titlecard', screen.cards, doomed, {screenId: screen.id});
      screen.cards = remaining;
      if (idMap) cardsRenumbered(screen, idMap);
      if (doomed.length > 1) cardSelection.deselectCard();
      handleChildChange();
      instance.proxy.$forceUpdate();
      // Lets the shared graphics toolbar's Undo button (see hooks/card-delete-undo.js) bring the cards back at the same places, with
      // the numbers they had: the blocks that name the ones that stayed follow them back (a block that named a deleted card was set
      // to nothing, and stays so).
      recordCardDeletion(() => {
        const back = new Map(remaining.map((each) => [each.id, oldIds.get(each)]));
        remapCardReferences('titlecard', back, {screenId: screen.id});
        original.forEach((each) => {
          each.id = oldIds.get(each);
        });
        screen.cards = original;
        cardsRenumbered(screen, back);
        handleChildChange();
        instance.proxy.$forceUpdate();
      });
    };

    const handleSetBackgroundColor = (screen, color) => {
      screen.backgroundColor = color;
      handleChildChange();
    };

    // The box behind a 48-wide picture (the kernel's per-image background color and PF1/PF2
    // playfield bytes): each playfield block that is on is drawn in the box color, the rest of the
    // row in the page's color. Left to right the 16 blocks the kernel controls are PF1's eight
    // (bit 7 first) and PF2's eight (bit 0 first), mirrored on the right half; the picture
    // covers the last six, and the two PF2 blocks before them lie just outside it.
    // The "Picture background" section under the frames (its text and its "Fit all frames to picture" and "Clear all
    // frames" buttons) is switched off for now; the swatch and blocks under each graphic stay.
    const showPictureBackgroundControls = false;
    const pageColorOf = (screen) => Number(screen.backgroundColor) || 0;
    const frameBoxColor = (screen, card, frame) => titleFrameBox(card, frame, pageColorOf(screen)).background;
    // The 12 blocks behind the 48-pixel picture, left to right: PF2 bits 2-7 for the left half, then the same
    // six mirrored for the right half. Blocks that mirror each other switch together.
    const boxBitOfColumnBlock = (index) => 2 + (index < 6 ? index : 11 - index);
    const frameBoxCells = (screen, card, frame) => {
      const box = titleFrameBox(card, frame, pageColorOf(screen));
      const css = colorByteToCss(box.background);
      const page = colorByteToCss(pageColorOf(screen));
      return Array.from({length: 12}, (_, index) => {
        const on = !!((box.pf2 >> boxBitOfColumnBlock(index)) & 1);
        return {index, on, bit: boxBitOfColumnBlock(index), color: on ? css : page};
      });
    };
    // Writes all of a frame's picture background values, so it no longer follows the graphic's.
    // What changes the colors and boxes of a graphic without a history is recorded for undo and redo (see
    // recordFieldsChange); the key makes the changes of one thing that follow each other quickly one step.
    const saveAndRedraw = () => {
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const changeKeys = new WeakMap();
    const changeKeyOf = (owner, name) => {
      if (!changeKeys.has(owner)) changeKeys.set(owner, {});
      const keys = changeKeys.get(owner);
      if (!keys[name]) keys[name] = {};
      return keys[name];
    };
    const setFrameBox = (screen, card, frame, changes) => {
      recordFieldsChange([{owner: frame, fields: ['pf1', 'pf2', 'background']}], () => {
        const box = {...titleFrameBox(card, frame, pageColorOf(screen)), ...changes};
        frame.pf1 = box.pf1;
        frame.pf2 = box.pf2;
        frame.background = box.background;
        saveAndRedraw();
      }, {key: changes.background !== undefined ? changeKeyOf(frame, 'box') : undefined, afterChange: saveAndRedraw});
    };
    const handleSetFrameBoxColor = (screen, card, frame, color) => setFrameBox(screen, card, frame, {background: color});
    const handleToggleFrameBoxCell = (screen, card, frame, cell) => {
      const box = titleFrameBox(card, frame, pageColorOf(screen));
      setFrameBox(screen, card, frame, {pf2: (box.pf2 ^ (1 << cell.bit)) & 0xff});
    };
    // What shows where the picture is off, per column: the page's background color, or the picture
    // background color where the block is switched on.
    const cardBackdrop = (screen, card, frame) => {
      const width = cardWidth(card);
      const page = colorByteToCss(pageColorOf(screen));
      if (width !== 48) return new Array(width).fill(page);
      const cells = frameBoxCells(screen, card, frame);
      return Array.from({length: width}, (_, column) => {
        // The blocks run left to right under the picture, 4 pixels each.
        return cells[Math.floor(column / 4)].color;
      });
    };
    const setAllFramesBox = (screen, card, pf2) => {
      recordFieldsChange([
        {owner: card, fields: ['pf1', 'pf2']},
        ...card.frames.map((frame) => ({owner: frame, fields: ['pf1', 'pf2', 'background']})),
      ], () => {
        card.pf1 = 0;
        card.pf2 = pf2;
        card.frames.forEach((frame) => {
          frame.pf1 = 0;
          frame.pf2 = pf2;
          if (frame.background === undefined || frame.background === null) {
            frame.background = titleFrameBox(card, frame, pageColorOf(screen)).background;
          }
        });
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };
    const handleFitBox = (screen, card) => setAllFramesBox(screen, card, 0xfc);
    const handleClearBox = (screen, card) => setAllFramesBox(screen, card, 0);

    const handleSetCardColor = (card, color) => {
      recordFieldsChange([{owner: card, fields: ['color']}], () => {
        card.color = color;
        handleChildChange();
      }, {key: changeKeyOf(card, 'color'), afterChange: saveAndRedraw});
    };
    // The color of the Player 0 or Player 1 sprite of a Player card.
    const handleSetPlayerColor = (card, field, color) => {
      recordFieldsChange([{owner: card, fields: [field]}], () => {
        card[field] = color;
        handleChildChange();
      }, {key: changeKeyOf(card, field), afterChange: saveAndRedraw});
    };

    // Clearing a card's  graphic (PixelEditor.vue's "clear" event,
    // separate from an ordinary pixel edit) resets its  color field(s)
    // back to the same default handleAddCard itself starts a new card at,
    // rather than leaving old picks behind on an otherwise blank card.
    // rowColors is per-FRAME now (see cardFrameHeight's comment in
    // blocks/titlescreen.js), so this resets every one of the card's
    // frames, not just the one whose "clear" button was actually clicked -
    // matches "clear" resetting the WHOLE card's look, not just one frame's
    // pixels, which is already what it does for the pixel data itself
    // (PixelEditor.vue's "clear" event only ever touches that one
    // v-model, i.e. just that one frame's pixels - this only covers color).
    const handleClearCardColors = (card) => {
      recordFieldsChange([
        {owner: card, fields: ['color', 'background']},
        ...card.frames.map((frame) => ({owner: frame, fields: ['rowColors', 'background']})),
      ], () => {
        if (cardHasRowColors(card)) {
          card.frames.forEach((frame) => {
            frame.rowColors = clearRowColors(frame.rowColors);
          });
        } else {
          card.color = 0x0f;
        }
        // The picture background colors go back to the page's color (the blocks that are on stay on).
        if (cardWidth(card) === 48) {
          delete card.background;
          card.frames.forEach((frame) => {
            delete frame.background;
          });
          instance.proxy.$forceUpdate();
        }
        handleChildChange();
      }, {afterChange: saveAndRedraw});
    };

    // Keeps a frame's rowColors in sync with its  current height
    // whenever the pixel editor's  height changes (drawing taller/
    // shorter, resizing, importing a differently-sized image) - same
    // pad-or-truncate-without-clobbering-existing-picks reasoning as
    // PlayerEditor.vue's  ensureRowColors.
    const ensureRowColors = (card, frame) => {
      if (!cardHasRowColors(card)) return;
      const rows = frame.pixels.length || 1;
      const existing = frame.rowColors || [];
      if (existing.length === rows) return;
      const next = existing.slice(0, rows);
      while (next.length < rows) next.push(DEFAULT_ROW_COLOR);
      frame.rowColors = next;
    };

    const handleFramePixelsInput = (card, frame) => {
      ensureRowColors(card, frame);
      handleChildChange();
    };

    const setRowColors = (frame, colors) => {
      frame.rowColors = colors;
      handleChildChange();
    };
    // A change made by the user (the color strip, Clear, Paste) can be undone; moving selected
    // pixels takes the row colors along through the pixel editor's history instead.
    const handleRowColorsInput = (frame, colors) => {
      recordRowColorsChange(frame, setRowColors, colors);
    };

    // Moving selected pixels with the Move tool takes the colors of their rows along
    // (PixelEditor.vue's 'move-rows' event - see utils/row-color-move.js).

    const handleMoveRows = (card, frame, move) => {
      if (!cardHasRowColors(card)) return;
      const colors = rowColorsForMove(frame, move);
      if (colors) setRowColors(frame, colors);
    };

    // Same shape as PlayerEditor.vue's handleAddFrame - prefills the new
    // frame with the previous frame's graphic (a copy, so editing it doesn't
    // change the frame it came from), falling back to a blank card-width
    // grid when this is the card's very first extra frame.
    const handleAddFrame = (card) => {
      const frames = card.frames;
      const maxId = getMaxId(frames);
      // With a frame selected in this graphic, the new frame is a copy of that one (duration included),
      // placed right after it; otherwise it copies the last frame and goes at the end.
      const cardScreen = findScreenForCard(card);
      const selectedIndex = cardScreen ? frames.findIndex((frame) => isFrameActive(cardScreen, card, frame)) : -1;
      const previousFrame = selectedIndex >= 0 ? frames[selectedIndex] : frames[frames.length - 1];
      const pixels = previousFrame ?
        structuredClone(previousFrame.pixels) :
        blankTitleScreenPixels(cardWidth(card));
      const newFrame = {
        id: maxId + 1,
        duration: selectedIndex >= 0 ? previousFrame.duration : 10,
        pixels,
        ...(previousFrame && previousFrame.rowColors ?
          {rowColors: structuredClone(previousFrame.rowColors)} : {}),
        // The picture background box (blocks and color) too.
        ...Object.fromEntries(['pf1', 'pf2', 'background']
            .filter((field) => previousFrame && previousFrame[field] !== undefined)
            .map((field) => [field, previousFrame[field]])),
      };
      if (selectedIndex >= 0) frames.splice(selectedIndex + 1, 0, newFrame);
      else frames.push(newFrame);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Whether "Import card frames" replaces this card's existing frames
    // instead of appending after them - one shared toggle (not per-card),
    // read fresh at click time by handleImportCardFrames below, same
    // "module-scope-style shared preference" reasoning as PlayerEditor.vue's
    // the shared replaceFramesOnImport toggle: there's only ever one import happening at a
    // time, so a single shared toggle is simpler than tracking it per card.
    const replaceFramesOnImport = ref(false);
    // With "Replace frames" on, whether the new frames keep the row colors and picture background box of the
    // frames they replace.
    const keepColorsOnImport = ref(false);

    // Which card's "Import card frames" popover is currently open, by
    // "screenId:cardId" ref (null when none is) - same reasoning as
    // PlayerEditor.vue's  importMenuOpenAnimationId: drives the menu's
    // its :value/@input explicitly so "Choose images..." can close it right
    // as the OS file picker takes over, instead of leaving it open (and now
    // stale) behind that native dialog.
    const importMenuOpenCardRef = ref(null);

    // The actual canvas-pixels-to-card-frame-matrix conversion, factored out
    // of imageToCardFramePixels below so handleImportAsepriteCardFrames's
    // per-frame cropped canvases (see createCroppedResizedCanvas) can reuse
    // the exact same on/off threshold instead of duplicating it.
    const canvasToCardFramePixels = (canvas, width) => {
      const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const imgPixels = imageData.data;
      const pixelValues = [];
      for (let i = 0, n = imgPixels.length; i < n; i += 4) {
        const r = imgPixels[i];
        const g = imgPixels[i + 1];
        const b = imgPixels[i + 2];
        pixelValues.push((r + g + b) / 3);
      }
      return chunk(pixelValues.map((v) => v > 32 ? 1 : 0), width);
    };

    // Converts one loaded image into a bitmap card's frame pixel format -
    // width fixed to this card's kernel width (48 or 96, see cardWidth),
    // height auto-sized to the image's resolution (clamped 1-64, same
    // range/rounding PixelEditor.vue's single-image import and
    // PlayerEditor.vue's batch import both already use).
    const imageToCardFramePixels = (img, width) => {
      const targetHeight = Math.min(64, Math.max(1, Math.round(img.height)));
      const canvas = createResizedCanvas(img, width, targetHeight);
      return canvasToCardFramePixels(canvas, width);
    };

    // Imports several image files at once as new card frames, in one shot -
    // one image per frame, ordered by sortImportedAnimationFrameFiles
    // (numbered filenames first, else selection order) - same mechanism as
    // PlayerEditor.vue's handleImportAnimationFrames, applied to a
    // title screen bitmap card's frames instead of a sprite animation's.
    // replaceFramesOnImport decides whether these land alongside the card's
    // existing frames or replace them outright, read fresh here (not
    // captured earlier), matching every other live toggle in this app.
    const handleImportCardFrames = (card) => {
      openFileDialogMultiple('image/*').then((files) => {
        if (!files.length) return;
        const orderedFiles = sortImportedAnimationFrameFiles(files);
        const width = cardWidth(card);
        return Promise.all(orderedFiles.map((file) =>
          loadImageFromFile(file).then((img) => imageToCardFramePixels(img, width))))
            .then((pixelMatrices) => {
              const keptFrames = replaceFramesOnImport.value ? [] : card.frames;
              let nextId = getMaxId(keptFrames) + 1;
              const newFrames = pixelMatrices.map((pixels) => ({
                id: nextId++,
                duration: 10,
                pixels,
                ...(cardHasRowColors(card) ? {rowColors: pixels.map(() => DEFAULT_ROW_COLOR)} : {}),
              }));
              card.frames = [...keptFrames,
                ...(replaceFramesOnImport.value && keepColorsOnImport.value ?
                  carryOverFrameColors(card.frames, newFrames) : newFrames)];
              handleChildChange();
              instance.proxy.$forceUpdate();
            });
      });
    };

    // The title screen the toolbar's export and import buttons work with: the selected one (they are greyed out with none selected).
    const exportableScreen = computed(() => state.value.screens.find(({id}) => id === selectedScreenId.value) || null);

    // Saves a title screen (its name, background color and every card with its frames) as a
    // .vcstitle file. The id is left out: an imported screen gets a new one in the project it
    // lands in.
    const handleExportTitleScreen = () => {
      const screen = exportableScreen.value;
      if (!screen) return;
      // eslint-disable-next-line no-unused-vars
      const {id, ...screenData} = screen;
      const blob = new Blob([JSON.stringify({type: 'VCS Game Maker Title Screen', ...appVersionField(), screen: screenData}, null, 2)],
          {type: 'application/json'});
      const filename = (screen.name || `title-screen-${screen.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `Title_${filename}-${getDateInfix()}.vcstitle`);
    };

    // Adds the title screen in a .vcstitle file as a new screen at the end of the list. The
    // kernel has a fixed number of each kind of card across every screen, so a file with more
    // cards than are left is refused with a message instead of producing a project that
    // cannot build.
    const handleImportTitleScreen = () => {
      openFileDialog('.vcstitle,.json').then((file) => file.text()).then((text) => {
        const data = JSON.parse(text);
        const source = data && (data.screen || (Array.isArray(data.screens) && data.screens[0]));
        if (!source || !Array.isArray(source.cards)) {
          throw new Error('the file does not contain a title screen');
        }
        const known = ['space', 'score', 'player', ...Object.keys(TITLE_SCREEN_KERNEL_TYPES)];
        const cards = source.cards.map(migrateCardFrames);
        const unknown = cards.find((card) => !known.includes(card.type));
        if (unknown) throw new Error(`it has a card of an unknown kind (${escapeHtml(String(unknown.type))})`);
        const name = source.name || 'Imported title screen';
        // A title screen with the same name is replaced (it keeps its place and its number, so the blocks that name it still
        // find it), and the cards of that page no longer count against the kinds the project has room for.
        const replaced = state.value.screens.find((screen) => screen.name === name);
        const replacedCount = (type) => (replaced ? (replaced.cards || []).filter((card) => card.type === type).length : 0);
        const kinds = [...new Set(cards.map((card) => card.type))].filter((type) => type !== 'space');
        const over = kinds.find((type) =>
          countOfType(type) - replacedCount(type) + cards.filter((card) => card.type === type).length > maxCopiesForType(type));
        if (over) {
          throw new Error(`there are not enough "${over}" cards left in the project for the ${
            cards.filter((card) => card.type === over).length} it has`);
        }
        if (replaced) {
          replaced.backgroundColor = Number(source.backgroundColor) || 0;
          replaced.cards = cards;
        } else {
          state.value.screens.push({
            id: getMaxId(state.value.screens) + 1,
            name,
            backgroundColor: Number(source.backgroundColor) || 0,
            cards,
          });
        }
        handleChildChange();
        instance.proxy.$forceUpdate();
      }).catch((e) => {
        if (e && e.message === 'No file selected') return;
        errorStorage.value = `Import title screen: ${e && e.message ? e.message : e}.`;
      });
    };

    // Whether "Import from Aseprite" popover is currently open - tab-level
    // (not per-card like importMenuOpenCardRef above), since this button
    // lives in the shared toolbar (see GraphicEditorToolbar.vue's
    // "extra-tools" slot) and always acts on selectedGraphicCard, the same
    // card the toolbar's "Set height" button already targets.
    const asepriteImportMenuOpen = ref(false);

    const errorStorage = useErrorStorage();

    const readFileAsText = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });

    // Imports an Aseprite "Export Sprite Sheet" .json plus its sprite strip
    // image into the currently selected card's frames - unlike
    // PlayerEditor.vue's Aseprite import (one new ANIMATION per
    // frameTag), a title screen card has no name a frameTag could match
    // against, so this only supports a single animation: the .json's one
    // frameTag (or, with no tags at all, every frame in the sheet, in
    // order). More than one frameTag is rejected with an error instead of
    // silently guessing which one the user meant.
    const handleImportAsepriteCardFrames = () => {
      const card = selectedGraphicCard.value;
      if (!card) return;
      openFileDialogMultiple('.json,image/*').then((files) => {
        if (!files.length) return;
        const jsonFile = files.find((file) => file.name.toLowerCase().endsWith('.json'));
        if (!jsonFile) {
          errorStorage.value = 'Import from Aseprite: select both the sprite sheet\'s .json file and its image.';
          return;
        }
        const imageFiles = files.filter((file) => file !== jsonFile);

        readFileAsText(jsonFile).then((text) => {
          let sheet;
          try {
            sheet = parseAsepriteSheet(JSON.parse(text));
          } catch (err) {
            errorStorage.value = `Import from Aseprite: ${escapeHtml(err.message)}.`;
            return;
          }
          if (sheet.tags.length > 1) {
            errorStorage.value = 'Import from Aseprite: the .json has more than one frame tag - ' +
              'title screen cards only support a single animation. Pick a .json with just one tag.';
            return;
          }
          const frameIndexes = sheet.tags.length ?
            sheet.tags[0].frameIndexes : sheet.frames.map((frame, index) => index);

          const imageFile = imageFiles.find((file) => file.name === sheet.imageName) || imageFiles[0];
          if (!imageFile) {
            errorStorage.value = 'Import from Aseprite: couldn\'t find the sprite strip image among the selected files.';
            return;
          }

          loadImageFromFile(imageFile).then((img) => {
            const width = cardWidth(card);
            const keptFrames = replaceFramesOnImport.value ? [] : card.frames;
            let nextId = getMaxId(keptFrames) + 1;
            const newFrames = frameIndexes.map((frameIndex) => {
              const sourceFrame = sheet.frames[frameIndex];
              const targetHeight = Math.min(64, Math.max(1, Math.round(sourceFrame.h)));
              const canvas = createCroppedResizedCanvas(
                  img, sourceFrame.x, sourceFrame.y, sourceFrame.w, sourceFrame.h, width, targetHeight);
              const pixels = canvasToCardFramePixels(canvas, width);
              return {
                id: nextId++,
                duration: sourceFrame.durationFrames,
                pixels,
                ...(cardHasRowColors(card) ? {rowColors: pixels.map(() => DEFAULT_ROW_COLOR)} : {}),
              };
            });
            card.frames = [...keptFrames,
              ...(replaceFramesOnImport.value && keepColorsOnImport.value ?
                carryOverFrameColors(card.frames, newFrames) : newFrames)];
            handleChildChange();
            instance.proxy.$forceUpdate();
          });
        });
      });
    };

    const handleDeleteFrame = (card, frame) => {
      card.frames = card.frames.filter(({id}) => id !== frame.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Copies/pastes a frame's whole row-color list without its image. A list of another length is
    // padded or cut to the target frame's height.
    const handleCopyRowColors = (frame) => {
      copiedFrameRowColors.value = structuredClone(frame.rowColors || []);
    };
    const handlePasteRowColors = (frame) => {
      if (!copiedFrameRowColors.value) return;
      const height = frame.pixels.length;
      const colors = Array.from({length: height}, (_, i) => copiedFrameRowColors.value[i] ?? DEFAULT_ROW_COLOR);
      handleRowColorsInput(frame, colors);
    };

    // "Standard" copy/paste - a frame's whole image, plus its row colors too
    // (unconditionally, unlike PlayerEditor.vue's version, which gates
    // that on a project-wide toggle - there's no equivalent toggle here,
    // hasRowColors is just a fixed property of the card's type).
    // The picture background box (its blocks and its color) belongs to the frame too: set on the frame
    // itself when it was changed from the graphic's, so those values go along.
    const FRAME_BOX_FIELDS = ['pf1', 'pf2', 'background'];
    const handleCopyFrame = (frame) => {
      copiedFrameData.value = {
        pixels: structuredClone(frame.pixels),
        ...(frame.rowColors ? {rowColors: structuredClone(frame.rowColors)} : {}),
        box: Object.fromEntries(FRAME_BOX_FIELDS.filter((field) => frame[field] !== undefined)
            .map((field) => [field, frame[field]])),
      };
    };
    const handlePasteFrame = (card, frame) => {
      if (!copiedFrameData.value) return;
      // Can be undone (see recordFieldsChange): the history of the pixel editor does not see a pasted image.
      recordFieldsChange([{owner: frame, fields: ['pixels', 'rowColors', ...FRAME_BOX_FIELDS]}], () => {
        frame.pixels = structuredClone(copiedFrameData.value.pixels);
        if (cardHasRowColors(card) && copiedFrameData.value.rowColors) {
          frame.rowColors = structuredClone(copiedFrameData.value.rowColors);
        }
        const copiedBox = copiedFrameData.value.box || {};
        FRAME_BOX_FIELDS.forEach((field) => {
          if (copiedBox[field] !== undefined) frame[field] = copiedBox[field];
          else delete frame[field];
        });
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };

    const {isCollapsed: isScreenCollapsed, toggleCollapsed: toggleScreenCollapsed, collapseAll: collapseAllScreens,
      remapIds: remapScreenCollapsedIds} = useCollapsedIds('titlescreen-screens', true);
    collapseAllScreens();

    // Card collapse state is shared across every screen (one storage
    // namespace, same as every other tab), but a card's  id is only
    // unique WITHIN its screen (see handleAddCard's  getMaxId, scoped
    // per screen) - so two different screens' cards can share the same raw
    // id. cardCollapseKey combines both into one id useCollapsedIds can
    // safely key on without those colliding.
    const {isCollapsed: isCollapsedRaw, toggleCollapsed: toggleCollapsedRaw, collapseAll: collapseAllCards,
      remapKeys: remapCardCollapsedKeys} = useCollapsedIds('titlescreen-cards', true);
    collapseAllCards();
    const cardCollapseKey = (screen, card) => ({id: `${screen.id}-${card.id}`});
    const isCollapsed = (key) => isCollapsedRaw(key);
    const toggleCollapsed = (key) => toggleCollapsedRaw(key);

    // The page selection (made further down) in a plain holder, since the drag and delete code above it only run later
    // (not a ref: that would unwrap the refs inside it).
    const screenSelectionRef = {value: null};
    const screenSelection = {
      getSelectedIndices: () => screenSelectionRef.value.getSelectedIndices(),
      deleteQuestion: (...args) => screenSelectionRef.value.deleteQuestion(...args),
      isDeleteTarget: (...args) => screenSelectionRef.value.isDeleteTarget(...args),
      idsToDelete: (...args) => screenSelectionRef.value.idsToDelete(...args),
    };
    // The pages are numbered by their place, and the graphics of a page by theirs within the page (see utils/card-refs.js): after a
    // move, a delete or a copy each keeps what the tab holds by number (collapsed, selected, being edited) under its new number,
    // and the blocks and data table cells that name a page or a graphic follow.
    const keptNumber = (idMap, id) => {
      const next = idMap.has(id) ? idMap.get(id) : id;
      return next === REMOVED ? null : next;
    };
    const screensRenumbered = (idMap) => {
      screenSelectionRef.value.remapIds(idMap);
      remapScreenCollapsedIds(idMap);
      remapCardCollapsedKeys((key) => {
        const [screen, card] = key.split('-').map(Number);
        if (!idMap.has(screen)) return undefined;
        return idMap.get(screen) === REMOVED ? null : `${idMap.get(screen)}-${card}`;
      });
      selectedCardScreenId.value = selectedCardScreenId.value === null ? null : keptNumber(idMap, selectedCardScreenId.value);
      activeScreenId.value = activeScreenId.value === null ? null : keptNumber(idMap, activeScreenId.value);
    };
    const cardsRenumbered = (screen, idMap) => {
      if (screen.id === selectedCardScreenId.value) cardSelection.remapIds(idMap);
      remapCardCollapsedKeys((key) => {
        const [screenId, card] = key.split('-').map(Number);
        if (screenId !== screen.id || !idMap.has(card)) return undefined;
        return idMap.get(card) === REMOVED ? null : `${screenId}-${idMap.get(card)}`;
      });
      if (screen.id === activeScreenId.value && activeCardId.value !== null) {
        activeCardId.value = keptNumber(idMap, activeCardId.value);
      }
    };
    const {dragAttrs: screenDragAttrs, dragCardClass: screenDragCardClass,
      dragHandleListeners: screenDragHandleListeners, dragTargetListeners: screenDragTargetListeners} = useDragReorder(
        () => state.value.screens,
        (items) => {
          state.value.screens = items;
          handleChildChange();
        },
        () => screenSelection.getSelectedIndices(),
        {renumber: {kind: 'titlescreen', onRenumbered: screensRenumbered}},
    );

    // One useDragReorder instance PER SCREEN (each screen's  card list
    // reorders independently) - useDragReorder is a plain factory (see
    // hooks/drag-reorder.js), not a Vue lifecycle hook, so it's safe to call
    // more than once/lazily like this. Cached by screen id so every card in
    // the same screen shares one instance (its  draggedIndex/
    // dragOverIndex refs), rather than creating a fresh, disconnected one
    // per card. Kept by the screen itself, not its number, which changes when the pages are numbered again.
    const cardDragReordersByScreen = new Map();
    const cardDragReorderFor = (screen) => {
      if (!cardDragReordersByScreen.has(screen)) {
        cardDragReordersByScreen.set(screen, useDragReorder(
            () => screen.cards,
            (items) => {
              screen.cards = items;
              handleChildChange();
            },
            () => (screen.id === selectedCardScreenId.value ? cardSelection.getSelectedIndices() : []),
            {renumber: {
              kind: 'titlecard',
              context: () => ({screenId: screen.id}),
              onRenumbered: (idMap) => cardsRenumbered(screen, idMap),
            }},
        ));
      }
      return cardDragReordersByScreen.get(screen);
    };
    const cardDragAttrs = (screen, index) => cardDragReorderFor(screen).dragAttrs(index);
    const cardDragCardClass = (screen, index) => cardDragReorderFor(screen).dragCardClass(index);
    const cardDragHandleListeners = (screen, index) => cardDragReorderFor(screen).dragHandleListeners(index);
    const cardDragTargetListeners = (screen, index) => cardDragReorderFor(screen).dragTargetListeners(index);

    // Frame reordering: one drag-reorder instance per graphic (made on first use), dropping a frame onto
    // another moves it there. Frame ids stay as they are.
    const frameDragByCard = new Map();
    const frameDrag = (screen, card) => {
      // Kept by the graphic itself, not its numbers, which change when the cards are numbered again.
      const cardKey = card;
      if (!frameDragByCard.has(cardKey)) {
        // Looked up again on every drop: the stored state can be rebuilt between renders.
        const currentCard = () => (state.value.screens.find(({id}) => id === screen.id) || screen)
            .cards.find(({id}) => id === card.id) || card;
        frameDragByCard.set(cardKey, useDragReorder(
            () => currentCard().frames,
            (items) => {
              currentCard().frames = items;
              handleChildChange();
            },
        ));
      }
      return frameDragByCard.get(cardKey);
    };
    // Any part of a frame that isn't the drawing, a field or a button starts a drag: the frame only becomes
    // draggable while the mouse is pressed on such a part.
    const FRAME_DRAG_BLOCKED = 'canvas, input, textarea, select, button, a, .v-input, .v-btn, .playfield-color-strip';
    const armedFrameKey = ref(null);
    const frameKey = (card, frame) => `${card.id}:${frame.id}`;
    const armFrameDrag = (event, card, frame) => {
      armedFrameKey.value = event.button === 0 && card.frames.length > 1 && !event.target.closest(FRAME_DRAG_BLOCKED) ?
        frameKey(card, frame) : null;
    };
    const frameHandleListeners = (screen, card, frameIndex) => {
      const listeners = frameDrag(screen, card).dragHandleListeners(frameIndex);
      return {
        dragend: (event) => {
          armedFrameKey.value = null;
          listeners.dragend(event);
        },
        dragstart: (event) => {
          if (!armedFrameKey.value) return;
          listeners.dragstart(event);
          const frameBox = event.currentTarget;
          if (frameBox && event.dataTransfer.setDragImage) {
            const box = frameBox.getBoundingClientRect();
            event.dataTransfer.setDragImage(frameBox, event.clientX - box.left, event.clientY - box.top);
          }
        },
      };
    };

    // Purely a visual "which card am I looking at" marker, plain local
    // component state - same reasoning/shape as every other tab's
    // selectCard/deselectCard (see e.g. MusicEditor.vue's  comment).
    // Screens get their  separate selection (a page and a graphic card
    // are never the same thing to have "selected" at once).
    const selectedCardId = ref(null);
    // Card ids are only unique within their page, so a selected card is its id and its page's id.
    const selectedCardScreenId = ref(null);
    // Shift+click selects a range, Ctrl/Cmd+click adds or removes a card, within one page (see hooks/card-selection.js):
    // deleting or dragging one of several selected cards does it to all of them.
    const cardSelection = useCardSelection(() => {
      const selectedScreen = state.value.screens.find(({id}) => id === selectedCardScreenId.value);
      return selectedScreen ? selectedScreen.cards.map(({id}) => id) : [];
    }, selectedCardId);
    const {selectedCardIds} = cardSelection;
    const isCardSelected = (screen, card) => screen.id === selectedCardScreenId.value && selectedCardIds.value.includes(card.id);
    const selectCard = (id, screenId, event = {}) => {
      // A card of another page starts a new selection.
      if (screenId !== selectedCardScreenId.value) cardSelection.deselectCard();
      selectedCardScreenId.value = screenId;
      cardSelection.selectCard(id, event);
      // Another card's frame no longer counts as the one being edited (its outline goes with it).
      if (activeCardId.value !== id || activeScreenId.value !== screenId) {
        activeFrameEditor.value = null;
        activeCardId.value = null;
        activeFrameId.value = null;
        activeScreenId.value = null;
      }
    };
    const selectedScreenId = ref(null);
    // The pages are selected the same way (Shift+click a range, Ctrl/Cmd+click one).
    screenSelectionRef.value = useCardSelection(() => state.value.screens.map(({id}) => id), selectedScreenId);
    const {selectedCardIds: selectedScreenIds} = screenSelectionRef.value;
    const selectScreen = (id, event = {}) => screenSelectionRef.value.selectCard(id, event);
    const deselectCard = () => {
      cardSelection.deselectCard();
      selectedCardScreenId.value = null;
      screenSelectionRef.value.deselectCard();
    };

    // The graphic card the shared "Set height" tool acts on - keyed off
    // selectedCardId (the card the user is actually looking at, same
    // reasoning as PlayerEditor.vue's selectedAnimation/BackgroundEditor
    // .vue's selectedBackground), not activeFrameEditor (the last
    // editor clicked INTO to draw/undo/etc.). Card ids are only unique
    // WITHIN its screen (see cardCollapseKey's comment above), so
    // this searches every screen the same way the existing "is this card
    // selected" highlight already does (:class="titlescreen-card-selected"
    // above) - same pre-existing id-collision caveat, not something new
    // this introduces. null (and the tool disabled) for a non-bitmap card
    // (player/score/space), which has no frames to resize at all.
    const selectedGraphicCard = computed(() => {
      for (const screen of state.value.screens) {
        if (screen.id !== selectedCardScreenId.value) continue;
        const card = screen.cards.find((c) => c.id === selectedCardId.value);
        if (card) return card.frames ? card : null;
      }
      return null;
    });

    // Tracks whichever frame's PixelEditor instance was last clicked
    // into (see its "activate" event, emitted from PixelEditor.vue's
    // handleActivate) - the single toolbar above (Eraser/Pencil/Undo/Redo/
    // Export/Import) acts on THIS frame, since every card's
    // per-instance toolbar is now hidden (hideToolbar on the pixel-editor
    // above) in favor of this one shared row. Same mechanism as
    // PlayerEditor.vue's activeFrameEditor/setActiveFrame.
    // activeCardId is what effectiveFrameEditor below compares against
    // selectedGraphicCard to decide whether this explicit click still
    // "wins" over the selected card's fallback editor - same
    // id-collision caveat as selectedGraphicCard's search above.
    // activeFrameId (frame ids are only unique WITHIN their card, same
    // reasoning as PlayerEditor.vue's activeFrameId) is what
    // isFrameActive below compares against to draw the "you're editing this
    // one" outline - same feature as PlayerEditor.vue's frame outline,
    // since a Title Screen graphic card can hold more than one frame
    // (animation) too.
    const activeFrameEditor = ref(null);
    const activeCardId = ref(null);
    const activeFrameId = ref(null);
    const activeScreenId = ref(null);
    const setActiveFrame = (editorInstance, cardId, frameId, screenId) => {
      activeFrameEditor.value = editorInstance;
      activeScreenId.value = screenId;
      activeCardId.value = cardId;
      activeFrameId.value = frameId;
    };
    const isFrameActive = (screen, card, frame) =>
      activeScreenId.value === screen.id && activeCardId.value === card.id && activeFrameId.value === frame.id;

    // Same "blue while the frame's card is actually selected, grey once
    // deselected but still what the toolbar acts on" reasoning as
    // PlayerEditor.vue's frameHighlightState.
    const frameHighlightState = (screen, card, frame) => {
      if (!isFrameActive(screen, card, frame)) return null;
      return selectedGraphicCard.value && selectedGraphicCard.value.id === card.id &&
        selectedCardScreenId.value === screen.id ? 'blue' : 'grey';
    };

    // Unique per screen+card+frame (card ids are only unique WITHIN their
    // screen, and frame ids only unique within their card) - used as
    // this frame's PixelEditor.vue $ref name (see the template) so
    // effectiveFrameEditor below can resolve straight to its component
    // instance.
    const pixelEditorRefKey = (screen, card, frame) => `pixelEditor_${screen.id}_${card.id}_${frame.id}`;

    // Which screen a given (already-resolved) graphic card actually belongs
    // to - selectedGraphicCard above only returns the card itself, but
    // pixelEditorRefKey needs the screen too. Reference equality (not an id
    // compare) since card is the exact object selectedGraphicCard found
    // inside state.value.screens, not a copy.
    const findScreenForCard = (card) => state.value.screens.find((screen) => screen.cards.includes(card));

    // What the shared toolbar (Eraser/Pencil/Undo/Redo/Export/Import) above
    // actually acts on - the explicitly-clicked-into frame (activeFrameEditor)
    // when it still belongs to the currently SELECTED graphic card, otherwise
    // the selected card's first frame, resolved via its $ref. Without
    // this fallback, the tools stayed disabled (and no frame was targeted at
    // all) until a graphic was clicked directly - reported as unexpected,
    // since selecting a card (clicking its title/anywhere else in it)
    // already conveys "I'm working on this one" the same way every other
    // per-card tool in this app already treats it. Same reasoning/shape as
    // PlayerEditor.vue's effectiveFrameEditor.
    const effectiveFrameEditor = computed(() => {
      if (activeFrameEditor.value && selectedGraphicCard.value && activeCardId.value === selectedGraphicCard.value.id &&
          activeScreenId.value === selectedCardScreenId.value) {
        return activeFrameEditor.value;
      }
      if (selectedGraphicCard.value && selectedGraphicCard.value.frames.length) {
        const screen = findScreenForCard(selectedGraphicCard.value);
        if (!screen) return null;
        const firstFrame = selectedGraphicCard.value.frames[0];
        const refs = instance.proxy.$refs[pixelEditorRefKey(screen, selectedGraphicCard.value, firstFrame)];
        return Array.isArray(refs) ? refs[0] || null : refs || null;
      }
      return null;
    });

    // Same fields as PixelEditor.vue's height-menu state, now living
    // here instead, since the menu itself moved to this shared toolbar -
    // always resizes every frame on the selected card together, same as
    // PlayerEditor.vue's handleUnifiedSetHeight.
    const heightMenuVisible = ref(false);
    const heightMenuValue = ref(0);
    const heightMenuScaleContents = ref(false);
    const openHeightMenu = () => {
      if (!selectedGraphicCard.value) return;
      heightMenuValue.value = selectedGraphicCard.value.frames[0].pixels.length;
      heightMenuScaleContents.value = false;
    };
    // The "H" hotkey - see PlayerEditor.vue's handleSetHeightHotkey for
    // why this can't just call openHeightMenu alone.
    const handleSetHeightHotkey = () => {
      if (!selectedGraphicCard.value) return;
      openHeightMenu();
      heightMenuVisible.value = true;
    };
    // Set height can be undone: every frame's rows and row colors as they were before and after.
    const heightSnapshot = (card) => structuredClone(card.frames.map(({id, pixels, rowColors}) => ({id, pixels, rowColors})));
    const findCard = (screenId, cardId) => {
      const screen = state.value.screens.find((candidate) => candidate.id === screenId);
      return screen ? screen.cards.find((candidate) => candidate.id === cardId) : undefined;
    };
    const restoreHeight = (screenId, cardId, snapshot) => {
      const current = findCard(screenId, cardId);
      if (!current || !current.frames) return;
      structuredClone(snapshot).forEach((saved) => {
        const frame = current.frames.find((candidate) => candidate.id === saved.id);
        if (!frame) return;
        frame.pixels = saved.pixels;
        frame.rowColors = saved.rowColors;
      });
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const handleUnifiedSetHeight = () => {
      const card = selectedGraphicCard.value;
      if (!card) return;
      heightMenuValue.value = Math.max(1, Math.min(64, heightMenuValue.value || 0));
      const before = heightSnapshot(card);
      card.frames.forEach((frame) => {
        // Scaling the contents scales each row's color along with its pixels.
        if (heightMenuScaleContents.value && frame.rowColors) {
          frame.rowColors = scaleRowColors(frame.rowColors, frame.pixels.length, heightMenuValue.value);
        }
        frame.pixels = resizePixelMatrixHeight(frame.pixels, heightMenuValue.value, cardWidth(card), heightMenuScaleContents.value);
        ensureRowColors(card, frame);
      });
      const after = heightSnapshot(card);
      const [screenId, cardId] = [selectedCardScreenId.value, card.id];
      recordReorder({
        undo: () => restoreHeight(screenId, cardId, before),
        redo: () => restoreHeight(screenId, cardId, after),
        isCurrent: () => !!findCard(screenId, cardId),
      });
      handleChildChange();
      instance.proxy.$forceUpdate();
      heightMenuVisible.value = false;
    };

    return {
      state, handleChildChange, handleFrameDurationChange,
      quickColorPalette, selectedQuickColor,
      handleAddScreen, handleDeleteScreen, handleDuplicateScreen, canDuplicateScreen,
      isScreenCollapsed, toggleScreenCollapsed,
      testingScreenId, buildInProgress, handleTestTitleScreen,
      screenDragAttrs, screenDragCardClass, screenDragHandleListeners, screenDragTargetListeners,
      cardWidth, editorWidth, cardAspectRatio, cardHasRowColors, editorRowColors, editorFgColor, cardTypeLabel,
      addCardOptions, canAddCardType, maxCopies, maxCopiesForType, playerAnimationOptions,
      handleAddCard, handleDeleteCard, handleDuplicateCard,
      showPictureBackgroundControls, frameBoxColor, frameBoxCells, handleSetFrameBoxColor, handleToggleFrameBoxCell, cardBackdrop, handleFitBox,
      handleClearBox,
      exportableScreen, handleExportTitleScreen, handleImportTitleScreen,
      handleSetBackgroundColor, handleSetCardColor, handleSetPlayerColor, handleClearCardColors,
      handleFramePixelsInput, handleRowColorsInput, handleMoveRows, cardFrameHeight,
      handleAddFrame, handleDeleteFrame,
      frameDrag, armedFrameKey, frameKey, armFrameDrag, frameHandleListeners,
      handleImportCardFrames, replaceFramesOnImport, keepColorsOnImport, importMenuOpenCardRef,
      handleImportAsepriteCardFrames, asepriteImportMenuOpen,
      handleCopyFrame, handlePasteFrame, copiedFrameData,
      copiedFrameRowColors, handleCopyRowColors, handlePasteRowColors,
      isCollapsed, toggleCollapsed, cardCollapseKey,
      cardDragAttrs, cardDragCardClass, cardDragHandleListeners, cardDragTargetListeners,
      showPixelGrid, zoom, titlescreenZoomLevels: TITLESCREEN_ZOOM_LEVELS,
      selectedCardId, selectedCardScreenId, selectCard, selectedCardIds, isCardSelected, cardDeleteQuestion,
      selectedScreenId, selectScreen, selectedScreenIds, screenSelection,
      deselectCard,
      selectedGraphicCard, activeFrameEditor, setActiveFrame, isFrameActive, frameHighlightState,
      effectiveFrameEditor, pixelEditorRefKey,
      heightMenuVisible, heightMenuValue, heightMenuScaleContents, openHeightMenu, handleUnifiedSetHeight,
      handleSetHeightHotkey,
    };
  },
});
</script>
<style scoped>
.titlescreen-intro-paragraph {
  margin-bottom: 16px;
}

/* The "Set height" button passed into GraphicEditorToolbar.vue's
   "after-tools" slot - see PlayerEditor.vue's identical rule for why this
   stays here rather than moving into that shared component. */
/* !important on width/min-width - see PlayerEditor.vue's identical rule for
   why (Vuetify's ".v-btn.v-size--small" default otherwise wins). */
.unified-toolbar-height-btn {
  width: auto !important;
  min-width: 0 !important;
  margin-left: -6px !important;
  padding: 0 2px;
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.55);
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Same rest/hover/press treatment as every icon in GraphicEditorToolbar.vue
   itself (its .get-tools >>> .v-btn rules) - this button previously
   fell back to Vuetify's default "text" button hover (a grey background
   overlay, not the flat color-only fade the rest of the toolbar uses),
   reading as a different, out-of-place control sitting right next to them. */
.unified-toolbar-height-btn::before {
  display: none;
}

.unified-toolbar-height-btn:not(.v-btn--disabled):hover {
  color: rgba(0, 0, 0, 0.87) !important;
}

.unified-toolbar-height-btn:not(.v-btn--disabled):active {
  transform: scale(0.92);
}

.unified-toolbar-height-btn >>> .v-icon {
  font-size: 16px;
  transition: color 0.15s ease;
  margin-top: -1px;
}

.unified-toolbar-scale-checkbox {
  margin-top: -30px;
  padding-left: 16px;
}

.titlescreen-list {
  /* Tighter than the 16px this used to be - see PlayerEditor.vue's
     identical .animation-list rule for why: the toolbar row directly above
     already has its top/bottom padding, so the old value on top of
     that read as too much combined space before the first screen card. */
  margin-top: 4px;
}

/* hooks/drag-reorder.js's  CSS_CLASS_DRAGGING/CSS_CLASS_DRAG_OVER -
   applying those classes alone does nothing without the actual visual
   rule for them, which this tab never had (confirmed as a real bug: the
   classes WERE being toggled correctly, just invisible). Same top-border
   convention MusicEditor.vue's identical rule uses (a single vertical
   list, not a multi-column grid needing Text/Background's left/right
   variant). Shared by both the screen list and the nested card list. */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* v-list-item's  default 0 16px padding stacks on top of v-card-text's,
   pushing every card in further on the right than the left - same fix as
   BackgroundEditor.vue's identical rule (see its comment). */
.entry-list-item {
  padding: 0;
}

/* Same fix as DataEditor.vue's  identical rule: without this,
   .v-list-item__content's default overflow: hidden clips a selected card's
   2px outline on its left/right edges (min-width: 0 has to come with
   it - overflow: visible alone silently undoes this flex item's default
   0 min-width, letting it refuse to shrink below its widest content). */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}

/* width: 100% - same fix as BackgroundEditor.vue's/PlayerEditor.vue's
   identical .background-card/.animation-card rule: without it, this card
   (nested inside v-list-item-content, not the list item itself) shrinks to
   its content's natural width instead of filling its row, so a
   collapsed card (just the title row) rendered visibly narrower than an
   expanded one (whose pixel editor forces a wider width). */
/* margin-bottom: 8px matches BackgroundEditor.vue's .background-list
   grid gap (its between-card spacing) - not that same 12px this card
   uses for its internal padding, which is a separate value there too. */
.titlescreen-screen-card,
.titlescreen-card {
  position: relative;
  width: 100%;
  padding: 12px;
  margin-bottom: 8px;
}

/* Only .titlescreen-card needs this: when collapsed, its  body (which
   normally supplies margin-top: 34px to clear the absolutely positioned
   collapse button/ID badge/corner toolbar - see .titlescreen-card-body's
   comment above) isn't rendered at all, so without this the card's box
   shrank shorter than that positioned content needed, and the toolbar/
   badge visually spilled out past its bottom edge. .titlescreen-screen-card
   never has this problem (its title row stays visible even collapsed),
   so it doesn't get this rule - it was making that card too tall. */
.titlescreen-card {
  min-height: 44px;
}

/* A top strip, not a left one - matches BackgroundEditor.vue's
   .background-drag-handle exactly (see its comment): covers the same
   header band the collapse/ID/delete controls occupy, sitting behind them
   in paint order (they're later in the DOM, so they stay clickable) but in
   front of everything else, so dragging elsewhere in the card still
   selects text/drags the pixel editor instead of starting a reorder. */
/* v-list-item-title is a plain, non-positioned block - unlike its
   absolutely-positioned collapse-btn/badge/corner-toolbar children (which
   already paint above .titlescreen-drag-handle by themselves, position:
   absolute vs. static), its EMPTY space still captures pointer events
   across its whole box (a transparent element still blocks clicks to
   whatever's behind it, regardless of background) - confirmed as a real
   bug: dragging never started anywhere except exactly on top of a button.
   pointer-events: none here lets a click/drag in that empty space fall
   through to the drag handle underneath; re-enabling it on every direct
   child keeps those controls (and the title row's input/swatch)
   clickable as normal. */
.titlescreen-header-title {
  pointer-events: none;
}

.titlescreen-header-title > * {
  pointer-events: auto;
}

.titlescreen-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* Matches every other tab's  collapse button placement exactly (see
   BackgroundEditor.vue's .background-collapse-btn/PlayerEditor.vue's
   .animation-collapse-btn) - absolutely positioned in the card's
   top-left corner, not flowed in normal layout. */
.titlescreen-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same placement as PlayerEditor.vue's .animation-name-field - a
   graphic card has no name field (nothing follows here), but a
   Title Screen page does, plus its background color swatch alongside
   it on the same row. margin-top clears the absolutely positioned collapse
   button/ID badge above (see .titlescreen-id-badge/.titlescreen-collapse-
   btn) - the corner toolbar's absolute top-right position never
   collides with it horizontally, same as every other tab's identical
   layout. */
/* margin-bottom: -12px - same fix, same measured ~12px excess, as
   PlayerEditor.vue's .animation-name-field/BackgroundEditor.vue's
   .background-name-field (see their comments) - this row's Page name
   field isn't hide-details either, so Vuetify reserves a hint/error strip
   below it, taller than DataEditor.vue's equivalent card ends up by the
   same amount. */
.titlescreen-screen-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  margin-bottom: -12px;
}

.titlescreen-screen-name-field {
  max-width: 220px;
}

/* PixelEditor.vue's outlined v-card is now the visible "frame" around
   each individual animation frame - same as PlayerEditor.vue's
   Sprites-tab frames (which never stripped this border to begin with; see
   that file for the closest reference). Previously stripped here (matching
   Background's single-graphic cards, which have no per-frame concept at
   all), but that's exactly why the border/outline highlight/delete button
   all read as detached from the actual graphic once a card could hold more
   than one frame - confirmed as a real reported bug ("the frame is wrong",
   "delete button also in the wrong place") once compared side by side with
   the Sprites tab. */

/* Marks which frame the shared toolbar above (Eraser/Pencil/Undo/Redo/
   Export/Import/Set height) currently acts on - same border-color + outline
   treatment as every other tab's "-selected" card highlight (App.vue's
   shared .titlescreen-card-selected/etc. rule), and the same blue/grey
   split as PlayerEditor.vue's identical rules (see frameHighlightState's
   comment). */
.pixel-editor-container-active >>> .v-card {
  border-color: var(--v-primary-base, #1976d2) !important;
  outline: 2px solid var(--v-primary-base, #1976d2) !important;
}

.pixel-editor-container-active-grey >>> .v-card {
  border-color: rgba(0, 0, 0, 0.24) !important;
  outline: 2px solid rgba(0, 0, 0, 0.24) !important;
}

/* Same styling as PlayerEditor.vue's identical .frame-number-badge -
   was missing here entirely (this class name is shared with that file, but
   had no matching rule in THIS file), so it fell back to plain
   unstyled text instead of reading as a small "ID: N" label. */
.frame-number-badge {
  text-align: left;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.75;
  margin-top: -8px;
  /* Extra clearance PlayerEditor.vue's identical badge doesn't need -
     a Sprites frame is tall enough that its canvas naturally starts below
     .frame-corner-toolbar's absolutely-positioned Delete button (top: 8,
     ~24px tall). A Title card's canvas can be far shorter (e.g. a
     single-line 48x1 image), so without this the toolbar visibly overlapped
     the top of the graphic instead of clearing it - confirmed directly via
     measurement (the toolbar's bottom edge landed ~8.66px BELOW the
     canvas's top). */
  margin-bottom: 12px;
}

/* Same reasoning/placement as PlayerEditor.vue's identical
   .frame-corner-toolbar - also missing here entirely, so Delete (and Copy/
   Paste, before those moved to the toolbar-end slot) rendered inline after
   the ID badge instead of floating in the frame's top-right corner. */
.frame-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

/* Same placement/style as every other tab's "ID: N" badge (see
   BackgroundEditor.vue's .background-id-badge). */
.titlescreen-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75em;
  font-family: monospace;
  opacity: 0.6;
}

/* Matches the Text tab's .text-bkcolor-label size (TextEditor.vue) -
   this page's background color now uses the same ColorSwatchPicker dot the
   Text/Score tabs use for their single background color, instead of
   PlayfieldColorStrip's multi-row strip (which is meant for per-ROW
   colors, not a single project/page-wide one - a real reported style
   mismatch). */
.titlescreen-bg-color-label {
  font-size: 1rem;
}

/* The wrapper itself is positioned (not the button inside via Vuetify's
   "absolute" prop) - same as BackgroundEditor.vue's
   .background-corner-toolbar/PlayerEditor.vue's .animation-corner-
   toolbar. Positioning the button directly instead (an earlier version of
   this) put it outside the v-menu activator's wrapper element instead
   of the card - confirmed as a real bug (the button rendered detached from
   the card entirely) - this wrapper avoids that since IT establishes the
   position, not something nested inside the menu's markup. */
.titlescreen-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

/* No drop shadow on floating (absolute-positioned) buttons - collapse,
   delete, add - matching BackgroundEditor.vue's identical rule. */
.v-btn--absolute {
  box-shadow: none !important;
}

/* .titlescreen-icon-btn-size's size/disabled-opacity/icon-font-size
   rules, and .delete-icon-btn.titlescreen-icon-btn-size's mdi-delete
   size bump - see App.vue's shared, unscoped copy (moved there once
   confirmed byte-identical to PlayerEditor.vue's .player-icon-btn-size -
   scoped CSS can't share a rule across components even under the same
   class name, so each tab using it still has to apply it here). */

/* .titlescreen-play-btn's background/shadow/before/rest-hover-color
   rules - see App.vue's shared, unscoped .music-flat-icon-btn copy (moved
   there once confirmed byte-identical to MusicEditor.vue's, see that
   file's comment). The "currently active" persistent tint below stays
   here rather than also moving - its trigger condition (:loading) is
   genuinely different from Music's (an explicit "currently playing" class),
   even though the resulting color declaration is the same. */
.titlescreen-play-btn:active >>> .v-icon,
.titlescreen-play-btn.v-btn--loading >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* Rest/hover/no-filled-circle treatment lives in App.vue's global
   .import-icon-btn rule (shared with PlayerEditor.vue's identical button) -
   only the icon-size bump is per-tab, since titlescreen-icon-btn-size is
   this component's sizing class. Same 21px bump as .delete-icon-btn
   above, so both corner buttons read as the exact same size at a glance. */
.import-icon-btn.titlescreen-icon-btn-size >>> .v-icon {
  font-size: 21px !important;
}

/* Same fixed-width, flex-column popover as PlayerEditor.vue's
   .import-animation-menu (see its comment there for the full reasoning) -
   the "Choose images..."/"Choose .json + image..." button and "Replace..."
   switch read as a small, deliberate control instead of stretching to
   v-menu's default sizing, and flex-column + gap (not a block button's
   width/margin alone) is what guarantees the button lines up flush with
   this element's left/right padding. */
.import-frames-menu {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-frames-menu >>> .v-input--selection-controls {
  margin-top: 0;
}

/* Wider than .import-frames-menu's shared 220px - "Choose .json +
   image..." is longer than "Choose images..." and was getting clipped/
   wrapped at that width. */
.import-aseprite-menu {
  width: 300px;
}

/* Comes right after .titlescreen-screen-title-row, which already clears
   the absolutely positioned collapse button/ID badge above it (see its
   comment) - only needs a little breathing room, not a second
   clearance margin. */
.titlescreen-screen-body {
  margin-top: 8px;
}

/* Unlike a Title Screen page, a graphic card has no name field (or any
   other normal-flow content) between its header and body to clear the
   absolutely positioned collapse button/ID badge/corner toolbar above -
   this margin does that job directly instead (34px clears the corner
   toolbar's delete button, the taller of the two). */
/* overflow-x: auto - unlike BackgroundEditor.vue/PlayerEditor.vue (whose
   CSS grid track width is set to match editorWidth exactly - see their
   comments), this card stays a fixed width: 100% regardless of a
   graphic's type/zoom. A 96-wide card (double a 48-wide one) at zoom
   above ~50% can make .pixel-editor-container's fixed pixel width
   (set inline via editorWidth) exceed THIS element's box - since this
   is the narrower, width-constrained ancestor (not .pixel-editor-container
   itself, whose box is always exactly as wide as its content and so
   never clips anything by itself), this is the right place for the
   scrollbar to actually appear. Without it, that overflow spilled out past
   the card's (and its screen card's, and eventually the whole page's)
   right edge instead of staying contained, a real reported bug. overflow-y
   is explicitly hidden rather than left as the default visible: CSS forces
   one axis's "visible" to compute as "auto" whenever the other axis isn't
   also visible, so leaving this "visible" produced an unwanted vertical
   scrollbar too (confirmed as a real bug) - hidden avoids that forced
   conversion, and is safe since nothing in here is ever taller than its
   content. */
/* padding: 2px - this clipping box's edges land exactly flush against
   the first/last frame's box on every side (nothing reserves space
   around them), so a selected frame's 2px outline (see
   .pixel-editor-container-active's comment) bled past this element's
   overflow-hidden boundary and was clipped away - visible only on the
   FIRST frame of each wrapped row (nothing to its left) and the top/bottom
   rows (nothing above/below), never on a frame with a sibling on that
   side to bleed into instead. Confirmed as a real reported bug ("selection
   border... looks like it's being cut off on the left... the first card in
   every row"). 2px matches the outline width exactly. */
.titlescreen-card-body {
  margin-top: 26px;
  padding: 2px;
  overflow-x: auto;
  overflow-y: hidden;
}

/* With the description text hidden (Expert mode) the first field sits straight under the ID badge: no need for the
   room the hint paragraph leaves there. */
.hide-description-text .titlescreen-card-body {
  margin-top: 16px;
}

.titlescreen-card-list {
  padding-top: 0;
  padding-bottom: 0;
}

.titlescreen-player-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.titlescreen-player-select,
.titlescreen-player-window-field {
  max-width: 260px;
}

.titlescreen-player-color {
  display: inline-flex;
  vertical-align: middle;
  height: 22px !important;
}

.titlescreen-player-color-label {
  font-size: 14px;
}

.titlescreen-player-hint {
  margin-bottom: 8px;
}

.titlescreen-box {
  margin-top: 28px;
}

.titlescreen-box-heading {
  font-size: 14px;
  margin-bottom: 14px;
}

.titlescreen-box-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

/* Under a frame's canvas, in the same style as the row color bar beside it: a swatch under the bar and one
   block per 4 pixels of the picture, lined up with the canvas. */
.titlescreen-frame-box-color {
  height: 22px;
  margin-top: 4px;
}

.titlescreen-frame-box-cells {
  display: flex;
  height: 22px;
  margin-top: 4px;
  border: 1px solid rgba(0, 0, 0, 0.4);
}

.titlescreen-frame-box-cell {
  flex: 1 1 0;
  min-width: 0;
  padding: 0;
  border: none;
  border-right: 1px solid rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.titlescreen-frame-box-cell:last-child {
  border-right: none;
}

.titlescreen-frame-box-cell:hover {
  outline: 2px solid #1976d2;
  outline-offset: -2px;
}

.add-titlescreen-card-buttom {
  margin-top: 8px;
}

/* Same layout as PlayerEditor.vue's animation frame list - each frame
   sits inline-block, side by side, rather than stacking as block-level divs
   would by default, so the "add frame" button below lands to the RIGHT of
   the last frame instead of wrapping underneath it. */
/* Matches PlayerEditor.vue's per-frame spacing exactly (there, this same
   16px gap comes from v-list-item's default right padding, since each
   Sprites frame is a real v-list-item - this one's a plain div, so the same
   value is set directly as margin instead). */
.pixel-editor-parent-container {
  display: inline-block;
  vertical-align: middle;
  margin-right: 16px;
}

/* Same small "C" badge as PlayerEditor.vue's colors-only copy/paste buttons. */
.copy-paste-color-btn {
  position: relative;
}

.copy-paste-color-badge {
  position: absolute;
  bottom: 3px;
  right: -2px;
  font-size: 8px;
  font-weight: bold;
  line-height: 1;
  padding: 0 1px;
  border-radius: 2px;
  background: white;
  color: rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

/* Frames sit side by side, so the drop mark is a bar on the near side of the frame dragged over. */
.pixel-editor-parent-container.drag-reorder-over {
  border-top: none !important;
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.pixel-editor-parent-container.drag-reorder-over.drag-reorder-over-after {
  border-left: none !important;
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Same reasoning/placement as PlayerEditor.vue's .add-frame-list-item -
   sits inline after the last frame, vertically centered against the frame
   cards' height via vertical-align (rather than the list item's default
   flex centering, which only centers within its row). */
.titlescreen-add-frame-list-item {
  display: inline-block;
  vertical-align: middle;
  width: auto;
  margin-top: 16px;
  margin-left: 12px;
}

/* Same circular sizing as PlayerEditor.vue's .add-frame-buttom - a
   distinct class (not shared with this file's "Add a card" FAB button
   below, .add-frame-buttom) since that one also carries an absolute-
   positioned "bottom: 8px" rule meant for its corner placement, not
   relevant here. */
.titlescreen-add-frame-buttom {
  width: 36px;
  height: 36px;
}

/* Same class name/positioning as BackgroundEditor.vue's  identical
   "Add background" button - a floating primary-colored FAB in the bottom-
   right corner, absolutely positioned relative to the outer wrapping div
   (a sibling of .editor-container, not inside its v-card-text). */
.add-frame-buttom {
  bottom: 8px;
}

/* Matches BackgroundEditor.vue's  identical .editor-container rule -
   without this, the card just flows in normal page scroll (this tab never
   had its override, unlike Background's), and .add-frame-buttom above
   (a sibling outside this card, not inside its scroll region) ends up
   anchored to some ancestor that scrolls the page along with it instead of
   staying pinned in place - a real reported bug ("the add button should not
   scroll"). Making THIS card itself the scrolling region (position:
   absolute + overflow: auto, pinned to the full height slot)
   is what lets the button sit outside it and stay fixed regardless of how
   far the card's content scrolls. */
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

.titlescreen-add-limit-note {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
}

.titlescreen-scroll-window-field {
  max-width: 320px;
  margin-top: 0;
  /* Room for the floating label, which is cut off at the top without it (most visible in Expert mode, with the
     description text above hidden). */
  padding-top: 12px;
  margin-bottom: 12px;
}

/* Room on the left for the switch's round highlight, which the card would otherwise clip. */
.titlescreen-play-once-switch {
  margin-top: 0;
  margin-left: 8px;
  padding-top: 0;
  margin-bottom: 12px;
}
</style>
