<template>
  <div>
    <v-card class="editor-container" :ripple="false" :style="{'--sticky-toolbar-offset': `${folderToolbarHeight}px`}"     @click="handleDeselectCards">
      <v-card-title>Playfield</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message background-intro-paragraph">
          Draw full-screen playfield backgrounds here, then set one as the active background
          with a "Background" block (Actions tab). Each pixel is either on or off; if "Enable
          per-row playfield colors (pfcolors)" is turned on (Options tab), each row can have
          its color instead of one fixed color for the whole background.
        </p>

        <!-- The folders are pinned above the toolbar of the graphics (which sticks just under them), as on the Sprite tab. -->
        <div ref="folderToolbar" class="playfield-folder-toolbar tight-under-intro" :class="{'folder-toolbar-pinned': folderToolbarPinned}">
          <card-folder-bar
            :folders="foldersOf()"
            :current="openFolderId()"
            root-label="Playfields"
            noun="playfield"
            :accept="draggingCardIndex !== null"
            @update:current="openFolder"
            @change="refresh"
            @add-folder="handleAddFolder"
            @delete-folder="handleDeleteFolder"
            @drop-cards="handleDropCards"
          />
        </div>

        <graphic-editor-toolbar
          ref="graphicToolbar"
          :active-editor="effectiveEditor"
          :card-columns.sync="cardColumns"
          card-columns-what="backgrounds"
          :stamp-on="tilemapOn ? stampOn : null"
          :stamp-flip="stampFlip"
          :stamp-disabled="!tileSet.tiles.length"
          @update:stampOn="setStampOn"
          @update:stampFlip="setStampFlip"
          @height-hotkey="handleSetHeightHotkey"
        >
          <template v-slot:zoom>
            <editor-zoom v-model="zoom" />
          </template>
          <template v-slot:before-tools>
            <pixel-grid-toggle v-model="showPixelGrid" />
            <pixel-grid-toggle
              v-model="showPixelGridLabels"
              :icon="null"
              label="XY"
              title-on="Hide pixel coordinates (Shift+')"
              title-off="Show pixel coordinates (Shift+')"
              :disabled="!showPixelGrid"
              disabled-title="Turn on the pixel grid to show coordinates"
            />
            <pixel-grid-toggle
              v-if="tilemapOn"
              v-model="showTiles"
              icon="mdi-view-grid-outline"
              label="Tiles"
              title-on="Hide the playfield tiles"
              title-off="Show the playfield tiles: a box round each tile (8 pixels wide, or 4 with 4-pixel tiles) with its number, the number the Set playfield tile block takes"
            />
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
                    :title="heightForTiles ? 'Set the height of all the tiles (H)' : 'Set height (H)'"
                    :disabled="!selectedBackground && !heightForTiles"
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
                        <v-list-item-title>{{ heightForTiles ? 'Set height for all the tiles' : 'Set height for the selected background' }}</v-list-item-title>
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
                          :max="heightForTiles ? MAX_TILE_ROWS : maxBackgroundRows"
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
          <template v-if="pfColorsEnabled || bkColorsEnabled" v-slot:below-tools>
            <quick-color-palette v-model="selectedQuickColor" :active-editor="effectiveEditor" />
          </template>
        </graphic-editor-toolbar>
        <div v-if="tilemapOn" class="tiles-section" :style="{'--tiles-sticky-top': `${folderToolbarHeight + graphicToolbarHeight}px`}">
          <!-- A line above (the toolbar's line is over the Quick colors when they show) and one under, like the Text tab's font editor. -->
          <v-divider v-if="pfColorsEnabled || bkColorsEnabled" class="tiles-divider" />
          <div class="option-section-header" @click="toggleTilesCollapsed(tilesEntry)">
            <v-btn
              icon
              small
              :title="isTilesCollapsed(tilesEntry) ? 'Expand this section' : 'Collapse this section'"
            >
              <v-icon>{{ isTilesCollapsed(tilesEntry) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
            </v-btn>
            <span class="text-subtitle-1">Tiles (beta 0.5)</span>
          </div>
          <div v-if="!isTilesCollapsed(tilesEntry)" class="option-section-content">
            <p class="v-messages theme--light v-messages__message">
              Tiles are 8 pixels wide and numbered in this order for the Set playfield tile block (the tiles the backgrounds have that are not here
              follow them). To place a tile in a background, select the tile, turn on the Stamp tool (after the Pencil) and click the background card.
              A background converted to tiles shows the number of each cell's tile: the Stamp sets a cell's tile, and drawing in a cell
              changes its tile everywhere it is used.
            </p>
            <p v-if="tilesMessage" class="v-messages theme--light v-messages__message tiles-message">{{ tilesMessage }}</p>
            <div class="tiles-controls">
              <!-- The tiles' zoom, apart from the backgrounds' (the toolbar's). Below 100% the tiles are a sheet: no cards, IDs or buttons. -->
              <editor-zoom v-model="tileZoom" :levels="TILE_ZOOM_LEVELS" />
              <!-- The buttons 8 pixels apart, as the emulator panel's Select and Reset. -->
              <div class="tiles-buttons">
              <v-btn small text class="plain-btn" @click="handleAddTile" title="Add a tile">
                <v-icon left small>mdi-plus</v-icon>Add tile
              </v-btn>
              <!-- One step: every different pattern of the backgrounds becomes a tile (a pattern and its mirror image one tile; with no tiles yet
                   at the height that takes the fewest bytes) and the backgrounds are kept as tiles. -->
              <v-btn
                small
                text
                class="plain-btn"
                title="Make tiles of the backgrounds' patterns (one for a pattern and its mirror image) and keep every background as tiles: its pixels then follow its tiles"
                @click="openMakeTiles"
              >
                <v-icon left small>mdi-auto-fix</v-icon>Playfield to tiles
              </v-btn>
              <!-- Playfield to tiles: the size of the tiles first (a width the build can cut a row into, 8, 16 or 32; a height of 1 to 32 rows or
                   the one with the fewest bytes), and whether they take the place of the tiles there are. Keeping them keeps their size. -->
              <v-dialog v-model="makeTilesVisible" width="420">
                <v-card>
                  <v-card-title class="text-subtitle-1">Playfield to tiles</v-card-title>
                  <v-card-text>
                    <div class="make-tiles-fields">
                      <v-select
                        v-model="makeTilesWidth"
                        :items="TILE_WIDTHS.map((value) => ({text: `${value} pixels`, value}))"
                        label="Tile width"
                        :disabled="makeTilesSizeLocked"
                        hide-details
                        dense
                      />
                      <v-select
                        v-model="makeTilesHeight"
                        :items="makeTilesHeightItems"
                        label="Tile height"
                        :disabled="makeTilesSizeLocked"
                        hide-details
                        dense
                      />
                    </div>
                    <v-checkbox
                      v-model="makeTilesReplace"
                      label="Replace existing tiles"
                      :disabled="!tileSet.tiles.length"
                      hide-details
                      dense
                      class="make-tiles-replace"
                    />
                    <v-checkbox
                      v-if="showNarrowTilesOption"
                      v-model="makeTilesNarrow"
                      label="Try 4-pixel tiles"
                      title="Also works out the tiles 4 pixels wide (8 to a row), and makes them so when they take fewer bytes than the tile width above"
                      :disabled="makeTilesSizeLocked"
                      hide-details
                      dense
                      class="make-tiles-narrow"
                    />
                    <p v-if="makeTilesSizeLocked" class="v-messages theme--light v-messages__message make-tiles-hint">
                      The tiles there are keep their size: tick Replace existing tiles to choose another.
                    </p>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="makeTilesVisible = false">Cancel</v-btn>
                    <v-btn text @click="handleMakeTiles">Make tiles</v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
              <v-btn
                v-if="mappedBackgroundCount > 0"
                small
                text
                class="plain-btn"
                title="Keep the backgrounds as pixels again (they look the same)"
                @click="openBackToPixels"
              >
                <v-icon left small>mdi-grid-off</v-icon>Back to pixels
              </v-btn>
              <v-dialog v-model="backToPixelsVisible" width="420">
                <v-card>
                  <v-card-title class="text-subtitle-1">Back to pixels</v-card-title>
                  <v-card-text>
                    The backgrounds are kept as pixels again; they look the same.
                    <v-checkbox
                      v-model="backToPixelsDeleteTiles"
                      label="Delete the tiles"
                      hide-details
                      dense
                      class="make-tiles-replace"
                    />
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="backToPixelsVisible = false">Cancel</v-btn>
                    <v-btn text @click="handleConvertToPixels">Back to pixels</v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
              </div>
            </div>
            <!-- Cards like the backgrounds' below: click to select (Shift for a range, Ctrl to add one), drag the top strip to move them (their
                 numbers follow the order), the corner buttons delete (with the same confirmation), copy and stamp the tile. Zoomed out below 100%
                 they are a tile sheet: the pictures side by side with no cards, IDs or buttons (the number shows when the mouse is over one). -->
            <div class="tiles-row" :class="{'tiles-sheet': tilesSheet}">
              <!-- One card a tile: the pixel editor's, with the ID and the corner buttons in it (as a frame of the Sprite tab). -->
              <div
                v-for="(tile, number) in tileSet.tiles"
                :key="tile.id"
                class="tile-card"
                :class="[tileDragCardClass(number), {'tile-card-selected': selectedTileIds.includes(tile.id)}]"
                :style="tileCardStyle"
                :title="tilesSheet ? `Tile ${number}` : undefined"
                v-on="tileDragTargetListeners(number)"
                @click.stop="handleSelectTile(tile.id, $event)"
              >
                <pixel-editor
                  :key="`${tile.id}-${tileWidthPx}`"
                  :width="tileWidthPx"
                  :height="tileRows"
                  :aspectRatio="tileAspectRatio"
                  :name="`tile ${number}`"
                  :value="tile.pixels"
                  fgColor="orange"
                  :allowChangingHeight="false"
                  :showClearButton="!tilesSheet"
                  :noDrawing="stampOn"
                  :outsideHistory="true"
                  :hideToolbar="true"
                  :showGrid="showPixelGrid && tileZoom >= 0.5"
                  :showCellIds="showPixelGrid && showPixelGridLabels && !tilesSheet"
                  @input="(pixels) => handleTileInput(tile, pixels)"
                  @activate="(editorInstance) => setActiveEditor(editorInstance, `tile-${tile.id}`)"
                >
                  <template v-slot:toolbar-end>
                    <v-btn
                      icon
                      small
                      title="Copy this tile's image"
                      class="player-icon-btn-size"
                      @click="() => handleCopyTile(tile)"
                    >
                      <v-icon>mdi-content-copy</v-icon>
                    </v-btn>
                    <v-btn
                      icon
                      small
                      :disabled="!copiedTilePixels"
                      title="Paste the copied image onto this tile"
                      class="player-icon-btn-size"
                      @click="() => handlePasteTile(tile)"
                    >
                      <v-icon>mdi-content-paste</v-icon>
                    </v-btn>
                  </template>
                  <template v-slot:badge>
                    <template v-if="!tilesSheet">
                    <div
                      class="background-drag-handle"
                      title="Drag to reorder"
                      v-bind="tileDragAttrs(number)"
                      v-on="tileDragHandleListeners(number)"
                    />
                    <div class="tile-id-badge" title="The number of this tile for the Set playfield tile block">ID:{{ number }}</div>
                    <div class="tile-corner-toolbar">
                      <confirm-delete-menu
                        :title="tileDeleteQuestion(tile.id, 'tile')"
                        :selected="tile.id === selectedTileId && selectedTileIds.includes(tile.id)"
                        :activator-title="tileDeleteQuestion(tile.id, 'tile').replace('?', '')"
                        icon-btn-class="player-icon-btn-size"
                        @confirm="handleDeleteTile(tile)"
                      />
                      <v-btn
                        icon
                        small
                        title="Duplicate this tile"
                        class="titlescreen-play-btn player-icon-btn-size"
                        @click.stop="() => handleDuplicateTile(tile)"
                      >
                        <v-icon>mdi-content-duplicate</v-icon>
                      </v-btn>
                    </div>
                    </template>
                  </template>
                </pixel-editor>
              </div>
            </div>
          </div>
          <v-divider class="tiles-divider" />
        </div>
        <v-list
          class="background-list"
          :style="{gridTemplateColumns: cardColumns ? `repeat(auto-fill, calc(${editorWidth} + 24px))` : '100%'}"
        >
          <v-list-item
            class="entry-list-item"
            v-for="{card: background, index} in visibleEntries()"
            v-bind:key="background.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="background-card"
                :class="[dragCardClass(index), {'background-card-selected': selectedCardIds.includes(background.id), 'background-card-open': !isCollapsed(background)}]"
                v-on="dragTargetListeners(index)"
                @click.stop="handleSelectBackgroundCard(background.id, $event)"
              >
                <div
                  class="background-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="cardHandleListeners(index)"
                />
                <v-list-item-title>
                  <v-btn
                    :title="isCollapsed(background) ? 'Expand this background' : 'Collapse this background'"
                    icon
                    small
                    absolute
                    top
                    left
                    class="background-collapse-btn"
                    @click="() => toggleCollapsed(background)"
                  >
                    <v-icon>{{ isCollapsed(background) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                  </v-btn>
                  <div class="background-id-badge">ID:{{ background.id }}</div>
                  <div class="background-name-row">
                    <v-text-field
                      class="background-name-field"
                      label="Background name"
                      v-model="background.name"
                      @change="handleChildChange"
                    />
                    <!-- One color for the whole playfield, and one for the background behind it, set when this background is shown: for
                         the ones that have no row colors (the Options tab). Left unset the color is not changed. -->
                    <div v-if="!pfColorsEnabled" class="background-solid-color">
                      <color-swatch-picker
                        :value="background.playfieldColor === undefined ? null : background.playfieldColor"
                        clear-label="Keep the current color"
                        square
                        title="Click to set the color of the playfield pixels (one color for all rows)"
                        @input="(byte) => handleSetSolidColor(background, 'playfieldColor', byte)"
                      />
                      <span class="background-solid-color-label">Playfield color</span>
                    </div>
                    <div v-if="!bkColorsEnabled" class="background-solid-color">
                      <color-swatch-picker
                        :value="background.backgroundColor === undefined ? null : background.backgroundColor"
                        clear-label="Keep the current color"
                        square
                        title="Click to set the color behind the playfield (one color for all rows)"
                        @input="(byte) => handleSetSolidColor(background, 'backgroundColor', byte)"
                      />
                      <span class="background-solid-color-label">Background color</span>
                    </div>
                    <v-text-field
                      v-if="kernelIsDpcPlus && !background.groupPfres"
                      class="background-name-field background-pfres-field"
                      label="pfres"
                      type="number"
                      min="1"
                      max="192"
                      :value="background.pfres || defaultPfres"
                      :placeholder="String(defaultPfres)"
                      persistent-placeholder
                      :title="`How many rows this background has on screen, 1 to 192. Left empty it uses the project's pfres (${defaultPfres}, set in Options).`"
                      @input="(value) => value !== '' && handleChangeBackgroundPfres(background, value)"
                      @change="(value) => handleChangeBackgroundPfres(background, value)"
                    />
                    <v-text-field
                      v-if="kernelIsDpcPlus && pfColorsEnabled"
                      class="background-name-field background-pfres-field background-color-rows-field"
                      label="pf color rows"
                      type="number"
                      min="1"
                      max="192"
                      :value="background.pfColorRows || background.pixels.length"
                      :placeholder="String(background.pixels.length)"
                      persistent-placeholder
                      title="How many rows of colors the playfield colors have, spread over the height of the picture. Left empty it is the number of rows of the picture."
                      @input="(value) => value !== '' && handleTypeColorRows(background, 'pf', value)"
                      @change="(value) => handleLeaveColorRows(background, 'pf', value)"
                    />
                    <v-text-field
                      v-if="kernelIsDpcPlus && bkColorsEnabled"
                      class="background-name-field background-pfres-field background-color-rows-field"
                      label="bg color rows"
                      type="number"
                      min="1"
                      max="192"
                      :value="background.bkColorRows || background.pixels.length"
                      :placeholder="String(background.pixels.length)"
                      persistent-placeholder
                      title="How many rows of colors the background colors have, spread over the height of the picture. Left empty it is the number of rows of the picture."
                      @input="(value) => value !== '' && handleTypeColorRows(background, 'bk', value)"
                      @change="(value) => handleLeaveColorRows(background, 'bk', value)"
                    />
                  </div>

                  <div class="background-corner-toolbar">
                    <confirm-delete-menu
                      v-if="state.backgrounds.length > 1"
                      :title="deleteQuestion(background.id, 'background', 1)"
                      :selected="background.id === selectedCardId && selectedCardIds.includes(background.id)"
                      :activator-title="deleteQuestion(background.id, 'background', 1).replace('?', '')"
                      icon-btn-class="player-icon-btn-size"
                      @confirm="handleDeleteBackground(background)"
                    />
                    <pixel-grid-toggle
                      v-if="kernelIsDpcPlus"
                      class="player-icon-btn-size background-corner-toggle"
                      tall
                      :value="!!background.groupPfres"
                      icon="mdi-view-column"
                      title-on="The four playfield columns have separate resolutions (pfres) - click to give them all the same one"
                      title-off="Give each of the four playfield columns (8 pixels wide) a separate resolution (pfres)"
                      @input="() => handleToggleGroupPfres(background)"
                    />
                    <v-btn
                      icon
                      small
                      title="Duplicate this background"
                      class="titlescreen-play-btn player-icon-btn-size"
                      @click.stop="() => handleDuplicateBackground(background)"
                    >
                      <v-icon>mdi-content-duplicate</v-icon>
                    </v-btn>
                    <v-btn
                      v-if="pfColorsEnabled"
                      icon
                      small
                      title="Copy this background's playfield row colors only"
                      class="player-icon-btn-size copy-paste-color-btn"
                      @click="() => handleCopyBackgroundRowColors(background)"
                    >
                      <v-icon>mdi-content-copy</v-icon>
                      <span class="copy-paste-color-badge">P</span>
                    </v-btn>
                    <v-btn
                      v-if="pfColorsEnabled"
                      icon
                      small
                      :disabled="!copiedBackgroundRowColors"
                      title="Paste copied playfield row colors only onto this background"
                      class="player-icon-btn-size copy-paste-color-btn"
                      @click="() => handlePasteBackgroundRowColors(background)"
                    >
                      <v-icon>mdi-content-paste</v-icon>
                      <span class="copy-paste-color-badge">P</span>
                    </v-btn>
                    <v-btn
                      v-if="bkColorsEnabled"
                      icon
                      small
                      title="Copy this background's background row colors only"
                      class="player-icon-btn-size copy-paste-color-btn"
                      @click="() => handleCopyBackgroundBkRowColors(background)"
                    >
                      <v-icon>mdi-content-copy</v-icon>
                      <span class="copy-paste-color-badge">B</span>
                    </v-btn>
                    <v-btn
                      v-if="bkColorsEnabled"
                      icon
                      small
                      :disabled="!copiedBackgroundBkRowColors"
                      title="Paste copied background row colors only onto this background"
                      class="player-icon-btn-size copy-paste-color-btn"
                      @click="() => handlePasteBackgroundBkRowColors(background)"
                    >
                      <v-icon>mdi-content-paste</v-icon>
                      <span class="copy-paste-color-badge">B</span>
                    </v-btn>
                    <v-btn
                      :title="testingId === background.id ? 'Building...' :
                        buildInProgress ? 'Another build is already running - try again once it finishes' :
                        'Test this background in the emulator'"
                      icon
                      small
                      :disabled="buildInProgress && testingId !== background.id"
                      :loading="testingId === background.id"
                      class="titlescreen-play-btn player-icon-btn-size"
                      @click.stop="() => handleTestBackground(background)"
                    >
                      <v-icon>mdi-play</v-icon>
                    </v-btn>
                  </div>
                </v-list-item-title>
                <v-list-item-subtitle v-if="!isCollapsed(background)">
                  <!-- aspectRatio is (32 * PF_COLUMN_WIDTH_PX) / (background.pixels.length *
                       pfRowDivisorFor(config)) - real screen width (32 columns *
                       PF_COLUMN_WIDTH_PX = 128px (the playfield is 128 of the screen's 160
                       pixels wide), always, regardless of pfres/Superchip - see
                       that constant's comment in utils/playfield-coords.js) over THIS
                       background's real total height (its row count * that row
                       count's real scanline height - pfRowDivisorFor's comment explains
                       why that per-row height isn't a flat constant either). Deliberately NOT
                       a flat ratio (an earlier fix used a fixed 96-scanline total, assuming
                       every background's row count always exactly matches pfres) - that
                       broke the one case a background's row count DOESN'T match pfres: a
                       background the user explicitly resized taller via "Set height"
                       (background.customHeight - see reflowBackgroundsToHeight's comment
                       in blocks/background.js, which deliberately leaves such a background's
                       row count alone on every pfres change) genuinely has MORE real scanlines
                       than a fixed 96 assumes, so it needs its actual row count factored
                       back in - confirmed as a real reported bug ("aspect ratio is not
                       updating when background graphic is taller than pfres value"). An
                       ordinary (non-custom-height) background's row count already tracks
                       pfres automatically, so this still lands on the exact same ratio that
                       background would have gotten from a pfres-only calculation - this isn't
                       a regression back to the ORIGINAL row-count-dependent bug (dividing by
                       row count while using a FIXED per-row height, which is what actually
                       broke for other pfres values before - see git history), since
                       pfRowDivisorFor itself already accounts for pfres correctly. -->
                  <div class="pixel-editor-container" :style="cardColumns ? {width: editorWidth, maxWidth: editorWidth} : {width: editorWidth, maxWidth: '100%'}">
                    <div v-if="background.groupPfres" class="group-editors-row">
                      <div class="group-pfres-row">
                        <v-text-field
                          v-for="(rows, group) in background.groupPfres"
                          :key="group"
                          class="group-pfres-field"
                          hide-details
                          :label="`pfres column ${group + 1}`"
                          type="number"
                          min="1"
                          max="192"
                          :value="rows"
                          :title="`How many rows playfield column ${group + 1} (pixels ${group * 8} to ${group * 8 + 7}) has on screen, 1 to 192.`"
                          @change="(value) => handleChangeGroupPfres(background, group, value)"
                        />
                      </div>
                      <div v-if="pfColorsEnabled" class="group-color-strip">
                        <playfield-color-strip
                          :value="background.rowColors"
                          :quickColors="quickColorPalette"
                          :activeQuickColor="selectedQuickColor"
                          title="Playfield row colors (shared by every group)"
                          @input="(colors) => handleRowColorsInput(background, colors)"
                        />
                      </div>
                      <div class="group-editors">
                      <pixel-editor
                        v-for="(rows, group) in background.groupPfres"
                        :key="group"
                        :ref="pixelEditorRefKey(background)"
                        class="group-editor"
                        :width="8"
                        :height="rows"
                        :aspectRatio="groupAspectRatio(rows)"
                        :name="background.name || 'background'"
                        :value="groupPixels(background, group)"
                        fgColor="orange"
                        :rowColors="groupColors(editorRowColors(background), rows)"
                        :rowBackdrop="groupColors(editorBkRowColors(background), rows)"
                        :rowColorsFine="fineColors(editorRowColors(background), rows)"
                        :rowBackdropFine="fineColors(editorBkRowColors(background), rows)"
                        :allowChangingHeight="false"
                        :showGrid="showPixelGrid"
                        :showCellIds="showPixelGrid && showPixelGridLabels"
                        :cellIdColumnOffset="group * 8"
                        :hideToolbar="true"
                        @input="(pixels) => handleGroupPixelsInput(background, group, pixels)"
                        @activate="(editorInstance) => setActiveEditor(editorInstance, background.id)"
                      />
                      </div>
                      <div v-if="bkColorsEnabled" class="group-color-strip">
                        <playfield-color-strip
                          :value="background.bkRowColors"
                          :quickColors="quickColorPalette"
                          :activeQuickColor="selectedQuickColor"
                          title="Background row colors (shared by every group)"
                          side="right"
                          :defaultColor="DEFAULT_BK_ROW_COLOR"
                          @input="(colors) => handleBkRowColorsInput(background, colors)"
                        />
                      </div>
                      <!-- The same buttons under the picture as a background without groups has (see the actions of PixelEditor.vue): clear the
                           playfield colors, copy, paste and clear, clear the background colors. -->
                      <div v-if="pfColorsEnabled" class="group-tools group-tools-left">
                        <v-btn icon small title="Clear this graphic's color data only (leaves the drawing itself untouched)" @click="() => handleClearPlayfieldRowColors(background)">
                          <v-icon>mdi-invert-colors-off</v-icon>
                        </v-btn>
                      </div>
                      <div class="group-tools group-tools-center">
                        <v-btn icon small title="Copy this background's image (and row colors, if any)" @click="() => handleCopyBackground(background)">
                          <v-icon>mdi-content-copy</v-icon>
                        </v-btn>
                        <v-btn icon small :disabled="!copiedBackgroundData" title="Paste copied image (and row colors, if any) onto this background" @click="() => handlePasteBackground(background)">
                          <v-icon>mdi-content-paste</v-icon>
                        </v-btn>
                        <v-btn icon small title="Clear" @click="() => handleClearGroupBackground(background)">
                          <v-icon>mdi-broom</v-icon>
                        </v-btn>
                      </div>
                      <div v-if="bkColorsEnabled" class="group-tools group-tools-right">
                        <v-btn icon small title="Clear this graphic's background row colors only (leaves the drawing and the playfield row colors untouched)" @click="() => handleClearBkRowColors(background)">
                          <v-icon>mdi-invert-colors-off</v-icon>
                        </v-btn>
                      </div>
                    </div>
                    <pixel-editor
                      v-else
                      :ref="pixelEditorRefKey(background)"
                      :width="pfWidth"
                      :guide-columns="pfWidth > 40 ? 40 : 0"
                      :tile-grid="tileGridFor(background)"
                      :stamp="stampFor()"
                      :height="background.pixels.length"
                      :aspectRatio="backgroundAspectRatio(background)"
                      :name="background.name || 'background'"
                      :value="background.pixels"
                      fgColor="orange"
                      :rowColors="pixelRowColors(editorRowColors(background), background)"
                      :rowBackdrop="pixelRowColors(editorBkRowColors(background), background)"
                      :rowColorsFine="fineColors(editorRowColors(background), background.pixels.length)"
                      :rowBackdropFine="fineColors(editorBkRowColors(background), background.pixels.length)"
                      :allowChangingHeight="true"
                      :showClearButton="true"
                      :showGrid="showPixelGrid"
                      :showCellIds="showPixelGrid && showPixelGridLabels"
                      :hideToolbar="true"
                      :outsideHistory="tilemapOn && !!background.tileMap"
                      @input="(pixels) => handleBackgroundPixelsInput(background, pixels)"
                      @clear="() => handleClearRowColors(background)"
                      @clear-colors="() => handleClearPlayfieldRowColors(background)"
                      @clear-bk-colors="() => handleClearBkRowColors(background)"
                      @move-rows="(move) => handleMoveRows(background, move)"
                      @flip-rows="() => handleFlipRowColors(background)"
                      @activate="(editorInstance) => setActiveEditor(editorInstance, background.id)"
                    >
                      <template v-if="pfColorsEnabled" v-slot:sidebar>
                        <playfield-color-strip
                          :value="background.rowColors"
                          :quickColors="quickColorPalette"
                          :activeQuickColor="selectedQuickColor"
                          title="Playfield row colors"
                          @input="(colors) => handleRowColorsInput(background, colors)"
                        />
                      </template>
                      <template v-if="bkColorsEnabled" v-slot:sidebar-right>
                        <playfield-color-strip
                          :value="background.bkRowColors"
                          :quickColors="quickColorPalette"
                          :activeQuickColor="selectedQuickColor"
                          title="Background row colors"
                          side="right"
                          :defaultColor="DEFAULT_BK_ROW_COLOR"
                          @input="(colors) => handleBkRowColorsInput(background, colors)"
                        />
                      </template>
                      <template v-slot:toolbar-end>
                        <v-btn
                          icon
                          small
                          title="Copy this background's image (and row colors, if any)"
                          class="player-icon-btn-size"
                          @click="() => handleCopyBackground(background)"
                        >
                          <v-icon>mdi-content-copy</v-icon>
                        </v-btn>
                        <v-btn
                          icon
                          small
                          :disabled="!copiedBackgroundData"
                          title="Paste copied image (and row colors, if any) onto this background"
                          class="player-icon-btn-size"
                          @click="() => handlePasteBackground(background)"
                        >
                          <v-icon>mdi-content-paste</v-icon>
                        </v-btn>
                      </template>
                    </pixel-editor>
                  </div>
                </v-list-item-subtitle>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-frame-buttom"
      color="primary"
      title="Add background"
      dark
      absolute
      right
      fab
      @click="handleAddBackground"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import Vue from 'vue';
import {computed, defineComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref} from '@vue/composition-api';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {recordReorder} from '../hooks/reorder-history';
import {recordFieldsChange, recordRowColorsChange} from '../utils/row-color-history';
import {useDragReorder} from '../hooks/drag-reorder';
import {insertCardAfter, removeCards} from '../utils/card-refs';
import {useCardSelection} from '../hooks/card-selection';
import {useCardFolders} from '../hooks/card-folders';
import CardFolderBar from '../components/CardFolderBar.vue';
import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import EditorZoom from '../components/EditorZoom.vue';
import GraphicEditorToolbar from '../components/GraphicEditorToolbar.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import QuickColorPalette from '../components/QuickColorPalette.vue';
import {useBackgroundsStorage, useColorPaletteStorage, useConfigurationStorage,
  usePixelGridOverlayStorage, usePixelGridLabelsStorage, useBackgroundCardColumnsStorage, useLastTilemap} from '../hooks/project';
import {buildBackgroundPreviewRom, useBuildInProgress} from '../hooks/rom';
import {useEditorZoom} from '../hooks/zoom';
import {colorByteToCss} from '../utils/palette';
import {PF_COLUMN_WIDTH_PX, pfRowDivisorFor, backgroundRowLinesFor, dpcPlusRowLinesFor} from '../utils/playfield-coords';
import {resizePixelMatrixHeight, scaleRowColors} from '../utils/pixels';
import {isPxe, pfWidthOf} from '../utils/pxe';
import {DEFAULT_TILE_ROWS, MAX_TILE_ROWS, NARROW_ARM_EXTRA_BYTES, NARROW_TILE_WIDTH, planStandardTilemap, planTilemap, standardTileCodeBytes, tileAt, tileColumnsOf,
  tileSetHeight, tileSetWidth, tileUnitOf, TILE_FLIP_BIT, TILE_WIDTHS} from '../generators/bbasic/pf-tiles';
import {bestTileHeight, cellPixels, flipRows, mapOfPixels, pixelsOfMap, samePixels, tileableBackgrounds} from '../utils/tilemap-edit';
import {rowColorsForMove} from '../utils/row-color-move';
import {CLOCK_ASPECT_PER_LINE_PAIR} from '../utils/pixel-aspect';
import {backgroundColorRows, backgroundHasColorRows, colorsAtRows, DEFAULT_BACKGROUNDS, DEFAULT_ROW_COLOR, DEFAULT_BK_ROW_COLOR, clearRowColors, backgroundDataRows, dpcPlusPfresOf,
  processBackgroundStorageDefaults} from '../blocks/background';

// Width of one background editor at 100% zoom.
const EDITOR_BASE_WIDTH = 480;
// The zoom stops of the Tiles section: further out than the tabs' (a tile is small), the sheet below 100%.
const TILE_ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

// A blank canvas (every pixel off), sized to whatever the current playfield
// resolution is - not a fixed row count, since Superchip's pfres setting can
// make that row count anything from 11 to 32. Used for new backgrounds
// instead of pre-drawing anything (a rectangular border was tried first and
// reverted: a brand new background starting with existing pixels already
// set meant clearing them by hand was the normal first step before drawing
// anything new, every time - matches how a new player animation frame
// starts blank too, see PlayerEditor.vue's  handleAddAnimation).
const buildDefaultBackgroundPixels = (rows, cols = 32) =>
  new Array(rows).fill(0).map(() => new Array(cols).fill(0));

// Same "module-scope, not a ref inside setup()" reasoning as
// PlayerEditor.vue's  copiedFrameRowColors/copiedFrameData - keeps the
// clipboard alive across navigating away from and back to this tab (Vue
// Router destroys and recreates this component each time).
const copiedBackgroundRowColors = ref(null);
const copiedBackgroundBkRowColors = ref(null);
// The number of separate color rows each copy had (pfColorRows, bkColorRows; undefined for one color a row of the picture).
let copiedPfColorRows;
let copiedBkColorRows;
const copiedBackgroundData = ref(null);

export default defineComponent({
  components: {CardFolderBar, ColorSwatchPicker, ConfirmDeleteMenu, EditorZoom, GraphicEditorToolbar, PixelEditor, PixelGridToggle, PlayfieldColorStrip, QuickColorPalette},
  setup() {
    const instance = getCurrentInstance();
    const backgroundsStorage = useBackgroundsStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('background');
    // How many pixels across the playfield is (40 on PXE when the project asks for the whole screen).
    const pfWidth = computed(() => pfWidthOf(configurationStorage.value));
    const editorWidth = computed(() => `${Math.round(EDITOR_BASE_WIDTH * zoom.value)}px`);
    // The Tiles section's zoom (apart from the backgrounds', remembered as the tabs' are). At 100% a tile's picture is as wide as 8 columns of a background's
    // picture at 100% (the card's width less its padding and border, 34 pixels). From 100% up it is in a card at least as wide as the ID and
    // the corner buttons need (the picture in its middle); below it the tiles are a sheet: the pictures alone, side by side.
    const tileZoom = useEditorZoom('background-tiles', 1, TILE_ZOOM_LEVELS);
    const tilesSheet = computed(() => tileZoom.value < 1);
    const tileCardStyle = computed(() => {
      const canvas = Math.max(8, Math.round((EDITOR_BASE_WIDTH - 34) * tileZoom.value * tileWidthPx.value / (pfWidth.value || 32)));
      return {'width': `${tilesSheet.value ? canvas : canvas + 34}px`, '--tile-canvas-width': `${canvas}px`};
    });
    // See the template's comment on where this background pixel editor's
    // aspectRatio comes from - real playfield width (always 128px) over THIS
    // background's real total height (its row count, not
    // necessarily pfres's - see customHeight - times that row count's real
    // scanline height).
    // Under DPC+ a background can set a pfres, which sets how tall its rows are.
    const backgroundAspectRatio = (background) => {
      const config = configurationStorage.value;
      const rowHeight = (config && config.kernel === 'dpcplus') ? backgroundRowLinesFor(background, config) / 2 : pfRowDivisorFor(config);
      return (pfWidth.value * PF_COLUMN_WIDTH_PX * CLOCK_ASPECT_PER_LINE_PAIR) / (background.pixels.length * rowHeight);
    };
    // Shared with PlayerEditor.vue's  Player 0/1 tabs (see
    // PixelGridToggle.vue's  comment).
    const showPixelGrid = usePixelGridOverlayStorage();
    // The cards in several columns (the window wide enough for more than one) or in one.
    const cardColumns = useBackgroundCardColumnsStorage();
    // Background-tab-only (see usePixelGridLabelsStorage's  comment) -
    // controls the grid overlay's "X,Y" cell labels independently of the
    // grid lines themselves (showPixelGrid above).
    const showPixelGridLabels = usePixelGridLabelsStorage();
    // The playfield tilemap (Options tab, DPC+ not PXE): the Tiles button shows each background's tiles and their numbers from the last build
    // (see generators/bbasic/pf-tiles.js). A background whose rows the scrolling cuts into thin rows has its tiles on those rows: none shown.
    const tilemapOn = computed(() => {
      const config = configurationStorage.value || {};
      return !isPxe(config) && !!config.dpcPlusTilemap;
    });
    // The standard kernel keeps its tiles as the bytes of the playfield memory, a tile for the column it is in (see planStandardTilemap).
    const tilesStandard = computed(() => (configurationStorage.value || {}).kernel !== 'dpcplus');
    const showTiles = ref(false);
    const lastTilemap = useLastTilemap();
    // The Tiles section: the project's tiles (kept with the backgrounds, as tileSet: {height, tiles: [{id, pixels}]}), numbered in their order.
    const tileSet = computed(() => {
      const data = state.value || {};
      return data.tileSet || {height: DEFAULT_TILE_ROWS, tiles: []};
    });
    // (The backgrounds kept as tile numbers are drawn again from their tiles.)
    const saveTileSet = (next) => {
      const data = state.value;
      Vue.set(data, 'tileSet', next);
      redrawMappedBackgrounds();
      handleChildChange();
    };
    const redrawMappedBackgrounds = () => {
      const set = state.value.tileSet || {};
      (state.value.backgrounds || []).forEach((background) => {
        if (background.tileMap) {
          background.pixels = pixelsOfMap(background.tileMap, tileSetHeight(set), set.tiles || [], background.pixels.length, tileSetWidth(set));
        }
      });
    };
    const nextTileId = (tiles) => Math.max(0, ...tiles.map((tile) => Number(tile.id) || 0)) + 1;
    // Undo for the tiles: a change to them (drawing, adding, deleting, a copy, Playfield to tiles, Back to pixels, their height) or to a
    // background kept as tiles reaches the others, so each is one step of the tab's history (hooks/reorder-history.js) that puts back the tiles
    // and every background's tile map (and the pixels of those kept as tiles) as they were; their pixel editors keep no separate undo
    // (outsideHistory). Steps to the same thing in a moment of each other (the strokes of a drawing) are one.
    const tileSnapshot = () => structuredClone({tileSet: state.value.tileSet || null,
      backgrounds: (state.value.backgrounds || []).map((background) => ({id: background.id, tileMap: background.tileMap || null,
        pixels: background.tileMap ? background.pixels : null}))});
    const restoreTileSnapshot = (snapshot) => {
      const copy = structuredClone(snapshot);
      if (copy.tileSet) Vue.set(state.value, 'tileSet', copy.tileSet);
      else Vue.delete(state.value, 'tileSet');
      copy.backgrounds.forEach(({id, tileMap, pixels}) => {
        const background = (state.value.backgrounds || []).find((other) => other.id === id);
        if (!background) return;
        if (tileMap) {
          Vue.set(background, 'tileMap', tileMap);
          if (pixels) background.pixels = pixels;
        } else {
          Vue.delete(background, 'tileMap');
        }
      });
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const recordTiles = (before, key) => {
      const after = tileSnapshot();
      recordReorder({key, undo: () => restoreTileSnapshot(before), redo: () => restoreTileSnapshot(after), isCurrent: () => true});
    };
    // What the last of the buttons below did.
    const tilesMessage = ref('');
    const mappedBackgroundCount = computed(() => ((state.value && state.value.backgrounds) || []).filter((background) => background.tileMap).length);
    // The popup of Playfield to tiles: the width and height of the tiles (the height 'best': the one with the fewest bytes) and whether they
    // take the place of the tiles there are (otherwise those are kept, with their size).
    const makeTilesVisible = ref(false);
    const makeTilesReplace = ref(false);
    const makeTilesWidth = ref(8);
    const makeTilesHeight = ref('best');
    const makeTilesNarrow = ref(false);
    // The 4-pixel tiles option is hidden until it has been tested more (makeTilesNarrow stays off).
    const showNarrowTilesOption = false;
    const makeTilesHeightItems = [{text: 'Best (fewest bytes)', value: 'best'},
      ...Array.from({length: MAX_TILE_ROWS}, (_, i) => ({text: `${i + 1} row${i ? 's' : ''}`, value: i + 1}))];
    const makeTilesSizeLocked = computed(() => tileSet.value.tiles.length > 0 && !makeTilesReplace.value);
    const openMakeTiles = () => {
      makeTilesReplace.value = false;
      makeTilesWidth.value = tileWidthPx.value;
      makeTilesHeight.value = tileSet.value.tiles.length ? tileRows.value : 'best';
      makeTilesVisible.value = true;
    };
    // The bytes the backgrounds take as tiles of a width (4, or 8 for 8, 16 and 32: the build's tiles are 8 wide then) at a height (0: the one
    // with the fewest), as the build of the kernel keeps them, with what its program takes more for 4-pixel tiles: {bytes, height}, or null.
    const tileCostOf = (width, height) => {
      const backgrounds = tileableBackgrounds(state.value.backgrounds);
      const unit = width === NARROW_TILE_WIDTH ? NARROW_TILE_WIDTH : 8;
      if (tilesStandard.value) {
        const plan = planStandardTilemap(backgrounds.map((background) => ({id: background.id, pixels: background.pixels})), unit, height);
        return plan ? {bytes: plan.bytes + standardTileCodeBytes(plan), height: plan.height} : null;
      }
      const plan = planTilemap(backgrounds.map((background) => ({id: background.id, pixels: background.pixels, fill: background.pixels.length})),
          {width: unit, tiles: []}, height);
      return plan ? {bytes: plan.bytes + (unit === NARROW_TILE_WIDTH ? NARROW_ARM_EXTRA_BYTES : 0), height: plan.height} : null;
    };
    const handleMakeTiles = () => {
      const replace = makeTilesReplace.value || !tileSet.value.tiles.length;
      let width = replace && TILE_WIDTHS.includes(makeTilesWidth.value) ? makeTilesWidth.value : tileWidthPx.value;
      const chosen = Number(makeTilesHeight.value);
      const fixedHeight = chosen >= 1 && chosen <= MAX_TILE_ROWS ? chosen : 0;
      let height = !replace ? tileRows.value : (fixedHeight || (bestTileHeight(state.value.backgrounds) || DEFAULT_TILE_ROWS));
      // Try 4-pixel tiles: made 4 pixels wide instead when that takes fewer bytes (at its best height when the height is Best).
      let narrowNote = '';
      if (replace && makeTilesNarrow.value && width !== NARROW_TILE_WIDTH) {
        const wide = tileCostOf(width, fixedHeight);
        const narrow = tileCostOf(NARROW_TILE_WIDTH, fixedHeight);
        if (narrow && (!wide || narrow.bytes < wide.bytes)) {
          narrowNote = ` 4-pixel tiles take about ${narrow.bytes} bytes, ${width}-pixel tiles ${wide ? wide.bytes : 'more'}: the tiles are 4 pixels wide.`;
          width = NARROW_TILE_WIDTH;
          height = narrow.height;
        } else if (narrow) {
          narrowNote = ` 4-pixel tiles would take about ${narrow.bytes} bytes, ${width}-pixel tiles ${wide.bytes}: the tiles are ${width} pixels wide.`;
        }
      }
      makeTilesVisible.value = false;
      handleConvertToTileNumbers(width, height, replace);
      if (narrowNote) tilesMessage.value += narrowNote;
    };
    const handleConvertToTileNumbers = (width, height, replace) => {
      const beforeTiles = tileSnapshot();
      const tiles = replace ? [] : tileSet.value.tiles.slice();
      const before = tiles.length;
      const addTile = (pixels) => {
        const id = nextTileId(tiles);
        tiles.push({id, pixels});
        return id;
      };
      const backgrounds = tileableBackgrounds(state.value.backgrounds);
      backgrounds.forEach((background) => Vue.set(background, 'tileMap', mapOfPixels(background.pixels, height, tiles, addTile, width)));
      // (The numbers of the cells' tiles show.)
      showTiles.value = true;
      if (replace) stampTileId.value = null;
      saveTileSet({...tileSet.value, height, width, tiles});
      recordTiles(beforeTiles);
      const skipped = (state.value.backgrounds || []).length - backgrounds.length;
      tilesMessage.value = `${backgrounds.length} background${backgrounds.length === 1 ? '' : 's'} converted to tiles, ${tiles.length - before} tile${tiles.length - before === 1 ? '' : 's'} added` +
        (skipped ? ` (${skipped} with separate rows for each column left as pixels).` : '.');
      instance.proxy.$forceUpdate();
    };
    // Back to pixels: the popup asks whether the tiles are deleted too.
    const backToPixelsVisible = ref(false);
    const backToPixelsDeleteTiles = ref(false);
    const openBackToPixels = () => {
      backToPixelsDeleteTiles.value = false;
      backToPixelsVisible.value = true;
    };
    const handleConvertToPixels = () => {
      const before = tileSnapshot();
      backToPixelsVisible.value = false;
      (state.value.backgrounds || []).forEach((background) => Vue.delete(background, 'tileMap'));
      if (backToPixelsDeleteTiles.value) {
        stampTileId.value = null;
        deselectTile();
        Vue.set(state.value, 'tileSet', {...tileSet.value, tiles: []});
      }
      tilesMessage.value = backToPixelsDeleteTiles.value ? 'The backgrounds are kept as pixels again, and the tiles are deleted.' :
        'The backgrounds are kept as pixels again.';
      handleChildChange();
      instance.proxy.$forceUpdate();
      recordTiles(before);
    };
    // A pixel edit of a background kept as tile numbers: a cell the Stamp put the stamped tile in takes that tile; any other changed cell
    // changes its tile (everywhere it is used). A new height maps the background again.
    // What each converted background's editor showed after its last edit. A cell is changed by an edit where it differs from that, not from the
    // background as it is kept: during a stroke the editor does not take in the background drawn again from its tiles (see PixelEditor's value
    // watcher), so the other cells of a tile just drawn on still showed their old pixels there, and taken as edits put the tile back.
    const shownMappedPixels = new Map();
    const handleMappedPixelsInput = (background, pixels) => {
      const before = tileSnapshot();
      const height = tileRows.value;
      const width = tileWidthPx.value;
      const last = shownMappedPixels.get(background.id);
      const shown = last && last.length === pixels.length ? last : background.pixels;
      shownMappedPixels.set(background.id, pixels.map((row) => [...row]));
      const tiles = tileSet.value.tiles.slice();
      const addTile = (rows) => {
        const id = nextTileId(tiles);
        tiles.push({id, pixels: rows});
        return id;
      };
      if (pixels.length !== background.pixels.length) {
        background.tileMap = mapOfPixels(pixels, height, tiles, addTile, width);
      } else {
        const stamp = stampFor();
        const map = background.tileMap.map((cells) => cells.slice());
        for (let cellRow = 0; cellRow < Math.ceil(pixels.length / height); cellRow++) {
          if (!map[cellRow]) map[cellRow] = new Array(32 / width).fill(null);
          for (let column = 0; column < 32 / width; column++) {
            const now = cellPixels(pixels, cellRow, column, height, width);
            if (samePixels(now, cellPixels(shown, cellRow, column, height, width))) continue;
            // (A cell of the last row can have fewer rows than a tile: only those are compared, and the tile keeps the rest.)
            const rowsHere = Math.min(height, pixels.length - cellRow * height);
            if (stamp && samePixels(now.slice(0, rowsHere), cellPixels(stamp.pixels, 0, 0, height, width).slice(0, rowsHere))) {
              map[cellRow][column] = stamp.id;
              continue;
            }
            // (A cell with a tile flipped changes the tile with the cell's pixels flipped back.)
            const cellId = map[cellRow][column];
            const flipped = typeof cellId === 'number' && cellId < 0;
            const index = tiles.findIndex((tile) => tile.id === (flipped ? -cellId : cellId));
            if (index < 0) {
              map[cellRow][column] = addTile(now);
            } else {
              const old = cellPixels(tiles[index].pixels, 0, 0, height, width);
              const merged = [...(flipped ? flipRows(now) : now).slice(0, rowsHere), ...old.slice(rowsHere)];
              tiles[index] = {...tiles[index], pixels: merged};
            }
          }
        }
        background.tileMap = map;
      }
      background.pixels = pixels;
      saveTileSet({...tileSet.value, tiles});
      recordTiles(before, `mapped-${background.id}`);
    };
    const blankRows = (rows) => Array.from({length: rows}, () => new Array(tileWidthPx.value).fill(0));
    // How wide a tile of the section is (8, 16 or 32 pixels, or 4 for 4-pixel tiles).
    const tileWidthPx = computed(() => tileSetWidth(tileSet.value));
    const tileRows = computed({
      get: () => tileSetHeight(tileSet.value),
      // Every tile is cut or padded with empty rows to the new height.
      set: (rows) => saveTileSet({...tileSet.value, height: rows,
        tiles: tileSet.value.tiles.map((tile) => ({...tile, pixels: [...(tile.pixels || []).slice(0, rows), ...blankRows(Math.max(0, rows - (tile.pixels || []).length))]}))}),
    });
    const handleAddTile = () => {
      const before = tileSnapshot();
      const id = Math.max(0, ...tileSet.value.tiles.map((tile) => Number(tile.id) || 0)) + 1;
      saveTileSet({...tileSet.value, height: tileRows.value, tiles: [...tileSet.value.tiles, {id, pixels: blankRows(tileRows.value)}]});
      recordTiles(before);
    };
    // The tile cards are selected and moved as the background cards are (hooks/card-selection.js, hooks/drag-reorder.js); a tile's number is
    // its place in the list, so nothing is renumbered.
    const selectedTileId = ref(null);
    const {selectedCardIds: selectedTileIds, selectCard: selectTile, deselectCard: deselectTile, idsToDelete: tileIdsToDelete,
      deleteQuestion: tileDeleteQuestion, getSelectedIndices: getSelectedTileIndices} =
      useCardSelection(() => tileSet.value.tiles.map((tile) => tile.id), selectedTileId);
    const {dragAttrs: tileDragAttrs, dragCardClass: tileDragCardClass, dragHandleListeners: tileDragHandleListeners,
      dragTargetListeners: tileDragTargetListeners} = useDragReorder(
        () => tileSet.value.tiles,
        (tiles) => saveTileSet({...tileSet.value, tiles}),
        getSelectedTileIndices,
        {sideBySide: true},
    );
    // The tile the Stamp tool places is the one selected last (the first tile until one is): selecting a background card with the Stamp on keeps it selected.
    const handleSelectTile = (id, event) => {
      deselectCard();
      selectTile(id, event);
      stampTileId.value = id;
    };
    const handleSelectBackgroundCard = (id, event) => {
      if (!stampOn.value) deselectTile();
      selectCard(id, event);
    };
    const handleDeselectCards = () => {
      deselectCard();
      deselectTile();
    };
    // Deletes the tile, or all the selected tiles when it is one of them.
    // (A background kept as tile numbers shows a dash and an empty cell where a deleted tile was.)
    const handleDeleteTile = (tile) => {
      const before = tileSnapshot();
      const doomed = tileIdsToDelete(tile.id);
      if (doomed.includes(stampTileId.value)) stampTileId.value = null;
      saveTileSet({...tileSet.value, tiles: tileSet.value.tiles.filter((other) => !doomed.includes(other.id))});
      if (doomed.length > 1) deselectTile();
      recordTiles(before);
    };
    // Copy and paste of a tile's image (the rows it has; a pasted image is cut or padded to the tile's rows).
    const copiedTilePixels = ref(null);
    const handleCopyTile = (tile) => {
      copiedTilePixels.value = JSON.parse(JSON.stringify(tile.pixels));
    };
    const handlePasteTile = (tile) => {
      if (!copiedTilePixels.value) return;
      // (Cut or padded to the tile's rows and width.)
      handleTileInput(tile, cellPixels(copiedTilePixels.value, 0, 0, tileRows.value, tileWidthPx.value));
    };
    // A copy of the tile right after it.
    const handleDuplicateTile = (tile) => {
      const before = tileSnapshot();
      const id = Math.max(0, ...tileSet.value.tiles.map((other) => Number(other.id) || 0)) + 1;
      const tiles = tileSet.value.tiles.slice();
      tiles.splice(tiles.indexOf(tile) + 1, 0, {id, pixels: JSON.parse(JSON.stringify(tile.pixels))});
      saveTileSet({...tileSet.value, tiles});
      recordTiles(before);
    };
    // (Matched by id: the tile objects are new after every change.)
    const handleTileInput = (tile, pixels) => {
      const before = tileSnapshot();
      saveTileSet({...tileSet.value, tiles: tileSet.value.tiles.map((other) => (other.id === tile.id ? {...other, pixels} : other))});
      recordTiles(before, `tile-${tile.id}`);
    };
    // The Stamp tool of the toolbar, and the tile it places (its id).
    const stampOn = ref(false);
    const stampTileId = ref(null);
    const setStampOn = (on) => {
      stampOn.value = on;
    };
    // The Flip button beside it: the tile is placed flipped left to right (the build keeps it as the same tile, flipped).
    const stampFlip = ref(false);
    const setStampFlip = (on) => {
      stampFlip.value = on;
    };
    const stampFor = () => {
      if (!tilemapOn.value || !stampOn.value) return null;
      const tiles = tileSet.value.tiles;
      const tile = tiles.find((other) => other.id === stampTileId.value) || tiles[0];
      if (!tile) return null;
      const pixels = cellPixels(tile.pixels || [], 0, 0, tileRows.value, tileWidthPx.value);
      return {rows: tileRows.value, width: tileWidthPx.value, pixels: stampFlip.value ? flipRows(pixels) : pixels, id: stampFlip.value ? -tile.id : tile.id};
    };
    // A tile drawn in the shape it has on the playfield: its pixels of the playfield's width by the rows of a tile of the project's row height.
    const tileAspectRatio = computed(() => {
      const config = configurationStorage.value || {};
      return (tileWidthPx.value * PF_COLUMN_WIDTH_PX * CLOCK_ASPECT_PER_LINE_PAIR) / (tileRows.value * (dpcPlusRowLinesFor(config) / 2));
    });
    // The tiles of the backgrounds as they are now (no build needed): the section's tiles first, then the others as the build numbers them
    // when it has every background (a background the build leaves out, or the scroll cuts into thin rows, can make its later numbers differ).
    const tilemapNow = computed(() => {
      if (!tilemapOn.value || !showTiles.value) return null;
      const backgrounds = tileableBackgrounds((state.value && state.value.backgrounds) || []);
      if (tilesStandard.value) {
        return planStandardTilemap(backgrounds.map((background) => ({id: background.id, pixels: background.pixels})), tileUnitOf(tileSet.value));
      }
      return planTilemap(backgrounds.map((background) => ({id: background.id, pixels: background.pixels, fill: background.pixels.length})), tileSet.value);
    });
    const tileGridFor = (background) => {
      if (!tilemapOn.value || !showTiles.value) return null;
      // A background kept as tile numbers: the numbers of its tiles in the section (a dash for one that was deleted).
      if (background.tileMap) {
        const numberOf = new Map(tileSet.value.tiles.map((tile, number) => [tile.id, number]));
        // (A tile flipped left to right: its number and an arrow.)
        const label = (id) => {
          const flipped = typeof id === 'number' && id < 0;
          const number = numberOf.get(flipped ? -id : id);
          return number === undefined ? '-' : `${number}${flipped ? '\u2194' : ''}`;
        };
        return {rows: tileRows.value, width: tileWidthPx.value, numbers: background.tileMap.map((cells) => cells.map(label))};
      }
      const plan = tilemapNow.value;
      // (The last build cut a scrolling background into thin rows: its tiles are on those, none shown.)
      const built = lastTilemap.value && lastTilemap.value.byId[String(background.id)];
      if (!plan || (built && built.thin !== 1)) return null;
      const cellRows = Math.ceil(background.pixels.length / plan.height);
      // (8 columns of 4 pixels with 4-pixel tiles.)
      const columns = Array.from({length: tileColumnsOf(plan)}, (_, column) => column);
      const width = 32 / columns.length;
      // No tiles yet (the Tiles section is empty): each cell a different number, counted along the rows.
      if (!tileSet.value.tiles.length) {
        return {rows: plan.height, width, numbers: Array.from({length: cellRows}, (_, row) => columns.map((column) => row * columns.length + column))};
      }
      return {rows: plan.height, width, numbers: Array.from({length: cellRows}, (_, row) => columns.map((column) => {
        const number = tileAt(plan, background.id, column, row);
        if (number === null) return '-';
        return plan.flipLayout && (number & TILE_FLIP_BIT) ? `${number & ~TILE_FLIP_BIT}\u2194` : number;
      }))};
    };

    // Same "armed color for direct-painting" reasoning as PlayerEditor.vue's
    // selectedQuickColor - v-model'd to the QuickColorPalette instance
    // above, passed into PlayfieldColorStrip's  activeQuickColor prop
    // below. Read-only access to the palette DATA itself
    // (quickColorPalette) - QuickColorPalette owns writing to that shared
    // storage; this just needs the list to pass into PlayfieldColorStrip's
    // quickColors prop.
    const selectedQuickColor = ref(null);
    const colorPaletteStorage = useColorPaletteStorage();
    const quickColorPalette = computed(() => colorPaletteStorage.value || []);

    // The playfield's row count is a single setting for the whole ROM (see
    // the Options tab's Superchip/pfres controls), not something each
    // background can override individually.
    const backgroundRows = computed(() =>
      backgroundDataRows(configurationStorage && configurationStorage.value));

    // A background keeps the rows it has: a change of pfres or kernel never pads or crops it (a shorter one
    // just leaves the rest of the playfield empty, see generateBackgrounds).

    // Per-row playfield colors (batari Basic pfcolors) are an all-or-nothing,
    // project-wide setting (see the Options tab) - once it's on, every
    // background needs its  color list, since the compiled kernel always
    // draws every background's playfield from that color table.
    // (With DPC+ they are also on by that kernel's option, as the generator takes it: dpcPlusPfColorsOn.)
    const pfColorsEnabled = computed(() => !!(configurationStorage && configurationStorage.value &&
      (configurationStorage.value.enablePfColors ||
        (configurationStorage.value.kernel === 'dpcplus' && configurationStorage.value.enableDpcPlusPfColors))));
    // DPC+ can also color every row of the background behind the playfield (Options tab), separately from the playfield's.
    const bkColorsEnabled = computed(() => !!(configurationStorage && configurationStorage.value &&
      configurationStorage.value.kernel === 'dpcplus' && configurationStorage.value.enableDpcPlusBkColors));

    // Fills in a missing/mismatched-length row color list so every background
    // has one whenever per-row colors are enabled, without clobbering colors
    // the user already picked. Left alone (not deleted) while the option is
    // off, so re-enabling it doesn't lose prior work.
    const ensureRowColors = (background, pixelRows) => {
      // (A list has as many colors as the pixel rows, unless the background has separate color rows, see backgroundColorRows.)
      const pfRows = backgroundHasColorRows(background, 'pf') ? backgroundColorRows(background, 'pf') : pixelRows;
      const bkRows = backgroundHasColorRows(background, 'bk') ? backgroundColorRows(background, 'bk') : pixelRows;
      if (pfColorsEnabled.value) {
        const existing = background.rowColors || [];
        if (existing.length !== pfRows) {
          const next = existing.slice(0, pfRows);
          while (next.length < pfRows) next.push(DEFAULT_ROW_COLOR);
          background.rowColors = next;
        }
      }
      // The background rows start out black, and are a separate list from the playfield's colors.
      if (bkColorsEnabled.value) {
        const existing = background.bkRowColors || [];
        if (!background.bkRowColors || existing.length !== bkRows) {
          const next = existing.slice(0, bkRows);
          while (next.length < bkRows) next.push(DEFAULT_BK_ROW_COLOR);
          background.bkRowColors = next;
        }
      }
    };

    // Purely a visual "which card am I looking at" marker - same
    // selectCard/selectedCardId/deselectCard pattern as MusicEditor.vue's
    // song cards and the other tabs'  entry cards (see
    // MusicEditor.vue's  comment for the full reasoning): plain local
    // component state, not persisted, not wired into anything else.
    // Shift+click selects a range, Ctrl/Cmd+click adds or removes a card (see hooks/card-selection.js): deleting or
    // dragging one of several selected cards does it to all of them.
    const selectedCardId = ref(null);
    const {selectedCardIds, selectCard, deselectCard, idsToDelete, deleteQuestion, remapIds: remapSelectedIds} =
      useCardSelection(
          () => visibleEntries().map(({card}) => card.id), selectedCardId);
    // The indices, in the whole list, of the selected cards (dragging one of them moves them all).
    const getSelectedFullIndices = () => state.value.backgrounds
        .map((background, index) => (selectedCardIds.value.includes(background.id) ? index : -1)).filter((index) => index >= 0);

    // Tracks whichever background's PixelEditor instance was last
    // clicked into (see its "activate" event, emitted from PixelEditor.vue's
    // handleActivate) - the single toolbar above (Eraser/Pencil/Undo/Redo/
    // Export/Import) acts on THIS editor, since every card's
    // per-instance toolbar is now hidden (hideToolbar on the pixel-editor
    // below) in favor of this one shared row. Same mechanism as
    // PlayerEditor.vue's activeFrameEditor/setActiveFrame.
    // activeBackgroundId is what effectiveEditor below compares against
    // selectedBackground to decide whether this explicit click still
    // "wins" over the selected card's fallback editor.
    const activeEditor = ref(null);
    const activeBackgroundId = ref(null);
    const setActiveEditor = (editorInstance, backgroundId) => {
      activeEditor.value = editorInstance;
      activeBackgroundId.value = backgroundId;
    };

    // Unique per background - used as its PixelEditor.vue $ref name (see
    // the template) so effectiveEditor (declared further below, once
    // selectedBackground itself exists) can resolve straight to its
    // component instance.
    const pixelEditorRefKey = (background) => `pixelEditor_${background.id}`;

    const state = computed({
      get() {
        try {
          const data = processBackgroundStorageDefaults(backgroundsStorage);
          data.backgrounds.forEach((background) => ensureRowColors(background, background.pixels.length));
          return data;
        } catch (e) {
          console.error('Error loading backgrounds from local storage', e);
          return DEFAULT_BACKGROUNDS;
        }
      },

      set(newState) {
        backgroundsStorage.value = newState;
      },
    });

    // The solid color of the playfield or of the background behind it (no row colors): a color byte, or null to keep the current one.
    const handleSetSolidColor = (background, key, byte) => {
      Vue.set(background, key, byte === undefined ? null : byte);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const handleChildChange = () => {
      state.value = state.value;
    };

    // DPC+: a background can set the number of rows on screen (pfres); left empty it follows the project's (Options tab).
    const kernelIsDpcPlus = computed(() => !!(configurationStorage.value && configurationStorage.value.kernel === 'dpcplus'));
    // DPC+ keeps up to 255 rows of playfield; a background taller than fits with the screen scrolls without wrapping.
    const maxBackgroundRows = computed(() => kernelIsDpcPlus.value ? 255 : 64);
    const defaultPfres = computed(() => dpcPlusPfresOf(configurationStorage.value));
    // The arrows of the number field change its value without a change event (that comes when the field is left), so this is also called on
    // every input, with the background looked up again (the list is read again from storage after every change).
    const handleChangeBackgroundPfres = (staleBackground, value) => {
      const background = state.value.backgrounds.find((candidate) => candidate.id === staleBackground.id) || staleBackground;
      const rows = Math.round(Number(value));
      if (rows > 0) background.pfres = Math.min(192, rows);
      else delete background.pfres;
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // DPC+: the playfield colors and the background colors can have a number of separate rows (pfColorRows, bkColorRows; see
    // backgroundColorRows), spread over the height of the picture. The list of colors is cut or stretched to the new number.
    // `before` is the list of colors to cut or stretch (while a number is being typed it is the list the field started from, so that the colors
    // are not cut to the first digit on the way to the second).
    const handleChangeColorRows = (background, kind, value, before = null) => {
      const key = kind === 'bk' ? 'bkColorRows' : 'pfColorRows';
      const listKey = kind === 'bk' ? 'bkRowColors' : 'rowColors';
      const rows = Math.round(Number(value));
      const from = before || background[listKey] || [];
      if (rows > 0) background[key] = Math.min(192, rows);
      else delete background[key];
      const next = backgroundColorRows(background, kind);
      if (from.length && next > 0) background[listKey] = colorsAtRows(from, next);
      ensureRowColors(background, background.pixels.length);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    // The arrows of the number field change its value without a change event (that comes when the field is left), so the color bars follow on
    // every change of the value. The colors the field started from are kept until it is left, and every number is made from those.
    const colorRowsStart = new Map();
    const currentBackground = (id) => state.value.backgrounds.find((candidate) => candidate.id === id);
    const handleTypeColorRows = (background, kind, value) => {
      const key = `${background.id}-${kind}`;
      // (The background is looked up again: the list is read again from storage after every change, so the object the field had when it
      // was first used is not the current one by the next change.)
      const current = currentBackground(background.id);
      if (!current) return;
      if (!colorRowsStart.has(key)) colorRowsStart.set(key, (current[kind === 'bk' ? 'bkRowColors' : 'rowColors'] || []).slice());
      handleChangeColorRows(current, kind, value, colorRowsStart.get(key));
    };
    // The field is left: the next change starts from the colors as they are now.
    const handleLeaveColorRows = (background, kind, value) => {
      const current = currentBackground(background.id);
      if (current) handleChangeColorRows(current, kind, value, colorRowsStart.get(`${background.id}-${kind}`) || null);
      colorRowsStart.delete(`${background.id}-${kind}`);
    };
    // The colors as the rows of the picture show them: the color of the row at the middle of a row when the colors have fewer rows than the picture
    // (the lists are then not the rows of the pixels), and the colors the row covers, as bands, when they have more.
    const pixelRowColors = (colors, background) => colorsAtRows(colors, background.pixels.length);

    // DPC+: each group of 8 columns can have a number of separate rows on screen (groupPfres, four numbers). The picture is one
    // matrix as tall as the tallest group; a shorter group is drawn in the top of its columns and the rows under are dimmed.
    const handleToggleGroupPfres = (background) => {
      if (background.groupPfres) delete background.groupPfres;
      else {
        const rows = Math.min(192, Math.max(1, background.pfres || defaultPfres.value));
        background.groupPfres = [rows, rows, rows, rows];
        // The picture is as tall as the groups.
        if (background.pixels.length !== rows) {
          background.customHeight = true;
          background.pixels = resizePixelMatrixHeight(background.pixels, rows, pfWidth.value, false);
          ensureRowColors(background, rows);
        }
      }
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    // One group's columns as a picture of the rows it has, drawn as tall as the others (every group fills the screen height).
    const groupAspectRatio = (rows) => {
      const config = configurationStorage.value;
      return (8 * PF_COLUMN_WIDTH_PX * CLOCK_ASPECT_PER_LINE_PAIR) / (rows * dpcPlusRowLinesFor(config, rows) / 2);
    };
    const groupPixels = (background, group) => background.pixels.slice(0, background.groupPfres[group]).map((row) => row.slice(group * 8, group * 8 + 8));
    // The row colors (kept at the resolution of the tallest group) as the rows of a group show them.
    const groupColors = (colors, rows) => {
      if (!colors) return null;
      return Array.from({length: rows}, (unused, row) => colors[Math.min(colors.length - 1, Math.floor((row + 0.5) * colors.length / rows))]);
    };
    // The colors of a list that has a number of rows other than the picture's (null when it has the same number, or none): the picture draws them at the
    // heights they have, whatever the rows of the picture are.
    const fineColors = (colors, rows) => (colors && colors.length !== rows ? colors : null);
    // The Clear button of a background with groups: the drawing and the row colors, as the broom of a background without groups does.
    const handleClearGroupBackground = (background) => {
      background.pixels = background.pixels.map((row) => row.map(() => 0));
      handleClearRowColors(background);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const handleGroupPixelsInput = (background, group, pixels) => {
      const rows = background.groupPfres[group];
      if (pixels.length !== rows) return;
      background.pixels = background.pixels.map((row, y) => {
        if (y >= rows) return row;
        const next = row.slice();
        pixels[y].forEach((value, x) => {
          next[group * 8 + x] = value;
        });
        return next;
      });
      handleChildChange();
    };
    const handleChangeGroupPfres = (background, group, value) => {
      const rows = Math.min(192, Math.max(1, Math.round(Number(value)) || background.groupPfres[group]));
      background.groupPfres.splice(group, 1, rows);
      const tallest = Math.max(...background.groupPfres);
      if (tallest > background.pixels.length) {
        background.customHeight = true;
        background.pixels = resizePixelMatrixHeight(background.pixels, tallest, pfWidth.value, false);
        ensureRowColors(background, tallest);
      }
      background.pixels.forEach((row, y) => row.forEach((cell, x) => {
        if (cell && y >= background.groupPfres[x >> 3]) row[x] = 0;
      }));
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // The card the shared "Set height" tool acts on - null (and the tool
    // disabled) until a card is selected. Same reasoning as PlayerEditor.
    // vue's selectedAnimation: keyed off selectedCardId (the card the
    // user is actually looking at), not activeEditor (the last editor
    // clicked INTO to draw/undo/etc.), so it can't stay pointed at a stale
    // background from a different card that was merely drawn on earlier.
    const selectedBackground = computed(
        () => state.value.backgrounds.find((background) => background.id === selectedCardId.value) || null);

    // What the shared toolbar (Eraser/Pencil/Undo/Redo/Export/Import) above
    // actually acts on - the explicitly-clicked-into editor (activeEditor)
    // when it still belongs to the currently SELECTED background, otherwise
    // the selected background's editor, resolved via its $ref. Without
    // this fallback, the tools stayed disabled (and no editor was targeted
    // at all) until a graphic was clicked directly - reported as unexpected,
    // since selecting a card (clicking its title/name field/anywhere else in
    // it) already conveys "I'm working on this one" the same way every other
    // per-card tool in this app already treats it. Same reasoning/shape as
    // PlayerEditor.vue's effectiveFrameEditor. Declared here (not
    // alongside activeEditor above) purely for readability - it reads
    // selectedBackground, so it makes more sense sitting next to it.
    const effectiveEditor = computed(() => {
      // A tile of the Tiles section that was clicked last.
      if (activeEditor.value && String(activeBackgroundId.value).startsWith('tile-')) return activeEditor.value;
      if (activeEditor.value && selectedBackground.value && activeBackgroundId.value === selectedBackground.value.id) {
        return activeEditor.value;
      }
      if (selectedBackground.value) {
        const refs = instance.proxy.$refs[pixelEditorRefKey(selectedBackground.value)];
        return Array.isArray(refs) ? refs[0] || null : refs || null;
      }
      return null;
    });

    // Same fields as PixelEditor.vue's height-menu state, now living
    // here instead, since the menu itself moved to this shared toolbar.
    const heightMenuVisible = ref(false);
    const heightMenuValue = ref(0);
    const heightMenuScaleContents = ref(false);
    // With a tile selected (the Tiles section), Set height sets the rows of every tile (1 to MAX_TILE_ROWS): the tiles all have the same height.
    const heightForTiles = computed(() => tilemapOn.value && selectedTileId.value !== null && selectedTileIds.value.includes(selectedTileId.value));
    const openHeightMenu = () => {
      if (heightForTiles.value) {
        heightMenuValue.value = tileRows.value;
        heightMenuScaleContents.value = false;
        return;
      }
      if (!selectedBackground.value) return;
      heightMenuValue.value = selectedBackground.value.pixels.length;
      heightMenuScaleContents.value = false;
    };
    // The "H" hotkey - see PlayerEditor.vue's handleSetHeightHotkey for
    // why this can't just call openHeightMenu alone.
    const handleSetHeightHotkey = () => {
      if (!selectedBackground.value && !heightForTiles.value) return;
      openHeightMenu();
      heightMenuVisible.value = true;
    };
    // Set height can be undone: the rows, their colors and the custom height flag as they were before and after.
    const heightSnapshot = (background) => structuredClone({pixels: background.pixels, rowColors: background.rowColors,
      bkRowColors: background.bkRowColors, customHeight: background.customHeight});
    const restoreHeight = (id, snapshot) => {
      const current = state.value.backgrounds.find((candidate) => candidate.id === id);
      if (!current) return;
      const copy = structuredClone(snapshot);
      current.pixels = copy.pixels;
      current.rowColors = copy.rowColors;
      current.bkRowColors = copy.bkRowColors;
      current.customHeight = copy.customHeight;
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    // All the tiles to a height: each cut or padded with empty rows, or scaled. (Not while a background is kept as tile numbers: its cells are
    // a tile's rows.) It can be undone.
    const setTilesHeight = (rows) => {
      if (mappedBackgroundCount.value > 0) {
        tilesMessage.value = 'The tiles keep their height while a background is converted to tiles: Back to pixels first.';
        return;
      }
      const before = tileSnapshot();
      saveTileSet({...tileSet.value, height: rows, tiles: tileSet.value.tiles.map((tile) =>
        ({...tile, pixels: resizePixelMatrixHeight(cellPixels(tile.pixels || [], 0, 0, tileRows.value, tileWidthPx.value), rows, tileWidthPx.value,
            heightMenuScaleContents.value)}))});
      recordTiles(before);
    };
    const handleUnifiedSetHeight = () => {
      if (heightForTiles.value) {
        heightMenuValue.value = Math.max(1, Math.min(MAX_TILE_ROWS, Number(heightMenuValue.value) || 1));
        if (heightMenuValue.value !== tileRows.value) setTilesHeight(heightMenuValue.value);
        heightMenuVisible.value = false;
        return;
      }
      const background = selectedBackground.value;
      if (!background) return;
      heightMenuValue.value = Math.max(1, Math.min(maxBackgroundRows.value, heightMenuValue.value || 0));
      const before = heightSnapshot(background);
      if (heightMenuValue.value !== background.pixels.length) {
        // Same customHeight flag handleBackgroundPixelsInput/
        // handlePasteBackground set on any other resize - opts this
        // background out of reflowBackgroundsToHeight's automatic
        // pfres-driven row count, so a later Superchip pfres change doesn't
        // silently undo this resize.
        background.customHeight = true;
        // Scaling the contents scales each row's color along with its pixels.
        if (heightMenuScaleContents.value && background.rowColors && !backgroundHasColorRows(background, 'pf')) {
          background.rowColors = scaleRowColors(
              background.rowColors, background.pixels.length, heightMenuValue.value);
        }
        if (heightMenuScaleContents.value && background.bkRowColors && !backgroundHasColorRows(background, 'bk')) {
          background.bkRowColors = scaleRowColors(
              background.bkRowColors, background.pixels.length, heightMenuValue.value);
        }
        background.pixels = resizePixelMatrixHeight(
            background.pixels, heightMenuValue.value, pfWidth.value, heightMenuScaleContents.value);
        const after = heightSnapshot(background);
        const id = background.id;
        recordReorder({
          undo: () => restoreHeight(id, before),
          redo: () => restoreHeight(id, after),
          isCurrent: () => state.value.backgrounds.some((candidate) => candidate.id === id),
        });
      }
      handleChildChange();
      instance.proxy.$forceUpdate();
      heightMenuVisible.value = false;
    };

    // Handles the pixel editor's "input" event for a background's
    // pixel grid - a plain pixel edit (drawing/erasing) never changes the
    // row count, but the pixel editor's "Set height" tool (enabled here via
    // allowChangingHeight) emits a resized array instead. Marking
    // customHeight the moment a resize is detected is what lets
    // reflowBackgroundsToHeight (blocks/background.js) leave this
    // background alone from then on, even if pfres later changes -
    // otherwise a pfres change would silently truncate/pad rows the user
    // added on purpose (e.g. for a future vertical scroll block to pan
    // through).
    const handleBackgroundPixelsInput = (background, pixels) => {
      if (pixels.length !== background.pixels.length) background.customHeight = true;
      if (tilemapOn.value && background.tileMap) {
        handleMappedPixelsInput(background, pixels);
        return;
      }
      background.pixels = pixels;
      handleChildChange();
    };

    // Every card starts collapsed on every visit to this tab (see
    // collapseAll's  comment in hooks/collapse.js), not just ones never
    // expanded before.
    const {isCollapsed, toggleCollapsed, collapseAll, remapIds: remapCollapsedIds} = useCollapsedIds('background', true);
    // The Tiles section opens or closes like the Text tab's font editor (one fixed entry under its name).
    const {isCollapsed: isTilesCollapsed, toggleCollapsed: toggleTilesCollapsed} = useCollapsedIds('background-tiles');
    collapseAll();

    // Card reordering (see hooks/drag-reorder.js). .background-list is a CSS grid (see its comment: two or more cards can sit side by
    // side on a wide enough window), so the hook marks the left or right edge of the card the pointer is over (sideBySide). The
    // backgrounds are numbered 1, 2, 3... by their place after a move, a delete or a copy, so the ID shown on a card and the number the
    // game switches backgrounds with follow the order of the list. Everything that referred to a background by its old id is pointed
    // at its new one (see utils/card-refs.js), and each card keeps its collapsed state and selection.
    const renumbered = (idMap) => {
      remapSelectedIds(idMap);
      remapCollapsedIds(idMap);
    };
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.backgrounds,
        (items) => {
          state.value.backgrounds = items;
          handleChildChange();
        },
        getSelectedFullIndices,
        {sideBySide: () => cardColumns.value, renumber: {kind: 'background', onRenumbered: renumbered}},
    );

    // Folders for the cards (see hooks/card-folders.js and components/CardFolderBar.vue): the backgrounds keep their numbers and their place in
    // the one list, a folder is only for looking after them. The folders are `folders` of the storage, the folder a background is in its `folder`.
    const foldersOf = () => {
      const data = state.value;
      if (!Array.isArray(data.folders)) data.folders = [];
      return data.folders;
    };
    const refresh = () => {
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const {openFolderId, visibleEntries, openFolder, newCardFolder, handleAddFolder, handleDeleteFolder, draggingCardIndex, wrapHandleListeners, handleDropCards} =
      useCardFolders({
        getCards: () => state.value.backgrounds,
        getFolders: foldersOf,
        setFolders: (folders) => {
          state.value.folders = folders;
        },
        refresh,
        getSelectedIndices: getSelectedFullIndices,
        deselectCard,
        tab: 'playfield',
      });
    const cardHandleListeners = wrapHandleListeners(dragHandleListeners);

    // How tall the pinned folders are: the toolbar of the graphics sticks under them, not behind them (as on the Sprite tab).
    const folderToolbar = ref(null);
    const folderToolbarHeight = ref(0);
    // Whether the folders are pinned at the top of the tab (scrolled): they get room above them then.
    const folderToolbarPinned = ref(false);
    let pinnedContainer = null;
    // (One pixel less than it is, rounded down: the toolbar under it overlaps its edge instead of leaving a gap that shows what is behind.)
    const pinnedHeight = (element) => Math.max(0, Math.floor(element.getBoundingClientRect().height) - 1);
    const updatePinned = () => {
      const element = folderToolbar.value;
      if (!element || !pinnedContainer) return;
      folderToolbarPinned.value = element.getBoundingClientRect().top <= pinnedContainer.getBoundingClientRect().top + 1;
      folderToolbarHeight.value = pinnedHeight(element);
    };
    let folderToolbarObserver = null;
    onMounted(() => {
      const element = folderToolbar.value;
      if (!element) return;
      folderToolbarHeight.value = pinnedHeight(element);
      pinnedContainer = element.closest('.editor-container');
      if (pinnedContainer) {
        pinnedContainer.addEventListener('scroll', updatePinned);
        updatePinned();
      }
      if (typeof ResizeObserver !== 'undefined') {
        folderToolbarObserver = new ResizeObserver(() => {
          folderToolbarHeight.value = pinnedHeight(element);
        });
        folderToolbarObserver.observe(element, {box: 'border-box'});
      }
    });
    // How tall the toolbar of the graphics is: the Tiles section sticks under it (and the folders above it) when the tab scrolls.
    const graphicToolbarHeight = ref(0);
    let graphicToolbarObserver = null;
    onMounted(() => {
      const toolbar = instance.proxy.$refs.graphicToolbar;
      const element = toolbar && toolbar.$el;
      if (!element || typeof ResizeObserver === 'undefined') return;
      graphicToolbarObserver = new ResizeObserver(() => {
        graphicToolbarHeight.value = pinnedHeight(element);
      });
      graphicToolbarObserver.observe(element, {box: 'border-box'});
    });
    onBeforeUnmount(() => {
      if (graphicToolbarObserver) graphicToolbarObserver.disconnect();
      if (folderToolbarObserver) folderToolbarObserver.disconnect();
      if (pinnedContainer) pinnedContainer.removeEventListener('scroll', updatePinned);
    });

    const setRowColors = (background, colors) => {
      background.rowColors = colors;
      handleChildChange();
      // The editors hold their  display state, so persisting isn't enough to
      // repaint the preview — force a re-render so the pixel editor receives the
      // updated row colors and recolors its canvas.
      instance.proxy.$forceUpdate();
    };
    // A change made by the user (the color strip, Clear, Paste) can be undone; moving selected
    // pixels takes the row colors along through the pixel editor's history instead.
    const handleRowColorsInput = (background, colors) => {
      recordRowColorsChange(background, setRowColors, colors);
    };


    // What changes a background's fields without a history (the background row colors, Clear, Paste) is recorded for
    // undo and redo (see recordFieldsChange).
    const saveAndRedraw = () => {
      handleChildChange();
      instance.proxy.$forceUpdate();
    };
    const bkRowColorsKeys = new WeakMap();
    const handleBkRowColorsInput = (background, colors) => {
      // Picking colors for a run of rows within a moment of each other is one step.
      if (!bkRowColorsKeys.has(background)) bkRowColorsKeys.set(background, {});
      recordFieldsChange([{owner: background, fields: ['bkRowColors']}], () => {
        background.bkRowColors = colors;
        saveAndRedraw();
      }, {key: bkRowColorsKeys.get(background), afterChange: saveAndRedraw});
    };

    // Moving selected pixels with the Move tool takes the colors of their rows along
    // (PixelEditor.vue's 'move-rows' event - see utils/row-color-move.js).
    const handleMoveRows = (background, move) => {
      // (Color separate rows are not the rows of the pixels, so the colors stay.)
      if (!pfColorsEnabled.value || backgroundHasColorRows(background, 'pf')) return;
      const colors = rowColorsForMove(background, move);
      if (colors) setRowColors(background, colors);
    };

    // Clearing a graphic (PixelEditor.vue's "clear" event, separate from
    // an ordinary pixel edit) resets its row colors back to the same default
    // every row starts at, rather than leaving old per-row picks behind on
    // an otherwise blank graphic.
    // Turning the whole picture upside down turns the row colors with it (both lists, when the project has them), and Undo puts them back.
    const handleFlipRowColors = (background) => {
      recordFieldsChange([{owner: background, fields: ['rowColors', 'bkRowColors']}], () => {
        if (pfColorsEnabled.value && background.rowColors) background.rowColors = background.rowColors.slice().reverse();
        if (bkColorsEnabled.value && background.bkRowColors) background.bkRowColors = background.bkRowColors.slice().reverse();
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };
    // The two buttons under the color strips: each clears the colors of its strip only.
    const handleClearPlayfieldRowColors = (background) => {
      recordFieldsChange([{owner: background, fields: ['rowColors']}], () => {
        if (pfColorsEnabled.value && background.rowColors) background.rowColors = clearRowColors(background.rowColors);
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };
    const handleClearBkRowColors = (background) => {
      recordFieldsChange([{owner: background, fields: ['bkRowColors']}], () => {
        if (bkColorsEnabled.value && background.bkRowColors) background.bkRowColors = background.bkRowColors.map(() => DEFAULT_BK_ROW_COLOR);
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };
    const handleClearRowColors = (background) => {
      recordFieldsChange([{owner: background, fields: ['rowColors', 'bkRowColors']}], () => {
        if (pfColorsEnabled.value && background.rowColors) background.rowColors = clearRowColors(background.rowColors);
        if (bkColorsEnabled.value && background.bkRowColors) background.bkRowColors = background.bkRowColors.map(() => DEFAULT_BK_ROW_COLOR);
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };

    // CSS colors passed to the pixel editor so it can tint each row. Returns
    // null when per-row colors are off (uniform fgColor). A pure black row
    // ($00) is nudged to near-black so the editor still counts those pixels
    // as "on" rather than reading them as the black background.
    const editorRowColors = (background) => {
      const nudged = (byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      };
      if (!pfColorsEnabled.value || !background.rowColors) {
        // No row colors: the solid color the background sets for the playfield, when it has one, for every row.
        return background.playfieldColor === undefined || background.playfieldColor === null ? null : [nudged(background.playfieldColor)];
      }
      return background.rowColors.map(nudged);
    };

    // The background row colors, shown behind the cells that are off, when the DPC+ kernel colors them.
    const editorBkRowColors = (background) => {
      if (!bkColorsEnabled.value || !background.bkRowColors) {
        // The same for the background behind the playfield.
        return background.backgroundColor === undefined || background.backgroundColor === null ? null : [colorByteToCss(background.backgroundColor)];
      }
      return background.bkRowColors.map((byte) => colorByteToCss(byte));
    };

    // Same "colors-only" pair as PlayerEditor.vue's
    // handleCopyRowColors/handlePasteRowColors, applied to a background's
    // rowColors instead of a frame's.
    const handleCopyBackgroundRowColors = (background) => {
      copiedBackgroundRowColors.value = structuredClone(background.rowColors || []);
      copiedPfColorRows = background.pfColorRows;
    };
    // The colors go with the number of rows they were made for.
    const pasteColorsAndRows = (background, rowsKey, rows, listKey, colors) => {
      recordFieldsChange([{owner: background, fields: [rowsKey, listKey]}], () => {
        if (rows > 0) background[rowsKey] = rows;
        else delete background[rowsKey];
        background[listKey] = structuredClone(colors);
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };
    const handlePasteBackgroundRowColors = (background) => {
      if (!copiedBackgroundRowColors.value) return;
      pasteColorsAndRows(background, 'pfColorRows', copiedPfColorRows, 'rowColors', copiedBackgroundRowColors.value);
    };

    // The same pair for the background row colors (the colors behind the cells that are off).
    const handleCopyBackgroundBkRowColors = (background) => {
      copiedBackgroundBkRowColors.value = structuredClone(background.bkRowColors || []);
      copiedBkColorRows = background.bkColorRows;
    };
    const handlePasteBackgroundBkRowColors = (background) => {
      if (!copiedBackgroundBkRowColors.value) return;
      pasteColorsAndRows(background, 'bkColorRows', copiedBkColorRows, 'bkRowColors', copiedBackgroundBkRowColors.value);
    };

    // Same "whole image, pixels + row colors together" pair as
    // PlayerEditor.vue's  handleCopyFrame/handlePasteFrame.
    const handleCopyBackground = (background) => {
      copiedBackgroundData.value = {
        pixels: structuredClone(background.pixels),
        ...(pfColorsEnabled.value && background.rowColors ?
          {rowColors: structuredClone(background.rowColors)} : {}),
        ...(bkColorsEnabled.value && background.bkRowColors ?
          {bkRowColors: structuredClone(background.bkRowColors)} : {}),
        pfColorRows: background.pfColorRows,
        bkColorRows: background.bkColorRows,
      };
    };
    const handlePasteBackground = (background) => {
      if (!copiedBackgroundData.value) return;
      // Same reasoning as handleBackgroundPixelsInput's customHeight
      // check - pasting a taller/shorter image is just as much a resize as
      // dragging the pixel editor's "Set height" slider.
      recordFieldsChange([{owner: background, fields: ['pixels', 'rowColors', 'bkRowColors', 'customHeight', 'pfColorRows', 'bkColorRows']}], () => {
        if (copiedBackgroundData.value.pixels.length !== background.pixels.length) {
          background.customHeight = true;
        }
        // The copy's color rows go with its colors.
        ['pfColorRows', 'bkColorRows'].forEach((key) => {
          if (copiedBackgroundData.value[key] > 0) background[key] = copiedBackgroundData.value[key];
          else delete background[key];
        });
        background.pixels = structuredClone(copiedBackgroundData.value.pixels);
        if (pfColorsEnabled.value && copiedBackgroundData.value.rowColors) {
          background.rowColors = structuredClone(copiedBackgroundData.value.rowColors);
        }
        if (bkColorsEnabled.value && copiedBackgroundData.value.bkRowColors) {
          background.bkRowColors = structuredClone(copiedBackgroundData.value.bkRowColors);
        }
        saveAndRedraw();
      }, {afterChange: saveAndRedraw});
    };

    const handleAddBackground = () => {
      const backgrounds = state.value.backgrounds;
      const maxId = max(backgrounds.map((o) => o.id)) || 0;
      const newBackground = {
        id: maxId + 1,
        ...newCardFolder(),
        name: 'Background',
        pixels: buildDefaultBackgroundPixels(backgroundRows.value, pfWidth.value),
      };

      state.value.backgrounds.push(newBackground);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Builds and loads a throwaway ROM showing just this background (see
    // buildBackgroundPreviewRom); same busy handling as the title screen Play button.
    const testingId = ref(null);
    const buildInProgress = useBuildInProgress();
    const handleTestBackground = async (background) => {
      if (buildInProgress.value) return;
      testingId.value = background.id;
      try {
        await buildBackgroundPreviewRom(background.id, background.name);
      } finally {
        testingId.value = null;
      }
    };

    // A copy of a background (pixels, row colors, height) put right after it: the backgrounds after it are numbered again.
    const handleDuplicateBackground = (background) => {
      const copy = JSON.parse(JSON.stringify(background));
      copy.name = `${background.name || 'Background'} copy`;
      const idMap = insertCardAfter('background', state.value.backgrounds, background, copy);
      if (idMap) renumbered(idMap);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteBackground = (background) => {
      const doomed = idsToDelete(background.id, 1);
      const {remaining, idMap} = removeCards('background', state.value.backgrounds, doomed);
      state.value.backgrounds = remaining;
      if (idMap) renumbered(idMap);
      if (doomed.length > 1) deselectCard();
      console.info('Deleted ', background);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    return {selectedCardId, selectedCardIds, selectCard, deselectCard, deleteQuestion, backgroundAspectRatio,
      state, handleChildChange, handleSetSolidColor, handleBackgroundPixelsInput, handleAddBackground, handleDeleteBackground, handleDuplicateBackground,
      testingId, buildInProgress, handleTestBackground,
      selectedQuickColor, quickColorPalette,
      handleRowColorsInput, handleMoveRows, handleFlipRowColors, handleClearRowColors, handleClearPlayfieldRowColors, handleClearBkRowColors, editorRowColors, editorBkRowColors, isCollapsed, toggleCollapsed,
      DEFAULT_BK_ROW_COLOR, zoom, showPixelGrid, showPixelGridLabels, tilemapOn, showTiles, tileGridFor, isTilesCollapsed, toggleTilesCollapsed, tilesEntry: {id: 'tiles'}, tileSet, tileRows, handleAddTile,
      tilesMessage, mappedBackgroundCount, makeTilesVisible, makeTilesReplace, makeTilesWidth, makeTilesHeight, makeTilesHeightItems, makeTilesNarrow, showNarrowTilesOption,
      makeTilesSizeLocked, openMakeTiles, handleMakeTiles, backToPixelsVisible, backToPixelsDeleteTiles, openBackToPixels, TILE_WIDTHS, MAX_TILE_ROWS, tileWidthPx, handleConvertToTileNumbers, handleConvertToPixels,
      handleDeleteTile, handleDuplicateTile, copiedTilePixels, handleCopyTile, handlePasteTile, handleTileInput, selectedTileId, selectedTileIds, deselectTile, handleSelectTile, tileDeleteQuestion,
      tileDragAttrs, tileDragCardClass, tileDragHandleListeners, tileDragTargetListeners, stampOn, setStampOn, stampFor, handleSelectBackgroundCard, handleDeselectCards, tileAspectRatio, tileCardStyle, tileZoom, tilesSheet, TILE_ZOOM_LEVELS, stampFlip, setStampFlip, cardColumns, editorWidth, pfWidth, backgroundRows, pfColorsEnabled, bkColorsEnabled, handleBkRowColorsInput,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
      visibleEntries, foldersOf, openFolderId, openFolder, refresh, handleAddFolder, handleDeleteFolder, handleDropCards, draggingCardIndex, cardHandleListeners,
      folderToolbar, folderToolbarHeight, folderToolbarPinned, graphicToolbarHeight,
      copiedBackgroundRowColors, handleCopyBackgroundRowColors, handlePasteBackgroundRowColors,
      copiedBackgroundBkRowColors, handleCopyBackgroundBkRowColors, handlePasteBackgroundBkRowColors,
      copiedBackgroundData, handleCopyBackground, handlePasteBackground,
      activeEditor, setActiveEditor, selectedBackground,
      effectiveEditor, pixelEditorRefKey,
      heightMenuVisible, heightMenuValue, heightMenuScaleContents, openHeightMenu, handleUnifiedSetHeight, heightForTiles,
      handleSetHeightHotkey, kernelIsDpcPlus, maxBackgroundRows, defaultPfres, handleChangeBackgroundPfres,
      handleToggleGroupPfres, handleChangeGroupPfres, groupAspectRatio, groupPixels, groupColors, fineColors, handleGroupPixelsInput, handleClearGroupBackground, handleChangeColorRows, handleTypeColorRows, handleLeaveColorRows, pixelRowColors};
  },
});
</script>
<style scoped>
/* The Tiles section: a plain chevron and title like the Text tab's font editor and the Options tab's sections. */
/* (No margin under it: the line it ends with is as far above the first card as the cards are from the sides, 16 pixels, as under the toolbar.)
   Pinned under the toolbar when the tab scrolls, as the toolbar is under the folders (--tiles-sticky-top: their heights), with the tab's color
   behind it (App.vue has the dark and subdued ones); its tiles scroll inside it past a third of the window, so the cards stay in view. */
.tiles-section {
  margin-top: 8px;
  position: sticky;
  top: var(--tiles-sticky-top, 0px);
  z-index: 1;
  background-color: #fff;
}

.desaturate-app-colors .tiles-section {
  background-color: #e1e1e1;
}

/* (The padding keeps a selected tile's outline, drawn 2 pixels outside it, inside the scrolling row: without it the row cut the outline off
   on the edges the tile touches, the top for the first row of tiles, the sides for the first and last tile of a row.) */
.tiles-section .tiles-row {
  max-height: 33vh;
  overflow-y: auto;
  padding: 3px;
}

/* The full width of the tab, as the toolbar's line. */
.tiles-divider {
  margin: 8px -16px;
  max-width: none;
}

.option-section-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.option-section-content {
  padding-left: 4px;
}

.tiles-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin: 8px 0 12px;
}

.make-tiles-fields {
  display: flex;
  gap: 16px;
}

.make-tiles-narrow {
  margin-top: 4px;
}

.make-tiles-replace {
  margin-top: 16px;
}

.make-tiles-hint {
  margin-top: 8px;
}

.tiles-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tiles-message {
  margin-top: 4px;
}

.tiles-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
}

/* A tile is the pixel editor's card (width set from the zoom, at least the ID and the corner buttons), selected as a frame of the Sprite tab is. */
.tile-card {
  position: relative;
  min-width: 100px;
}

/* The tile sheet (the Tiles section's zoom below 100%): the pictures side by side, with no card, padding, ID or buttons. */
.tiles-row.tiles-sheet {
  gap: 0;
}

.tiles-sheet .tile-card {
  min-width: 0;
}

.tiles-sheet .tile-card >>> .v-card {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.tiles-sheet .tile-card >>> .v-card__text {
  padding: 0;
}

.tiles-sheet .tile-card >>> .editor-with-sidebar {
  margin-top: 0;
}

/* The picture as wide as the zoom makes it (--tile-canvas-width), in the middle of a card the buttons keep wider. */
.tile-card >>> .proportion-wrapper {
  flex: 0 0 var(--tile-canvas-width);
}

.tile-card >>> .editor-with-sidebar {
  justify-content: center;
}

/* Above the tiles beside it (in the sheet they touch, and a later tile was drawn over the outline). */
.tile-card-selected {
  z-index: 1;
}

.tile-card-selected >>> .v-card {
  border-color: var(--v-primary-base, #1976d2) !important;
  outline: 2px solid var(--v-primary-base, #1976d2) !important;
}

/* The ID as a frame's (PlayerEditor.vue's .frame-number-badge), the corner buttons as its .frame-corner-toolbar. */
.tile-id-badge {
  position: relative;
  text-align: left;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.75;
  margin-top: -8px;
  pointer-events: none;
}

/* (No gap: the delete icon is drawn narrower than its button, so the buttons side by side already have room between their icons.) */
.tile-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
}

/* The picture under the corner buttons. */
.tile-card >>> .editor-with-sidebar {
  margin-top: 6px;
}

/* max-width is set inline from the zoom factor. */

/* Vuetify sets overflow: hidden on list-item content/subtitle (for text
   ellipsis), which clips the pixel editor card's shadow on the flush left and
   bottom edges. Let it show. */
.editor-container >>> .v-list-item__content,
.editor-container >>> .v-list-item__subtitle {
  overflow: visible;
}

.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* v-list-item's  default 0 16px padding stacks on top of v-card-text's,
   pushing the graphic card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. Zeroing both sides
   (not just left, as this used to) keeps the card's right edge from sitting
   16px further in than its left edge. */
/* padding-top/bottom zeroed too (not just left/right) - Vuetify's
   default vertical list-item padding was adding extra space between grid
   ROWS on top of .background-list's 8px row gap, without adding
   anything similar between columns (that's handled entirely by the grid's
   column-gap), so rows visibly had more space than columns despite the
   grid's gap being uniform. Zeroing this leaves the grid's gap as the
   only source of spacing in either direction, matching row/column spacing
   exactly. */
.entry-list-item {
  padding: 0;
}

/* v-list-item__content (a Vuetify-owned element between .entry-list-item
   and .background-card, not directly reachable without a deep selector)
   carries its default 12px top/bottom padding - on top of the grid's
   row gap AND .background-card's 12px padding, this was adding a
   third, easy-to-miss source of extra space above/below each card. */
/* overflow: visible added alongside the padding reset (see MusicEditor.vue's
   identical fix) - stops this element's default "overflow: hidden" from
   clipping a selected card's 2px outline - min-width: 0 has to come
   with it (same comment there for the full explanation): overflow: visible
   silently undoes a flex item's default 0 min-width, letting it refuse
   to shrink below its widest content instead of the tab's width. */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}

/* Same grid layout as TextEditor.vue's .text-list - lets more than one
   background card fit per row on a wide enough window/zoom level instead of
   each always spanning a full row, at the user's request. Unlike
   .text-list's static minmax(280px, 1fr), the column size here is bound
   inline (see the template) to a literal editorWidth - not minmax(editorWidth,
   1fr) - since a background card's width is exactly the graphic's width,
   with nothing that benefits from stretching wider: 1fr would have grown
   the single column (and so the card) to fill the entire remaining row
   whenever only one fit, making it far wider than the graphic actually
   needs. A literal, fixed track size means each column is always exactly
   editorWidth, however many fit, with any leftover row space simply left
   empty instead of stretched into a card.

   "+ 24px" accounts for .background-card's 12px padding on each side
   (below) - editorWidth alone is only the pixel editor's inner width,
   so a column sized to exactly that was 24px too narrow for the card
   actually wrapping it, and the card's real (wider) box overflowed into
   its neighbor's column instead of fitting in its. */
/* margin-top restores the gap above the FIRST row that used to come from
   v-list-item__content's 12px top padding (see .entry-list-item's
   comment on zeroing that) - zeroing it fixed the (unwanted) extra space
   BETWEEN rows, but also removed the (wanted) space between the editor-zoom
   control above and the first row, which this puts back without
   reintroducing any inter-row gap (a margin on the grid container itself
   only affects space before its first row, not the row gap between items). */
.background-list {
  display: grid;
  gap: 8px;
  align-items: start;
  /* Tighter than the 12px this used to be (matching the old margin-top
     comment further up, before the sticky toolbar row existed) - see
     PlayerEditor.vue's identical .animation-list rule for why: the toolbar
     row directly above already has its top/bottom padding, so the old
     value on top of that read as too much combined space before the first
     card. */
  margin-top: 4px;
}

/* Same rounded, thin-bordered look as the Sound/Data/Text/Music tabs'
   per-item cards (e.g. SoundFXEditor's .soundfx-card) - this one wraps
   directly around the existing v-list-item-title/subtitle content (rather
   than switching to a v-card-text section like those tabs use) so the
   change is just the border, not a layout rework; padding here replaces the
   internal spacing a v-card-text would otherwise have provided. */
/* width: 100% - without it, the card (nested inside v-list-item-content,
   not itself the grid item .background-list sizes) shrinks to fit its
   content's natural width instead of filling the grid column .background-
   list already fixed to editorWidth + 24px (see its comment). A
   collapsed card's content (just the title row) is narrower than that
   fixed column, so it rendered visibly narrower than an expanded card
   (whose pixel editor forces the full editorWidth) instead of both being
   the same width the grid already allocated for them. */
/* The folders stay at the top of the tab when it scrolls, across its full width like the toolbars of the other tabs (the tab's 16px of padding is
   cancelled and put back); the toolbar of the graphics sticks just under them. The same as the Sprite tab's. */
.playfield-folder-toolbar {
  position: sticky;
  top: 0;
  z-index: 3;
  background-color: #fff;
  margin-left: -16px;
  margin-right: -16px;
  padding: 2px 16px 0;
  --toolbar-bleed: 16px;
}

.playfield-folder-toolbar >>> .card-folder-bar {
  margin-top: 0;
}

.playfield-folder-toolbar.folder-toolbar-pinned {
  padding-top: 10px;
}

.playfield-folder-toolbar + .graphic-editor-toolbar {
  padding-top: 8px;
}
.playfield-folder-toolbar + .graphic-editor-toolbar.graphic-editor-toolbar-scrolled {
  padding-top: 11px;
}

.desaturate-app-colors .playfield-folder-toolbar {
  background-color: #e1e1e1;
}

.background-card {
  position: relative;
  width: 100%;
  padding: 12px 16px;
}

/* 20px from the picture to the bottom of an open card, as under the last field of the other tabs' cards (a closed card ends with the name field, 20px as is). */
.background-card-open {
  padding-bottom: 19px;
}

/* PixelEditor.vue always wraps itself in its  outlined v-card with
   card-text padding - useful standalone (e.g. each Player tab animation
   frame, where it's the only border that card has), but redundant once
   .background-card above already frames the WHOLE background entry the
   same way, showing as a visible second "inner" border-plus-padding around
   just the graphic/tools. Stripped here, scoped to this nested instance
   only, rather than changing PixelEditor.vue itself (which would remove
   the Player tabs' only border). */
.pixel-editor-container >>> .v-card {
  border: none !important;
  box-shadow: none !important;
}

/* PixelEditor.vue's left/right v-card-text/v-card-actions padding
   (see its comment) is meant for standalone use - redundant here since
   .background-card above already pads the WHOLE background entry the same
   way (12px), doubling up (12+16=28px) into a visibly wider left/right
   gutter around just the graphic/tools, and a taller bottom gutter, than
   every other tab has. Zeroed back out, scoped to this nested instance
   only, so .background-card's 12px is the only gutter left. */
.pixel-editor-container >>> .v-card__text {
  padding-left: 0 !important;
  padding-right: 0 !important;
  /* The fields above are 8px from the picture, not 8px plus the padding of the card. */
  padding-top: 0 !important;
}

.pixel-editor-container >>> .v-card__actions {
  padding-left: 0 !important;
  padding-right: 0 !important;
  padding-bottom: 0 !important;
}

/* Only this top strip is draggable (see hooks/drag-reorder.js's
   comment on why) - covers the same header band the collapse/ID/delete
   controls already occupy. Sits behind them (they're later in DOM order,
   so they paint on top and stay clickable) but in front of everything
   else, so a click-and-drag gesture anywhere else in the card still selects
   text/drags the pixel editor instead of starting a reorder drag. */
.background-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

.drag-reorder-dragging {
  opacity: 0.4;
}

/* Which side of THIS card a dragged one would land on (see
   entryDragOverSide/dragOverSideFor) - left/right, not hooks/
   drag-reorder.js's top-border convention, since .background-list is a
   CSS grid that can put more than one card on the same row (see its
   comment) - left/right is what actually reflects reading-order position
   within it. */
.drag-reorder-side-before {
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.drag-reorder-side-after {
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Sits in v-list-item-title, which (unlike the pixel editor's  toolbar)
   is always rendered regardless of collapse state, so the toolbar stays
   visible on a collapsed card instead of disappearing along with the pixel
   editor. Same "one flex row of whichever buttons are actually present"
   reasoning as PlayerEditor.vue's .frame-corner-toolbar - the color
   copy/paste pair is only shown while per-row playfield colors is on. */
/* The columns toggle in the corner: the same size as the buttons beside it (the toolbar's gap is the space between them). */
.background-corner-toolbar .background-corner-toggle {
  margin-left: 0;
}
.background-corner-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

/* Same reasoning as PlayerEditor.vue's  identical rule - lets the
   color-only badge (position: absolute) anchor to the button itself. */
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

/* .player-icon-btn-size's size/disabled-opacity/icon-font-size rules,
   and .delete-icon-btn.player-icon-btn-size's mdi-delete size bump -
   see App.vue's shared, unscoped copy (moved there once confirmed
   byte-identical to PlayerEditor.vue's copy of this exact class name -
   scoped CSS can't share a rule across components even under the same
   class name, so each tab using it still has to apply it here). */

/* The "Set height" button passed into GraphicEditorToolbar.vue's
   "after-tools" slot - see PlayerEditor.vue's identical rule for why this
   stays here rather than moving into that shared component. */
/* !important on width/min-width - see PlayerEditor.vue's identical rule for
   why (Vuetify's ".v-btn.v-size--small" default otherwise wins). */
/* (padding !important too: Vuetify's small button padding, about 12 pixels a side, otherwise wins, which left 25 pixels of empty button
   round the 16 pixel icon, so the toolbar wrapped it to a new line with room still to be seen; the -6 pixel margin that made up for part
   of it is gone with it.) */
.unified-toolbar-height-btn {
  width: auto !important;
  min-width: 0 !important;
  margin-left: 0 !important;
  padding: 0 4px !important;
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

/* Absolutely positioned (matching Text/SoundFX/Data/Music's  collapse
   button placement exactly) rather than flowed in a flex row alongside the
   ID badge - the row wrapper this used to sit in is gone; .background-
   name-field's margin-top (below) makes room for both this and the
   badge to sit above it instead. */
.background-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same placement/style as every other tab's "ID: N" badge (see
   MusicEditor.vue's .music-id-badge). */
.background-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same reasoning as TextEditor.vue's .text-name-field - reserves room below
   the now-absolutely-positioned collapse button/ID badge instead of them
   overlapping this field, now that neither sits in a normal-flow row above
   it anymore. Matches .soundfx-name-field's margin-top (SoundFXEditor.vue)
   for consistent badge-to-name spacing across every tab.
   margin-bottom: -12px - same fix, same measured ~12px excess, as
   PlayerEditor.vue's .animation-name-field (see its comment) - this field
   isn't hide-details either, so Vuetify reserves a hint/error strip
   below it, taller than DataEditor.vue's equivalent card ends up by the
   same amount. */
.background-name-field {
  margin-top: 20px;
  margin-bottom: -13px;
}

/* The DPC+ pfres field sits beside the name, which takes the rest of the row. */
.background-solid-color {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Down to the line of the fields beside it: their text sits low in the box (the label and the strip for hints are above and below it). */
  align-self: flex-start;
  margin-top: 38px;
}

.background-solid-color-label {
  font-size: 1rem;
}

.background-name-row {
  display: flex;
  gap: 16px;
  /* Clear of the buttons in the corner above. */
  margin-top: 10px;
  margin-bottom: -2px;
}

.background-name-row .background-name-field:first-child {
  flex: 1 1 auto;
}

/* The four groups of columns side by side, each as tall as the screen however many rows it has. */
.group-editors-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: stretch;
}
/* Each pfres field sits over its group of columns (the strips at the sides are the first and third grid columns). */
.group-pfres-row {
  grid-column: 2;
  grid-row: 1;
  display: flex;
}
.group-pfres-row > .group-pfres-field {
  margin-top: 20px;
  margin-bottom: 8px;
  padding-top: 0;
  flex: 1 1 0 !important;
  max-width: none;
  flex: 1 1 0;
  min-width: 0;
  padding: 0 8px 0 0;
}
.group-editors-row > .group-color-strip,
.group-editors-row > .group-editors {
  grid-row: 2;
}
.group-editors-row > .group-color-strip {
  grid-column: 1;
}
.group-editors-row > .group-editors ~ .group-color-strip {
  grid-column: 3;
}
.group-editors-row > .group-editors {
  grid-column: 2;
}
.group-editors {
  display: flex;
  align-items: flex-start;
  flex: 1 1 auto;
  min-width: 0;
}
.group-color-strip {
  flex: 0 0 auto;
  display: flex;
}
/* The buttons under the picture, in the grid row under it: the first under the playfield colors, the last under the background colors. */
.group-tools {
  grid-row: 3;
  display: flex;
  align-items: center;
  padding: 8px 0 2px;
}
.group-tools-left {
  grid-column: 1;
  justify-content: center;
}
.group-tools-center {
  grid-column: 2;
  justify-content: center;
}
.group-tools-right {
  grid-column: 3;
  justify-content: center;
}
.group-tools >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
}
.group-tools >>> .v-btn::before {
  display: none;
}
.group-tools >>> .v-btn .v-icon {
  font-size: 19px;
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}
.group-tools >>> .v-btn:hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}
.group-tools >>> .v-btn:active .v-icon {
  transform: scale(0.82);
}
.group-editors .group-editor {
  flex: 1 1 0;
  min-width: 0;
}
.group-editors >>> .v-card__text {
  padding: 0 !important;
}
.background-pfres-field {
  flex: 0 0 96px;
}
.background-color-rows-field {
  flex: 0 0 112px;
}

.add-frame-buttom {
  bottom: 8px;
}

/* No drop shadow on floating (absolute-positioned) buttons - delete, add, etc. */
.v-btn--absolute {
  box-shadow: none !important;
}
.titlescreen-play-btn:active >>> .v-icon,
.titlescreen-play-btn.v-btn--loading >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}
</style>
