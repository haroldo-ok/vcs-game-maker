<template>
  <div>
    <v-card flat :ripple="false" class="editor-container">
      <v-card-title>Music (alpha 0.8)</v-card-title>
      <v-alert type="warning" dense outlined :icon="false" class="alpha-notice">
        This feature is in alpha. Things may change or break. You've been warned!
      </v-alert>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message music-intro-paragraph">
          Compose songs here, then play one at runtime with a "Play song" block (Actions tab).
          A song is a sequence of patterns (drag to reorder, or repeat one in a row); each
          pattern holds one or more instrument tracks, note by note, with its tempo if it
          needs one.
        </p>
      </v-card-text>
      <div class="music-toolbar" :class="{'music-toolbar-scrolled': isMusicToolbarScrolled}" v-if="activeSong()">
        <div class="music-toolbar-row">
          <v-btn
            icon
            small
            title="Save every song in this project (with the instruments they use) to a single .JSON song bank file"
            class="music-flat-icon-btn music-icon-btn-size"
            @click="handleExportSongBank"
          >
            <v-icon>mdi-database-export</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Load a .JSON song bank file - a song whose name matches one already here has its contents replaced; every other song in the file is added"
            class="music-flat-icon-btn music-icon-btn-size"
            @click="handleImportSongBank"
          >
            <v-icon>mdi-database-import</v-icon>
          </v-btn>
          <v-divider class="music-toolbar-divider" vertical />
          <v-btn
            icon
            small
            title="Export song to .JSON file"
            class="music-flat-icon-btn music-icon-btn-size"
            @click="() => handleExportSong(activeSong())"
          >
            <v-icon>mdi-export</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Import song from .JSON file"
            class="music-flat-icon-btn music-icon-btn-size"
            @click="() => handleImportSong(activeSong())"
          >
            <v-icon>mdi-import</v-icon>
          </v-btn>
          <v-divider class="music-toolbar-divider" vertical />
          <v-btn
            icon
            small
            class="music-flat-icon-btn music-icon-btn-size"
            :class="{'music-icon-btn-active': autoFollowPlayback}"
            :title="autoFollowPlayback ?
              'Auto-switch to whichever pattern is playing: on' :
              'Auto-switch to whichever pattern is playing: off'"
            @click="autoFollowPlayback = !autoFollowPlayback"
          >
            <v-icon small>mdi-target</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            :title="activeSong().loop ?
              'Loop this song\'s preview playback until stopped (on)' :
              'Loop this song\'s preview playback until stopped (off)'"
            :class="['music-flat-icon-btn', 'music-icon-btn-size', {'music-icon-btn-active': activeSong().loop}]"
            @click="() => handleToggleLoopSong(activeSong())"
          >
            <v-icon small>{{ activeSong().loop ? 'mdi-repeat' : 'mdi-repeat-off' }}</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Stop playback (Space)"
            class="music-flat-icon-btn music-icon-btn-size"
            @click="handleStop"
          >
            <v-icon>mdi-stop</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            :title="playingSongId === activeSong().id ? 'Playing...' : 'Play the full pattern sequence (Space)'"
            :class="['music-flat-icon-btn', 'music-icon-btn-size',
              {'music-icon-btn-active': playingSongId === activeSong().id}]"
            @click="() => handlePlaySong(activeSong())"
          >
            <v-icon>{{ playingSongId === activeSong().id ? 'mdi-volume-high' : 'mdi-play' }}</v-icon>
          </v-btn>
          <v-divider class="music-toolbar-divider" vertical />
          <div class="dim-controls" title="When DIM is on, every note plays at the volume set here, as a percentage of its set volume (the same setting as the Sound tab's DIM, so changing it here changes it there too). Off: notes play at their set volume.">
            <v-switch
              v-model="dimSoundFx"
              label="DIM"
              hide-details
              class="dim-switch"
            />
            <v-slider
              :value="dimSoundFxPercentDisplay"
              @input="(v) => (dimSoundFxPercentDisplay = v)"
              @change="(v) => (dimSoundFxPercent = v)"
              :disabled="!dimSoundFx"
              min="0"
              max="100"
              step="1"
              dense
              hide-details
              class="dim-slider"
            />
            <span class="dim-percent">{{ dimSoundFxPercentDisplay }}%</span>
          </div>
        </div>
      </div>
      <v-card-text class="song-list-section">
        <template v-for="song in activeSongArray">
          <div
            :key="song.id"
            class="song-card"
            :data-song-id="song.id"
          >
                <div class="music-id-badge">ID:{{ song.id }}</div>

                <v-card-text class="music-name-section pattern-name-row song-name-row">
                  <v-combobox
                    class="music-name-field"
                    label="Song name"
                    item-text="text"
                    :items="songOptions()"
                    :value="songName(activeSongId())"
                    @change="(value) => handleSongFieldChange(value)"
                  />
                  <div class="pattern-actions-row">
                    <v-btn icon small class="music-icon-btn-size" title="Add song" @click="handleAddSong">
                      <v-icon small>mdi-plus</v-icon>
                    </v-btn>
                    <v-btn icon small class="music-icon-btn-size" title="Duplicate this song" @click="() => handleDuplicateSong(song)">
                      <v-icon small>mdi-content-duplicate</v-icon>
                    </v-btn>
                    <confirm-delete-menu
                      v-if="state.songs.length > 1"
                      title="Delete this song?"
                      activator-title="Delete this song"
                      icon-btn-class="music-icon-btn-size"
                      @confirm="handleDeleteSong(song)"
                    />
                  </div>
                  <v-text-field
                    class="tempo-field"
                    label="Tempo (BPM)"
                    type="number"
                    :min="minTempo"
                    :max="maxTempo"
                    v-model.number="song.tempo"
                    @change="() => handleTempoChange(song)"
                  />
                </v-card-text>

                <v-card-text class="music-sequence-section">
                  <div class="option-section-header" @click="() => toggleSequenceCollapsed(song)">
                    <v-btn icon small :title="isSequenceCollapsed(song) ? 'Show this song\'s sequence' : 'Hide this song\'s sequence'">
                      <v-icon>{{ isSequenceCollapsed(song) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
                    </v-btn>
                    <span class="text-subtitle-1">Sequencer</span>
                  </div>
                  <div v-if="!isSequenceCollapsed(song)" class="sequence-row">
                    <div
                      v-for="group in song.sequence"
                      v-bind:key="group.id"
                      class="sequence-chip-wrap"
                      :class="{
                        'sequence-chip-dragging': isSequenceStepDragging(song, group),
                        'sequence-chip-drag-over-before': sequenceDragOverSide(song, group) === 'before',
                        'sequence-chip-drag-over-after': sequenceDragOverSide(song, group) === 'after',
                        'sequence-chip-wrap-playing': isSequenceGroupPlaying(song, group),
                      }"
                      draggable="true"
                      title="Drag to reorder"
                      v-on="sequenceChipListeners(song, group)"
                    >
                      <v-chip
                        small
                        close
                        dark
                        class="sequence-chip"
                        :color="patternSequenceColor(group.patternId)"
                        :style="sequenceGroupChipStyle(song, group)"
                        title="Click to edit this pattern"
                        @click="() => handleSequenceChipClick(song, group)"
                        @click:close="() => handleRemoveSequenceGroup(song, group)"
                      >
                        <span
                          class="sequence-chip-id-badge"
                          title="This chip's position in the sequence (1 = first) - see the &quot;When sequence chip has finished playing&quot; block. Changes if you reorder, insert, or delete chips before it."
                        >ID:{{ group.id }}</span>
                        {{ patternName(song, group.patternId) }}<template v-if="sequenceGroupPreviewCount(song, group) > 1"> ×{{ sequenceGroupPreviewCount(song, group) }}</template>
                      </v-chip>
                      <div
                        class="sequence-chip-resize-handle"
                        draggable="false"
                        title="Drag to repeat this pattern more times in a row"
                        :style="sequenceGroupHandleStyle(group)"
                        @mousedown="(event) => handleSequenceResizeStart(song, group, event)"
                        @click.stop
                        @dragstart.stop.prevent
                      ></div>
                    </div>
                  </div>
                  <div v-if="!isSequenceCollapsed(song)" class="sequence-add-row">
                    <v-menu>
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn text small class="add-track-button" v-bind="attrs" v-on="on">
                          <v-icon left small>mdi-plus</v-icon>
                          Add pattern
                        </v-btn>
                      </template>
                      <v-list dense>
                        <v-list-item
                          v-for="option in patternOptions(song)"
                          v-bind:key="option.value"
                          @click="() => handleAddSequenceStep(song, option.value)"
                        >
                          <v-list-item-title>{{ option.text }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>

                  <template v-if="activePattern(song)">
                  <v-divider class="my-2" />
                  <div
                    class="option-section-header"
                    @click="() => togglePatternCollapsed(song, activePattern(song))"
                  >
                    <v-btn icon small :title="isPatternCollapsed(song, activePattern(song)) ? 'Expand this pattern' : 'Collapse this pattern'">
                      <v-icon>{{ isPatternCollapsed(song, activePattern(song)) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
                    </v-btn>
                    <span class="text-subtitle-1">Pattern Editor</span>
                  </div>
                  <div v-if="!isPatternCollapsed(song, activePattern(song))" class="option-section-content pattern-section-content">
                    <v-card-text class="music-name-section pattern-name-row">
                      <div class="music-id-badge option-section-pattern-id-badge">ID:{{ activePattern(song).id }}</div>
                      <v-combobox
                        class="music-name-field"
                        label="Pattern name"
                        item-text="text"
                        :items="patternOptions(song)"
                        :value="patternName(song, activePatternId(song))"
                        @change="(value) => handlePatternFieldChange(song, value)"
                      />
                      <div class="pattern-actions-row">
                        <v-btn icon small class="music-icon-btn-size" title="Add pattern" @click="() => handleAddPattern(song)">
                          <v-icon small>mdi-plus</v-icon>
                        </v-btn>
                        <v-btn icon small class="music-icon-btn-size" title="Duplicate this pattern" @click="() => handleDuplicatePattern(song, activePattern(song))">
                          <v-icon small>mdi-content-duplicate</v-icon>
                        </v-btn>
                        <confirm-delete-menu
                          v-if="song.patterns.length > 1"
                          title="Delete this pattern?"
                          activator-title="Delete this pattern"
                          icon-btn-class="music-icon-btn-size"
                          @confirm="handleDeletePattern(song, activePattern(song))"
                        />
                      </div>
                      <v-text-field
                        class="steps-field"
                        label="Length (steps)"
                        type="number"
                        :min="minPatternSteps"
                        :max="maxPatternSteps"
                        v-model.number="activePattern(song).stepCount"
                        @change="() => handleStepCountChange(song, activePattern(song))"
                      />
                      <div class="pattern-length-tempo-group">
                        <v-checkbox
                          class="use-song-tempo-checkbox"
                          title="Use this pattern's tempo instead of the song's"
                          hide-details
                          v-model="activePattern(song).useOwnTempo"
                          @change="handleChildChange"
                        />
                        <v-text-field
                          class="tempo-field"
                          label="Tempo (BPM)"
                          type="number"
                          :min="minTempo"
                          :max="maxTempo"
                          :disabled="!activePattern(song).useOwnTempo"
                          v-model.number="activePattern(song).tempo"
                          @change="() => handleTempoChange(activePattern(song))"
                        />
                      </div>
                    </v-card-text>

                    <v-card-text class="track-section">
                      <div class="instruments-label-row">
                        <v-btn
                          icon
                          x-small
                          :title="isInstrumentsCollapsed(song) ?
                            'Show this pattern\'s instruments' : 'Hide this pattern\'s instruments'"
                          class="instruments-collapse-btn"
                          @click="() => toggleInstrumentsCollapsed(song)"
                        >
                          <v-icon small>
                            {{ isInstrumentsCollapsed(song) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}
                          </v-icon>
                        </v-btn>
                        <div class="music-section-label">
                          Instruments
                        </div>
                      </div>
                      <template v-if="!isInstrumentsCollapsed(song)">
                      <div class="track-grid">
                      <div
                        v-for="track in activePattern(song).tracks"
                        v-bind:key="track.id"
                        class="track-row"
                      >
                        <div class="track-instrument-row">
                          <v-btn
                            icon
                            small
                            :title="isActiveTrack(activePattern(song), track) ?
                              'Currently editing this instrument\'s notes' : 'Click to edit this instrument\'s notes'"
                            @click="() => setActiveTrack(activePattern(song), track)"
                          >
                            <v-icon small :color="isActiveTrack(activePattern(song), track) ? 'primary' : undefined">
                              {{ isActiveTrack(activePattern(song), track) ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}
                            </v-icon>
                          </v-btn>
                          <div
                            class="instrument-color-dot"
                            :style="{backgroundColor: instrumentColor(track)}"
                            title="This instrument's note color - set it on its Sound tab card"
                          />
                          <v-select
                            dense
                            hide-details
                            label="Instrument"
                            class="track-instrument-select"
                            :items="soundEffectOptions()"
                            v-model="track.soundEffectId"
                            @change="handleChildChange"
                          />
                          <v-select
                            dense
                            hide-details
                            label="Channel"
                            class="track-channel-select"
                            :items="channelOptionItems"
                            v-model="track.channel"
                            @change="handleChildChange"
                          />
                          <div class="track-icon-group">
                            <v-btn
                              icon
                              small
                              class="music-flat-icon-btn music-icon-btn-size"
                              :title="isTrackHidden(activePattern(song), track) ?
                                'Show this instrument\'s notes in the piano roll' : 'Hide this instrument\'s notes in the piano roll'"
                              @click="() => handleToggleTrackVisibility(activePattern(song), track)"
                            >
                              <v-icon small>{{ isTrackHidden(activePattern(song), track) ? 'mdi-eye-off' : 'mdi-eye' }}</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              class="music-flat-icon-btn music-icon-btn-size"
                              :class="{'music-icon-btn-active': explicitlyMutedTrack(song, track)}"
                              :title="explicitlyMutedTrack(song, track) ?
                                'Unmute this instrument during playback (every pattern in this song)' :
                                'Mute this instrument during playback (every pattern in this song)'"
                              @click="() => handleToggleTrackMute(song, activePattern(song), track)"
                            >
                              <v-icon small>{{ explicitlyMutedTrack(song, track) ? 'mdi-alpha-m-box' : 'mdi-alpha-m-box-outline' }}</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              class="music-flat-icon-btn music-icon-btn-size"
                              :class="{'music-icon-btn-active': isTrackSoloed(song, track)}"
                              :title="isTrackSoloed(song, track) ?
                                'Unsolo this instrument' :
                                'Solo this instrument (silences every other instrument in this song during playback)'"
                              @click="() => handleToggleTrackSolo(song, activePattern(song), track)"
                            >
                              <v-icon small>{{ isTrackSoloed(song, track) ? 'mdi-alpha-s-box' : 'mdi-alpha-s-box-outline' }}</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              class="music-flat-icon-btn music-icon-btn-size"
                              title="Copy this instrument's notes"
                              @click="() => handleCopyTrack(track)"
                            >
                              <v-icon small>mdi-content-copy</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              class="music-flat-icon-btn music-icon-btn-size"
                              :disabled="!copiedTrackNotes"
                              title="Paste copied notes onto this instrument"
                              @click="() => handlePasteTrack(track)"
                            >
                              <v-icon small>mdi-content-paste</v-icon>
                            </v-btn>
                            <v-menu v-if="activePattern(song).tracks.length > 1" top>
                              <template v-slot:activator="{ on, attrs }">
                                <v-btn
                                  icon
                                  small
                                  class="music-flat-icon-btn music-icon-btn-size"
                                  title="Remove this instrument row"
                                  v-bind="attrs"
                                  v-on="on"
                                >
                                  <v-icon small>mdi-delete</v-icon>
                                </v-btn>
                              </template>
                              <v-card>
                                <v-card-title>Remove this instrument row?</v-card-title>
                                <v-list>
                                  <v-list-item @click="() => handleDeleteTrack(activePattern(song), track)">
                                    <v-list-item-icon><v-icon>mdi-check</v-icon></v-list-item-icon>
                                    <v-list-item-title>Yes, remove</v-list-item-title>
                                  </v-list-item>
                                  <v-list-item link>
                                    <v-list-item-icon><v-icon>mdi-cancel</v-icon></v-list-item-icon>
                                    <v-list-item-title>No, don't remove</v-list-item-title>
                                  </v-list-item>
                                </v-list>
                              </v-card>
                            </v-menu>
                          </div>
                        </div>
                      </div>
                      </div>

                      <v-btn text small class="add-track-button" @click="() => handleAddTrack(activePattern(song))">
                        <v-icon left small>mdi-plus</v-icon>
                        Add instrument
                      </v-btn>
                      </template>
                      <div v-else class="instruments-collapsed-summary">
                        <v-chip
                          v-for="track in activePattern(song).tracks"
                          v-bind:key="track.id"
                          small
                          :color="instrumentColor(track)"
                          :style="{color: instrumentTextColor(track)}"
                          class="instrument-summary-chip"
                          :class="{'instrument-summary-chip-active': isActiveTrack(activePattern(song), track)}"
                          title="Click to edit this instrument's notes"
                          @click="() => setActiveTrack(activePattern(song), track)"
                        >
                          {{ trackSoundEffect(track) ? (trackSoundEffect(track).name || 'Unnamed') : 'No instrument set' }}
                        </v-chip>
                      </div>

                      <v-divider v-if="activePattern(song).tracks.length" class="instruments-piano-divider"></v-divider>

                      <div
                        class="piano-roll-zoom-row"
                        v-if="activePattern(song).tracks.length"
                        :style="{top: `${musicToolbarHeight}px`}"
                      >
                        <div class="subdivision-controls">
                          <v-btn
                            icon
                            small
                            :title="UNDO_TITLE"
                            class="music-flat-icon-btn music-icon-btn-size piano-roll-transport-btn"
                            :disabled="!canUndoPattern(activePattern(song)) && !reorderCanUndo"
                            @click="() => handleUndoPattern(song, activePattern(song))"
                          >
                            <v-icon small>mdi-undo</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            :title="REDO_TITLE"
                            class="music-flat-icon-btn music-icon-btn-size piano-roll-transport-btn"
                            :disabled="!canRedoPattern(activePattern(song)) && !reorderCanRedo"
                            @click="() => handleRedoPattern(song, activePattern(song))"
                          >
                            <v-icon small>mdi-redo</v-icon>
                          </v-btn>
                          <v-divider class="music-toolbar-divider" vertical />
                          <v-btn
                            icon
                            small
                            title="Move (V, drag a placed note to a different pitch/step)"
                            class="music-flat-icon-btn music-icon-btn-size piano-roll-tool-btn"
                            :class="{'music-icon-btn-active': pianoRollTool === 'move'}"
                            @click="() => setPianoRollTool('move')"
                          >
                            <v-icon small>mdi-cursor-move</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            title="Draw (B, click to place a note)"
                            class="music-flat-icon-btn music-icon-btn-size piano-roll-tool-btn"
                            :class="{'music-icon-btn-active': pianoRollTool === 'draw'}"
                            @click="() => setPianoRollTool('draw')"
                          >
                            <v-icon small>mdi-pencil</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            title="Erase (E, click a placed note to remove it)"
                            class="music-flat-icon-btn music-icon-btn-size piano-roll-tool-btn"
                            :class="{'music-icon-btn-active': pianoRollTool === 'erase'}"
                            @click="() => setPianoRollTool('erase')"
                          >
                            <v-icon small>mdi-eraser</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            title="Rectangle select (M, drag to select multiple notes - use Move to drag them together)"
                            class="music-flat-icon-btn music-icon-btn-size piano-roll-tool-btn"
                            :class="{'music-icon-btn-active': pianoRollTool === 'select'}"
                            @click="() => setPianoRollTool('select')"
                          >
                            <svg class="v-icon piano-roll-marquee-icon" viewBox="0 0 24 24">
                              <rect x="3.5" y="3.5" width="17" height="17" />
                            </svg>
                          </v-btn>
                          <v-divider class="music-toolbar-divider" vertical />
                          <v-btn
                            icon
                            small
                            class="music-flat-icon-btn music-icon-btn-size snap-toggle-btn"
                            :class="{'music-icon-btn-active': snapEnabled, 'snap-toggle-btn-off': !snapEnabled}"
                            :title="snapEnabled ?
                              'Disable note duration snap (place/resize notes freely, ignoring the slice count below)' :
                              'Enable note duration snap (place/resize notes snapped to the slice count below)'"
                            @click="handleToggleSnap"
                          >
                            <v-icon small>mdi-magnet</v-icon>
                          </v-btn>
                          <v-select
                            dense
                            hide-details
                            single-line
                            class="subdivision-select"
                            title="Note duration snap (slices per step)"
                            :items="subdivisionOptionItems"
                            v-model="state.subdivision"
                            @change="handleChangeSubdivision"
                          />
                        </div>
                        <div class="piano-roll-zoom-and-playback">
                          <div class="piano-roll-zoom-controls">
                            <v-btn icon small class="piano-roll-zoom-icon-btn music-flat-icon-btn music-icon-btn-size" title="Fit zoom to this pattern's length"
                              @click="() => handleFitZoom(song, activePattern(song))">
                              <v-icon small>mdi-backup-restore</v-icon>
                            </v-btn>
                            <span class="piano-roll-zoom-label">{{ Math.round(pianoRollZoom * 100) }}%</span>
                            <v-btn icon small class="piano-roll-zoom-icon-btn music-flat-icon-btn music-icon-btn-size" title="Zoom out" @click="() => stepPianoRollZoom(-1)">
                              <v-icon small>mdi-magnify-minus-outline</v-icon>
                            </v-btn>
                            <v-slider
                              dense
                              hide-details
                              min="25"
                              max="1600"
                              class="piano-roll-zoom-slider"
                              :value="Math.round(pianoRollZoom * 100)"
                              @input="(percent) => { pianoRollZoom = percent / 100; }"
                            />
                            <v-btn icon small class="piano-roll-zoom-icon-btn music-flat-icon-btn music-icon-btn-size" title="Zoom in" @click="() => stepPianoRollZoom(1)">
                              <v-icon small>mdi-magnify-plus-outline</v-icon>
                            </v-btn>
                          </div>
                          <div class="pattern-playback-controls">
                            <v-btn
                              icon
                              small
                              title="Export pattern to .JSON file (Shift+E)"
                              class="music-flat-icon-btn music-icon-btn-size"
                              @click="() => handleExportPattern(activePattern(song))"
                            >
                              <v-icon>mdi-export</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              title="Import pattern from .JSON file (Shift+I)"
                              class="music-flat-icon-btn music-icon-btn-size"
                              @click="() => handleImportPattern(song, activePattern(song))"
                            >
                              <v-icon>mdi-import</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              :title="song.patternPreviewLoop ?
                                'Loop pattern preview playback until stopped (on) - applies to every pattern in this song' :
                                'Loop pattern preview playback until stopped (off) - applies to every pattern in this song'"
                              :class="['music-flat-icon-btn', 'music-icon-btn-size',
                                {'music-icon-btn-active': song.patternPreviewLoop}]"
                              @click="() => handleToggleLoopPattern(song)"
                            >
                              <v-icon small>{{ song.patternPreviewLoop ? 'mdi-repeat' : 'mdi-repeat-off' }}</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              title="Stop playback (Shift+Space)"
                              class="music-flat-icon-btn music-icon-btn-size"
                              @click="handleStop"
                            >
                              <v-icon>mdi-stop</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              :title="playingPatternId === activePattern(song).id ? 'Playing...' : 'Play this pattern (Shift+Space)'"
                              :class="['music-flat-icon-btn', 'music-icon-btn-size',
                                {'music-icon-btn-active': playingPatternId === activePattern(song).id}]"
                              @click="() => handlePlayPattern(song, activePattern(song))"
                            >
                              <v-icon>{{ playingPatternId === activePattern(song).id ? 'mdi-volume-high' : 'mdi-play' }}</v-icon>
                            </v-btn>
                          </div>
                        </div>
                      </div>

                      <div class="piano-roll-wrapper" v-if="activePattern(song).tracks.length">
                      <div
                        class="piano-roll-height-resize-handle"
                        title="Drag to resize the pitch grid"
                        @mousedown.prevent="startPianoRollResizeTop"
                      />
                      <div
                        class="piano-roll-scroll"
                        :style="{maxHeight: `${pianoRollHeight}px`}"
                        @scroll="(event) => handlePianoRollScroll(song, event)"
                      >
                        <div class="piano-roll-step-header">
                          <div class="piano-roll-label-spacer" />
                          <div
                            v-for="stepIndex in maxPatternSteps"
                            v-bind:key="stepIndex"
                            class="piano-roll-step-number"
                            :class="{'piano-roll-step-number-disabled': stepIndex - 1 >= stepsFor(activePattern(song))}"
                            :style="[rulerCellStyle(activePattern(song), stepIndex - 1), {flex: `0 0 ${cellWidthPx()}px`}]"
                            :title="stepIndex - 1 >= stepsFor(activePattern(song)) ? undefined :
                              'Set the playhead here - seeks immediately if already playing, ' +
                              'otherwise Play will start from here next'"
                            @click="(event) => stepIndex - 1 < stepsFor(activePattern(song)) &&
                              handleSeekToStep(song, activePattern(song), stepIndex - 1, event)"
                            @mousemove="(event) => stepIndex - 1 < stepsFor(activePattern(song)) &&
                              handleSeekHover(activePattern(song), stepIndex - 1, event)"
                            @mouseleave="handleSeekHoverLeave"
                          >{{ stepIndex }}</div>
                        </div>

                        <div class="piano-roll">
                          <div
                            v-for="row in sharedNoteRows"
                            v-bind:key="row.midi"
                            class="piano-roll-row"
                          >
                            <div
                              class="piano-roll-label"
                              :class="{'piano-roll-label-black-key': isBlackKeyRow(row),
                                'piano-roll-label-row-unavailable': labelRowUnavailable(activePattern(song), row)}"
                            >{{ row.label }}</div>
                            <div
                              v-for="stepIndex in maxPatternSteps"
                              v-bind:key="stepIndex"
                              class="piano-roll-cell"
                              :style="[patternCellStyle(song, activePattern(song), row, stepIndex - 1), {flex: `0 0 ${cellWidthPx()}px`}]"
                              :class="[patternCellClasses(activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song))),
                                {'piano-roll-cell-move-cursor': pianoRollTool === 'move',
                                  'piano-roll-cell-select-cursor': pianoRollTool === 'select'}]"
                              :title="patternCellTitle(activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)))"
                              @click="(event) => handlePatternCellClick(song, activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)), event)"
                              @mousedown="(event) => handleCellMouseDown(song, activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)), event)"
                              @mousemove="(event) => handleCellHover(activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)), event)"
                              @mouseleave="handleCellLeave"
                            >
                              <div
                                v-for="note in activeTrackNoteTips(activePattern(song), row, stepIndex - 1)"
                                v-bind:key="note.step"
                                class="piano-roll-resize-handle"
                                :style="{left: `calc(${noteEndFraction(note, stepIndex - 1) * 100}% - 3px)`}"
                                @click.stop
                                @mousedown.stop.prevent="
                                  (event) => startResize(activePattern(song), activeTrackFor(activePattern(song)),
                                    note, stepsFor(activePattern(song)), event)"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Live preview of the Select tool's in-progress
                           drag (see marqueeSelecting/handleMarqueeSelectMove) -
                           position: fixed (see its CSS) sized directly off
                           the drag's raw clientX/clientY corners, so it needs
                           no container-relative math at all; the actual
                           selection itself is only computed once on mouseup
                           (stopMarqueeSelect). -->
                      <div
                        v-if="marqueeSelecting"
                        class="piano-roll-marquee-box"
                        :style="marqueeBoxStyle(marqueeSelecting)"
                      />

                      <div
                        class="piano-roll-height-resize-handle"
                        title="Drag to resize the pitch grid"
                        @mousedown.prevent="startPianoRollResize"
                      />

                      <div class="piano-roll-volume-scroll">
                        <div class="piano-roll-row piano-roll-volume-row">
                          <div class="piano-roll-label piano-roll-volume-label">Vol</div>
                          <div
                            v-for="stepIndex in maxPatternSteps"
                            v-bind:key="stepIndex"
                            class="piano-roll-volume-cell"
                            :class="{'piano-roll-volume-cell-continuation':
                              volumeCellIsContinuation(activePattern(song), stepIndex - 1)}"
                            :style="{flex: `0 0 ${cellWidthPx()}px`, height: `${volumeRowHeight}px`}"
                          >
                            <div
                              v-for="ghost in otherTrackVolumeBars(activePattern(song), stepIndex - 1)"
                              v-bind:key="ghost.key"
                              class="piano-roll-volume-bar piano-roll-volume-bar-ghost"
                              :style="ghost.style"
                            />
                            <div
                              v-for="note in volumeBarNotesAt(activePattern(song), stepIndex - 1)"
                              v-bind:key="note.step"
                              class="piano-roll-volume-bar"
                              :style="volumeBarStyleFor(note, activePattern(song), stepIndex - 1)"
                              :title="'Drag to change this note\'s volume (' +
                                noteVolumePercent(note, activePattern(song)) +
                                '% of the instrument\'s base volume, for just this note)'"
                            >
                              <div
                                class="piano-roll-volume-handle"
                                @mousedown="(event) => handleVolumeBarPointerDown(note, activePattern(song), event)"
                              />
                              <input
                                v-if="noteStartStep(note) === stepIndex - 1"
                                type="number"
                                class="piano-roll-volume-value"
                                :value="noteVolumePercent(note, activePattern(song))"
                                title="This note's volume, as a percentage of the instrument's base volume"
                                min="0"
                                @click.stop
                                @mousedown.stop
                                @change="(event) => handleVolumePercentChange(note, activePattern(song), event)"
                              />
                            </div>
                          </div>
                        </div>
                        <div
                          class="piano-roll-volume-resize-handle"
                          title="Drag to resize the volume row"
                          @mousedown.prevent="startVolumeRowResize"
                        />
                      </div>
                      </div>
                    </v-card-text>
                  </div>
                  </template>
                </v-card-text>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>
<script>
import {
  computed, defineComponent, getCurrentInstance, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, ref, watch,
} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {max} from 'lodash';

import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {recordReorder, sameItems} from '../hooks/reorder-history';
import {canRedoReorder, canUndoReorder, noteEdit, settleEdits, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';
import {useMusicEditorActiveState, usePlaybackStatusState} from '../hooks/music-editor-state';
import {useConfigurationStorage, useDimSoundFxPercentStorage, useDimSoundFxStorage, useSongsStorage,
  useSoundEffectsStorage, loadMutedMusicTrackIds, loadSoloedMusicTrackIds, MUTED_MUSIC_TRACKS_KEY,
  SOLOED_MUSIC_TRACKS_KEY, isMusicTrackMuted} from '../hooks/project';
import {
  clampPatternSteps, clampTempo, DEFAULT_PATTERN_STEPS, DEFAULT_SONGS, DEFAULT_TEMPO, DURATION_SUBDIVISION_OPTIONS,
  LENGTH_UNITS_PER_STEP, MAX_PATTERN_STEPS, MAX_TEMPO, MIN_PATTERN_STEPS, MIN_TEMPO, normalizeSequenceGroups,
  processSongsStorageDefaults,
} from '../blocks/music';
import {processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT} from '../generators/bbasic/soundfx';
import {channelOptions} from '../blocks/sound';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {audfByMidiForAudc, getCanonicalNoteRows, noteAudv, soundHasTunableNotes, RAW_FREQUENCY_ROWS,
  rawFrequencyOf} from '../utils/music-notes';
import {effectiveTempo, getPlaybackHead, playPattern, playSequence, previewPatternNote, setTrackMuted,
  stopPatternPlayback} from '../utils/music-playback';
import {autoInstrumentColor, instrumentColorFor, isLightColor,
  mixColorWithWhite, mixColorWithTransparent} from '../utils/instrument-colors';
import {REDO_TITLE, UNDO_TITLE, undoRedoKind} from '../utils/undo-hotkey';

// The piano roll's  zoom range (25%-1600%) goes well past the shared
// hooks/zoom.js's  discrete ZOOM_LEVELS (used by the sprite/background/
// score editors, capped at 400%) - a plain continuous slider here instead,
// stored separately so it doesn't disturb those editors'  zoom levels.
const PIANO_ROLL_ZOOM_KEY = 'vcs-game-maker.zoom.music-piano-roll';
const clampPianoRollZoom = (value) => (Number.isFinite(value) ? Math.min(16, Math.max(0.25, value)) : 1);

// The volume row's  height (see .piano-roll-volume-cell) - draggable via
// its  resize handle (handleVolumeRowResizeMove below), same idea as the
// piano roll's  horizontal zoom just above, just for this row's vertical
// size instead. Stored separately (shared-across-every-song
// scope) rather than folded into pianoRollZoom - zooming the pitch grid and
// resizing this row are independent adjustments, a project with a lot of
// fine per-note volume automation wants this tall regardless of whatever
// horizontal zoom the pitch grid above it happens to be at right now.
// 64 (the old fixed CSS height) is the default floor; the max is generous
// enough for fine per-note volume work without letting one drag make the
// row absurdly, unusably tall.
const VOLUME_ROW_HEIGHT_KEY = 'vcs-game-maker.music-piano-roll.volume-row-height';
const VOLUME_ROW_HEIGHT_MIN = 64;
const VOLUME_ROW_HEIGHT_MAX = 320;
const clampVolumeRowHeight = (value) =>
  (Number.isFinite(value) ? Math.min(VOLUME_ROW_HEIGHT_MAX, Math.max(VOLUME_ROW_HEIGHT_MIN, value)) :
    VOLUME_ROW_HEIGHT_MIN);

// Same idea as VOLUME_ROW_HEIGHT_KEY just above, for the pitch grid's
// height instead - previously a flat, un-resizable 340px (.piano-roll-
// scroll's old max-height). 340 is kept as the default so existing
// projects/sessions open at the exact same height as before until the user
// actually drags the new handle between it and the volume row.
const PIANO_ROLL_HEIGHT_KEY = 'vcs-game-maker.music-piano-roll.pitch-grid-height';
const PIANO_ROLL_HEIGHT_MIN = 120;
const PIANO_ROLL_HEIGHT_MAX = 800;
const PIANO_ROLL_HEIGHT_DEFAULT = 340;
const clampPianoRollHeight = (value) =>
  (Number.isFinite(value) ? Math.min(PIANO_ROLL_HEIGHT_MAX, Math.max(PIANO_ROLL_HEIGHT_MIN, value)) :
    PIANO_ROLL_HEIGHT_DEFAULT);

// Which instrument rows are muted/soloed for pattern/song preview playback -
// a view preference (see mutedTrackIds/soloedTrackIds below), but one that
// should survive navigating away to another tab and back, not just reset
// silently. Loading/keys/the effective-mute formula (isTrackMuted below)
// now live in hooks/project.js, shared with generators/bbasic/music.js so
// the compiled ROM honors the exact same mute/solo state as this tab's
// preview - see isMusicTrackMuted's  comment there.

// The only "row" an untunable instrument (see utils/music-notes.js) ever
// gets - it has no clean pitch to offer a real piano roll for, just an
// on/off hit per note event.
const HIT_ROW = [{midi: 'hit', label: 'Hit'}];
// Below the Hit row: a row for each frequency (see RAW_FREQUENCY_ROWS in utils/music-notes.js), for a sound type with no in-tune notes.
const FREQUENCY_ROWS = RAW_FREQUENCY_ROWS;

// Same array the template's "sharedNoteRows" binding builds (see the
// return statement below) - hoisted to module scope so the Move tool's
// drag logic can look up a row by index/offset too, not just render them.
// The pitched rows depend on the kernel (see getCanonicalNoteRows), so this is read when needed, not kept.
let sharedNoteRowsCache = {source: null, rows: [...HIT_ROW, ...FREQUENCY_ROWS]};
const currentSharedNoteRows = () => {
  const source = getCanonicalNoteRows();
  if (sharedNoteRowsCache.source !== source) sharedNoteRowsCache = {source, rows: [...source, ...HIT_ROW, ...FREQUENCY_ROWS]};
  return sharedNoteRowsCache.rows;
};
// .piano-roll-cell's fixed CSS height (see its rule further down) -
// duplicated here as a named constant (not read from the DOM) since the
// Move tool's vertical drag needs to convert a pixel Y-delta into a row
// count entirely in JS, and this value never actually changes (unlike the
// pattern's per-step width, which DOES scale with pianoRollZoom and so
// has to come from cellWidthPx() instead).
const PIANO_ROLL_ROW_HEIGHT_PX = 20;

// The piano roll only zooms horizontally (steps get wider) - there's no
// vertical zoom, so this is the step width at 100% zoom; multiply by the
// current zoom factor (see pianoRollZoom below) to get the actual width.
const PIANO_ROLL_CELL_WIDTH_BASE = 28;
// Matches .piano-roll-label-spacer/.piano-roll-label's  flex-basis -
// the row-label column's width doesn't scale with zoom, so it has to be
// subtracted before dividing the remaining space among this pattern's
// steps (see handleFitZoom). Wide enough for a black-key row's  combined
// "C#4/Db4"-style label (see noteLabel in utils/music-notes.js) - a natural
// note's  shorter single-name label ("C4") fits with room to spare.
// Sized generously past the widest real label (measured ~50px) rather than
// exactly to it - flex-shrink:0 on both rules means actual content wider
// than this basis would grow the column anyway (each .piano-roll-row is its
// independent flex container, so a mix of over- and under-width rows
// breaks the grid's  column alignment down the page - a real, visible
// bug this fixes).
const PIANO_ROLL_LABEL_WIDTH = 58;

// Every new instrument row defaults to channel 0 - TIA only has 2 real
// hardware sound channels, and a row plays fine on its  without the user
// having to pick a channel first; they can still switch a row to channel 1
// via its  Channel dropdown once they actually want two playing at once.
const emptyTrack = (id, soundEffectId, channel = 0) => ({
  id,
  soundEffectId,
  channel,
  notes: [],
});

export default defineComponent({
  components: {ConfirmDeleteMenu},
  setup() {
    const songsStorage = useSongsStorage();
    const soundEffectsStorage = useSoundEffectsStorage();
    const configurationStorage = useConfigurationStorage();
    // Same shared app-wide storage keys as SoundFXEditor.vue's  identical
    // dimSoundFx/dimSoundFxPercent pair (see useDimSoundFxStorage's
    // comment in hooks/project.js - a standing app preference, not part of
    // this project's  saved configuration) - deliberately not scoped to
    // this tab, so toggling/adjusting either one here or on the Sound tab
    // updates the exact same underlying value both read from, no separate
    // sync logic needed. Music's  note volumes already read these same
    // two keys (see generators/bbasic/music.js's  buildMusicPlayResetBody/
    // flattenPatternEvents), so this UI is the only piece that was actually
    // missing.
    const dimSoundFx = useDimSoundFxStorage();
    const dimSoundFxPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT);
    // The slider's  visible thumb position/percentage - deliberately NOT
    // bound directly to dimSoundFxPercent above. That computed's setter still
    // does a synchronous localStorage write on every call, and v-slider's
    // v-model fires on every "input" event - many times per second while
    // actually dragging. Doing that write on every single drag tick (worse
    // still, an earlier version of this wrote the ENTIRE shared
    // configurationStorage object, plus the reactive re-render cascade that
    // triggered everywhere else it's read) was blocking the main thread badly
    // enough that the visible thumb lagged behind the mouse and only
    // "caught up" once dragging stopped - a real reported bug. This ref
    // instead absorbs every "input" tick for free (cheap, local, nothing
    // else depends on it), and the persisted write only happens once, on
    // "change" (drag release) - see the v-slider below.
    const dimSoundFxPercentDisplay = ref(dimSoundFxPercent.value);
    // Keeps the slider in sync if the value changes from elsewhere (e.g. the
    // Sound tab's  identical slider, since both read/write the same
    // underlying configurationStorage key).
    watch(dimSoundFxPercent, (value) => {
      dimSoundFxPercentDisplay.value = value;
    });
    const pianoRollZoomStored = ref(clampPianoRollZoom(parseFloat(localStorage.getItem(PIANO_ROLL_ZOOM_KEY))));
    const pianoRollZoom = computed({
      get: () => pianoRollZoomStored.value,
      set(value) {
        const zoom = clampPianoRollZoom(value);
        pianoRollZoomStored.value = zoom;
        localStorage.setItem(PIANO_ROLL_ZOOM_KEY, String(zoom));
      },
    });

    const volumeRowHeightStored = ref(
        clampVolumeRowHeight(parseFloat(localStorage.getItem(VOLUME_ROW_HEIGHT_KEY))));
    const volumeRowHeight = computed({
      get: () => volumeRowHeightStored.value,
      set(value) {
        const height = clampVolumeRowHeight(value);
        volumeRowHeightStored.value = height;
        localStorage.setItem(VOLUME_ROW_HEIGHT_KEY, String(height));
      },
    });

    // Drag-to-resize for the volume row's  handle (see
    // .piano-roll-volume-resize-handle in the template) - same
    // mousedown/mousemove/mouseup-on-window shape as startResize/
    // handleResizeMove below (a note's  length handle), just tracking
    // one ref instead of mutating a note, and with no "overlapping note"
    // concerns to speak of.
    const volumeRowResizing = ref(null);
    const handleVolumeRowResizeMove = (event) => {
      if (!volumeRowResizing.value) return;
      const {startClientY, startHeight} = volumeRowResizing.value;
      volumeRowHeight.value = startHeight + (event.clientY - startClientY);
    };
    const stopVolumeRowResize = () => {
      volumeRowResizing.value = null;
      window.removeEventListener('mousemove', handleVolumeRowResizeMove);
      window.removeEventListener('mouseup', stopVolumeRowResize);
    };
    const startVolumeRowResize = (event) => {
      volumeRowResizing.value = {startClientY: event.clientY, startHeight: volumeRowHeight.value};
      window.addEventListener('mousemove', handleVolumeRowResizeMove);
      window.addEventListener('mouseup', stopVolumeRowResize);
    };

    const pianoRollHeightStored = ref(
        clampPianoRollHeight(parseFloat(localStorage.getItem(PIANO_ROLL_HEIGHT_KEY))));
    const pianoRollHeight = computed({
      get: () => pianoRollHeightStored.value,
      set(value) {
        const height = clampPianoRollHeight(value);
        pianoRollHeightStored.value = height;
        localStorage.setItem(PIANO_ROLL_HEIGHT_KEY, String(height));
      },
    });

    // Drag-to-resize for the pitch grid's handle, sitting on the same
    // boundary line as the volume row's handle just above (the top edge of
    // the volume row IS the bottom edge of the pitch grid) - same shape as
    // startVolumeRowResize/handleVolumeRowResizeMove, just growing the
    // pitch grid instead of the volume row when dragged down.
    const pianoRollResizing = ref(null);
    const handlePianoRollResizeMove = (event) => {
      if (!pianoRollResizing.value) return;
      const {startClientY, startHeight, sign} = pianoRollResizing.value;
      pianoRollHeight.value = startHeight + sign * (event.clientY - startClientY);
    };
    const stopPianoRollResize = () => {
      pianoRollResizing.value = null;
      window.removeEventListener('mousemove', handlePianoRollResizeMove);
      window.removeEventListener('mouseup', stopPianoRollResize);
    };
    const startPianoRollResize = (event) => {
      pianoRollResizing.value = {startClientY: event.clientY, startHeight: pianoRollHeight.value, sign: 1};
      window.addEventListener('mousemove', handlePianoRollResizeMove);
      window.addEventListener('mouseup', stopPianoRollResize);
    };
    // Same drag, from the grid's TOP edge instead of its bottom one - sign
    // is flipped (dragging UP, a negative clientY delta, has to GROW the
    // grid here, the opposite of the bottom handle) since this handle sits
    // above the content instead of below it.
    const startPianoRollResizeTop = (event) => {
      pianoRollResizing.value = {startClientY: event.clientY, startHeight: pianoRollHeight.value, sign: -1};
      window.addEventListener('mousemove', handlePianoRollResizeMove);
      window.addEventListener('mouseup', stopPianoRollResize);
    };

    // A fixed multiplicative step (not a fixed percentage-point step, the
    // way hooks/zoom.js's  discrete ZOOM_LEVELS effectively are) - this
    // slider's  range (25%-1600%, a 64x span, see clampPianoRollZoom)
    // is far too wide for a flat +25-point step to feel usable at either
    // end: fine-grained down near 25%, but would take dozens of clicks to
    // reach 1600%. Clamped by pianoRollZoom's  setter above either way.
    const stepPianoRollZoom = (direction) => {
      pianoRollZoom.value = direction > 0 ? pianoRollZoom.value * 1.25 : pianoRollZoom.value / 1.25;
    };
    // The step width 100% zoom itself means - always recalibrated (see
    // recalculateFitBaseWidth) to whatever width makes the CURRENT pattern's
    // steps exactly fill the visible area, so 100% always reads as "fit
    // to this pattern's Length" rather than some arbitrary fixed pixel size
    // - the slider still zooms in/out relative to that baseline exactly like
    // it would against a fixed one. Starts at the plain default
    // (PIANO_ROLL_CELL_WIDTH_BASE) before the first measurement lands.
    const pianoRollBaseWidth = ref(PIANO_ROLL_CELL_WIDTH_BASE);
    const cellWidthPx = () => pianoRollBaseWidth.value * pianoRollZoom.value;

    // Finds this song's  piano-roll-scroll via its data-song-id (see the
    // v-list-item above) rather than a v-for template ref - Vue 2's
    // function-ref support for an inline arrow expression inside v-for
    // wasn't reliably populating $refs - and re-measures its width against
    // the pattern's current step count. Called whenever that width could
    // have changed: Length (steps) edits, switching which pattern is being
    // edited, and the explicit Fit button.
    const recalculateFitBaseWidth = (song, pattern) => {
      const el = document.querySelector(`[data-song-id="${song.id}"] .piano-roll-scroll`);
      if (!el) {
        pianoRollBaseWidth.value = PIANO_ROLL_CELL_WIDTH_BASE;
        return;
      }
      const stepCount = stepsFor(pattern) || 1;
      const availableWidth = el.clientWidth - PIANO_ROLL_LABEL_WIDTH;
      pianoRollBaseWidth.value = Math.max(1, availableWidth / stepCount);
    };

    // Keeps the volume row's  horizontal position matching the main
    // grid's - they're two separate scrollable elements now (see the
    // template's .piano-roll-scroll/.piano-roll-volume-scroll split),
    // not one shared scroll container, specifically so the grid's
    // native scrollbar renders at ITS bottom edge (right above the
    // volume row) instead of below everything, including the volume row
    // itself. Same data-song-id lookup technique as
    // recalculateFitBaseWidth above, for the same reason (a v-for'd
    // template ref isn't reliable here). The volume strip's
    // overflow is hidden (see its  CSS), not auto/scroll - it never
    // shows its  scrollbar or accepts direct dragging, purely mirrors
    // whatever this one-way sync sets.
    const handlePianoRollScroll = (song, event) => {
      const volumeScrollEl = document.querySelector(`[data-song-id="${song.id}"] .piano-roll-volume-scroll`);
      if (volumeScrollEl) volumeScrollEl.scrollLeft = event.target.scrollLeft;
    };
    const handleFitZoom = (song, pattern) => {
      recalculateFitBaseWidth(song, pattern);
      pianoRollZoom.value = 1;
    };


    const state = computed({
      get() {
        try {
          return processSongsStorageDefaults(songsStorage);
        } catch (e) {
          console.error('Error loading songs from local storage', e);
          return DEFAULT_SONGS;
        }
      },
      set(newState) {
        songsStorage.value = newState;
      },
    });

    // Plain functions, not computed()s - matches activePattern etc. below:
    // soundEffectsStorage is a plain mutable object shared with (and edited
    // on) the separate Sound tab, whose edits go through the exact same
    // "mutate in place, then reassign the same object reference" pattern as
    // this file's  handleChildChange - a computed() here would go stale
    // the moment the Sound tab changed anything, since Vue's ref reactivity
    // skips notifying dependents when a ref is set to a value that's
    // reference-equal to what it already held.
    // Values the piano roll would otherwise recompute for every one of its
    // (thousands of) cells, kept for the length of one render: the cache is
    // emptied before each re-render, so it is rebuilt from the current data
    // inside that render, where Vue tracks what it reads. Rendering one cell
    // used to cost about a millisecond, and playback re-renders the roll
    // many times a second to move the playhead - that froze the tab and then
    // crashed it once memory ran out.
    const newRenderCache = () => ({
      soundEffectsById: null, instrumentColors: new WeakMap(), cellNotes: new WeakMap(), blockedRanges: new Map(),
    });
    let renderCache = newRenderCache();
    onBeforeUpdate(() => {
      renderCache = newRenderCache();
    });

    const soundEffects = () => {
      try {
        return processSoundEffectsStorageDefaults(soundEffectsStorage).soundEffects;
      } catch (e) {
        console.error('Error loading sound effects from local storage', e);
        return [];
      }
    };

    // Only sounds tagged as an instrument (see SoundFXEditor.vue's
    // isInstrument toggle) are meant to be picked as a track's
    // instrument here - a plain, untagged sound effect could still be
    // ALREADY assigned to a track from before it was untagged (see
    // trackSoundEffect, unaffected by this filter, still resolves it by id
    // regardless), but shouldn't be newly choosable from this dropdown.
    const soundEffectOptions = () => soundEffects().filter((soundEffect) => soundEffect.isInstrument || soundEffect.isPercussion).map(
        (soundEffect) => ({text: soundEffect.name || `Unnamed ${soundEffect.id}`, value: soundEffect.id}));

    const handleChildChange = () => {
      state.value = state.value;
    };

    // Undo/redo for the pattern editor - one stack pair per pattern id
    // (patternUndoStacks/patternRedoStacks, reactive so the toolbar buttons'
    // disabled state updates), storing plain-JSON snapshots of just the
    // fields a pattern edit can actually touch (name/tempo/useOwnTempo/
    // stepCount/loop/tracks - the same shape handleExportPattern already
    // treats as "this pattern's  content"), never its id. patternLastSnapshot
    // is a plain (non-reactive) module-level cache, not project data itself -
    // just this file's  bookkeeping for detecting "did this pattern
    // actually change since we last looked."
    const PATTERN_HISTORY_KEYS = ['name', 'tempo', 'useOwnTempo', 'stepCount', 'tracks'];
    const snapshotPattern = (pattern) => JSON.stringify(
        PATTERN_HISTORY_KEYS.reduce((acc, key) => {
          acc[key] = pattern[key]; return acc;
        }, {}));
    const patternUndoStacks = ref({});
    const patternRedoStacks = ref({});
    const patternLastSnapshot = {};

    // Seeded once, synchronously, for every pattern already on disk when this
    // component mounts - without this, a pattern's TRUE pre-edit state is
    // never captured (the reactive watcher below only ever fires AFTER a
    // mutation has already happened, by which point Vue has already applied
    // it), so the very first edit to an existing pattern would have nothing
    // to undo back to. A pattern created AFTER mount (Add/Duplicate) doesn't
    // need this same seeding - its  first watcher fire already IS its
    // true baseline, nothing existed before it to lose.
    state.value.songs.forEach((song) => song.patterns.forEach((pattern) => {
      patternLastSnapshot[pattern.id] = snapshotPattern(pattern);
    }));

    // Debounced (not one push per keystroke/drag-frame): a fast gesture like
    // dragging a note's resize handle or typing a pattern name fires this
    // watcher many times a second, and coalescing those into one undo step
    // per PAUSE in editing (not one per underlying mutation) matches how a
    // typical undo history actually reads to a user - see stopResize's
    // single "release" point for the equivalent idea applied to just resize.
    let patternHistoryDebounce = null;
    watch(() => state.value.songs, () => {
      clearTimeout(patternHistoryDebounce);
      patternHistoryDebounce = setTimeout(() => {
        state.value.songs.forEach((song) => song.patterns.forEach((pattern) => {
          const snapshot = snapshotPattern(pattern);
          const last = patternLastSnapshot[pattern.id];
          if (last !== undefined && last !== snapshot) {
            const stack = patternUndoStacks.value[pattern.id] || [];
            noteEdit();
            patternUndoStacks.value = {...patternUndoStacks.value, [pattern.id]: [...stack, last]};
            // A fresh edit invalidates whatever redo history existed from an
            // earlier undo - same convention as any standard undo/redo stack.
            if ((patternRedoStacks.value[pattern.id] || []).length) {
              patternRedoStacks.value = {...patternRedoStacks.value, [pattern.id]: []};
            }
          }
          patternLastSnapshot[pattern.id] = snapshot;
        }));
      }, 500);
    }, {deep: true});

    const applyPatternSnapshot = (pattern, snapshotJson) => {
      const data = JSON.parse(snapshotJson);
      PATTERN_HISTORY_KEYS.forEach((key) => {
        pattern[key] = data[key];
      });
      // Written directly (not through the watcher above) so restoring a
      // snapshot is never itself mistaken for a new edit worth recording.
      patternLastSnapshot[pattern.id] = snapshotJson;
    };
    const canUndoPattern = (pattern) => (patternUndoStacks.value[pattern.id] || []).length > 0;
    const canRedoPattern = (pattern) => (patternRedoStacks.value[pattern.id] || []).length > 0;
    const reorderCanUndo = computed(() => canUndoReorder());
    const reorderCanRedo = computed(() => canRedoReorder());
    const handleUndoPattern = (song, pattern) => {
      if (tryUndoReorder()) return;
      if (!pattern) return;
      const stack = patternUndoStacks.value[pattern.id] || [];
      if (!stack.length) return;
      const redoStack = patternRedoStacks.value[pattern.id] || [];
      patternRedoStacks.value = {...patternRedoStacks.value, [pattern.id]: [...redoStack, snapshotPattern(pattern)]};
      patternUndoStacks.value = {...patternUndoStacks.value, [pattern.id]: stack.slice(0, -1)};
      applyPatternSnapshot(pattern, stack[stack.length - 1]);
      recalculateFitBaseWidth(song, pattern);
      handleChildChange();
      forceUpdate();
      settleEdits();
    };
    const handleRedoPattern = (song, pattern) => {
      if (tryRedoReorder()) return;
      if (!pattern) return;
      const stack = patternRedoStacks.value[pattern.id] || [];
      if (!stack.length) return;
      const undoStack = patternUndoStacks.value[pattern.id] || [];
      patternUndoStacks.value = {...patternUndoStacks.value, [pattern.id]: [...undoStack, snapshotPattern(pattern)]};
      patternRedoStacks.value = {...patternRedoStacks.value, [pattern.id]: stack.slice(0, -1)};
      applyPatternSnapshot(pattern, stack[stack.length - 1]);
      recalculateFitBaseWidth(song, pattern);
      handleChildChange();
      forceUpdate();
    };

    // The Tempo (BPM) field's  min/max HTML attributes alone don't
    // actually stop a value typed outside that range from being applied
    // (they only affect the spin-button arrows and the input's
    // :invalid styling, not v-model) - this is what actually enforces it,
    // called from both the song- and pattern-level Tempo fields'
    // @change. Re-uses the exact same clampTempo also applied on load (see
    // processSongsStorageDefaults in blocks/music.js), so a value can't
    // reach storage out of range either way (typed directly, or loaded
    // from an older save/an imported file - see handleImportSong/
    // handleImportPattern).
    const handleTempoChange = (target) => {
      target.tempo = clampTempo(target.tempo);
      handleChildChange();
      forceUpdate();
    };

    // One shared preview-loop preference for every pattern in this song, not
    // stored per pattern - see its  migration comment in blocks/music.js
    // for why (switching which pattern is active, e.g. clicking a Sequence
    // chip, used to silently carry over whatever THAT pattern's  stored
    // loop flag happened to be). Plain assignment (not $set) is safe here -
    // processSongsStorageDefaults'  migration guarantees
    // song.patternPreviewLoop already exists as a real boolean on every song
    // by the time this can run, unlike song.loop when THAT field was new.
    const handleToggleLoopPattern = (song) => {
      song.patternPreviewLoop = !song.patternPreviewLoop;
      handleChildChange();
    };

    // The Pattern Editor section is open or closed as ONE setting for the whole
    // tab - whatever the user last chose - rather than remembered per song and
    // pattern, so every pattern (a new or duplicated one, or one picked from
    // the sequence chips) shows it the same way. useCollapsedIds keys off
    // entry.id, so this one fixed entry stands in for every pattern; the
    // song/pattern arguments below only keep the template's call sites as
    // they were. Collapsing it hides everything below the Pattern name/Length/
    // Tempo row - instruments, piano roll, zoom/playback controls, all of it.
    // The Instruments list nested inside has a separate state (below).
    const PATTERN_EDITOR_COLLAPSE_ENTRY = {id: 'pattern-editor'};
    const {isCollapsed: isPatternCollapsedRaw, toggleCollapsed: togglePatternCollapsedRaw,
      collapseAll: collapseAllPatterns} = useCollapsedIds('music-pattern', true);
    collapseAllPatterns();
    // eslint-disable-next-line no-unused-vars
    const isPatternCollapsed = (song, pattern) => isPatternCollapsedRaw(PATTERN_EDITOR_COLLAPSE_ENTRY);
    // eslint-disable-next-line no-unused-vars
    const togglePatternCollapsed = (song, pattern) => togglePatternCollapsedRaw(PATTERN_EDITOR_COLLAPSE_ENTRY);
    // Keyed by song alone (not one setting for the whole tab like the Pattern Editor above)
    // - one shared expanded/collapsed state for the whole song's Instruments
    // section, not a separate one remembered per pattern (so creating/
    // duplicating a PATTERN within an existing song never touches this at
    // all - its key, the song, hasn't changed - already exactly matching a
    // real reported requirement, "when a new pattern is created/duplicated,
    // don't change the state of the instrument section", with no extra code
    // needed for it). song.id is already globally unique (see
    // toggleSequenceCollapsed's  comment just below), so no synthetic
    // compound entry is needed here either.
    const {isCollapsed: isInstrumentsCollapsedRaw, toggleCollapsed: toggleInstrumentsCollapsedRaw,
      setCollapsed: setInstrumentsCollapsed, collapseAll: collapseAllInstruments} =
      useCollapsedIds('music-instruments', true);
    collapseAllInstruments();
    const isInstrumentsCollapsed = (song) => isInstrumentsCollapsedRaw(song);
    const toggleInstrumentsCollapsed = (song) => toggleInstrumentsCollapsedRaw(song);

    // Same idea, one level up - the whole Sequence (play order) row (every
    // chip, plus the "Add pattern to sequence" select) collapsed away to
    // just its  label. song.id is already globally unique (unlike
    // pattern.id), so this can
    // key off the song object directly instead of needing a synthetic
    // compound entry.
    const {isCollapsed: isSequenceCollapsed, toggleCollapsed: toggleSequenceCollapsed,
      setCollapsed: setSequenceCollapsed, collapseAll: collapseAllSequences} =
      useCollapsedIds('music-sequence', true);
    collapseAllSequences();

    const instance = getCurrentInstance();
    const forceUpdate = () => instance.proxy.$forceUpdate();

    // Same "growing padding + a bottom border once actually scrolled"
    // treatment as GraphicEditorToolbar.vue's .graphic-editor-toolbar/
    // isScrolled - that component finds its .editor-container ancestor
    // in an Options API mounted() hook; this is the Composition API
    // equivalent, using instance.proxy.$el (this component's root is
    // itself .editor-container's PARENT div, not that element, so this has
    // to search for it rather than just reading $el directly).
    const isMusicToolbarScrolled = ref(false);
    let musicToolbarScrollContainer = null;
    const handleMusicToolbarScroll = (event) => {
      isMusicToolbarScrolled.value = event.target.scrollTop > 0;
    };
    // The piano roll's toolbar (.piano-roll-zoom-row) is ALSO sticky (see
    // its CSS) and needs to stack directly below this one rather than
    // overlapping it - but .music-toolbar's height isn't a fixed constant:
    // it grows 4px/4px -> 10px/10px padding once actually scrolled (see
    // .music-toolbar-scrolled's comment), so a single hardcoded "top"
    // offset for the piano roll toolbar would either leave a gap or
    // overlap depending on scroll state. Measured live via ResizeObserver
    // instead (offsetHeight, not entry.contentRect, so this reads the real
    // border-box height including that padding directly, with no
    // box-sizing ambiguity) and bound to .piano-roll-zoom-row's "top"
    // through musicToolbarHeight below.
    const musicToolbarHeight = ref(0);
    let musicToolbarResizeObserver = null;

    onMounted(() => {
      musicToolbarScrollContainer = instance.proxy.$el.querySelector('.editor-container');
      if (musicToolbarScrollContainer) {
        musicToolbarScrollContainer.addEventListener('scroll', handleMusicToolbarScroll);
      }
      const musicToolbarEl = instance.proxy.$el.querySelector('.music-toolbar');
      if (musicToolbarEl && window.ResizeObserver) {
        musicToolbarResizeObserver = new ResizeObserver(() => {
          musicToolbarHeight.value = musicToolbarEl.offsetHeight;
        });
        musicToolbarResizeObserver.observe(musicToolbarEl);
      }
    });
    onBeforeUnmount(() => {
      if (musicToolbarScrollContainer) {
        musicToolbarScrollContainer.removeEventListener('scroll', handleMusicToolbarScroll);
      }
      if (musicToolbarResizeObserver) {
        musicToolbarResizeObserver.disconnect();
      }
    });

    // Plain assignment (song.loop = ...) doesn't work for a song saved
    // before this field existed - Vue 2 can't detect a brand new property
    // being added to an already-reactive object that way (see
    // processSongsStorageDefaults'  migration in blocks/music.js, which
    // is where such a song's song.loop first gets set), so the toggle
    // button's  icon/active-state bindings never re-evaluate. $set (same
    // fix DataEditor.vue's handleColumnsInput/handleColumnsChange use) plus
    // forceUpdate is what actually makes the change visible immediately -
    // confirmed directly as the cause of "can't toggle song preview
    // looping." handleToggleLoopPattern right above doesn't need this same
    // fix even though song.patternPreviewLoop is also a migrated field:
    // processSongsStorageDefaults'  migration guarantees it already
    // exists as a real boolean on every song by load time (before Vue's
    // reactivity conversion runs), unlike song.loop when THAT field was
    // first introduced.
    const handleToggleLoopSong = (song) => {
      instance.proxy.$set(song, 'loop', !song.loop);
      handleChildChange();
      forceUpdate();
    };

    // handleChildChange alone isn't reliably enough to make the piano roll's
    // slice grid lines/hover-slice math (which read state.value.subdivision
    // fresh on every render, not via a reactive computed) actually re-render
    // right away - same reasoning as every other cross-cutting mutation in
    // this file that also calls forceUpdate().
    const handleChangeSubdivision = () => {
      handleChildChange();
      forceUpdate();
    };

    // Whether the "Note duration snap" dropdown's  value is actually
    // applied right now - a page-local UI preference (not project data,
    // same as autoFollowPlayback), separate from state.subdivision itself
    // so toggling this off and back on always restores exactly whatever
    // slice count was last selected, rather than the dropdown's  value
    // having to change (e.g. to 1) to temporarily get unsnapped placement.
    const snapEnabled = ref(true);
    const handleToggleSnap = () => {
      snapEnabled.value = !snapEnabled.value;
      forceUpdate();
    };

    // Which gesture a click/drag on the piano roll grid performs right now -
    // a page-local UI preference (not project data), shared across every
    // song/pattern the same way snapEnabled/pianoRollZoom already are, not
    // one per pattern. 'draw' is the default, matching this grid's
    // historical plain-click-to-place behavior before these tools existed.
    const pianoRollTool = ref('draw');
    const setPianoRollTool = (tool) => {
      // Switching away from Select (to Draw/Erase, or back to Select on a
      // DIFFERENT track - see setActiveTrack) drops whatever was selected -
      // a stale selection from a tool/track switch away and back would
      // otherwise silently still be there for the NEXT Move drag to grab,
      // with no visual trace of it left on screen to explain why several
      // notes suddenly moved together.
      if (tool !== 'move') pianoRollSelection.value = new Set();
      pianoRollTool.value = tool;
    };
    // The active track's notes currently marquee-selected (Select
    // tool - see handleSelectMouseDown/stopMarqueeSelect below), as a Set of
    // direct note-object references (stable for a note's lifetime - a
    // note is never replaced in place, only pushed/spliced - so reference
    // equality is all this needs, no separate id scheme). Checked by the
    // Move tool (handleCellMouseDown) to move every selected note together
    // instead of just whichever one was actually clicked.
    const pianoRollSelection = ref(new Set());
    const isNoteSelected = (note) => pianoRollSelection.value.has(note);
    // The slice count actually in effect for note placement/resizing and
    // the grid lines that reflect it - the dropdown's  value when snap
    // is on, or 1 (the whole step, i.e. no sub-step snapping at all) when
    // it's off. Every place that used to read state.value.subdivision
    // directly reads this instead, so flipping the toggle takes effect
    // everywhere at once without touching the stored dropdown value.
    const effectiveSubdivision = () => (snapEnabled.value ? Math.max(1, Math.round(state.value.subdivision || 1)) : 1);

    // Which pattern is shown in each song's single pattern editor - a view
    // preference, not project data, so it isn't stored alongside the song
    // itself (same reasoning as hooks/collapse.js's collapsed-card state).
    // Backed by useMusicEditorActiveState's  module-level ref (persisted
    // to localStorage) rather than a plain local ref, so it survives Vue
    // Router destroying and recreating this component when the user leaves
    // and returns to the Music tab.
    const {activePatternIdsRef, activeTrackIdsRef, activeSongIdRef, setActivePatternId, setActiveTrackId,
      setActiveSongId} = useMusicEditorActiveState();
    const activePatternId = (song) =>
      activePatternIdsRef.value[song.id] || (song.patterns[0] && song.patterns[0].id);
    const setActivePattern = (song, patternId) => {
      // Captured before switching: the instrument (soundEffectId) the
      // OUTGOING pattern currently has active. Track ids are only unique
      // WITHIN a pattern (see hiddenTrackKey's  comment), so the
      // per-pattern activeTrackIdsRef entry below can't carry "the same
      // instrument" across patterns by itself - matching by soundEffectId
      // instead keeps whichever instrument the user was just looking at
      // selected on the new pattern too, whenever that same instrument is
      // also used there, rather than falling back to track 1 every time.
      const previousPattern = activePattern(song);
      const previousTrack = previousPattern && activeTrackFor(previousPattern);
      const previousSoundEffectId = previousTrack && previousTrack.soundEffectId;

      // Whether pattern PLAYBACK (as opposed to just which pattern is being
      // viewed/edited) should follow this switch too - only when the
      // pattern currently sounding is the one being switched AWAY from
      // (the only way pattern playback ever starts is the "Play this
      // pattern" button, which always acts on whichever pattern is active
      // at the moment it's clicked - see handlePlayPattern - so this is the
      // one case where "switch selection" and "switch what's playing"
      // should track each other). Confirmed directly as a real bug
      // otherwise: switching to a different pattern while one loops left
      // the OLD pattern quietly looping in the background - Loop/Stop
      // buttons, now bound to the newly active pattern, stopped doing
      // anything audible, since they were reading/writing a pattern that
      // wasn't the one actually playing.
      const shouldFollowPlayback = previousPattern && playingPatternId.value === previousPattern.id &&
        patternId !== previousPattern.id;

      setActivePatternId(song.id, patternId);
      const pattern = song.patterns.find(({id}) => id === patternId);
      // Full handleFitZoom (recalculate AND reset zoom to 1), not just
      // recalculateFitBaseWidth alone - pianoRollZoom is a single value
      // shared across every song/pattern (see its comment), so without
      // this, switching to a pattern of a different length than whatever
      // was last viewed showed it at that stale zoom percentage instead of
      // fit to ITS length - confirmed as a real reported bug ("isn't
      // auto-resizing the zoom to the pattern length by default").
      if (pattern) handleFitZoom(song, pattern);
      if (pattern && previousSoundEffectId != null) {
        const matchingTrack = pattern.tracks
            .find((track) => track.soundEffectId === previousSoundEffectId);
        if (matchingTrack) setActiveTrack(pattern, matchingTrack);
      }
      if (pattern && shouldFollowPlayback) handlePlayPattern(song, pattern);
      // Switching patterns can swap in a whole new set of tracks whose
      // v-selects (Channel, Instrument) Vue's  v-for keying (by
      // track.id) may reuse the SAME DOM node for, if the new pattern
      // happens to have a track sharing that id with the old one's (e.g.
      // both patterns' first track is id 1) - a plain reactive update
      // alone left a reused select showing the PREVIOUS pattern's
      // value rather than the new track's, same class of stale-Vuetify-
      // select bug as the Sound tab's  Frequency field and this same
      // Channel field's  default-value display, both already fixed the
      // same way. Bare forceUpdate() (not handleChildChange - no project
      // data actually changed here, just which pattern is being viewed).
      forceUpdate();
    };
    const activePattern = (song) =>
      song.patterns.find(({id}) => id === activePatternId(song)) || song.patterns[0];

    // Which song the single editor below is showing - a view preference,
    // not project data (same reasoning as activePatternId above), persisted
    // so it survives leaving and returning to this tab. Unlike
    // activePatternId (keyed per-song, since every song has its
    // separately-remembered active pattern), there's only ever one song
    // being edited at a time, so this is a single scalar id, not a map.
    const activeSongId = () =>
      activeSongIdRef.value != null && state.value.songs.some(({id}) => id === activeSongIdRef.value) ?
        activeSongIdRef.value : (state.value.songs[0] && state.value.songs[0].id);
    const activeSong = () => state.value.songs.find(({id}) => id === activeSongId()) || state.value.songs[0];
    // A one-item-or-empty array wrapper around activeSong() purely so the
    // template can get a "song" binding for the single active song via a
    // plain v-for (Vue 2 templates have no other way to introduce a local
    // variable) - the editor below it is otherwise unchanged from when it
    // was one card among many in a v-for over every song.
    const activeSongArray = computed(() => {
      const song = activeSong();
      return song ? [song] : [];
    });
    const setActiveSong = (songId) => {
      setActiveSongId(songId);
      // Same free fit-to-length as setActivePattern gives a pattern switch -
      // switching songs also swaps in a whole different piano roll (this
      // song's active pattern), which needs fitting to ITS length too,
      // not whatever zoom was last left over from the previous song.
      const song = state.value.songs.find(({id}) => id === songId);
      const pattern = song && activePattern(song);
      if (pattern) handleFitZoom(song, pattern);
      forceUpdate();
    };

    const songName = (songId) => {
      const song = state.value.songs.find(({id}) => id == songId);
      return song ? (song.name || `Song ${songId}`) : `Song ${songId}`;
    };
    const songOptions = () => state.value.songs.map(
        (song) => ({text: song.name || `Song ${song.id}`, value: song.id}))
        .sort((a, b) => a.text.localeCompare(b.text, undefined, {sensitivity: 'base'}));

    // Combined "Editing song"/"Song name" field (see the template's
    // v-combobox) - same exact behavior as handlePatternFieldChange below,
    // just for the song picker instead of the pattern one: picking an
    // EXISTING song switches which one is active, typing a name that
    // doesn't match any OTHER song renames whichever song is CURRENTLY
    // active.
    const handleSongFieldChange = (text) => {
      const value = text && typeof text === 'object' ? text.text : text;
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const current = activeSong();
      if (trimmed === songName(current.id)) return;
      const matched = state.value.songs.find((s) => s.id !== current.id && songName(s.id) === trimmed);
      if (matched) {
        setActiveSong(matched.id);
        return;
      }
      current.name = trimmed;
      handleChildChange();
      forceUpdate();
    };

    // Combined "Editing pattern"/"Pattern name" field (see the template's
    // v-combobox) - picking an EXISTING pattern from its dropdown
    // switches which one is active, exactly like the old separate
    // "Editing pattern" select did; typing something that doesn't match
    // any OTHER existing pattern's  name instead renames whichever
    // pattern is CURRENTLY active, exactly like the old separate
    // "Pattern name" field did. Both cases arrive here as a plain string
    // (v-combobox's  model is the display text itself, not a
    // patternId - unlike v-select, it doesn't do an item-value lookup for
    // an externally-set :value, so binding this to an id the way the old
    // "Editing pattern" select could just showed the raw id number
    // instead of the pattern's  name - confirmed directly), so which
    // case this is has to be told apart by matching that text against
    // every OTHER pattern's  name instead.
    const handlePatternFieldChange = (song, text) => {
      // v-combobox's @change can hand back the raw {text, value} ITEM
      // object instead of a plain string - happens whenever the typed text
      // lands on an existing option (item-text is set here, but no
      // item-value, so nothing tells it to collapse a selected item down to
      // a primitive) - confirmed directly as a real bug: renaming silently
      // did nothing (the typeof guard below bounced the object straight
      // back out) while the input's  leftover typed text stayed
      // visible until the next re-render quietly reverted it, LOOKING like
      // the rename either failed or hit the wrong pattern.
      const value = text && typeof text === 'object' ? text.text : text;
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const current = activePattern(song);
      if (trimmed === patternName(song, current.id)) return;
      const matched = song.patterns.find((p) => p.id !== current.id && patternName(song, p.id) === trimmed);
      if (matched) {
        setActivePattern(song, matched.id);
        return;
      }
      current.name = trimmed;
      handleChildChange();
      forceUpdate();
    };

    const handleAddSong = () => {
      const songs = state.value.songs;
      const maxId = max(songs.map((o) => o.id)) || 0;
      const firstSoundEffectId = soundEffects().length ? soundEffects()[0].id : 1;
      // Captured BEFORE pushing the new song - the song the user is
      // actually looking at right now, whose sequence/instruments/pattern
      // section states the new song's brand new (otherwise-defaulted-
      // collapsed) sections should match. A real reported refinement over
      // an earlier version of this fix, which force-expanded all three
      // instead: "the sequencer section shouldn't open, just leave
      // sequencer and pattern editor in whatever their current state is" -
      // copying whatever's already showing, not assuming "expanded" is
      // always wanted.
      const previousSong = activeSong();
      const newSong = {
        id: maxId + 1,
        name: `Song ${maxId + 1}`,
        patterns: [{
          id: 1,
          name: 'Pattern 1',
          tempo: DEFAULT_TEMPO,
          useOwnTempo: false,
          stepCount: DEFAULT_PATTERN_STEPS,
          tracks: [emptyTrack(1, firstSoundEffectId)],
        }],
        sequence: [{id: 1, patternId: 1, count: 1}],
      };
      songs.push(newSong);
      if (previousSong) {
        setSequenceCollapsed(newSong, isSequenceCollapsed(previousSong));
        setInstrumentsCollapsed(newSong, isInstrumentsCollapsed(previousSong));
      }
      setActiveSong(newSong.id);
      handleChildChange();
      forceUpdate();
      // pianoRollBaseWidth/pianoRollZoom are shared across every song (not
      // per-song state), so a freshly added song otherwise just inherits
      // whatever was left over from the last song/pattern edited, rather
      // than a real 100% fit to its piano-roll-scroll width - the same
      // gap handleFitZoom's  button fixes for an EXISTING pattern.
      // setActiveSong above already calls handleFitZoom, but this new
      // song's .piano-roll-scroll element doesn't exist in the DOM yet at
      // that point - recalculateFitBaseWidth's querySelector would find
      // nothing and silently fall back to the unmeasured default width, so
      // this nextTick fixup re-measures once it actually exists.
      nextTick(() => handleFitZoom(newSong, newSong.patterns[0]));
    };

    const handleDuplicateSong = (song) => {
      if (!song) return;
      const songs = state.value.songs;
      const maxId = max(songs.map((o) => o.id)) || 0;
      const newSong = {
        ...structuredClone(song),
        id: maxId + 1,
        name: `${song.name || 'Song'} copy`,
      };
      songs.push(newSong);
      // Same reasoning as handleAddSong's setCollapsed calls - copies
      // the state from the song actually being duplicated (not some other
      // active song), since that's the state the user would reasonably
      // expect its copy to start in. Reads from/writes to patterns[0]
      // specifically on both sides (not activePattern(song), which could be
      // a different pattern than patterns[0] if the user had navigated
      // elsewhere first) - activePattern(newSong) just below falls back to
      // newSong.patterns[0] regardless, since a brand new song.id has no
      // remembered "active pattern" yet, so patterns[0] is the one
      // actually shown either way.
      setSequenceCollapsed(newSong, isSequenceCollapsed(song));
      setInstrumentsCollapsed(newSong, isInstrumentsCollapsed(song));
      setActiveSong(newSong.id);
      handleChildChange();
      // Same DOM-not-ready-yet reasoning as handleAddSong's nextTick.
      nextTick(() => handleFitZoom(newSong, activePattern(newSong)));
    };

    const handleDeleteSong = (song) => {
      state.value.songs = state.value.songs.filter(({id}) => id != song.id);
      if (activeSongId() === song.id) {
        setActiveSong(state.value.songs[0] && state.value.songs[0].id);
      }
      handleChildChange();
      forceUpdate();
    };

    // Song data (name/tempo/loop/patterns/sequence) as a standalone .vcsmus
    // file, for sharing a song between projects or keeping an external
    // backup - the song's  id isn't included (see handleImportSong,
    // which keeps the IMPORTING song's id rather than the file's), since
    // ids are only meaningful within a single project's  storage. Also
    // bundles every Sound tab instrument any of this song's tracks
    // actually points at (see soundEffectIdsUsedBySong/handleImportSong's
    // importSoundEffects) - without this, a song exported and opened
    // in a different project would still LOOK complete (every note has a
    // soundEffectId), but every one of those ids would be pointing at
    // either nothing or, worse, some unrelated instrument that just
    // happens to already occupy that id in the target project.
    const soundEffectIdsUsedBySong = (song) => {
      const ids = new Set();
      (song.patterns || []).forEach((pattern) => {
        (pattern.tracks || []).forEach((track) => {
          if (track.soundEffectId != null) ids.add(String(track.soundEffectId));
        });
      });
      return ids;
    };
    const handleExportSong = (song) => {
      const usedIds = soundEffectIdsUsedBySong(song);
      const usedSoundEffects = soundEffects().filter(({id}) => usedIds.has(String(id)));
      // eslint-disable-next-line no-unused-vars
      const {id, ...songData} = song;
      const exportData = {...songData, soundEffects: usedSoundEffects};
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
      const filename = (song.name || `song-${song.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `Song_${filename}-${getDateInfix()}.vcsmus`);
    };

    // Adds whichever of an imported song's  bundled instruments (see
    // handleExportSong above) aren't already covered by an EXISTING Sound
    // tab card of the same name - matched by name rather than by the
    // file's  id, since that id only ever meant something in the
    // project the song was originally exported from, and could collide
    // with an unrelated instrument already sitting at that same id here.
    // A name match instead means re-importing a song into the SAME
    // project (or one that already has that instrument, e.g. from a
    // previous import) reuses the existing card instead of piling up
    // duplicates. Returns oldId -> newId (or reused existing id), for
    // handleImportSong to rewrite the incoming patterns'  track.
    // soundEffectId references with.
    const importSoundEffects = (importedSoundEffects) => {
      const idMap = {};
      if (!Array.isArray(importedSoundEffects) || !importedSoundEffects.length) return idMap;
      const current = processSoundEffectsStorageDefaults(soundEffectsStorage);
      let maxId = max(current.soundEffects.map((o) => o.id)) || 0;
      importedSoundEffects.forEach((effect) => {
        if (!effect || typeof effect !== 'object') return;
        const oldId = effect.id;
        const existing = effect.name && current.soundEffects.find((o) => o.name === effect.name);
        if (existing) {
          if (oldId != null) idMap[oldId] = existing.id;
          return;
        }
        maxId += 1;
        current.soundEffects.push({...effect, id: maxId, name: effect.name || `Sound effect ${maxId}`});
        if (oldId != null) idMap[oldId] = maxId;
      });
      soundEffectsStorage.value = current;
      return idMap;
    };

    // Overwrites this song card's  data with a previously exported .vcsmus
    // file's contents - keeps this song's  id (see handleExportSong)
    // untouched so every music_play_song/music_song_stopped block already
    // pointing at this card keeps working, exactly like handleImportCsv in
    // DataEditor.vue keeps a data table's  id on import.
    const handleImportSong = (song) => {
      openFileDialog('.vcsmus,.json')
          .then((file) => file.text())
          .then((text) => {
            const parsed = JSON.parse(text);
            if (!parsed || !Array.isArray(parsed.patterns)) {
              throw new Error('File does not contain valid song data');
            }
            // eslint-disable-next-line no-unused-vars
            const {soundEffects: importedSoundEffects, ...songData} = parsed;
            const idMap = importSoundEffects(importedSoundEffects);
            // Always resolved through idMap, never left as the raw imported
            // id - a track whose id has no idMap entry (the bundle didn't
            // include it) would otherwise keep pointing at whatever
            // UNRELATED instrument already happens to occupy that same
            // numeric id in this project from before the import, silently
            // showing the wrong (stale, pre-import) instrument rather than
            // the one this track actually meant. Cleared to null instead -
            // the Instrument select below has no "unset" option; null just
            // reads as no selection made, which is honest about what's
            // actually known here, rather than a guess that looks correct.
            songData.patterns.forEach((pattern) => {
              (pattern.tracks || []).forEach((track) => {
                if (track.soundEffectId != null) {
                  track.soundEffectId = idMap[track.soundEffectId] != null ? idMap[track.soundEffectId] : null;
                }
              });
            });
            // Normalized the same way a stored project's  sequence is
            // (see processSongsStorageDefaults in blocks/music.js) - an
            // OLDER exported song file (from before repeat groups
            // existed) would otherwise still have its  sequence as a
            // flat array of raw patternIds, bypassing that normalization
            // entirely, since import overwrites this song's fields
            // directly rather than going through the storage-load path.
            songData.sequence = normalizeSequenceGroups(songData.sequence);
            Object.assign(song, songData, {id: song.id});
            if (activePatternId(song) && !song.patterns.some(({id: pid}) => pid === activePatternId(song))) {
              setActivePattern(song, song.patterns[0] && song.patterns[0].id);
            }
            handleChildChange();
            forceUpdate();
          })
          .catch((e) => console.error('Failed to import song', e));
    };

    // Every song in the project as one .vcsmus "song bank" file (the toolbar's
    // database-export button): each song as handleExportSong writes it, minus
    // its id, plus every Sound tab instrument any of them uses.
    const handleExportSongBank = () => {
      const usedIds = new Set();
      state.value.songs.forEach((song) => soundEffectIdsUsedBySong(song).forEach((id) => usedIds.add(id)));
      const usedSoundEffects = soundEffects().filter(({id}) => usedIds.has(String(id)));
      const exportData = {
        // eslint-disable-next-line no-unused-vars
        songs: state.value.songs.map(({id, ...songData}) => songData),
        soundEffects: usedSoundEffects,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
      saveAs(blob, `Songs-${getDateInfix()}.vcsmus`);
    };

    // Loads a song bank file (see handleExportSongBank). Like the Sound tab's
    // sound bank: a song whose name matches one already in the project has
    // its contents replaced (keeping that song's id, so every block pointing
    // at it still works), and every other song in the file is added as a new
    // one. Instruments are matched by name through importSoundEffects, the
    // same as importing one song.
    const handleImportSongBank = () => {
      openFileDialog('.vcsmus,.json')
          .then((file) => file.text())
          .then((text) => {
            const parsed = JSON.parse(text);
            if (!parsed || !Array.isArray(parsed.songs)) {
              throw new Error('File does not contain a song bank');
            }
            const idMap = importSoundEffects(parsed.soundEffects);
            const songs = state.value.songs;
            let maxId = max(songs.map((o) => o.id)) || 0;
            parsed.songs.forEach((imported) => {
              if (!imported || !Array.isArray(imported.patterns)) return;
              // eslint-disable-next-line no-unused-vars
              const {id: importedId, soundEffects: bundled, ...songData} = imported;
              songData.patterns.forEach((pattern) => {
                (pattern.tracks || []).forEach((track) => {
                  if (track.soundEffectId != null) {
                    track.soundEffectId = idMap[track.soundEffectId] != null ? idMap[track.soundEffectId] : null;
                  }
                });
              });
              songData.sequence = normalizeSequenceGroups(songData.sequence);
              const existing = songData.name && songs.find((o) => o.name === songData.name);
              if (existing) {
                Object.assign(existing, songData, {id: existing.id});
                if (activePatternId(existing) && !existing.patterns.some(({id: pid}) => pid === activePatternId(existing))) {
                  setActivePattern(existing, existing.patterns[0] && existing.patterns[0].id);
                }
              } else {
                maxId += 1;
                songs.push({
                  loop: false, patternPreviewLoop: false, ...songData, id: maxId, name: songData.name || `Song ${maxId}`,
                });
              }
            });
            handleChildChange();
            forceUpdate();
          })
          .catch((e) => console.error('Failed to import song bank', e));
    };

    // Same bundled-instruments reasoning as soundEffectIdsUsedBySong above,
    // just scoped to one pattern's  tracks instead of every pattern in
    // a whole song.
    const soundEffectIdsUsedByPattern = (pattern) => {
      const ids = new Set();
      (pattern.tracks || []).forEach((track) => {
        if (track.soundEffectId != null) ids.add(String(track.soundEffectId));
      });
      return ids;
    };

    // Same shape/reasoning as handleExportSong above, one level down - a
    // single pattern (with its  bundled instruments) as a standalone
    // .vcsmus file, for reusing one pattern across songs/projects without
    // dragging the whole song along with it.
    const handleExportPattern = (pattern) => {
      const usedIds = soundEffectIdsUsedByPattern(pattern);
      const usedSoundEffects = soundEffects().filter(({id}) => usedIds.has(String(id)));
      // eslint-disable-next-line no-unused-vars
      const {id, ...patternData} = pattern;
      const exportData = {...patternData, soundEffects: usedSoundEffects};
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
      const filename = (pattern.name || `pattern-${pattern.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `${filename}-${getDateInfix()}.vcsmus`);
    };

    // Overwrites this pattern's  data with a previously exported .vcsmus
    // file's contents - keeps this pattern's  id (see
    // handleExportPattern) untouched so the song's  Sequence list
    // (which references patterns by id, not position - see
    // handleAddSequenceStep) keeps pointing at the same slot. Reuses
    // importSoundEffects (see handleImportSong above) for the same
    // name-matched instrument reuse/creation.
    const handleImportPattern = (song, pattern) => {
      openFileDialog('.vcsmus,.json')
          .then((file) => file.text())
          .then((text) => {
            const parsed = JSON.parse(text);
            if (!parsed || !Array.isArray(parsed.tracks)) {
              throw new Error('File does not contain valid pattern data');
            }
            // eslint-disable-next-line no-unused-vars
            const {soundEffects: importedSoundEffects, ...patternData} = parsed;
            const idMap = importSoundEffects(importedSoundEffects);
            // Same reasoning as handleImportSong above: always resolved
            // through idMap, cleared to null rather than left pointing at
            // an unrelated pre-existing instrument that happens to share
            // the raw imported id.
            (patternData.tracks || []).forEach((track) => {
              if (track.soundEffectId != null) {
                track.soundEffectId = idMap[track.soundEffectId] != null ? idMap[track.soundEffectId] : null;
              }
            });
            Object.assign(pattern, patternData, {id: pattern.id});
            recalculateFitBaseWidth(song, pattern);
            handleChildChange();
            forceUpdate();
          })
          .catch((e) => console.error('Failed to import pattern', e));
    };

    const handleAddPattern = (song) => {
      const maxId = max(song.patterns.map((o) => o.id)) || 0;
      const firstSoundEffectId = soundEffects().length ? soundEffects()[0].id : 1;
      const newPattern = {
        id: maxId + 1,
        name: `Pattern ${maxId + 1}`,
        tempo: DEFAULT_TEMPO,
        useOwnTempo: false,
        stepCount: DEFAULT_PATTERN_STEPS,
        loop: false,
        tracks: [emptyTrack(1, firstSoundEffectId)],
      };
      song.patterns.push(newPattern);
      // setActivePattern itself now already fits the zoom to whichever
      // pattern becomes active (see its comment), so a brand new
      // pattern gets that for free here - no separate handleFitZoom call
      // needed.
      setActivePattern(song, newPattern.id);
      handleChildChange();
      forceUpdate();
    };

    const handleDuplicatePattern = (song, pattern) => {
      if (!pattern) return;
      const maxId = max(song.patterns.map((o) => o.id)) || 0;
      const newPattern = {
        ...structuredClone(pattern),
        id: maxId + 1,
        name: `${pattern.name || 'Pattern'} copy`,
      };
      song.patterns.push(newPattern);
      // Same free fit-to-length as handleAddPattern above, via
      // setActivePattern.
      setActivePattern(song, newPattern.id);
      handleChildChange();
      forceUpdate();
    };

    const handleDeletePattern = (song, pattern) => {
      song.patterns = song.patterns.filter(({id}) => id != pattern.id);
      song.sequence = song.sequence.filter((id) => id != pattern.id);
      if (activePatternId(song) === pattern.id) {
        setActivePattern(song, song.patterns[0] && song.patterns[0].id);
      }
      handleChildChange();
      forceUpdate();
    };

    const handleStepCountChange = (song, pattern) => {
      pattern.stepCount = clampPatternSteps(pattern.stepCount);
      const maxUnits = pattern.stepCount * LENGTH_UNITS_PER_STEP;
      pattern.tracks.forEach((track) => {
        track.notes = track.notes
            .filter((note) => note.step < maxUnits)
            .map((note) => ({...note, length: Math.min(note.length, maxUnits - note.step)}));
      });
      // Full handleFitZoom (recalculate AND reset zoom to 1), not just
      // recalculateFitBaseWidth alone - a Length edit should always
      // re-fit the view to the new step count, not just recalibrate what
      // "100%" means while leaving whatever zoom level was already set
      // (which would read as "100%" but not actually look like a fit).
      handleFitZoom(song, pattern);
      handleChildChange();
      forceUpdate();
    };

    // Which instrument row a pattern's shared piano roll is currently
    // editing - a view preference, not project data (same reasoning and
    // same persisted-ref backing as activePatternIds above).
    const activeTrackFor = (pattern) => {
      const id = activeTrackIdsRef.value[pattern.id];
      return pattern.tracks.find((track) => track.id === id) || pattern.tracks[0];
    };
    const isActiveTrack = (pattern, track) => activeTrackFor(pattern) === track;
    const setActiveTrack = (pattern, track) => {
      setActiveTrackId(pattern.id, track.id);
      // The marquee selection (see pianoRollSelection) only ever holds the
      // PREVIOUSLY active track's notes - switching tracks would
      // otherwise leave a Move drag grabbing a different track's notes than
      // whichever one the user can currently see/intend to edit.
      pianoRollSelection.value = new Set();
    };

    // Which instrument rows' notes are hidden from the shared piano roll - a
    // view preference (not project data), purely visual: hiding a track
    // doesn't change monophonic/channel blocking or anything else about it,
    // just whether its  note bars are drawn. Keyed by pattern id (not
    // just track id) since track ids are only unique WITHIN a pattern, not
    // globally - two different patterns can each have their "track 1".
    const hiddenTrackIds = ref({});
    const hiddenTrackKey = (pattern, track) => `${pattern.id}:${track.id}`;
    const isTrackHidden = (pattern, track) => !!hiddenTrackIds.value[hiddenTrackKey(pattern, track)];
    const handleToggleTrackVisibility = (pattern, track) => {
      const key = hiddenTrackKey(pattern, track);
      hiddenTrackIds.value = {...hiddenTrackIds.value, [key]: !hiddenTrackIds.value[key]};
    };

    // Which instrument rows are explicitly silenced during pattern/song
    // preview playback - same "view preference, not project data" shape as
    // hiddenTrackIds above, just for audio instead of the piano roll's
    // display (doesn't touch the compiled ROM at all - that has no concept
    // of muting, only the Music tab's  browser preview does). This is
    // only HALF of a track's  effective muted state now - see
    // isTrackMuted below, which also factors in soloedTrackIds.
    //
    // Keyed by SONG id + track id (not pattern id like hiddenTrackIds
    // above) - a single mute/solo toggle is meant to apply across every
    // pattern in the song at once (e.g. muting "track 1" mutes that same
    // instrument slot in every one of the song's patterns), not just the
    // one pattern whose button was clicked. This relies on track ids being
    // assigned consistently pattern-to-pattern within a song (see
    // handleAddTrack - each pattern's  tracks are numbered 1, 2, ... in
    // the order they were added), the same assumption the rest of the app
    // already leans on for a song's patterns to read as "the same
    // instruments, different notes."
    const mutedTrackIds = ref(loadMutedMusicTrackIds());
    const mutedTrackKey = (song, track) => `${song.id}:${track.id}`;
    const explicitlyMutedTrack = (song, track) => !!mutedTrackIds.value[mutedTrackKey(song, track)];

    // Which instrument rows are soloed - see isMusicTrackMuted's
    // comment (hooks/project.js) for why this is a separate set from
    // mutedTrackIds rather than folded into it. Song-scoped for the same
    // reason as mutedTrackIds above.
    const soloedTrackIds = ref(loadSoloedMusicTrackIds());
    const soloedTrackKey = (song, track) => `${song.id}:${track.id}`;
    const isTrackSoloed = (song, track) => !!soloedTrackIds.value[soloedTrackKey(song, track)];

    // A track's REAL, effective muted state, used everywhere actual
    // playback/note-color decisions are made (schedulePattern's
    // isTrackMuted callback in utils/music-playback.js, patternCellStyle's
    // note-dimming) - see isMusicTrackMuted in hooks/project.js (shared with
    // the ROM generator, so the compiled output honors the exact same
    // mute/solo state as this tab's  preview) for the actual solo-
    // overrides-mute formula.
    const isTrackMuted = (song, pattern, track) =>
      isMusicTrackMuted(mutedTrackIds.value, soloedTrackIds.value, song, pattern, track);

    // Re-applies every track's  EFFECTIVE muted state (see isTrackMuted)
    // to whatever's currently playing, not just the next pattern/song play
    // - see setTrackMuted's  comment. Needed on any mute OR solo toggle,
    // for every track in the pattern (not just the one just clicked) since
    // toggling solo on one track changes every other track's  effective
    // state too. Only reaches the pattern whose button was clicked
    // (same pre-existing limitation as before this became song-scoped) -
    // if a DIFFERENT pattern in the same song happens to be mid-playback
    // right now (e.g. as part of a playing Sequence), its  live audio
    // isn't retroactively touched, only what schedulePattern reads next
    // time that pattern is (re)scheduled.
    const applyLiveTrackMuteState = (song, pattern) => {
      (pattern.tracks || []).forEach((track) => setTrackMuted(pattern, track, isTrackMuted(song, pattern, track)));
    };

    const handleToggleTrackMute = (song, pattern, track) => {
      const key = mutedTrackKey(song, track);
      mutedTrackIds.value = {...mutedTrackIds.value, [key]: !mutedTrackIds.value[key]};
      localStorage.setItem(MUTED_MUSIC_TRACKS_KEY, JSON.stringify(mutedTrackIds.value));
      applyLiveTrackMuteState(song, pattern);
    };

    const handleToggleTrackSolo = (song, pattern, track) => {
      const key = soloedTrackKey(song, track);
      soloedTrackIds.value = {...soloedTrackIds.value, [key]: !soloedTrackIds.value[key]};
      localStorage.setItem(SOLOED_MUSIC_TRACKS_KEY, JSON.stringify(soloedTrackIds.value));
      applyLiveTrackMuteState(song, pattern);
    };

    // Clipboard for one instrument's placed notes (see handleCopyTrack/
    // handlePasteTrack) - shared across every pattern/song, so a rhythm can
    // be copied from one instrument onto another (in the same or a
    // different pattern) without touching the target's  instrument/
    // channel assignment. null until the first copy.
    const copiedTrackNotes = ref(null);
    const handleCopyTrack = (track) => {
      copiedTrackNotes.value = structuredClone(track.notes || []);
    };
    const handlePasteTrack = (track) => {
      if (!copiedTrackNotes.value) return;
      track.notes = structuredClone(copiedTrackNotes.value);
      handleChildChange();
      forceUpdate();
    };

    const handleAddTrack = (pattern) => {
      const maxId = max(pattern.tracks.map((o) => o.id)) || 0;
      const firstSoundEffectId = soundEffects().length ? soundEffects()[0].id : 1;
      const newTrack = emptyTrack(maxId + 1, firstSoundEffectId);
      pattern.tracks.push(newTrack);
      setActiveTrack(pattern, newTrack);
      handleChildChange();
      forceUpdate();
    };

    const handleDeleteTrack = (pattern, track) => {
      pattern.tracks = pattern.tracks.filter(({id}) => id != track.id);
      if (activeTrackIdsRef.value[pattern.id] === track.id) {
        setActiveTrack(pattern, pattern.tracks[0] || {id: null});
      }
      handleChildChange();
      forceUpdate();
    };

    // song.sequence is stored as {id, patternId, count} groups (see
    // DEFAULT_SONGS/normalizeSequenceGroups in blocks/music.js) - one
    // resizable Sequence chip per group, count > 1 meaning that pattern
    // repeats that many times in a row (see handleSequenceResizeStart)
    // instead of making the user add the same pattern over and over. A
    // fresh Add adds to the LAST group's  count instead of always
    // pushing a new one whenever it already matches, so repeatedly picking
    // the same pattern from the dropdown behaves the same as dragging the
    // resize handle would.
    // A chip's "id" IS its current 1-based position in song.sequence -
    // not a separate, permanent identity tracked alongside position (an
    // earlier version of this kept the two as distinct values, one stable
    // across reordering and one just for display - reverted at the user's
    // explicit request in favor of a single number that always means
    // "position right now"). Called after every mutation that can change
    // ANY chip's  position (add, remove, reorder) so id never drifts out
    // of sync with where a chip actually sits - existing lookups elsewhere
    // in this file (handleRemoveSequenceGroup, the resize/drag handlers)
    // keep matching by "id" completely unchanged, since id and position are
    // now simply the same number.
    const renumberSequenceIds = (song) => {
      song.sequence.forEach((group, index) => {
        group.id = index + 1;
      });
    };

    const handleAddSequenceStep = (song, patternId) => {
      if (patternId == null) return;
      const last = song.sequence[song.sequence.length - 1];
      if (last && last.patternId === patternId) {
        last.count++;
      } else {
        song.sequence.push({id: song.sequence.length + 1, patternId, count: 1});
      }
      handleChildChange();
      forceUpdate();
    };

    const handleRemoveSequenceGroup = (song, group) => {
      song.sequence = song.sequence.filter(({id}) => id !== group.id);
      renumberSequenceIds(song);
      handleChildChange();
      forceUpdate();
    };

    // Roughly one chip's  width in px - drags are snapped to whole
    // multiples of this (see handleSequenceResizeStart), matching the
    // "1x long, 2x long, 3x long" whole-repeat-only requirement rather
    // than free-form pixel widths that wouldn't map onto a real repeat
    // count at all.
    const SEQUENCE_CHIP_UNIT_WIDTH = 64;

    // {songId, groupId, startCount, previewCount} of whichever chip is
    // currently being resize-dragged, or null - previewCount is the LIVE
    // (not yet committed) repeat count while dragging, read by
    // sequenceGroupPreviewCount/sequenceGroupChipStyle below so the chip's
    // label/width visibly track the drag before it's released; the
    // group's real count is only actually written once on mouseup (see
    // handleSequenceResizeStart), same "commit on release, preview during
    // the gesture" split the Length (steps) resize handle elsewhere on
    // this tab already uses.
    const sequenceResize = ref(null);
    const sequenceGroupPreviewCount = (song, group) =>
      sequenceResize.value && sequenceResize.value.songId === song.id &&
        sequenceResize.value.groupId === group.id ?
        sequenceResize.value.previewCount : group.count;
    const sequenceGroupChipStyle = (song, group) => {
      const count = sequenceGroupPreviewCount(song, group);
      return count > 1 ? {minWidth: `${count * 56}px`} : {};
    };
    // A lighter tint of the chip's  color (see patternSequenceColor),
    // not a fixed grey - reads as part of the same chip rather than an
    // unrelated control bolted on next to it, while still being visibly a
    // different (lighter) shade so the drag affordance itself doesn't get
    // lost against a same-color chip.
    const sequenceGroupHandleStyle = (group) =>
      ({background: mixColorWithWhite(patternSequenceColor(group.patternId), 45)});

    // Dragging this handle grows/shrinks how many times in a row this
    // pattern repeats, snapped to whole repeats (see
    // SEQUENCE_CHIP_UNIT_WIDTH) - a plain window-level mousemove/mouseup
    // drag, not the HTML5 draggable API the chips themselves use for
    // reordering (see sequenceChipListeners below), since this needs
    // continuous pointer-position tracking rather than drop-target
    // semantics. preventDefault on mousedown (and the handle's
    // draggable="false" in the template) keeps this from also kicking off
    // a native chip-reorder drag, since the handle sits inside the same
    // draggable wrap.
    const handleSequenceResizeStart = (song, group, event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      sequenceResize.value = {songId: song.id, groupId: group.id, startCount: group.count, previewCount: group.count};
      const handleMove = (moveEvent) => {
        const deltaCount = Math.round((moveEvent.clientX - startX) / SEQUENCE_CHIP_UNIT_WIDTH);
        const previewCount = Math.max(1, sequenceResize.value.startCount + deltaCount);
        if (sequenceResize.value.previewCount !== previewCount) {
          sequenceResize.value = {...sequenceResize.value, previewCount};
        }
      };
      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        const resize = sequenceResize.value;
        sequenceResize.value = null;
        if (!resize || resize.previewCount === resize.startCount) return;
        const target = song.sequence.find(({id}) => id === resize.groupId);
        if (!target) return;
        target.count = resize.previewCount;
        handleChildChange();
        forceUpdate();
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    };

    // Drag-and-drop reordering for one song's  Sequence chips - not built
    // on hooks/drag-reorder.js's  useDragReorder, since that hook's
    // draggedIndex/dragOverIndex refs assume exactly one reorderable list
    // exists at a time, and every song's sequence is independently
    // reorderable. The songId in this state is a holdover from when every
    // song was rendered as its card at once (see git history) - only
    // the single active song's sequence can ever be dragged now, but
    // keeping it costs nothing and avoids a wider rename. The whole chip is
    // the drag handle (not a separate strip like a song card's used to
    // have) since, unlike that card, a chip has no text field or other
    // free-form click-and-drag-to-select content for `draggable` to
    // conflict with.
    const draggedSequenceStep = ref(null);
    // {songId, groupId, side} - groupId identifies which Sequence group
    // (see blocks/music.js's {id, patternId, count} shape) is being
    // dragged toward, side is 'before' or 'after', which HALF of that chip
    // the pointer is currently over (see dragOverSideFor below) - a chip
    // being dragged toward doesn't just mean "insert before it" the way a
    // single-index version would always draw its highlight; a chip dragged
    // to a position AFTER a target needs the highlight (and the actual drop) to
    // land on that target's  right side, not its left.
    const dragOverSequenceStep = ref(null);
    const isSequenceStepDragging = (song, group) =>
      !!draggedSequenceStep.value &&
      draggedSequenceStep.value.songId === song.id && draggedSequenceStep.value.groupId === group.id;
    const isSequenceStepDragOver = (song, group) =>
      !!dragOverSequenceStep.value &&
      dragOverSequenceStep.value.songId === song.id && dragOverSequenceStep.value.groupId === group.id &&
      !isSequenceStepDragging(song, group);
    // Which side of this chip's  highlight to show, for the template's
    // :class binding - null when this chip isn't the current drag-over
    // target at all (see isSequenceStepDragOver above, which this reuses
    // so the two never disagree).
    const sequenceDragOverSide = (song, group) =>
      isSequenceStepDragOver(song, group) ? dragOverSequenceStep.value.side : null;
    // Left half of the chip's  bounding box means "insert before it",
    // right half means "insert after it" - the same halfway-point
    // convention most drag-reorder UIs use (e.g. a Kanban board's
    // card-drop indicator), so the highlight always lands on whichever
    // side the pointer is actually closer to instead of unconditionally
    // always showing "before".
    const dragOverSideFor = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    };
    // Dragging a chip moves its  group object within song.sequence - a
    // repeated chip (count > 1) is still just ONE array entry (see
    // blocks/music.js's {id, patternId, count} shape), so this is a
    // plain single-item move, same as before repeat groups existed.
    const sequenceChipListeners = (song, group) => ({
      dragstart: (event) => {
        event.stopPropagation();
        draggedSequenceStep.value = {songId: song.id, groupId: group.id};
        event.dataTransfer.effectAllowed = 'move';
        // Same Firefox requirement as hooks/drag-reorder.js's
        // dragHandleListeners - the value itself is never read back.
        event.dataTransfer.setData('text/plain', String(group.id));
      },
      dragend: (event) => {
        event.stopPropagation();
        draggedSequenceStep.value = null;
        dragOverSequenceStep.value = null;
      },
      dragover: (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        // dragover fires continuously (many times a second) for as long as
        // the pointer sits over this chip, not just once on entry - only
        // actually writing the ref when the target (groupId OR which half
        // of it - see dragOverSideFor) changed, not every single tick,
        // avoids creating a brand new object, and the resulting
        // full-component reactive re-render (piano roll grid included),
        // dozens of times a second even while the pointer sits still.
        // Confirmed as the cause of a very long, increasing lag between
        // dropping and the reorder actually landing - the drop handler
        // itself was fine, it was just queued behind a huge backlog of
        // these redundant re-renders.
        const side = dragOverSideFor(event);
        const current = dragOverSequenceStep.value;
        if (!current || current.songId !== song.id || current.groupId !== group.id || current.side !== side) {
          dragOverSequenceStep.value = {songId: song.id, groupId: group.id, side};
        }
      },
      dragleave: (event) => {
        event.stopPropagation();
        // A chip's  child elements (its label, the close icon) are
        // still part of this same wrap div visually, but the browser
        // fires dragleave/dragenter at every element boundary crossing,
        // including moving from the wrap onto one of its  children -
        // relatedTarget is where the pointer actually went, so this skips
        // treating that as a real "left the chip" and only clears the
        // drag-over highlight once the pointer is genuinely outside it.
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (isSequenceStepDragOver(song, group) || isSequenceStepDragging(song, group)) {
          dragOverSequenceStep.value = null;
        }
      },
      drop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = draggedSequenceStep.value;
        draggedSequenceStep.value = null;
        dragOverSequenceStep.value = null;
        if (!from || from.songId !== song.id || from.groupId === group.id) return;
        // Computed fresh off the actual drop event's  pointer position
        // (not read back off dragOverSequenceStep) so the drop always
        // matches exactly what the highlight it lands on last showed, even
        // in the (browser-dependent) edge case where a final dragover
        // right before the drop didn't get a chance to update that ref.
        const side = dragOverSideFor(event);
        const sequence = song.sequence.slice();
        const fromIndex = sequence.findIndex(({id}) => id === from.groupId);
        const targetIndex = sequence.findIndex(({id}) => id === group.id);
        if (fromIndex === -1 || targetIndex === -1) return;
        // Where the dragged chip should land, in terms of the ORIGINAL
        // (pre-removal) array's  indices: right before the target for
        // 'before', right after it for 'after'. Removing the dragged chip
        // first shifts every index after its  OLD position left by
        // one, so that has to be corrected for before this target
        // position is actually used to splice it back in - see
        // dragOverSideFor's  comment for why "before/after a target"
        // is tracked at all instead of always inserting before it.
        let insertAt = side === 'after' ? targetIndex + 1 : targetIndex;
        if (fromIndex < insertAt) insertAt--;
        if (insertAt === fromIndex) return;
        const before = song.sequence.slice();
        const [moved] = sequence.splice(fromIndex, 1);
        sequence.splice(insertAt, 0, moved);
        song.sequence = sequence;
        renumberSequenceIds(song);
        handleChildChange();
        forceUpdate();
        const after = sequence.slice();
        const restore = (order) => {
          song.sequence = order.slice();
          renumberSequenceIds(song);
          handleChildChange();
          forceUpdate();
        };
        recordReorder({
          undo: () => restore(before),
          redo: () => restore(after),
          isCurrent: () => sameItems(song.sequence, after),
        });
      },
    });

    // Only one of a pattern or a song's full sequence can be playing at a
    // time (they share the same underlying audio engine - see
    // utils/music-playback.js), so starting either one clears the other.
    // Backed by usePlaybackStatusState's  module-level refs (not plain
    // local ones) for the same "survives Vue Router destroying/recreating
    // this component" reason activePatternIdsRef/activeTrackIdsRef above
    // already need it - see that hook's  comment.
    const {playingPatternIdRef: playingPatternId, playingSongIdRef: playingSongId} = usePlaybackStatusState();

    // {patternId, elapsedUnits} of whatever's currently playing (either a
    // single pattern or one step of a song's sequence), or null - drives the
    // piano roll's  moving playhead (see patternCellStyle) and the
    // Sequence list's playing-pattern highlight (see isSequenceGroupPlaying).
    // Polled via requestAnimationFrame rather than pushed from
    // music-playback.js, since that module only knows AudioContext time, not
    // Vue reactivity - this is the one place that bridges the two, and only
    // while something's actually playing (see startPlaybackHeadPolling).
    const playbackHead = ref(null);
    let playbackHeadFrame = null;
    const stopPlaybackHeadPolling = () => {
      if (playbackHeadFrame != null) {
        window.cancelAnimationFrame(playbackHeadFrame);
        playbackHeadFrame = null;
      }
      playbackHead.value = null;
    };
    // Every change to playbackHead re-renders the whole piano roll (thousands
    // of cells), so it is only updated when the playhead has actually moved to
    // another slice (the playhead is drawn snapped to slices - see
    // playheadSliceLayer) and at most every PLAYHEAD_MIN_INTERVAL_MS, instead
    // of with a fresh object on every animation frame. A move to another
    // pattern or sequence chip is applied at once.
    const PLAYHEAD_MIN_INTERVAL_MS = 100;
    let lastPlaybackHeadUpdate = 0;
    const startPlaybackHeadPolling = () => {
      const tick = () => {
        const head = getPlaybackHead();
        const previous = playbackHead.value;
        const now = window.performance.now();
        let apply = head !== previous;
        if (head && previous) {
          const slice = subdivisionUnitLength();
          const sameSegment = head.patternId === previous.patternId && head.sequenceIndex === previous.sequenceIndex;
          const sameSlice = Math.floor(head.elapsedUnits / slice) === Math.floor(previous.elapsedUnits / slice);
          apply = !sameSegment || (!sameSlice && now - lastPlaybackHeadUpdate >= PLAYHEAD_MIN_INTERVAL_MS);
        }
        if (apply) {
          playbackHead.value = head;
          lastPlaybackHeadUpdate = now;
        }
        playbackHeadFrame = window.requestAnimationFrame(tick);
      };
      if (playbackHeadFrame == null) tick();
    };
    onBeforeUnmount(stopPlaybackHeadPolling);
    // Resumes polling immediately if playback was already active when this
    // component mounts - true the first time the Music tab is ever opened
    // during something playing, but far more commonly true on a REMOUNT
    // (navigating away and back mid-playback, see playingPatternId/
    // playingSongId's  comment): the actual audio engine kept going the
    // whole time regardless, but the PREVIOUS mount's  polling loop was
    // torn down by its  onBeforeUnmount above, so nothing was left
    // updating playbackHead - without this, the moving playhead and
    // Sequence list highlight stayed frozen/blank until the next Play
    // click, even though playingPatternId/playingSongId themselves (now
    // module-level) correctly still showed something playing.
    if (playingPatternId.value != null || playingSongId.value != null) startPlaybackHeadPolling();

    // Toggle for the auto-follow watcher just below - a page-local UI
    // preference (not persisted project data, same reasoning/mechanism as
    // ActionEditor.vue's  gridSnapEnabled), since this only affects what
    // you're LOOKING at while a song plays, never the song itself. Defaults
    // off - the icon (see the template, in the song toolbar next to the
    // Stop/Play buttons) turns it on for whoever wants the piano roll to
    // follow along automatically instead of staying on whichever pattern
    // they had open.
    const autoFollowPlayback = ref(false);

    // Makes the viewed/edited pattern follow a SONG's  playback as its
    // sequence advances from one pattern to the next - without this, the
    // piano roll (and everything scoped to activePattern, including the
    // per-sound-type valid-note graying out in patternCellClasses) stayed
    // frozen on whichever pattern was selected when Play was clicked, never
    // showing the instruments/notes actually sounding a moment later. Only
    // acts on the patternId actually changing (not every playbackHead tick,
    // which fires every animation frame) and only while a SONG (not a lone
    // pattern) is playing - setActivePattern's  shouldFollowPlayback
    // guard only fires for playingPatternId, so calling it here can't
    // accidentally start/restart pattern-only playback and fight the song.
    watch(() => playbackHead.value && playbackHead.value.patternId, (patternId) => {
      if (patternId == null || !playingSongId.value || !autoFollowPlayback.value) return;
      const song = state.value.songs.find(({id}) => id === playingSongId.value);
      if (song && activePatternId(song) !== patternId) setActivePattern(song, patternId);
    });

    // Where playback should START from next, per pattern (id -> units) - set
    // by clicking the step ruler (see handleSeekToStep), read by
    // handlePlayPattern. Deliberately separate from playbackHead (which only
    // ever reflects REAL, currently-scheduled audio, and goes null the
    // instant nothing's playing) - this needs to survive being stopped, so
    // Play can pick back up from wherever was last clicked instead of always
    // restarting at 0. Only ever holds an entry for a pattern once the user
    // has actually clicked its ruler at least once - patternDisplayedHead
    // below treats "no entry" as "nothing to show" rather than defaulting to
    // a possibly-misleading marker at step 0.
    const patternSeekUnits = ref({});

    // What the piano roll should actually show as its playhead for this
    // pattern right now - the real, live position while it's genuinely
    // playing, otherwise the "armed" position last clicked on its ruler (if
    // any), otherwise nothing at all. Centralizing this (rather than
    // patternCellStyle checking playbackHead/patternSeekUnits separately)
    // keeps the "which one wins" precedence in exactly one place.
    const patternDisplayedHead = (pattern) => {
      if (playbackHead.value && playbackHead.value.patternId === pattern.id) {
        return {elapsedUnits: playbackHead.value.elapsedUnits, live: true};
      }
      const armed = patternSeekUnits.value[pattern.id];
      return armed == null ? null : {elapsedUnits: armed, live: false};
    };

    const handlePlayPattern = (song, pattern, startUnits = patternSeekUnits.value[pattern.id] ?? 0) => {
      playingSongId.value = null;
      playingPatternId.value = pattern.id;
      startPlaybackHeadPolling();
      playPattern(song, pattern, soundEffects(), {
        // schedulePattern (utils/music-playback.js) calls this back as
        // (pattern, track) - song is bound here via closure since mute/solo
        // state is now keyed by song, not just pattern (see isTrackMuted's
        // comment).
        isTrackMuted: (p, track) => isTrackMuted(song, p, track),
        startUnits,
        onDone: () => {
          if (playingPatternId.value === pattern.id) {
            playingPatternId.value = null;
            stopPlaybackHeadPolling();
          }
        },
      });
    };

    // Clicking the piano roll's  step ruler (see the template) always
    // arms that position as where Play will start from next (see
    // handlePlayPattern's  default, and patternDisplayedHead, which shows
    // it as a static playhead marker until playback actually catches up to
    // or passes it) - and, if this pattern is ALREADY playing, also seeks
    // there immediately rather than waiting for the next Play click.
    // clickedSliceOffsetUnits reuses the exact same "which slice within the
    // step was clicked" logic a click on the piano roll itself uses to place
    // a note, so seeking/arming snaps to the same granularity notes do.
    const handleSeekToStep = (song, pattern, step, event) => {
      const startUnits = step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event);
      patternSeekUnits.value = {...patternSeekUnits.value, [pattern.id]: startUnits};
      if (playingPatternId.value === pattern.id) {
        handlePlayPattern(song, pattern, startUnits);
      }
    };

    // {patternId, units} of whichever ruler slice the mouse is currently
    // over - a preview of exactly where handleSeekToStep would arm/seek the
    // playhead to if clicked right now, cleared on mouseleave. Purely a
    // hover affordance (see patternDisplayedHead's  ARMED/live pair for
    // the actual playhead state this previews).
    const seekHover = ref(null);
    const handleSeekHover = (pattern, step, event) => {
      seekHover.value = {patternId: pattern.id, units: step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event)};
    };
    const handleSeekHoverLeave = () => {
      seekHover.value = null;
    };

    const handlePlaySong = (song, startIndex = 0) => {
      playingPatternId.value = null;
      playingSongId.value = song.id;
      startPlaybackHeadPolling();
      playSequence(song, soundEffects(), {
        // Same song-binding wrapper as handlePlayPattern above.
        isTrackMuted: (p, track) => isTrackMuted(song, p, track),
        startIndex,
        onDone: () => {
          if (playingSongId.value === song.id) {
            playingSongId.value = null;
            stopPlaybackHeadPolling();
          }
        },
      });
    };
    const handleStop = () => {
      stopPatternPlayback();
      playingPatternId.value = null;
      playingSongId.value = null;
      stopPlaybackHeadPolling();
    };

    // A sequence chip's  click does two things while the song's
    // sequence is mid-playback: JUMPS playback there (restarting
    // handlePlaySong at that step, the same "click seeks" affordance the
    // piano roll's  step ruler already gives a single playing pattern -
    // see handleSeekToStep) AND still switches which pattern is being
    // viewed/edited (see setActivePattern), same as a click while nothing
    // is playing - without this second part, the Instruments list below
    // kept showing whichever pattern was active before the click instead of
    // the one just jumped to, since only handlePlaySong ran.
    const handleSequenceChipClick = (song, group) => {
      if (playingSongId.value === song.id) {
        const index = song.sequence.findIndex(({id}) => id === group.id);
        handlePlaySong(song, index === -1 ? 0 : index);
      }
      setActivePattern(song, group.patternId);
    };

    // Whether THIS specific sequence GROUP (see blocks/music.js's
    // {id, patternId, count} shape - one chip, possibly repeating count > 1
    // times in a row) is the one currently sounding - only meaningful
    // during song (not lone pattern) playback, since a sequence step only
    // exists in that context. Matched by this group's  POSITION in
    // song.sequence (playSequence in music-playback.js tags every one of a
    // group's  repeats with that same position as sequenceIndex - see
    // its  comment), not by patternId alone, so a pattern used in more
    // than one separate group (e.g. an intro pattern reused later) only
    // highlights the group actually playing right now, not every group for
    // that pattern at once.
    const isSequenceGroupPlaying = (song, group) => {
      if (playingSongId.value !== song.id || !playbackHead.value) return false;
      const index = song.sequence.findIndex(({id}) => id === group.id);
      return index !== -1 && playbackHead.value.sequenceIndex === index;
    };

    // Random-but-stable per pattern (same golden-angle hue trick as
    // autoInstrumentColor, just keyed by pattern id instead of sound effect
    // id) - every chip for the SAME pattern in the Sequence list gets the
    // same color, so a repeated pattern is visually recognizable at a
    // glance, not just by its (possibly truncated/identical-looking) name.
    const patternSequenceColor = (patternId) => autoInstrumentColor(patternId);

    const patternName = (song, patternId) => {
      const pattern = song.patterns.find(({id}) => id == patternId);
      return pattern ? (pattern.name || `Pattern ${patternId}`) : `Pattern ${patternId}`;
    };

    const patternOptions = (song) => song.patterns.map(
        (pattern) => ({text: pattern.name || `Pattern ${pattern.id}`, value: pattern.id}))
        .sort((a, b) => a.text.localeCompare(b.text, undefined, {sensitivity: 'base'}));

    const stepsFor = (pattern) => pattern.stepCount || DEFAULT_PATTERN_STEPS;

    // Whether a piano-roll row is a "black key" on a real piano - shown via
    // its  label styling (see .piano-roll-label-black-key) so the row
    // list reads at a glance the same way a real keyboard's key colors do.
    // A row's  label already carries this: only a black key ever gets
    // BOTH standard spellings (see noteLabel in utils/music-notes.js, e.g.
    // "C#4/Db4"), a natural always has just the one name - cheaper than
    // re-deriving it from row.midi % 12 separately.
    const isBlackKeyRow = (row) => row.label.includes('/');

    // Only pure-tone AUDC values (see utils/music-notes.js) have a clean,
    // tunable pitch - anything else can only be triggered on/off per step,
    // via the shared "Hit" row instead of a real pitch.
    // Looked up by id through a per-render map (see renderCache below), not by
    // re-reading and re-processing the stored sound effects for every call -
    // the piano roll calls this for every cell it draws.
    const trackSoundEffect = (track) => {
      if (!renderCache.soundEffectsById) {
        renderCache.soundEffectsById = new Map(soundEffects().map((soundEffect) => [`${soundEffect.id}`, soundEffect]));
      }
      return renderCache.soundEffectsById.get(`${track.soundEffectId}`);
    };

    // The color is set on the Sound tab (see ColorSwatchPicker there) - the
    // Music tab only displays it, keyed off whichever sound effect the
    // track is currently pointed at.
    const instrumentColor = (track) => {
      let color = renderCache.instrumentColors.get(track);
      if (color === undefined) {
        color = instrumentColorFor(trackSoundEffect(track));
        renderCache.instrumentColors.set(track, color);
      }
      return color;
    };

    // Chip text color for the collapsed instrument summary below - a
    // hardcoded white (see the chip's  former "dark" prop) read poorly
    // against a light instrument color (e.g. a pale user-picked TIA color),
    // so this switches to dark text whenever the instrument's  color is
    // light enough to need it.
    const instrumentTextColor = (track) => isLightColor(instrumentColor(track)) ? '#000' : '#fff';

    // Under DPC+ the chip plays channel 0 and the TIA plays channel 1, so a channel 1 track has the notes of the TIA.
    const trackUsesTia = (track) => {
      const config = (configurationStorage && configurationStorage.value) || {};
      return config.kernel === 'dpcplus' && config.enableDpcPlusAudio !== false && Number(track.channel) === 1;
    };
    const rowIsAvailable = (track, row) => {
      const soundEffect = trackSoundEffect(track);
      if (!soundEffect) return false;
      // Hit is only meaningful for an instrument with no real tunable pitch
      // (noise/untuned types) - a tunable instrument already has
      // its  proper pitched rows, so Hit is greyed out for it instead of
      // offering a redundant, pitch-less way to trigger the same sound.
      const tia = trackUsesTia(track);
      if (row.midi === 'hit') return !soundHasTunableNotes(soundEffect, tia);
      // A frequency row: for any sound that is not a percussion sound (which only has the Hit row) and is not played by the DPC+ chip
      // (whose pitch is a key of the piano). A sound type with in-tune notes has its piano rows as well.
      if (rawFrequencyOf(row.midi) !== null) {
        const config = (configurationStorage && configurationStorage.value) || {};
        const chip = !tia && config.kernel === 'dpcplus' && config.enableDpcPlusAudio !== false;
        return !soundEffect.isPercussion && !chip;
      }
      return soundHasTunableNotes(soundEffect, tia) && audfByMidiForAudc(soundEffect.audc, tia).has(row.midi);
    };
    // Same "not available to the currently active track" check
    // patternCellClasses'  piano-roll-cell-row-unavailable already
    // applies across a row's  cells - mirrored here so the row's
    // label (see .piano-roll-label-row-unavailable) reads as unavailable
    // too, instead of looking like any other normal, playable row while
    // every cell beside it is greyed out.
    const labelRowUnavailable = (pattern, row) => {
      const activeTrack = activeTrackFor(pattern);
      return !!activeTrack && !rowIsAvailable(activeTrack, row);
    };
    const rowAudf = (track, row) => {
      if (row.midi === 'hit') return null;
      const soundEffect = trackSoundEffect(track);
      if (!soundEffect) return null;
      if (rawFrequencyOf(row.midi) !== null) return rawFrequencyOf(row.midi);
      const tia = trackUsesTia(track);
      return soundHasTunableNotes(soundEffect, tia) ? audfByMidiForAudc(soundEffect.audc, tia).get(row.midi) : null;
    };

    // One "slice" of a step, in LENGTH_UNITS_PER_STEP units, per the "Note
    // duration snap" dropdown - a fresh note is exactly one slice long, and
    // a resize drag snaps to multiples of it.
    const subdivisionUnitLength = () =>
      Math.max(1, Math.round(LENGTH_UNITS_PER_STEP / effectiveSubdivision()));

    // Length (LENGTH_UNITS_PER_STEP units) of the last note placed or
    // resized (see handlePatternCellClick/stopResize) - a newly placed note
    // reuses this instead of always snapping to the current subdivision, so
    // laying down a run of same-length notes (or matching a length you just
    // dragged out) doesn't need re-picking the subdivision each time. Null
    // until the first note is actually placed/resized this session, at
    // which point newNoteLength below falls back to the plain subdivision
    // length exactly like every new note already worked before this.
    const lastNoteLength = ref(null);
    const newNoteLength = () => lastNoteLength.value || subdivisionUnitLength();

    // Volume override (an absolute AUDV, or null for "this instrument's
    // plain default") of the last note placed or resized/volume-edited (see
    // handlePatternCellClick, stopResize, handleVolumeBarMove/
    // handleVolumePercentChange) - tracked for a possible future feature,
    // but NOT applied to prefill a brand new note's volume the way
    // newNoteLength reuses the last length for a new note's length: a
    // freshly placed note (in an empty slot, nothing to preserve) always
    // starts unset instead, so it plays at whatever volume its
    // instrument is set to on the Sound tab (see noteAudv's fallback),
    // never a leftover custom volume from some other, possibly
    // differently-voiced note - confirmed as a real reported bug when this
    // still did carry forward.
    const lastNoteAudv = ref(null);

    // Both a note's step (start) and length are in LENGTH_UNITS_PER_STEP
    // units now (not whole steps) - a note can start at any sub-step slice,
    // not just a step's  beginning (see the subdivision dropdown). These
    // convert that back to whole-step indices, for the step-level
    // containment checks (monophonic blocking, resize boundaries, which
    // rendered cell a note's tip falls in) that the rest of this file's grid
    // logic is built around.
    const noteStartStep = (note) => Math.floor(note.step / LENGTH_UNITS_PER_STEP);
    const noteEndStepExclusive = (note) => Math.ceil((note.step + note.length) / LENGTH_UNITS_PER_STEP);

    // Where (0-1, from this step's  left edge) a note's tip actually
    // sits - not simply how much of the step it covers, which only happens
    // to match the tip's true position when the note starts right at the
    // step's  beginning. A note starting partway into the step (any
    // slice other than the first) needs its real end position measured
    // from the step's edge, not its  width, or the resize handle lands
    // in the wrong spot.
    const noteEndFraction = (note, step) => {
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const noteEndUnits = note.step + note.length;
      return Math.max(0, Math.min(1, (noteEndUnits - stepStartUnits) / LENGTH_UNITS_PER_STEP));
    };

    // Every ACTIVE TRACK note whose unit range overlaps this step - not
    // just whichever one happens to be first (unlike the old noteAt-based
    // lookup this replaced). A step can hold several short, non-overlapping
    // notes at different slices (see the subdivision dropdown, and
    // notesInCell's  identical reasoning for the main grid above) - each
    // needs its  bar/handle here too, since volume is set per NOTE, not
    // per step.
    const volumeBarNotesAt = (pattern, step) => {
      const activeTrack = activeTrackFor(pattern);
      if (!activeTrack) return [];
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const stepEndUnits = stepStartUnits + LENGTH_UNITS_PER_STEP;
      return (activeTrack.notes || []).filter((note) =>
        note.step < stepEndUnits && note.step + note.length > stepStartUnits);
    };

    // This step's  left border seam should disappear only where a note
    // actually continues through it from an earlier column - erasing it
    // just because SOME note starts here (while another note's bar sits at
    // the cell's  right edge) would wrongly blend two unrelated notes
    // together.
    const volumeCellIsContinuation = (pattern, step) =>
      volumeBarNotesAt(pattern, step).some((note) => noteStartStep(note) < step);

    // This note's  volume, as a percentage of its INSTRUMENT's  base
    // volume (soundEffect.audv) rather than a raw 0-15 AUDV number - a note
    // with no override of its  reads as a clean 100% (it just plays at
    // the instrument's  volume), and dragging the bar scales down from
    // there, rather than making users think in raw hardware AUDV units.
    // 0% for a silent (audv 0) instrument, since there's no base volume to
    // express a fraction of. Clamped to 100 - a note can no longer be set
    // louder than the instrument's base volume at all (see
    // handleVolumePercentChange's matching clamp), but legacy data from
    // before that cap existed could still store an audv above base, so this
    // keeps the displayed number capped too, not just the bar's height.
    const notePercentOf = (note, soundEffect) => {
      const base = Number(soundEffect.audv) || 0;
      if (base <= 0) return 0;
      return Math.min(100, Math.round((noteAudv(note, soundEffect) / base) * 100));
    };

    const noteVolumePercent = (note, pattern) => {
      const activeTrack = activeTrackFor(pattern);
      const soundEffect = activeTrack && trackSoundEffect(activeTrack);
      return soundEffect ? notePercentOf(note, soundEffect) : 0;
    };

    // How much of THIS step's  column a note actually occupies, as a
    // left offset + width (0-100%) - same startPercent/endPercent math as
    // segmentGradient uses for the main grid's  note coloring, just
    // returned as box-position styles instead of a gradient string. A note
    // starting or ending mid-step (see the "Note duration snap" slices)
    // only fills its  fraction of that step's column, not the whole
    // thing - and since .piano-roll-volume-handle is positioned relative
    // to its  parent bar (left: 0; right: 0 there), giving the bar
    // itself this narrower box automatically narrows the handle to match,
    // with no separate handle-sizing logic needed. Also what lets several
    // notes sharing one step (see volumeBarNotesAt) render side by side
    // instead of overlapping - each one's  slice range gets its
    // slice of the column's width.
    const noteStepSpanStyle = (note, step) => {
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const startPercent = Math.max(0, ((note.step - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      const endPercent = Math.min(100, ((note.step + note.length - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      return {left: `${startPercent}%`, width: `${endPercent - startPercent}%`};
    };

    // Bar height is this note's  volume as a percentage of the
    // instrument's  base volume (see notePercentOf), clamped to 100% -
    // dragging can't push a note louder than its  instrument's base
    // (see handleVolumeBarPointerDown/handleVolumeBarMove), but existing
    // data from before that cap existed could still be stored above it,
    // so the bar's  height stays visually capped even if the raw
    // percentage shown in the value label doesn't need to be. Same
    // instrument colour the note itself already shows in the grid above
    // (instrumentColor), so the bar reads as clearly belonging to the
    // same note/instrument. Rendered (via volumeBarNotesAt in the
    // template) across every step the note covers, not just its  first
    // one, so the bar reads as one continuous shape spanning the note's
    // full length, same as the note itself does in the grid above.
    const volumeBarStyleFor = (note, pattern, step) => {
      const activeTrack = activeTrackFor(pattern);
      return {
        height: `${Math.max(0, Math.min(100, noteVolumePercent(note, pattern)))}%`,
        backgroundColor: activeTrack ? instrumentColor(activeTrack) : undefined,
        ...noteStepSpanStyle(note, step),
      };
    };

    // Every OTHER track's  note(s) overlapping this step (if any) -
    // shown as faint, non-interactive bars behind the active track's,
    // so a channel/instrument switch doesn't make the rest of the
    // pattern's volume shape disappear from this row entirely. Mirrors
    // .piano-roll-cell-foreign's "still visible, just dimmed and
    // inert" treatment for a foreign note in the grid above, and (like
    // volumeBarNotesAt) can return more than one note for the same step.
    const otherTrackVolumeBars = (pattern, step) => {
      const activeTrack = activeTrackFor(pattern);
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const stepEndUnits = stepStartUnits + LENGTH_UNITS_PER_STEP;
      const bars = [];
      (pattern.tracks || []).forEach((track) => {
        if (track === activeTrack) return;
        const soundEffect = trackSoundEffect(track);
        if (!soundEffect) return;
        (track.notes || []).forEach((note) => {
          if (note.step >= stepEndUnits || note.step + note.length <= stepStartUnits) return;
          bars.push({
            key: `${track.id}:${note.step}`,
            style: {
              height: `${Math.max(0, Math.min(100, notePercentOf(note, soundEffect)))}%`,
              backgroundColor: instrumentColor(track),
              ...noteStepSpanStyle(note, step),
            },
          });
        });
      });
      return bars;
    };

    // A track is monophonic (one real hardware channel), so at most one note
    // can occupy any given UNIT of time - but several short, sequential
    // (non-overlapping) notes can still share one step, each at its
    // slice (see the subdivision dropdown). Whole-step versions of these
    // (below) are for the grid's  per-step rendering/grey-out; the click
    // handler itself checks the exact clicked unit range instead, so
    // placing a note in one free slice never gets blocked by an unrelated
    // note elsewhere in the same step.
    const noteAt = (track, step) =>
      ((track && track.notes) || [])
          .find((note) => step >= noteStartStep(note) && step < noteEndStepExclusive(note)) || null;

    // TIA has 2 real hardware channels - two tracks on DIFFERENT channels can
    // genuinely sound at once, so only a track sharing the active track's
    // channel can block a new note here; a different-channel track's note at
    // the same step is no obstacle.
    const channelBlockingNote = (pattern, activeTrack, step) =>
      pattern.tracks.find((track) =>
        track !== activeTrack && track.channel === activeTrack.channel && noteAt(track, step)) || null;

    // The EXACT unit ranges within this step where a different track sharing
    // the active track's channel already has a note - a channel can only
    // play one pitch at a time, but only the precise overlapping range is
    // actually blocked (see canPlaceNoteAt, which checks at this same
    // granularity for the click itself), and it applies the same way to
    // every row in this step (blocking is about channel + time, never
    // pitch) - other slices, and other rows' cells outside these ranges,
    // stay fully available.
    const blockedRangesInStep = (pattern, activeTrack, step) => {
      if (!activeTrack) return [];
      // The same for every row of a step, so computed once per step per
      // render rather than once per cell.
      const cacheKey = `${pattern.id}:${activeTrack.id}:${step}`;
      const cached = renderCache.blockedRanges.get(cacheKey);
      if (cached) return cached;
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const stepEndUnits = stepStartUnits + LENGTH_UNITS_PER_STEP;
      const ranges = [];
      pattern.tracks.forEach((track) => {
        if (track === activeTrack || track.channel !== activeTrack.channel) return;
        (track.notes || []).forEach((note) => {
          const start = Math.max(stepStartUnits, note.step);
          const end = Math.min(stepEndUnits, note.step + note.length);
          if (end > start) ranges.push({start, end});
        });
      });
      renderCache.blockedRanges.set(cacheKey, ranges);
      return ranges;
    };

    // A single step's cell can now show more than one note (several short
    // ones on the same row, at different slices) - returns every {note,
    // track} touching (row.midi, step), active track's  notes first, so
    // they're never hidden behind an overlapping different-channel track's
    // note when both are drawn.
    //
    // Every cell of the piano roll asks this several times per render (its
    // style, classes and title), and a pattern can have thousands of cells, so
    // answering each by scanning every note of every track made one render
    // take hundreds of milliseconds and allocate hundreds of megabytes - and
    // playback re-renders the roll many times a second to move the playhead,
    // which froze and then crashed the browser tab. The notes are indexed by
    // (row, step) once per render instead (the index is dropped before each
    // re-render, so it is rebuilt from the current notes every time, inside
    // that render, where Vue tracks what it reads).
    const cellNotesIndex = (pattern) => {
      let index = renderCache.cellNotes.get(pattern);
      if (index) return index;
      index = new Map();
      const addTrack = (track) => {
        (track.notes || []).forEach((note) => {
          const lastStep = noteEndStepExclusive(note);
          for (let step = noteStartStep(note); step < lastStep; step++) {
            const key = `${note.midi}:${step}`;
            const found = index.get(key);
            if (found) found.push({note, track});
            else index.set(key, [{note, track}]);
          }
        });
      };
      const activeTrack = activeTrackFor(pattern);
      if (activeTrack && !isTrackHidden(pattern, activeTrack)) addTrack(activeTrack);
      pattern.tracks.forEach((track) => {
        if (track !== activeTrack && !isTrackHidden(pattern, track)) addTrack(track);
      });
      renderCache.cellNotes.set(pattern, index);
      return index;
    };
    const NO_NOTES = Object.freeze([]);
    const notesInCell = (pattern, row, step) => cellNotesIndex(pattern).get(`${row.midi}:${step}`) || NO_NOTES;

    // The single note this cell would report for simple (title/tip/resize)
    // purposes - the active track's  note here if it has one, otherwise
    // whichever other note is drawn. Cells with several notes (see
    // notesInCell) only ever get a resize handle for the active track's
    // one anyway.
    const findDisplayedNote = (pattern, row, step) => notesInCell(pattern, row, step)[0] || null;

    const patternCellClasses = (pattern, row, step, stepCount) => {
      if (step >= stepCount) return {'piano-roll-cell-length-disabled': true};
      const displayed = findDisplayedNote(pattern, row, step);
      const activeTrack = activeTrackFor(pattern);
      // A note belonging to a DIFFERENT CHANNEL isn't a real conflict for
      // the active track - the TIA's two channels play independently, so
      // that note being here doesn't stop the active track from placing
      // its. Most visible on the shared "Hit" row, since every
      // untunable instrument on EITHER channel shares that one row, so two
      // different channels both wanting a Hit note at the same step is
      // common - without this, the second channel's  Hit row looked
      // dimmed/blocked (piano-roll-cell-foreign below) even though
      // clicking it would have worked fine. Falls through to the same
      // empty-cell classing as if this note weren't here at all; its
      // color still paints via patternCellStyle regardless (that's a
      // separate, unrelated layer).
      if (displayed && activeTrack && displayed.track !== activeTrack && displayed.track.channel !== activeTrack.channel) {
        if (!rowIsAvailable(activeTrack, row)) return {'piano-roll-cell-disabled': true};
        return {};
      }
      if (displayed) {
        return {
          'piano-roll-cell-active': true,
          'piano-roll-cell-continuation': step !== noteStartStep(displayed.note),
          'piano-roll-cell-foreign': displayed.track !== activeTrack,
          // This row can be one the ACTIVE track can't use at all - either
          // because the note shown here belongs to a different instrument
          // (e.g. a tuned-note row while a noise instrument is selected), OR
          // because it's the active track's  note but its instrument's
          // Sound type changed to something untunable AFTER the note was
          // placed (notes are never deleted or rewritten when that
          // happens - see flattenSongEvents'  note on this - so a
          // once-valid note can be sitting on a row that's no longer valid
          // for its  instrument). Either way, without this it looked
          // like a perfectly normal, currently-valid note.
          'piano-roll-cell-row-unavailable': !!activeTrack && !rowIsAvailable(activeTrack, row),
        };
      }
      if (!activeTrack) return {};
      // Channel-conflict blocking is now painted precisely (only the exact
      // blocked unit ranges - see blockedRangesInStep/patternCellStyle)
      // instead of darkening the whole cell, since a step can be partly
      // free even when another same-channel track occupies some of it.
      if (!rowIsAvailable(activeTrack, row)) return {'piano-roll-cell-disabled': true};
      return {};
    };

    // Light vertical divider(s) marking the "Note duration snap" slices
    // within a step - lighter than the step boundary lines (.piano-roll-cell
    // itself already draws those via its  border-left) so a step's
    // edge always reads as more prominent than a slice within it. null (no
    // extra lines) when the dropdown is 1 - one slice IS the whole step.
    const sliceGridImage = () => {
      const subdivision = effectiveSubdivision();
      if (subdivision <= 1) return null;
      const slicePercent = 100 / subdivision;
      return `repeating-linear-gradient(to right, rgba(0, 0, 0, 0.08) 0, rgba(0, 0, 0, 0.08) 1px, ` +
        `transparent 1px, transparent ${slicePercent}%)`;
    };

    // Same slice divisions as sliceGridImage, echoed onto the step ruler
    // (.piano-roll-step-number) above the piano roll itself - fainter than
    // both that function's  slice lines (0.08) and .piano-roll-cell's
    // step-edge border (0.22), so the ruler stays a quiet reference rather
    // than competing with the piano roll's, more prominent grid.
    const headerSliceGridImage = () => {
      const subdivision = effectiveSubdivision();
      if (subdivision <= 1) return null;
      const slicePercent = 100 / subdivision;
      return `repeating-linear-gradient(to right, rgba(0, 0, 0, 0.05) 0, rgba(0, 0, 0, 0.05) 1px, ` +
        `transparent 1px, transparent ${slicePercent}%)`;
    };

    // A note shorter than a full step (or a multi-step note's  tail) only
    // fills part of the cell; a step can also hold several short, sequential
    // notes at once (see notesInCell) - all rendered as colored bands within
    // a single gradient image layered over the slice grid (rather than
    // separate overlay elements), so the rest of the cell (border, hover,
    // etc.) stays untouched.
    // Each kind of thing a cell can show is its  gradient layer (not
    // stops concatenated into one gradient) - keeps the hover preview's
    // 4 stops independent of however many note segments are also in this
    // cell, so there's no risk of out-of-order stop positions between them.
    // Layers are listed topmost-first: the hover preview always paints over
    // real notes, so it's visible even hovering a slice/step that already
    // has something placed there.
    // Fades a note's  color toward the cell background when its
    // instrument is muted, so muted notes stay visible (still show where
    // they are) without competing with unmuted ones for attention.
    // mixColorWithTransparent works uniformly whether the source color is
    // hsl(...) (an auto-assigned instrument color - see autoInstrumentColor)
    // or the rgb(...)/hex a user picked explicitly on the Sound tab, unlike
    // trying to parse/rewrite the color string's  alpha channel
    // per-format.
    const mutedNoteColor = (color) => mixColorWithTransparent(color, 35);

    const segmentGradient = (stepStartUnits, startUnits, endUnits, color) => {
      const startPercent = Math.max(0, ((startUnits - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      const endPercent = Math.min(100, ((endUnits - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      return `linear-gradient(to right, transparent ${startPercent}%, ${color} ${startPercent}%, ` +
        `${color} ${endPercent}%, transparent ${endPercent}%)`;
    };

    // A distinct color per hover outcome, so the exact effect a click would
    // have is legible before it happens, not just "something will change
    // here": blue for placing a genuinely new note on an empty slot, purple
    // for touching something already there (this instrument's  note,
    // either replaced at a different pitch - see the 'overwrite' mode below
    // - or removed outright at the same pitch), red for a slot this click
    // can't use at all (see canPlaceNoteAt - wrong row for this instrument,
    // or a different track already holding the channel here). Blended (via
    // normal alpha stacking) over an existing note's  color for
    // overwrite/remove, or over the empty cell for add/blocked, so each
    // still reads clearly despite sharing a color with its sibling mode.
    const HOVER_PREVIEW_COLORS = {
      add: 'rgba(25, 118, 210, 0.4)',
      overwrite: 'rgba(156, 39, 176, 0.4)',
      remove: 'rgba(156, 39, 176, 0.4)',
      blocked: 'rgba(200, 30, 30, 0.35)',
    };
    // A slice of a step another track on the same channel is already using
    // (see blockedRangesInStep). A lighter tone than
    // .piano-roll-cell-disabled/.piano-roll-cell-length-disabled (a whole row
    // this instrument can't play, 0.18): it is only one slice, often every
    // other step, and at the full tone those bands read as heavy vertical
    // stripes through the grid.
    const BLOCKED_RANGE_COLOR = 'rgba(0, 0, 0, 0.08)';
    // Translucent rather than solid, so a note/other layer underneath the
    // currently-playing slice still shows through it. Vuetify's  default
    // theme "primary" blue (#1976D2 - see plugins/vuetify.js, no custom
    // theme colors are set), matching the loop button's active tint and the
    // zoom slider.
    const PLAYHEAD_COLOR = 'rgba(25, 118, 210, 0.55)';
    // Same blue, fainter - where Play will pick up from next (see
    // patternSeekUnits) while this pattern's actually stopped, not where
    // it's genuinely playing right now. Lighter so a still, "armed" marker
    // never reads as "audio is happening here this instant" the way the
    // live playhead does.
    const ARMED_PLAYHEAD_COLOR = 'rgba(25, 118, 210, 0.28)';
    // Fainter still - a hover preview of where clicking the ruler right now
    // would arm/seek to (see seekHover), shown on the ruler itself so it
    // never gets mistaken for either playhead color above.
    const SEEK_HOVER_COLOR = 'rgba(25, 118, 210, 0.15)';
    // The Select tool's marquee result (see pianoRollSelection) -
    // painted as a segmentGradient layer over the EXACT note range, same as
    // every other per-note layer below, rather than a plain CSS class
    // covering the whole cell (an earlier version of this did that) -
    // confirmed as a real reported bug otherwise ("only notes should be
    // selected, not the steps they're in... accurately show selection based
    // on music note length, not step length") for any note shorter than a
    // full step, or not starting exactly on a step boundary.
    const SELECTION_COLOR = 'rgba(144, 202, 249, 0.9)';

    // Shared by patternCellStyle (the piano roll itself) and rulerCellStyle
    // (the step-number row above it) so both always agree on exactly which
    // slice a given elapsedUnits falls into, and don't drift out of sync
    // with each other. Snapped to the same "Note duration snap" slice width
    // notes themselves snap to (see subdivisionUnitLength), like a DAW step
    // sequencer's  playhead - a continuous, unsnapped position would
    // drift smoothly across a step instead of visibly landing on each of its
    // slices in turn as the song plays. Null (no layer) when elapsedUnits'
    // slice doesn't fall within this particular step at all.
    const playheadSliceLayer = (elapsedUnits, stepStartUnits, color) => {
      const slice = subdivisionUnitLength();
      const sliceStart = Math.floor(elapsedUnits / slice) * slice;
      const sliceEnd = sliceStart + slice;
      if (sliceEnd <= stepStartUnits || sliceStart >= stepStartUnits + LENGTH_UNITS_PER_STEP) return null;
      return segmentGradient(stepStartUnits, sliceStart, sliceEnd, color);
    };

    // The step-number ruler's  background - the same playhead (live or
    // armed - see patternDisplayedHead) and hover preview (see seekHover)
    // the piano roll itself shows, plus the ruler's  always-on slice
    // grid (see headerSliceGridImage), so the ruler reads as the same
    // "column" as whatever it lines up with below it.
    const rulerCellStyle = (pattern, step) => {
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const layers = [];
      const hover = seekHover.value;
      if (hover && hover.patternId === pattern.id) {
        const layer = playheadSliceLayer(hover.units, stepStartUnits, SEEK_HOVER_COLOR);
        if (layer) layers.push(layer);
      }
      const head = patternDisplayedHead(pattern);
      if (head) {
        const layer = playheadSliceLayer(
            head.elapsedUnits, stepStartUnits, head.live ? PLAYHEAD_COLOR : ARMED_PLAYHEAD_COLOR);
        if (layer) layers.push(layer);
      }
      const grid = headerSliceGridImage();
      if (grid) layers.push(grid);
      return layers.length ? {backgroundImage: layers.join(', ')} : {};
    };

    const patternCellStyle = (song, pattern, row, step) => {
      const grid = sliceGridImage();
      const notes = notesInCell(pattern, row, step);
      const activeTrack = activeTrackFor(pattern);
      const preview = hoverPreview.value;
      const showsPreview = !!preview && preview.step === step && preview.midi === row.midi &&
        activeTrack && preview.trackId === activeTrack.id;
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;

      const layers = [];
      const head = patternDisplayedHead(pattern);
      if (head) {
        const layer = playheadSliceLayer(
            head.elapsedUnits, stepStartUnits, head.live ? PLAYHEAD_COLOR : ARMED_PLAYHEAD_COLOR);
        if (layer) layers.push(layer);
      }
      if (showsPreview) {
        layers.push(segmentGradient(
            stepStartUnits, preview.startUnits, preview.endUnits, HOVER_PREVIEW_COLORS[preview.mode]));
      }
      if (notes.length) {
        notes
            .slice()
            .sort((a, b) => a.note.step - b.note.step)
            .forEach(({note, track}) => {
              // The selection tint has to be pushed BEFORE the note's base
              // color below, not after - CSS stacks multiple background-
              // image layers with the FIRST one on top, so pushing it last
              // (as before) buried it under the note's opaque color and it
              // never actually showed, despite isNoteSelected being true.
              if (isNoteSelected(note)) {
                layers.push(segmentGradient(stepStartUnits, note.step, note.step + note.length, SELECTION_COLOR));
              }
              const color = isTrackMuted(song, pattern, track) ?
                mutedNoteColor(instrumentColor(track)) : instrumentColor(track);
              layers.push(segmentGradient(stepStartUnits, note.step, note.step + note.length, color));
            });
      }
      // Only the exact ranges another same-channel track already occupies -
      // see blockedRangesInStep - not the whole cell, so a step that's only
      // partly busy still reads as partly available. Skipped on a row this
      // instrument can't use at all (piano-roll-cell-disabled already
      // covers that uniformly) to avoid uneven double-darkening there.
      if (activeTrack && rowIsAvailable(activeTrack, row)) {
        blockedRangesInStep(pattern, activeTrack, step).forEach(({start, end}) =>
          layers.push(segmentGradient(stepStartUnits, start, end, BLOCKED_RANGE_COLOR)));
      }
      if (grid) layers.push(grid);

      return layers.length ? {backgroundImage: layers.join(', ')} : {};
    };

    const patternCellTitle = (pattern, row, step, stepCount) => {
      if (step >= stepCount) return 'Increase the pattern\'s Length to use this step';
      const displayed = findDisplayedNote(pattern, row, step);
      const activeTrack = activeTrackFor(pattern);
      // Same "different channel isn't a real conflict" reasoning as
      // patternCellClasses above - don't describe this cell as belonging
      // to that other note, since the active track can still place its
      // here.
      if (displayed && activeTrack && displayed.track !== activeTrack && displayed.track.channel !== activeTrack.channel) {
        if (!rowIsAvailable(activeTrack, row)) return `${row.label} - not in tune for this instrument`;
        return row.label;
      }
      if (displayed) {
        if (displayed.track === activeTrack) return row.label;
        const soundEffect = trackSoundEffect(displayed.track);
        return `${row.label} - ${soundEffect ? (soundEffect.name || 'unnamed instrument') : 'another instrument'}`;
      }
      if (!activeTrack) return row.label;
      if (noteAt(activeTrack, step)) return 'The selected instrument already has a note at this step';
      const channelConflict = channelBlockingNote(pattern, activeTrack, step);
      if (channelConflict) {
        const conflictSound = trackSoundEffect(channelConflict);
        return `Channel ${activeTrack.channel} is already playing ` +
          `${conflictSound ? (conflictSound.name || 'another instrument') : 'another instrument'} at this step`;
      }
      if (!rowIsAvailable(activeTrack, row)) return `${row.label} - not in tune for this instrument`;
      return row.label;
    };

    // Every ACTIVE TRACK note whose last occupied step is this one - a
    // step can hold several short notes at different slices (see
    // notesInCell), and each needs its resize handle. This used to go
    // through findDisplayedNote, which only ever returns the FIRST note in
    // the cell - so only whichever note happened to be first (in practice,
    // the earliest slice) ever got a handle at all; any other note sharing
    // the same step was impossible to resize.
    const activeTrackNoteTips = (pattern, row, step) => {
      const activeTrack = activeTrackFor(pattern);
      if (!activeTrack || isTrackHidden(pattern, activeTrack)) return [];
      return (activeTrack.notes || []).filter((note) =>
        note.midi === row.midi && step === noteEndStepExclusive(note) - 1);
    };

    // Where within a step (in LENGTH_UNITS_PER_STEP units, from that step's
    // start) a click landed, snapped to the current "Note duration snap"
    // slices - so clicking partway across a step starts a new note at that
    // slice, not always at the step's  beginning. Falls back to the
    // step's start if there's no usable click-position info (offsetX only
    // means something when the click's  target was the cell itself,
    // which holds whenever this is reached from a real click event on an
    // empty cell - see the template).
    const clickedSliceOffsetUnits = (event) => {
      const subdivision = effectiveSubdivision();
      const offsetX = event && typeof event.offsetX === 'number' ? event.offsetX : 0;
      const sliceIndex = Math.max(0, Math.min(subdivision - 1, Math.floor((offsetX / cellWidthPx()) * subdivision)));
      return sliceIndex * (LENGTH_UNITS_PER_STEP / subdivision);
    };

    // Shared by the real click handler and the hover preview below, so the
    // preview always shows exactly what a click would actually do. The
    // active track's overlapping note (if any) isn't a blocker here -
    // placing a new note where this instrument already has one just
    // replaces it (see handlePatternCellClick) - only a DIFFERENT track
    // sharing the channel is a real hardware conflict.
    //
    // Any instrument (tunable or noise) is allowed to overlap whatever
    // another track sharing its channel is already playing - real hardware
    // has only one waveform generator per channel, so this doesn't truly mix
    // two sounds, it briefly "steals" the channel for the new note's
    // duration, then hands the interrupted note back for whatever's left of
    // its  length (see flattenPatternEvents in generators/bbasic/
    // music.js, which splits the interrupted note around it and resumes it
    // afterward - the same "briefly steal the channel, no dev var, no
    // runtime resume check" technique a real tracker's auto hi-hat uses).
    // Which note actually wins the overlap is decided by Priority (see the
    // Sound tab's  field, and flattenPatternEvents' matching resolution
    // pass), not by which one is being placed here.
    const canPlaceNoteAt = (pattern, activeTrack, row, startUnits, endUnits) =>
      rowIsAvailable(activeTrack, row);

    // A faint preview of exactly where/how long a note would land if clicked
    // right now - without this, hovering could only show the whole cell
    // highlighted (CSS :hover can't know the mouse's X position within it),
    // which reads as "this will fill the whole step" even when the current
    // slice snap would only fill a fraction of it.
    const hoverPreview = ref(null);
    const handleCellHover = (pattern, row, step, stepCount, event) => {
      const activeTrack = activeTrackFor(pattern);
      if (!activeTrack || step >= stepCount) {
        hoverPreview.value = null;
        return;
      }
      const startUnits = step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event);
      const endUnits = startUnits + newNoteLength();
      const ownNoteHere = (activeTrack.notes || [])
          .find((note) => startUnits >= note.step && startUnits < note.step + note.length);
      // Move and Select are both pure drag gestures (see handleNoteDragStart/
      // handleMarqueeSelectStart below) - no placement/removal preview,
      // since a plain click does nothing in either.
      if (pianoRollTool.value === 'move' || pianoRollTool.value === 'select') {
        hoverPreview.value = null;
        return;
      }
      if (pianoRollTool.value === 'erase') {
        hoverPreview.value = (ownNoteHere && ownNoteHere.midi === row.midi) ?
          {mode: 'remove', trackId: activeTrack.id, midi: row.midi, step,
            startUnits: ownNoteHere.step, endUnits: ownNoteHere.step + ownNoteHere.length} : null;
        return;
      }
      // A different pitch where this instrument already has a note falls
      // through to the same placeable check as an empty slot - a channel
      // can only hold one note at a time anyway, so clicking here replaces
      // whatever's there instead of being blocked by it (see
      // canPlaceNoteAt, and handlePatternCellClick which does the actual
      // replacing). Still flagged as its 'overwrite' mode (rather than
      // 'add') so hovering it reads as "this will replace what's here",
      // not indistinguishable from a genuinely empty slot.
      const placeable = canPlaceNoteAt(pattern, activeTrack, row, startUnits, endUnits);
      const mode = !placeable ? 'blocked' : (ownNoteHere ? 'overwrite' : 'add');
      hoverPreview.value = {
        mode,
        trackId: activeTrack.id, midi: row.midi, step, startUnits, endUnits,
      };
    };
    const handleCellLeave = () => {
      hoverPreview.value = null;
    };

    const handlePatternCellClick = (song, pattern, row, step, stepCount, event) => {
      // A resize drag ends with the mouse released wherever the note's tip
      // was just dragged to, still over a real .piano-roll-cell - the
      // browser fires its  native "click" for that same mouseup right
      // after, landing on the cell underneath the (now-moved) resize
      // handle. Without this guard, that stray click hit the "clicking an
      // existing note removes it" branch below, deleting the note the
      // user had just finished resizing. See stopResize, which sets this
      // flag right as the drag ends and clears it shortly after. Also set
      // by stopNoteDrag below, same reasoning - a Move drag's mouseup
      // fires this same stray click too.
      if (suppressNextCellClick) return;
      if (step >= stepCount) return;
      const activeTrack = activeTrackFor(pattern);
      if (!activeTrack) return;

      const noteStartUnits = step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event);
      const noteEndUnits = noteStartUnits + newNoteLength();
      const ownNoteHere = (activeTrack.notes || [])
          .find((note) => noteStartUnits >= note.step && noteStartUnits < note.step + note.length);

      // Move and Select are both pure drag gestures (see handleNoteDragStart/
      // handleNoteDragMove/stopNoteDrag and handleMarqueeSelectStart/
      // handleMarqueeSelectMove/stopMarqueeSelect below) - a plain click
      // with no real drag does nothing in either, rather than falling
      // through to Draw's placement behavior.
      if (pianoRollTool.value === 'move' || pianoRollTool.value === 'select') return;

      // Erase removes whatever this track's note occupies THIS exact
      // row at the clicked slice - unlike Draw's placement below, this
      // doesn't require the note to be at the SAME pitch as the row clicked
      // (Erase only ever "sees" its track's notes on the row they're
      // actually drawn on anyway, since that's the only place a user could
      // click to trigger this in the first place).
      if (pianoRollTool.value === 'erase') {
        if (ownNoteHere && ownNoteHere.midi === row.midi) {
          activeTrack.notes = activeTrack.notes.filter((note) => note !== ownNoteHere);
          handleChildChange();
        }
        return;
      }
      // Blocking is checked against the EXACT slice range being placed, not
      // the whole step - a track is still monophonic (only one note playing
      // at any given instant), but several short, non-overlapping notes can
      // share one step at different slices (see the subdivision dropdown).
      // Only a DIFFERENT track sharing the channel can actually block this -
      // the active track's  note(s) overlapping this range (ownNoteHere
      // above, at a different pitch, or any other note of its  the wider
      // range happens to reach) get replaced below instead.
      if (!canPlaceNoteAt(pattern, activeTrack, row, noteStartUnits, noteEndUnits)) return;
      const soundEffect = trackSoundEffect(activeTrack);
      if (!soundEffect) return;
      const audf = rowAudf(activeTrack, row);
      const ownOverlapping = (activeTrack.notes || []).filter((note) =>
        note.step < noteEndUnits && note.step + note.length > noteStartUnits);
      // Carries the replaced note's  volume-row override (see
      // handleVolumeBarPointerDown) forward onto the new note, rather than
      // silently dropping back to the instrument's default volume just
      // because the step got re-clicked (e.g. to change pitch) - a real
      // reported annoyance re-adjusting the volume bar after every pitch
      // tweak. The first overlapping note with an override wins; in
      // practice there's only ever one note under a clicked slice anyway.
      const preservedAudv = ownOverlapping.find((note) => Number.isInteger(note.audv));
      if (ownOverlapping.length) {
        activeTrack.notes = activeTrack.notes.filter((note) => !ownOverlapping.includes(note));
      }
      const newNote = {step: noteStartUnits, midi: row.midi, audf, length: newNoteLength()};
      // Replacing an existing note (ownOverlapping.length) always keeps
      // exactly what WAS there - an explicit override if any overlapping
      // note had one (preservedAudv), else deliberately left unset (that
      // note was already playing at its instrument's  plain default,
      // and should stay there). A genuinely NEW note (nothing overlapping
      // at all) always starts unset too, deliberately NOT carrying
      // lastNoteAudv forward here - noteAudv's fallback (see
      // utils/music-notes.js) means an unset audv already plays at
      // whatever volume the instrument itself is set to on the Sound tab,
      // which is what a brand new note should start at, not whatever
      // custom volume was last set on some other, possibly differently-
      // voiced note (a real reported bug: placing a note on a freshly
      // selected instrument inherited an unrelated instrument's
      // custom volume instead of that instrument's actual base volume).
      if (ownOverlapping.length && preservedAudv) {
        newNote.audv = preservedAudv.audv;
      }
      activeTrack.notes.push(newNote);
      lastNoteLength.value = newNote.length;
      lastNoteAudv.value = newNote.audv === undefined ? null : newNote.audv;
      hoverPreview.value = null;
      handleChildChange();
      if (!isTrackMuted(song, pattern, activeTrack)) {
        previewPatternNote({
          audc: soundEffect.audc,
          audf: audf == null ? soundEffect.audf : audf,
          audv: noteAudv(newNote, soundEffect),
          arpeggio: soundEffect.arpeggio,
          arpeggioDivision: soundEffect.arpeggioDivision,
          arpeggioInterval: soundEffect.arpeggioInterval,
          arpeggioRange: soundEffect.arpeggioRange,
          soundEffect, midi: row.midi, tia: trackUsesTia(activeTrack),
          tempo: effectiveTempo(song, pattern),
        });
      }
    };

    // Move tool - repositions an existing note to a different pitch/step,
    // rather than resizing it (startResize/handleResizeMove/stopResize
    // below) or toggling it on/off (handlePatternCellClick's Draw/Erase
    // branches). Same window-level mousedown/mousemove/mouseup shape as
    // those, and the same "capture once at drag start, re-derive from a
    // live clientX/clientY delta every move" reasoning startResize's
    // comment gives - startRowIndex/startStep never change mid-drag, only
    // the live delta does.
    const movingNote = ref(null);
    // Plays the note's sound at its CURRENT (post-move) pitch - same
    // audio feedback placing a fresh note already gives (see
    // handlePatternCellClick's previewPatternNote call), so dragging an
    // existing one to a new pitch/step is just as audible as placing it
    // there fresh would have been.
    const playDraggedNotePreview = (moving) => {
      const {note, track, pattern, song} = moving;
      const soundEffect = trackSoundEffect(track);
      if (!soundEffect || isTrackMuted(song, pattern, track)) return;
      const audf = rowAudf(track, {midi: note.midi});
      previewPatternNote({
        audc: soundEffect.audc,
        audf: audf == null ? soundEffect.audf : audf,
        audv: noteAudv(note, soundEffect),
        arpeggio: soundEffect.arpeggio,
        arpeggioDivision: soundEffect.arpeggioDivision,
        arpeggioInterval: soundEffect.arpeggioInterval,
        arpeggioRange: soundEffect.arpeggioRange,
        soundEffect, midi: note.midi, tia: trackUsesTia(track),
        tempo: effectiveTempo(song, pattern),
      });
    };
    const handleNoteDragMove = (event) => {
      if (!movingNote.value) return;
      const {note, track, pattern, startClientX, startClientY, stepCount, group} = movingNote.value;
      // Both deltas are always measured from the FIXED drag-start point
      // (startClientX/startClientY/startStep/startRowIndex, captured once
      // in handleCellMouseDown and never rebased mid-drag) - same "re-derive
      // from the live total delta, don't accumulate tick-to-tick" reasoning
      // startResize's handleResizeMove already uses. Rebasing those on
      // every move (an earlier version of this code did) rounds each
      // individual tick's tiny delta to zero against snapUnits/one row
      // independently, instead of letting a slow drag's movement actually
      // accumulate across ticks - confirmed as a real reported bug ("note
      // drag isn't keeping up with mouse position"). Both deltas are
      // computed ONCE here, from the clicked (primary) note's start
      // position, then applied identically to every note in the group below
      // - that's what keeps a multi-note selection moving as one rigid
      // shape instead of each note re-deriving its delta independently.
      const snapUnits = subdivisionUnitLength();
      const rawDeltaUnits = ((event.clientX - startClientX) / cellWidthPx()) * LENGTH_UNITS_PER_STEP;
      const deltaUnits = Math.round(rawDeltaUnits / snapUnits) * snapUnits;
      // Rows read top-to-bottom in currentSharedNoteRows() order, same as the
      // template's v-for - dragging DOWN on screen means a LATER row
      // index, so the row delta (not the step delta above) is added, not
      // subtracted.
      const deltaRows = Math.round((event.clientY - startClientY) / PIANO_ROLL_ROW_HEIGHT_PX);
      group.forEach((member) => {
        const maxStartUnits = Math.max(0, stepCount * LENGTH_UNITS_PER_STEP - member.note.length);
        member.note.step = Math.max(0, Math.min(maxStartUnits, member.startStep + deltaUnits));
        const newRowIndex = Math.max(0, Math.min(currentSharedNoteRows().length - 1, member.startRowIndex + deltaRows));
        const newRow = currentSharedNoteRows()[newRowIndex];
        // A row this track's instrument can't actually play (rowIsAvailable -
        // see canPlaceNoteAt) is skipped rather than landing there anyway -
        // this one note just stops following the cursor vertically past
        // that point (independently of the rest of the group), same as it's
        // blocked from ever being PLACED on such a row in the first place.
        // Still measured from the same fixed startRowIndex origin every
        // time, so it picks back up immediately once the cursor returns to
        // a valid row, rather than staying stuck offset from wherever it
        // last successfully landed.
        if (canPlaceNoteAt(pattern, track, newRow, member.note.step, member.note.step + member.note.length)) {
          member.note.midi = newRow.midi;
          member.note.audf = rowAudf(track, newRow);
        }
      });
      // Only the primary (actually clicked) note plays back, even when
      // dragging a whole group - every selected note retriggering together
      // on each tick would read as a noisy chord smear, not useful feedback
      // about where THIS drag is landing.
      if (note.step !== movingNote.value.lastPlayedStep || note.midi !== movingNote.value.lastPlayedMidi) {
        movingNote.value.lastPlayedStep = note.step;
        movingNote.value.lastPlayedMidi = note.midi;
        playDraggedNotePreview(movingNote.value);
      }
      forceUpdate();
    };
    const stopNoteDrag = () => {
      if (!movingNote.value) return;
      const {track, group} = movingNote.value;
      const movedNotes = group.map((member) => member.note);
      // Same "clean up whatever this note now overlaps" reasoning
      // handlePatternCellClick's ownOverlapping removal uses when
      // PLACING a note - a note dragged on top of another of this same
      // track would otherwise leave two overlapping notes behind, which
      // nothing else in this file expects to ever exist. Every OTHER moved
      // note is exempted from this check (not just the one being tested
      // against) - two selected notes dragged so they now overlap EACH
      // OTHER should stay exactly as dragged, not have one silently delete
      // the other.
      track.notes = track.notes.filter((other) => movedNotes.includes(other) ||
        movedNotes.every((note) => other.step >= note.step + note.length || other.step + other.length <= note.step));
      const primary = movingNote.value.note;
      lastNoteLength.value = primary.length;
      lastNoteAudv.value = primary.audv === undefined ? null : primary.audv;
      movingNote.value = null;
      handleChildChange();
      window.removeEventListener('mousemove', handleNoteDragMove);
      window.removeEventListener('mouseup', stopNoteDrag);
      // See handlePatternCellClick's  comment - suppresses the stray
      // click this same mouseup generates on the cell underneath it.
      suppressNextCellClick = true;
      window.setTimeout(() => {
        suppressNextCellClick = false;
      }, 0);
    };
    // Select tool - drags a rectangular marquee across the grid and selects
    // every one of the ACTIVE TRACK's notes it overlaps, for the Move
    // tool (handleCellMouseDown above) to drag as one group afterward. Same
    // window-level mousedown/mousemove/mouseup shape as every other piano
    // roll drag here, but doesn't touch any note directly itself - purely a
    // selection gesture.
    const marqueeSelecting = ref(null);
    // Clamps the drawn box to the grid's rect (see handleMarqueeSelect-
    // Start's gridRect comment) - the drag's raw clientX/clientY corners
    // are otherwise free to run past the grid into the row-label column or
    // the step-ruler header above, which looked like it was "highlighting"
    // that text even though neither is actually part of the selection.
    const marqueeBoxStyle = (marquee) => {
      const {startClientX, startClientY, currentClientX, currentClientY, gridRect} = marquee;
      let left = Math.min(startClientX, currentClientX);
      let right = Math.max(startClientX, currentClientX);
      let top = Math.min(startClientY, currentClientY);
      let bottom = Math.max(startClientY, currentClientY);
      if (gridRect) {
        left = Math.max(left, gridRect.left);
        right = Math.min(right, gridRect.right);
        top = Math.max(top, gridRect.top);
        bottom = Math.min(bottom, gridRect.bottom);
      }
      return {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, right - left)}px`,
        height: `${Math.max(0, bottom - top)}px`,
      };
    };
    const handleMarqueeSelectMove = (event) => {
      if (!marqueeSelecting.value) return;
      marqueeSelecting.value.currentClientX = event.clientX;
      marqueeSelecting.value.currentClientY = event.clientY;
      forceUpdate();
    };
    const stopMarqueeSelect = () => {
      if (!marqueeSelecting.value) return;
      const {track, startClientX, startClientY, currentClientX, currentClientY, startRowIndex, startUnits} =
        marqueeSelecting.value;
      // Same fixed-origin delta math as the Move tool's drag (see
      // handleNoteDragMove) - converts the live end corner back into a row-
      // index range and a unit range, both inclusive of whichever corner is
      // actually "first" (a marquee can be dragged in any of the 4
      // directions from its starting corner).
      const deltaRows = Math.round((currentClientY - startClientY) / PIANO_ROLL_ROW_HEIGHT_PX);
      const endRowIndex = Math.max(0, Math.min(currentSharedNoteRows().length - 1, startRowIndex + deltaRows));
      const minRowIndex = Math.min(startRowIndex, endRowIndex);
      const maxRowIndex = Math.max(startRowIndex, endRowIndex);
      const deltaUnits = ((currentClientX - startClientX) / cellWidthPx()) * LENGTH_UNITS_PER_STEP;
      const minUnits = Math.min(startUnits, startUnits + deltaUnits);
      const maxUnits = Math.max(startUnits, startUnits + deltaUnits);
      const selectedMidis = new Set(currentSharedNoteRows().slice(minRowIndex, maxRowIndex + 1).map((r) => r.midi));
      // note.step < maxUnits && note.step + note.length > minUnits - tests
      // each note's REAL [step, step+length) range against the marquee,
      // not the step column(s) it happens to sit in, so a short note only
      // gets selected once the marquee actually overlaps ITS extent
      // (see startUnits' comment on why the marquee's start corner is
      // slice-accurate rather than step-accurate too - confirmed as a real
      // reported bug otherwise, "only notes should be selected, not the
      // steps they're in").
      pianoRollSelection.value = new Set((track.notes || []).filter((note) =>
        selectedMidis.has(note.midi) && note.step < maxUnits && note.step + note.length > minUnits));
      marqueeSelecting.value = null;
      window.removeEventListener('mousemove', handleMarqueeSelectMove);
      window.removeEventListener('mouseup', stopMarqueeSelect);
    };
    const handleMarqueeSelectStart = (pattern, track, row, step, event) => {
      const startRowIndex = currentSharedNoteRows().findIndex((candidate) => candidate.midi === row.midi);
      // Captured once up front (fixed-positioned, so it needs no re-
      // measuring mid-drag - internal scrolling moves the grid's content,
      // not the grid's viewport rect) and used to clamp the drawn box below:
      // without this, the box's raw clientX/clientY corners could extend
      // past the grid into the row-label column or the step-ruler header,
      // visually "highlighting" text that was never actually selectable.
      const gridEl = event.currentTarget.closest('.piano-roll');
      marqueeSelecting.value = {
        pattern, track, startRowIndex, gridRect: gridEl ? gridEl.getBoundingClientRect() : null,
        // The precise slice-snapped unit position within the clicked step
        // (same helper handlePatternCellClick/handleCellHover already use
        // for note placement itself), not just that step's left edge -
        // confirmed as a real reported bug otherwise: starting the marquee
        // from a whole step boundary made its selection effectively
        // step-granular instead of note-granular, even though the final
        // note-overlap test (stopMarqueeSelect) already compared against
        // each note's real length.
        startUnits: step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event),
        startClientX: event.clientX, startClientY: event.clientY,
        currentClientX: event.clientX, currentClientY: event.clientY,
      };
      window.addEventListener('mousemove', handleMarqueeSelectMove);
      window.addEventListener('mouseup', stopMarqueeSelect);
    };

    // Wired to the cell's @mousedown (not @click - a drag has to start
    // capturing movement from the very first pixel, not wait for a full
    // click to complete) - same "resolve the note under this exact
    // row/slice by hand" lookup handlePatternCellClick's ownNoteHere
    // uses, since nothing else already has this note reference in hand at
    // mousedown time.
    const handleCellMouseDown = (song, pattern, row, step, stepCount, event) => {
      // Without this, dragging a Move/Select gesture across the grid also
      // runs the browser's native text-selection drag underneath it -
      // highlighting the row labels' note names (and anything else text
      // under the cursor) and fighting the custom drag for every mousemove,
      // which is what made the marquee box/dragged note visibly lag behind
      // the real cursor position.
      event.preventDefault();
      if (step >= stepCount) return;
      const track = activeTrackFor(pattern);
      if (!track) return;
      const startUnits = step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event);
      const note = (track.notes || [])
          .find((candidate) => startUnits >= candidate.step && startUnits < candidate.step + candidate.length);
      if (pianoRollTool.value === 'select') {
        handleMarqueeSelectStart(pattern, track, row, step, event);
        return;
      }
      if (pianoRollTool.value !== 'move') return;
      if (!note || note.midi !== row.midi) return;
      // Dragging a note that's part of a bigger marquee selection (Select
      // tool - see pianoRollSelection/isNoteSelected) moves the WHOLE
      // selection together, not just the one actually clicked - a lone
      // selected note (or clicking one NOT in the current selection at all)
      // still just moves itself, same as before Select existed.
      const notesToMove = (isNoteSelected(note) && pianoRollSelection.value.size > 1) ?
        [...pianoRollSelection.value] : [note];
      const group = notesToMove.map((groupNote) => ({
        note: groupNote,
        startStep: groupNote.step,
        startRowIndex: currentSharedNoteRows().findIndex((candidate) => candidate.midi === groupNote.midi),
      }));
      movingNote.value = {
        note, track, row, pattern, song, group,
        startClientX: event.clientX,
        startClientY: event.clientY,
        stepCount,
        // The (step, midi) pair last actually sounded during this drag -
        // see handleNoteDragMove's playDraggedNotePreview, which only
        // re-triggers playback when either actually changes, not on every
        // single mousemove tick.
        lastPlayedStep: note.step,
        lastPlayedMidi: note.midi,
      };
      playDraggedNotePreview(movingNote.value);
      window.addEventListener('mousemove', handleNoteDragMove);
      window.addEventListener('mouseup', stopNoteDrag);
    };

    // Dragging a held note's right edge changes its length, independent of
    // the instrument preset's  Duration field - length is in
    // LENGTH_UNITS_PER_STEP units, snapped to whatever the subdivision
    // dropdown is currently set to (so a drag can produce a note shorter
    // than one full step, not just whole steps).
    const resizing = ref(null);
    // See handlePatternCellClick's  comment - suppresses the one stray
    // click a resize drag's mouseup generates on the cell underneath it.
    let suppressNextCellClick = false;
    const handleResizeMove = (event) => {
      if (!resizing.value) return;
      const {note, startClientX, startLength, maxLength, snapUnits} = resizing.value;
      const rawDeltaUnits = ((event.clientX - startClientX) / cellWidthPx()) * LENGTH_UNITS_PER_STEP;
      const deltaUnits = Math.round(rawDeltaUnits / snapUnits) * snapUnits;
      note.length = Math.min(maxLength, Math.max(snapUnits, startLength + deltaUnits));
      forceUpdate();
    };
    const stopResize = () => {
      if (!resizing.value) return;
      // See newNoteLength's  comment - grabbing a note's resize handle
      // counts as "interacting with" that note, same as placing one fresh,
      // EVEN if the mouse never actually moves (mouseup still fires stopResize
      // regardless of whether handleResizeMove ever ran) - both this note's
      // length AND its  volume (whatever it already was, override or
      // not) carry forward, not just whichever one this particular gesture
      // happens to edit.
      lastNoteLength.value = resizing.value.note.length;
      lastNoteAudv.value = resizing.value.note.audv === undefined ? null : resizing.value.note.audv;
      resizing.value = null;
      handleChildChange();
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', stopResize);
      suppressNextCellClick = true;
      window.setTimeout(() => {
        suppressNextCellClick = false;
      }, 0);
    };
    const startResize = (pattern, track, note, stepCount, event) => {
      if (!note) return;
      // Both .step values are already in LENGTH_UNITS_PER_STEP units, so
      // this comparison/boundary is too - only the stepCount fallback (a
      // whole-step count) needs converting to match. A channel is
      // monophonic, so growing this note can't be dragged past whichever
      // comes first: this same track's  next note, OR a different
      // track's note sharing this same channel (see canPlaceNoteAt, which
      // already blocks a brand new note the same way - resizing an existing
      // one was missing that same check).
      const laterUnits = [];
      track.notes.forEach((other) => {
        if (other !== note && other.step > note.step) laterUnits.push(other.step);
      });
      (pattern.tracks || []).forEach((otherTrack) => {
        if (otherTrack === track || otherTrack.channel !== track.channel) return;
        (otherTrack.notes || []).forEach((other) => {
          if (other.step > note.step) laterUnits.push(other.step);
        });
      });
      const boundaryUnits = laterUnits.length ? Math.min(...laterUnits) : stepCount * LENGTH_UNITS_PER_STEP;
      resizing.value = {
        note,
        startClientX: event.clientX,
        startLength: note.length,
        maxLength: boundaryUnits - note.step,
        snapUnits: subdivisionUnitLength(),
      };
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', stopResize);
    };

    // Dragging a volume bar - same window-level mousemove/mouseup shape as
    // startResize/handleResizeMove/stopResize above, just mapping the
    // cursor's Y position (relative to the cell's  top/height, captured
    // once at mousedown rather than re-measured every move, since the
    // cell's  position can't change mid-drag) to a percentage of the
    // instrument's  base volume (baseAudv, captured at mousedown too)
    // instead of an X-delta to a note length. top=100% (as loud as the
    // instrument's  base volume), bottom=0% (silent) - dragging can
    // never make a note louder than its  instrument's base, only
    // quieter, matching "100%" reading as "this note's  instrument
    // volume, unchanged."
    const volumeDragging = ref(null);
    const handleVolumeBarMove = (event) => {
      if (!volumeDragging.value) return;
      const {note, top, height, baseAudv} = volumeDragging.value;
      const fraction = 1 - Math.max(0, Math.min(1, (event.clientY - top) / height));
      note.audv = Math.round(fraction * baseAudv);
      forceUpdate();
    };
    const stopVolumeDrag = () => {
      if (!volumeDragging.value) return;
      // See lastNoteAudv's  comment - dragging a note's volume counts as
      // "editing" it too, same as placing one fresh.
      lastNoteAudv.value = volumeDragging.value.note.audv;
      volumeDragging.value = null;
      handleChildChange();
      window.removeEventListener('mousemove', handleVolumeBarMove);
      window.removeEventListener('mouseup', stopVolumeDrag);
    };
    // The note itself now comes straight from the template's  v-for
    // (see volumeBarNotesAt) rather than being looked up here by step -
    // several notes can share one step (different slices), so a step
    // number alone is no longer enough to say which one a drag meant.
    const handleVolumeBarPointerDown = (note, pattern, event) => {
      const activeTrack = activeTrackFor(pattern);
      const soundEffect = activeTrack && trackSoundEffect(activeTrack);
      const baseAudv = soundEffect ? (Number(soundEffect.audv) || 0) : 0;
      // The drag now starts from the handle strip (see the template - only
      // it shows the ns-resize cursor, not the whole column), so the full
      // column's  rect has to be found by walking up to it rather than
      // reading event.currentTarget directly.
      const rect = event.currentTarget.closest('.piano-roll-volume-cell').getBoundingClientRect();
      volumeDragging.value = {note, top: rect.top, height: rect.height, baseAudv};
      // Sets the value immediately from the click position itself, not
      // just once a drag actually moves - a plain click (no drag at all)
      // still sets the bar to wherever it was clicked, matching how a
      // typical fader/slider responds to a direct click.
      handleVolumeBarMove(event);
      window.addEventListener('mousemove', handleVolumeBarMove);
      window.addEventListener('mouseup', stopVolumeDrag);
    };

    // Typing an exact value into the volume row's  number field (see the
    // template - only rendered on a note's  start step, same as the
    // label it replaces) - same target field (note.audv, an absolute 0-15
    // AUDV value) as dragging the bar, just entered as a percentage of the
    // instrument's  base volume instead of derived from cursor position.
    // Clamped to 100, same as dragging already was - a note can never be
    // set louder than the instrument's base volume this way, matching
    // notePercentOf's display clamp (a project with older data already
    // stored above that ceiling still reads as capped, not just new edits).
    const handleVolumePercentChange = (note, pattern, event) => {
      const activeTrack = activeTrackFor(pattern);
      const soundEffect = activeTrack && trackSoundEffect(activeTrack);
      const baseAudv = soundEffect ? (Number(soundEffect.audv) || 0) : 0;
      const percent = Math.max(0, Math.min(100, Number(event.target.value) || 0));
      note.audv = Math.max(0, Math.min(15, Math.round((percent / 100) * baseAudv)));
      // See lastNoteAudv's  comment - typing a note's volume counts as
      // "editing" it too, same as dragging or placing one fresh.
      lastNoteAudv.value = note.audv;
      handleChildChange();
      forceUpdate();
    };
    onBeforeUnmount(() => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('mousemove', handleVolumeBarMove);
      window.removeEventListener('mouseup', stopVolumeDrag);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('mousemove', handlePianoRollResizeMove);
      window.removeEventListener('mouseup', stopPianoRollResize);
      window.removeEventListener('mousemove', handleNoteDragMove);
      window.removeEventListener('mouseup', stopNoteDrag);
      window.removeEventListener('mousemove', handleMarqueeSelectMove);
      window.removeEventListener('mouseup', stopMarqueeSelect);
      window.removeEventListener('keydown', handlePianoRollToolHotkey);
    });

    // So 100% already reads as "fit" on first load/navigation too, not only
    // after some later interaction - and keeps fitting if the browser
    // window itself is resized. Only the single active song is ever
    // rendered now (see activeSong below), so there's nothing to loop over.
    const handleWindowResize = () => {
      const song = activeSong();
      if (song) recalculateFitBaseWidth(song, activePattern(song));
    };

    // Same letters as GraphicEditorToolbar.vue's Move/Pencil/Eraser/
    // Rectangle select hotkeys (V/B/E/M) - see that component's
    // TOOL_HOTKEYS - so a user who already reaches for those on the graphic
    // tabs doesn't have to learn a second set just for the piano roll's
    // Move/Draw/Erase/Rectangle select.
    const PIANO_ROLL_TOOL_HOTKEYS = {v: 'move', b: 'draw', e: 'erase', m: 'select'};
    // Space/Shift+Space play/stop the song/pattern-preview (song and
    // pattern-preview playback are mutually exclusive - see handleStop's
    // comment - so either key's "stop" half can just call the one shared
    // handleStop regardless of which is currently playing). Shift+E/
    // Shift+I export/import the active PATTERN (not the whole song - no
    // unshifted letter is free for a second export/import target, and the
    // pattern is what you're actively looking at/editing, matching
    // Shift+Space's pattern-preview target) - checked ahead of the
    // plain 'e' tool-hotkey lookup below, same as GraphicEditorToolbar.vue's
    // Shift+E/Shift+I checks run ahead of its Eraser lookup.
    const handlePianoRollToolHotkey = (event) => {
      const history = undoRedoKind(event);
      if (history) {
        const song = activeSong();
        const pattern = song && activePattern(song);
        const can = history === 'undo' ?
          reorderCanUndo.value || (pattern && canUndoPattern(pattern)) :
          reorderCanRedo.value || (pattern && canRedoPattern(pattern));
        if (can) {
          event.preventDefault();
          (history === 'undo' ? handleUndoPattern : handleRedoPattern)(song, pattern);
        }
        return;
      }
      // event.repeat - skips the synthetic keydowns the OS fires while a
      // key is held, same reasoning as SoundFXEditor.vue's
      // handleSoundFxPlaybackHotkey: without this, holding Space/
      // Shift+Space kept re-triggering Play dozens of times a second
      // instead of once per actual press.
      if (event.repeat) return;
      // Same "skip Ctrl/Cmd/Alt combos and real text fields" guards as
      // GraphicEditorToolbar.vue's handleToolHotkey.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;

      const song = activeSong();
      if (event.key === ' ') {
        event.preventDefault();
        if (!song) return;
        if (event.shiftKey) {
          const pattern = activePattern(song);
          if (!pattern) return;
          if (playingPatternId.value === pattern.id) handleStop();
          else handlePlayPattern(song, pattern);
        } else if (playingSongId.value === song.id) {
          handleStop();
        } else {
          handlePlaySong(song);
        }
        return;
      }
      if (event.key.toLowerCase() === 'e' && event.shiftKey) {
        event.preventDefault();
        const pattern = song && activePattern(song);
        if (pattern) handleExportPattern(pattern);
        return;
      }
      if (event.key.toLowerCase() === 'i' && event.shiftKey) {
        event.preventDefault();
        const pattern = song && activePattern(song);
        if (song && pattern) handleImportPattern(song, pattern);
        return;
      }

      const tool = PIANO_ROLL_TOOL_HOTKEYS[event.key.toLowerCase()];
      if (!tool) return;
      event.preventDefault();
      setPianoRollTool(tool);
    };

    onMounted(() => {
      handleWindowResize();
      window.addEventListener('resize', handleWindowResize);
      window.addEventListener('keydown', handlePianoRollToolHotkey);
    });

    return {
      dimSoundFx, dimSoundFxPercent, dimSoundFxPercentDisplay,
      state, handleChildChange, handleChangeSubdivision, snapEnabled, handleToggleSnap,
      pianoRollTool, setPianoRollTool, handleCellMouseDown,
      pianoRollSelection, isNoteSelected, marqueeSelecting, marqueeBoxStyle,
      handleTempoChange, minTempo: MIN_TEMPO, maxTempo: MAX_TEMPO,
      handleAddSong, handleDeleteSong, handleDuplicateSong, handleExportSong, handleImportSong, handleExportSongBank, handleImportSongBank,
      activeSongId, activeSong, activeSongArray, setActiveSong, songName, songOptions, handleSongFieldChange,
      handleAddPattern, handleDuplicatePattern, handleDeletePattern, handleStepCountChange,
      handlePatternFieldChange,
      canUndoPattern, canRedoPattern, handleUndoPattern, handleRedoPattern, reorderCanUndo, reorderCanRedo, UNDO_TITLE, REDO_TITLE,
      handleExportPattern, handleImportPattern,
      handleAddTrack, handleDeleteTrack, copiedTrackNotes, handleCopyTrack, handlePasteTrack,
      handleAddSequenceStep, handleRemoveSequenceGroup,
      sequenceGroupPreviewCount, sequenceGroupChipStyle, sequenceGroupHandleStyle, handleSequenceResizeStart,
      sequenceChipListeners, isSequenceStepDragging, sequenceDragOverSide,
      handlePlayPattern, handlePlaySong, handleSequenceChipClick, handleStop,
      handleToggleLoopPattern, handleToggleLoopSong,
      handleSeekToStep,
      playingPatternId, playingSongId, autoFollowPlayback,
      isSequenceGroupPlaying, patternSequenceColor,
      handlePatternCellClick, handleCellHover, handleCellLeave, startResize,
      activePatternId, setActivePattern, activePattern,
      activeTrackFor, isActiveTrack, setActiveTrack,
      isTrackHidden, handleToggleTrackVisibility, isTrackMuted, explicitlyMutedTrack, handleToggleTrackMute,
      isTrackSoloed, handleToggleTrackSolo,
      patternName, patternOptions, stepsFor,
      patternCellClasses, patternCellStyle, patternCellTitle, activeTrackNoteTips, noteEndFraction, noteAt,
      volumeBarNotesAt, volumeCellIsContinuation, noteVolumePercent, volumeBarStyleFor, otherTrackVolumeBars,
      noteStartStep,
      handleVolumeBarPointerDown, handleVolumePercentChange, handlePianoRollScroll,
      rulerCellStyle, handleSeekHover, handleSeekHoverLeave,
      instrumentColor, instrumentTextColor,
      soundEffectOptions,
      // CHANNEL_OPTIONS' values are strings ('0'/'1') - a requirement
      // of Blockly's FieldDropdown (see blocks/sound.js, which also feeds
      // this same array to a Blockly block), not of the Music tab's
      // track.channel, which has always been stored as a NUMBER (see
      // emptyTrack/DEFAULT_SONGS in blocks/music.js). Vuetify's v-select
      // matches its :items value against v-model by strict ===, so a
      // numeric track.channel of 0 never matched the string item '0' here
      // - the Channel dropdown showed blank/placeholder even for a
      // perfectly valid, already-set channel 0 (same class of bug as the
      // Sound tab's  Frequency field before its  fix). Number(value)
      // converts back to match what's actually stored.
      // Under DPC+ with its sound chip the choices are the chip's three voices and the TIA's channel.
      channelOptionItems: computed(() => channelOptions().map(([text, value]) => ({text, value: Number(value)}))),
      subdivisionOptionItems: DURATION_SUBDIVISION_OPTIONS.map((n) => ({text: `${n}`, value: n})),
      minPatternSteps: MIN_PATTERN_STEPS,
      maxPatternSteps: MAX_PATTERN_STEPS,
      pianoRollZoom, stepPianoRollZoom, cellWidthPx, handleFitZoom,
      volumeRowHeight, startVolumeRowResize,
      pianoRollHeight, startPianoRollResize, startPianoRollResizeTop,
      isMusicToolbarScrolled, musicToolbarHeight,
      sharedNoteRows: computed(() => currentSharedNoteRows()),
      isBlackKeyRow, labelRowUnavailable,
      isPatternCollapsed, togglePatternCollapsed, isInstrumentsCollapsed, toggleInstrumentsCollapsed,
      isSequenceCollapsed, toggleSequenceCollapsed,
      trackSoundEffect,
    };
  },
});
</script>
<style scoped>
/* .alpha-notice - see App.vue's shared, unscoped rule. */

.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

.dim-controls {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 4px;
  height: 26px;
  /* Room between the divider before it and the DIM switch, on top of the
     row's 4px gap (the same 8px as the Columns switches). */
  margin-left: 8px;
}

/* Vuetify gives switches/checkboxes ("selection controls") a built-in
   margin-top: 16px, meant for stacking them below other form fields - with
   nothing above it here, that just pushes the switch down out of line with
   the slider next to it (which has no such margin). !important because
   Vuetify's ".v-input--selection-controls" rule outweighs a single
   custom class on specificity alone. */
.dim-switch {
  flex: 0 0 auto;
  margin: 0 !important;
  padding: 0 !important;
}

/* A short slider: this sits at the left of the toolbar row, beside the
   icon buttons. */
.dim-slider {
  flex: 0 0 90px;
  margin: 0;
  min-height: 0;
}

/* Keeps the slider (normally 32px tall) inside the 26px toolbar row. */
.dim-slider >>> .v-input__control {
  min-height: 26px;
}

.dim-slider >>> .v-input__slot {
  margin: 0;
}

.dim-percent {
  flex: 0 0 auto;
  min-width: 2.5em;
}
/* Left/right zeroed too - .song-card is a plain div now (no border/padding
 - see its comment), so this v-card-text's default 16px
   side padding used to stack with the inner v-card-text sections'
   (.music-name-section etc.) default 16px, reading as double-wide
   padding down the left/right edges compared to the rest of the tab. Those
   inner sections' padding is what actually insets the content now. */
.song-list-section {
  /* 8px, not 0 - matches the content inset every other tab's card list
     naturally has (Vuetify's default v-list padding-top, left unoverridden
     on PlayerEditor.vue's .animation-list/DataEditor.vue's .data-list/
     SoundFXEditor.vue's .soundfx-list), on top of .music-toolbar's 4px
     margin-bottom - 4 + 8 = 12px toolbar-to-card-content, matching
     GraphicEditorToolbar.vue's measured gap exactly instead of the
     flat 4px this used to read as (a real reported case: "spacing below
     music toolbar and music cards looks too close, matching spacing from
     graphic editor toolbar and sprite card"... "yes use same padding
     everywhere for consistency"). This section is a plain v-card-text
     (not a v-list, unlike every other tab's card container), so it
     never had that default to rely on - explicit here instead. */
  padding-top: 8px;
  padding-left: 0;
  padding-right: 0;
}

/* Narrow - the options themselves (1/2/4/8/16) are at most 2 characters,
   room for up to 3 is plenty; this used to be a full-width field up top
   with a long label, before moving next to each card's
   zoom control (see .piano-roll-zoom-row). flex-shrink: 0 keeps it from
   being squeezed by .piano-roll-zoom-controls' claim on space (see its
   comment); the deep selectors strip Vuetify's default input
   padding/min-width, which otherwise renders wider than 56px regardless of
   this flex-basis, the same fix DataEditor.vue's .data-value-field uses. */
/* Replaces the select's  floating "Snap" label (removed) - a magnet icon
   reads as "snap" without needing text, and sitting outside the select's
   56px-wide box (rather than Vuetify's built-in prepend-icon, which would
   have squeezed into that same tight box alongside the value) leaves room
   for both. align-items: center on the parent .piano-roll-zoom-row lines
   this up on the same baseline as the reset-zoom button on the row's other
   side. */
.subdivision-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* MDI has no dedicated "magnet-off" glyph (unlike mdi-repeat/mdi-repeat-off,
   which the loop button swaps between) - a diagonal line drawn over the
   plain magnet icon fakes that same "struck through" off-state look
   instead. Sized/positioned to cross the icon itself, not this button's
   whole 26px click-target box. */
.snap-toggle-btn {
  position: relative;
}

.snap-toggle-btn-off::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 2px;
  background-color: currentColor;
  transform: translate(-50%, -50%) rotate(-45deg);
  pointer-events: none;
}

/* Vuetify's  default (non-outlined) text-field/select style still
   reserves some top padding for where a floating label would normally sit,
   even with single-line - forcing the slot/control down to a 26px min-height
   alone wasn't enough to cancel that out, so the field kept sitting visibly
   lower than its 26px-tall neighbors (the snap toggle button, the
   reset-zoom button). The negative margin-top pulls the whole field's box up to
   compensate directly. */
.subdivision-select {
  flex: 0 0 56px;
  margin-top: -6px;
}

.subdivision-select >>> .v-input__slot {
  padding: 0 4px !important;
  min-height: 26px !important;
}

.subdivision-select >>> .v-input__control {
  min-height: 26px !important;
}

.subdivision-select >>> .v-select__selection {
  margin: 0;
}

/* No card chrome (border/shadow/margin) - this is the single
   editor now, not one card among several needing visual separation from
   its neighbors. position: relative is still needed regardless (not
   decorative) - .music-id-badge inside is absolutely positioned against
   it. */
.song-card {
  position: relative;
  width: 100%;
}

/* .music-id-badge's shared left offset (below) exists to clear the pattern
   card's collapse button, still present there - the song card no
   longer has an equivalent button (there's nothing left to collapse when
   only one song is ever shown at a time), so its badge alone sits closer
   to the edge, matching the toolbar buttons/fields around it. */
/* Matches the Song name field's left edge below it (this v-card-text's
   default 16px padding - unlike the Pattern section's fields, this
   row's padding was never zeroed, see .pattern-section-content's
   comment) - same alignment the Pattern ID badge now gets by just being a
   plain flex sibling name field, with nothing extra reaching in
   from the side to clear. */
.song-card > .music-id-badge {
  left: 16px;
}

.music-id-badge {
  position: absolute;
  top: 12px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
  /* Without an explicit value, this inherits whatever line-height its
     surrounding context happens to resolve to - which isn't the same
     everywhere this badge is used: the song card's badge sits in a
     context that resolves to a tight ~13px, but the pattern card's
     (nested one level deeper) resolves to Vuetify's default ~22px
     instead, visibly pushing the id text down within that taller line
     box even though top: 10px itself was identical in both. A fixed,
     tight value keeps this badge's text position independent of
     wherever it's placed. */
  line-height: 1;
}

/* Same monospace/tight-line-height idea as .music-id-badge just above, but
   lives INSIDE the chip (see the template) rather than floating over/beside
   it. No explicit color here - the chip itself always carries Vuetify's
   "dark" prop (white text), regardless of the chip's actual background
   lightness/darkness (see .sequence-chip's "dark" in the template), so
   this just inherits that same white rather than computing its
   brightness-based color against patternSequenceColor - which looked
   inconsistent (the pattern name and count staying white while the id badge
   independently switched to black) since the two were following different
   rules for text that's supposed to read as one unit. */
.sequence-chip-id-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.75;
  line-height: 1;
  vertical-align: middle;
  margin-right: 4px;
}

/* Export/Import/playback controls row, above the song editor's full-
   width divider - same background/padding as GraphicEditorToolbar.vue's
   .graphic-editor-toolbar (that component itself isn't reused here -
   it's built entirely around a PixelEditor instance's tools, nothing
   this tab has - but the visual treatment is copied so it reads as the
   same kind of toolbar). */
/* Sticks to the top of the tab's scrolling ancestor as everything below it
   scrolls past - same position: sticky pattern as
   GraphicEditorToolbar.vue's .graphic-editor-toolbar. z-index keeps it
   above the scrolled-under song/pattern content (piano roll cells etc.). */
.music-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
  /* 4px/4px top/bottom (was 4px/16px) and an explicit margin-top (was
     none) - a real reported case of this tab's toolbar being the
     actual odd one out across the app's toolbars ("space above/below
     sound tab toolbar still isn't consistent with other toolbars... stop
     and play look even farther apart now on the sound tab AND music
     toolbar" - DataEditor.vue's/SoundFXEditor.vue's toolbars had already
     been matched to GraphicEditorToolbar.vue's measured 16px-above/4px-
     below exactly; this one, still at its original 0px-above/16px-bottom-
     padding, was the mismatch being compared against, not the other way
     around).
     margin-top is -10px: close under the intro text while the toolbar is not
     pinned. The intro paragraph's 16px bottom margin collapses with this
     one, so a positive value changes nothing - this negative one pulls the
     toolbar up to a 6px gap (the DIM controls that used to sit above are in
     the toolbar now, and a 16px gap read as too much). */
  padding: 4px 16px;
  margin-top: -10px;
  /* Also removed the plain, always-visible <v-divider> this used to have
     right after it in the template - sandwiched between this toolbar's
     padding-bottom and .song-list-section's zero padding-top, it left
     literally 0px of breathing room on either side of that divider line,
     reading as cramped compared to every other toolbar's clean gap (a
     real reported case: "space above/below music toolbar now looks
     wrong"). An explicit margin-bottom instead, matching
     GraphicEditorToolbar.vue's measured 4px gap below its toolbar - that
     component has no such divider either, relying on the scrolled-state
     border-bottom (.music-toolbar-scrolled, already matched to it) to
     show a line only once actually scrolled, the same way this toolbar
     already does now that the redundant static one is gone. */
  margin-bottom: 4px;
  transition: padding 0.15s ease;
}

/* Same "grows + gains a bottom border once actually scrolled" treatment as
   GraphicEditorToolbar.vue's .graphic-editor-toolbar-scrolled, matched
   exactly (10px/10px). */
.music-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

/* Same "Soft Colors" override as GraphicEditorToolbar.vue's
   .desaturate-app-colors .graphic-editor-toolbar rule. */
.desaturate-app-colors .music-toolbar {
  background-color: #e1e1e1;
}

/* Same 4px gap-based spacing as GraphicEditorToolbar.vue's .get-tools -
   see that component's comment on why gap (not per-button margins) is
   what actually guarantees every icon/divider gap here matches exactly. */
.music-toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Zeroes .music-icon-btn-size's margin: 0 1px (needed elsewhere on
   this tab, e.g. track rows, where there's no shared flex gap doing the
   spacing) - left as-is here, it stacked with this row's 4px gap for a
   6px total gap between icons, not the clean 4px GraphicEditorToolbar.vue
   achieves by relying on gap alone with zero button margin. */
.music-toolbar-row >>> .music-icon-btn-size {
  margin: 0;
}

.music-toolbar-divider {
  margin: 0;
}

/* .music-flat-icon-btn's background/shadow/before/rest-hover-color
   rules - see App.vue's shared, unscoped copy (moved there once confirmed
   byte-identical to TitleScreenEditor.vue's .titlescreen-play-btn, see
   that file's comment). border: none kept local rather than folded
   into that shared rule - GraphicEditorToolbar.vue's .get-tools >>>
   .v-btn has it, and this tab's buttons were specifically asked to match
   that toolbar's buttons in every state, but TitleScreenEditor.vue's
   button was never reported as needing it (Vuetify's "icon" v-btn has no
   border by default anyway, so this is a no-op there either way - just
   kept scoped to what was actually asked). */
.music-flat-icon-btn {
  border: none !important;
}

/* Momentary press feedback - a shrink, not a color change, matching
   GraphicEditorToolbar.vue's .get-tools >>> .v-btn:not(.v-btn--disabled):active
   rule exactly (per an explicit request to match that toolbar's buttons in
   every state) - color is reserved for the PERSISTENT "currently on/
   playing" tint below instead, so a one-shot action button (Undo, zoom
   reset, etc.) with no ongoing state to show doesn't read as
   if it just turned "on". :not(.v-btn--disabled), same as Graphic's
   rule - a disabled button shouldn't visibly react to a click it can't
   actually receive in the first place. */
.music-flat-icon-btn:not(.v-btn--disabled):active >>> .v-icon {
  transform: scale(0.82);
}

/* Disabled dimming, matching GraphicEditorToolbar.vue's
   .get-tools >>> .v-btn--disabled .v-icon rule exactly - icon color, not
   button opacity (the shared .player-icon-btn-size-style tabs elsewhere in
   this app use opacity instead - see App.vue's comment - left as-is
   there; only this tab's buttons were asked to match Graphic's specific
   treatment). Needed at all because the rest-color rule just above
   (App.vue's shared .music-flat-icon-btn >>> .v-icon) already forces
   rgba(0,0,0,0.38) with !important, which would otherwise block Vuetify's
   default disabled dimming from ever showing through - a disabled
   button would read as identically clickable to an enabled, unhovered one. */
.music-flat-icon-btn.v-btn--disabled >>> .v-icon {
  color: rgba(0, 0, 0, 0.18) !important;
}

/* "This is currently on/playing" tint for any .music-flat-icon-btn toggle -
   the pattern loop button when looping is on, and the pattern/song Play
   buttons while their playback is active. Same blue as the piano roll's
   playhead/zoom slider (Vuetify's default theme "primary", #1976D2 - no
   custom theme colors are set, see plugins/vuetify.js). Needs the extra
   .music-flat-icon-btn specificity to win over that class's blanket
   !important color rule above - a plain :color="primary" prop on the v-icon
   itself loses to it silently. */
.music-flat-icon-btn.music-icon-btn-active >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* .music-icon-btn-size's size/icon-font-size rules - see App.vue's
   shared, unscoped copy. */

/* Same plain-inline-SVG dotted marquee icon as GraphicEditorToolbar.vue's
   Rectangle select button (.get-shape-icon/.get-marquee-icon there) -
   duplicated rather than shared across components since GraphicEditorToolbar's
   copy is reached via its >>> deep combinator, not exposed for
   reuse. fill: none + stroke: currentColor is what lets this same button's
   .v-icon color rules just above (rest/hover/active tint) reach a plain SVG
   the same way they reach a real MDI glyph's font colour; width/height
   stand in for font-size, which has no effect on an SVG. !important + the
   same >>> .music-icon-btn-size specificity every other icon-sizing rule in
   this file already uses - confirmed as a real reported bug otherwise
   ("the marquee icon looks too big") - Vuetify's .v-icon.v-icon rule
   sets width/height off ITS font-size with a specificity this plain
   class alone couldn't out-rank. */
.music-icon-btn-size >>> .piano-roll-marquee-icon {
  width: 19px !important;
  height: 19px !important;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 0.1 4.5;
}

/* Matches GraphicEditorToolbar.vue's Undo/Redo spacing/press-feedback
   exactly, per a direct request to align the two. .music-icon-btn-size's
   margin: 0 1px (needed elsewhere - see that class's comment)
   would otherwise stack with .subdivision-controls' 4px gap for an uneven
   6px gap between these two buttons, unlike the graphic toolbar's clean
   4px (gap alone, zero button margin - see GraphicEditorToolbar.vue's
   .get-tools comment). Overrides .music-flat-icon-btn:active's shared blue
   tint (right above) with a scale-down instead - the graphic toolbar's
   one-shot-action press feedback, rather than the "currently on" color this
   tab otherwise reserves for toggles/playback. */
.subdivision-controls >>> .piano-roll-transport-btn {
  margin: 0;
}

.subdivision-controls >>> .piano-roll-transport-btn:active .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
  transform: scale(0.82);
}

.music-name-field {
  margin-top: 12px;
}

/* This class is shared with plain text fields too (e.g. Song name), which
   have no dropdown icon at all - harmless no-op there. The Pattern name
   field is a v-combobox (editable text AND a dropdown - see
   handlePatternFieldChange), so Vuetify gives it its dropdown arrow
   icon; without this, that icon inherited the field's text-input
   cursor (a text I-beam) instead of a pointer, reading as if clicking the
   arrow wouldn't do anything even though it does open the dropdown. */
.music-name-field >>> .v-input__append-inner {
  cursor: pointer;
}

.music-name-section {
  padding-bottom: 0;
}

/* Extra clearance from the song card's ID badge (absolutely
   positioned so it doesn't take up flow space by itself) sitting above
   this row - on top of .music-name-field's existing 12px margin-top
   (rather than setting padding-top directly, which would override - and
   shrink - this v-card-text's larger Vuetify default padding instead of
   adding to it). The pattern section's equivalent row doesn't need this:
   its
   toolbar was moved down next to the piano roll's zoom controls (see
   .pattern-playback-controls), so nothing sits above it to clear. */
.song-name-row .music-name-field,
.song-name-row .tempo-field {
  /* Was bumped to 20px to also clear a collapse-toggle button that used
     to sit over this same top-left corner (back when every song had its
     card in a list); the song card no longer has one (there's only
     ever one song shown at a time now, nothing left to collapse), so this
     reverts to the smaller value that was already enough to clear just
     the top-right toolbar alone. */
  margin-top: 16px;
}

.music-sequence-section {
  padding-top: 0;
  /* Zeroed (was 6px) so "Add pattern"'s  gap down to the pattern
     sub-card below matches "Add instrument"'s gap down to
     .instruments-piano-divider (see .sequence-add-row .add-track-button's
     margin-bottom, which is what actually sets this gap now). */
  padding-bottom: 0;
  /* Pulls this section up closer to the Song name/Tempo row above it -
     that row's v-text-fields reserve space for a hint/error line even
     though hide-details isn't set on them, which read as a bigger gap
     (measured at 22px) than padding-top: 0 alone accounts for. -10 (not
     -12) leaves 2px of breathing room instead of pulling flush against it. */
  margin-top: -10px;
}

/* The pattern sub-section's collapse toggle used to sit absolutely
   positioned over this row's top-left corner, needing enough padding-top
   to clear it - now that it lives in its header row above (see
   .option-section-header, matching TextFontEditor.vue's "Text Minikernel
   Font Editor" section), the only thing left to clear is the top-right
   Delete button, back to this smaller value. */
.pattern-section-content .music-name-section {
  padding-top: 6px;
}

/* flex-wrap lets .pattern-length-tempo-group (tempo-checkbox/Tempo)
   drop to its line under the Pattern name field when both don't fit
   side by side - same "two atomic blocks" pattern as
   .piano-roll-zoom-and-playback/.track-instrument-row (see their
   comments). Also shared by the song card's name row (.song-name-row),
   which only ever has two fields and so rarely needs to wrap at all - this
   doesn't change its normal single-line layout. */
.pattern-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
}

/* Scoped to .pattern-section-content specifically, NOT .pattern-name-row -
   the song card's name row (see the template) carries BOTH .song-name-row
   AND .pattern-name-row (they share layout, just not this spacing), so a
   .pattern-name-row-scoped rule here would win the specificity tie
   against .song-name-row's 16px override above (same specificity,
   later in the file) and wrongly flatten the song row's spacing down to
   this pattern-only value too - confirmed directly as the cause of the
   song row suddenly looking too cramped right after this was added.
   .pattern-section-content only ever wraps the pattern sub-section's row.
   Also covers .steps-field (Length (steps)) now - its base rule below
   sets a flat 12px unconditionally, which left it sitting visibly lower
   than this row's other fields once they were pulled up to 8px here
   without it. */
.pattern-section-content .music-name-field,
.pattern-section-content .tempo-field,
.pattern-section-content .steps-field {
  margin-top: 8px;
}

/* Capped to the same 360px as the Song name field (see
   .song-name-row .music-name-field) instead of growing to fill all
   leftover row space - .pattern-length-tempo-group's margin-left:auto
   below is what now pushes the tempo checkbox/Tempo to the row's right edge
   (in line with the song's Tempo field) instead, while Length (steps) sits
   beside the Pattern name's buttons on the left. */
.pattern-name-row .music-name-field {
  flex: 0 1 360px;
  max-width: 360px;
}

.pattern-length-tempo-group {
  margin-left: auto;
}

/* The song card's .music-sequence-section (which wraps this) has its
   padding-bottom zeroed out (see that class's comment), so this margin is
   the ONLY thing separating the pattern section's bottom edge from the
   song card's bottom edge below it. */
.pattern-section-content {
  margin-bottom: 20px;
}

/* Overrides the flex: 1 1 auto (grow to fill) rule just above - unlike the
   Pattern name field (which shares this row's layout class), the Song name
   field doesn't need to stretch across all the leftover space next to the
   Tempo field/Add/Duplicate buttons; a fixed, shorter width reads better
   for what's usually a short title. Placed after that rule (not merged
   into it) so it wins the same-specificity tie via source order. */
.song-name-row .music-name-field {
  flex: 0 1 360px;
  /* flex-grow: 0 alone isn't enough to actually cap this - Vuetify's
     .v-input rules set their width, which wins over the flex item's
     basis. max-width is what actually enforces the cap. */
  max-width: 360px;
}

/* No flex-wrap (unlike .pattern-name-row) - tempo-checkbox/
   Tempo always move as one block, matching the "atomic group" pattern used
   elsewhere on this tab. */
.pattern-length-tempo-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 0 0 auto;
}

/* Add/Duplicate/Delete pattern - tight gap (not this row's  12px,
   meant for spacing separate FIELDS apart, not a group of icon buttons
   next to each other) and a margin-top nudge to line these up against
   the combobox's input line/underline rather than Vuetify's default
   icon-button margin, which read as sitting noticeably higher and
   further apart than the field beside them. */
.pattern-actions-row {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
  margin-top: 22px;
}

/* The Song name row's fields sit at margin-top: 16px (see
   .song-name-row .music-name-field/.tempo-field above), 8px more than the
   Pattern row's fields (margin-top: 8px, see .pattern-section-content's
   rule) that .pattern-actions-row's flat 22px was tuned against -
   without a matching +8px here, the Song row's Add/Duplicate buttons sat
   noticeably higher than its Song name/Tempo fields' input line. */
.song-name-row .pattern-actions-row {
  margin-top: 30px;
}

.tempo-field {
  flex: 0 0 110px;
  margin-top: 12px;
}

/* Pins Tempo to the row's right edge - the Pattern name field (sharing
   this same row layout) grows to fill the leftover space by itself (see
   .pattern-name-row .music-name-field's flex: 1 1 auto), which already
   pushes Tempo to the end; the Song name field next to it is now a fixed,
   capped width instead (see .song-name-row .music-name-field above), so
   without this Tempo just sat wherever it landed right after the
   Add/Duplicate buttons instead of at the row's far edge. */
.song-name-row .tempo-field {
  margin-left: auto;
}

/* Same margin-top override as SoundFXEditor's .dim-switch -
   Vuetify's selection-control margin-top (meant for stacking below other
   fields) otherwise pushes this out of line with the text field next to it. */
.use-song-tempo-checkbox {
  flex: 0 0 auto;
  margin-top: 20px !important;
  margin-right: -8px;
}

/* Vuetify's default selection-control ripple (a circular hover/focus
   background) removed in favor of the same plain icon-darkening hover as
   the Stop/Play buttons (.music-flat-icon-btn) elsewhere on this card. */
.use-song-tempo-checkbox >>> .v-input--selection-controls__ripple {
  display: none;
}

.use-song-tempo-checkbox:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.steps-field {
  flex: 0 0 130px;
  margin-top: 12px;
}

/* Matches a Vuetify field's  floated label exactly (e.g. "Editing
   pattern" below) - that's rendered at 16px scaled down by the fixed 0.75
   Vuetify itself applies to a floated label, so 12px is the real equivalent
   here, not a separate scale. */
.music-section-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 4px;
  /* Without an explicit value, this inherits the ambient body line-height
     (~1.43x), which reads as noticeably taller than the 12px text itself -
     align-items: center on the row centers that whole taller box, not the
     glyphs within it, leaving the actual text sitting visibly below the
     chevron button beside it (same root cause .music-id-badge's
     line-height: 1 already fixes for that badge). */
  line-height: 1;
}

.instruments-label-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Vuetify keeps a much taller invisible click-target box around even an
   x-small icon button (same issue .piano-roll-zoom-icon-btn's comment
   describes) - .instruments-label-row's align-items: center was
   centering that whole oversized box against the "Instruments" text
   next to it, which visibly reads as the chevron itself sitting too low
   against the text's baseline. A fixed, tight height/width (matching
   this row's 12px label line-height) fixes that the same way
   .piano-roll-zoom-icon-btn does for the zoom row's icon buttons. */
.instruments-collapse-btn {
  margin-left: -4px;
  margin-top: -6px;
  min-width: 0;
  height: 16px !important;
  width: 16px !important;
}

/* Same "same width/height, no shadow" treatment as the other flat icon
   buttons on this tab (.music-flat-icon-btn/.music-icon-btn-size), just a
   step smaller (x-small) to match this row's 12px label text instead
   of dwarfing it. */
.instruments-collapse-btn.v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Shown instead of the Instruments list/Add instrument button while that
   section is collapsed (see isInstrumentsCollapsed) - one small chip per
   track, colored the same way each track's note color dot is
   (instrumentColor) so a glance still identifies which instruments this
   pattern uses without expanding it back out. */
.instruments-collapsed-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  margin-bottom: 16px;
}

.instruments-collapsed-summary .v-chip {
  cursor: pointer;
}

/* Same white-then-primary double ring as .sequence-chip-playing (see its
   comment on why a single white ring alone isn't visible against this
   tab's white card background) - marks which track clicking a chip here
   last selected as active, mirroring the radio-button highlight the
   expanded Instruments list gives the same track (see isActiveTrack). */
.instrument-summary-chip-active {
  box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v-primary-base, #1976d2);
}

.sequence-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

/* No margin-bottom - Vuetify's v-btn is inline-flex, so its
   margin-bottom (see .sequence-add-row .add-track-button below) doesn't
   collapse into this wrapper div's margin the way two plain block boxes'
   margins would, and a margin here on TOP of the button's would just
   double the gap down to the pattern sub-card below instead of matching
   it. */
.sequence-add-row {
  margin-bottom: 0;
}

/* Overrides .add-track-button's  8px margin-top/12px margin-bottom
   (shared with the Instruments section's "Add instrument" button) - here
   it sits right under the sequence chips instead of a whole card-text row
   below a collapse-toggle heading, so it doesn't need as much clearance
   above, and its gap to the pattern sub-card below is meant to match
   "Add instrument"'s gap to .instruments-piano-divider (see that
   button's override right below), not this shared class's base value. */
.sequence-add-row .add-track-button {
  margin-top: 4px;
  margin-bottom: 8px;
}

/* Matches .sequence-add-row .add-track-button's  margin-bottom above -
   "Add instrument"'s gap down to the divider below it is meant to read the
   same as "Add pattern"'s gap down to the pattern sub-card below IT. */
.track-section .add-track-button {
  margin-bottom: 8px;
}

.sequence-chip-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  cursor: grab;
}

/* Same reasoning as hooks/drag-reorder.js's  CSS_CLASS_DRAGGING/
   CSS_CLASS_DRAG_OVER (see sequenceChipListeners' comment on why this
   is a separate, hand-rolled drag implementation instead of that shared
   hook) - a left/right border rather than that hook's top border, since
   this list is laid out horizontally (see .sequence-row), not as stacked
   cards. Which side shows (see sequenceDragOverSide/dragOverSideFor)
   reflects which half of THIS chip the pointer is actually over, so the
   highlight always marks where the dragged chip would really land -
   before this one, or after it - instead of always marking "before". */
.sequence-chip-dragging {
  opacity: 0.4;
}

.sequence-chip-drag-over-before {
  border-left: 3px solid var(--v-primary-base, #1976d2);
}

.sequence-chip-drag-over-after {
  border-right: 3px solid var(--v-primary-base, #1976d2);
}

/* A double ring (white, then the app's  primary color) rather than
   swapping the chip's (per-pattern) color, so it reads as "this one's
   playing right now" without fighting/hiding the color that identifies
   WHICH pattern it is - see patternSequenceColor. A single white ring
   alone (this rule's previous version) turned out to be invisible in
   practice: .song-card's background is white/near-white, so a white
   ring around a chip sitting on it had no contrast against the card at
   all, only against the chip's (usually darker/saturated) color -
   confirmed as the reason this looked like it was never implemented, even
   though the class WAS being applied correctly the whole time. The
   primary-color outer ring is what actually shows up against the card;
   the white ring is kept as an inner separator so the two don't blend
   into the chip's color either, on a light or dark chip color alike.
   Applied to the WHOLE wrap (chip + its resize handle together, see
   .sequence-chip-wrap), not just the chip by itself - confirmed directly
   as a real bug otherwise: once the resize handle became a visually fused
   part of the same chip (flush edges, matching height - see
   .sequence-chip-resize-handle), a ring drawn around the chip ALONE
   stopped short of the handle, reading as a highlight that didn't match
   the shape of the control it was supposedly outlining. Rounded to match
   the combined shape's corners (the chip's rounded left end, the
   handle's rounded right end). */
.sequence-chip-wrap-playing {
  border-radius: 12px;
  box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v-primary-base, #1976d2);
}

/* Label stays pinned to the left edge and the close (x) icon to the right
   edge even once the chip is stretched wider than its content (see
   sequenceGroupChipStyle's minWidth, for a chip repeating more than once) -
   Vuetify's .v-chip__content only ever sizes to its content by
   default, so a wider outer chip otherwise left both floating together in
   the middle instead of spreading to the chip's full width. */
.sequence-chip >>> .v-chip__content {
  width: 100%;
  justify-content: space-between;
}

/* No gap between the chip and its  resize handle (see
   .sequence-chip-wrap below) and no rounding on the chip's right
   corners, where the handle sits flush against it - together with the
   handle's matching left corners (0) and matching height, this reads
   as ONE pill-shaped control (chip + handle) rather than two separate
   controls sitting side by side. */
.sequence-chip {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  /* Vuetify's  default right padding leaves noticeable empty space
     between the close (x) icon and the chip's right edge - tightened
     here so it sits closer to that edge, same reasoning as the icon's
     already-tight left-side spacing. Left padding untouched (the text
     label's spacing is unaffected). */
  padding-right: 8px !important;
}

/* A grip fused onto a sequence chip's  right edge (see .sequence-chip
   above) - dragging it repeats the chip's pattern more (or fewer)
   times in a row (see handleSequenceResizeStart), snapped to whole
   repeats. Same height as the chip itself (a "small" v-chip's fixed
   24px) and rounded only by itself outer (right) corners, matching the
   chip's pill shape on that side, so the combined shape reads as one
   continuous capsule. Its background color (see
   sequenceGroupHandleStyle) is a lighter tint of the chip's color, not
   a fixed grey, for the same "part of the same chip" reason. ew-resize
   (not the wrap's grab cursor) signals this is a horizontal resize,
   not a reorder drag, even though both live in the same small area. */
.sequence-chip-resize-handle {
  /* At least as wide as its  12px corner radius (matching the chip's
     left-edge radius - see .sequence-chip) - CSS scales corner radii
     DOWN to fit when they'd otherwise exceed the box's width, so a
     narrower handle wouldn't actually render at the full matching 12px it
     was given, despite the value itself being identical. */
  width: 14px;
  height: 24px;
  border-radius: 0 12px 12px 0;
  cursor: ew-resize;
  flex: 0 0 auto;
}

.sequence-chip-resize-handle:hover {
  filter: brightness(0.92);
}

/* Not a card anymore (see the template's comment on this section) -
   just a plain collapsible region, matching TextFontEditor.vue's "Text
   Minikernel Font Editor" section (.option-section-header/-content). */
/* Only adds click affordance on top of .instruments-label-row's
   layout (also carried on this element - see the template) - the Sequence
   header uses that same class un-clickable-styled (its chevron button
   is the only click target there), but the Pattern header's whole row
   toggles on click, same as this tab's other collapsible sections. */
.option-section-header {
  cursor: pointer;
  user-select: none;
}

.option-section-content {
  padding-left: 4px;
  /* position: relative - not decorative, the Delete button inside is
     absolutely positioned against this. */
  position: relative;
}

/* No left indent for the pattern section specifically (overrides the 4px
   above) - unlike Text Minikernel's single always-narrow glyph grid, this
   section's piano roll/track grid should use the full width available,
   flush with the Sequence chips/Song name row above it rather than sitting
   slightly indented under the collapse arrow. */
.pattern-section-content {
  padding-left: 0;
}

/* Zeroes the inner v-card-text elements' default 16px left/right
   padding - .music-sequence-section (the outer v-card-text this whole
   pattern section sits inside) already provides that same 16px inset once;
   these inner v-card-texts stacking their 16px on top of it left
   Pattern name/Length/Tempo and the Instruments grid/piano roll sitting a
   full 32px in from the edge, visibly further indented than the Sequence
   chips right above them (which sit directly in .music-sequence-section,
   only ever getting that single 16px). */
.pattern-section-content .music-name-section,
.pattern-section-content .track-section {
  padding-left: 0;
  padding-right: 0;
}

/* The Pattern header's ID badge (see the template) - .music-id-badge's
   shared position: absolute/top/left (tuned for sitting inside a card,
   see its comment) doesn't apply in this plain flex header row, and
   this needs its left margin (no button/collapse-arrow clearance to
   rely on here, since the chevron is a normal flex sibling now, not an
   absolutely positioned overlay). */
/* flex-basis: 100% forces this onto its line, above the Pattern name
   field beside it in the same flex-wrap row (see .pattern-name-row), even
   though it's the field's flex sibling, not a separate block ancestor. */
.option-section-pattern-id-badge {
  position: static;
  flex-basis: 100%;
  /* Pulls the Pattern name field below it closer - .pattern-name-row's
     12px gap (needed for its actual side-by-side fields) otherwise left a
     bigger gap under this badge than it needs by itself. */
  margin-bottom: -10px;
}

.track-section {
  padding-top: 0;
  /* Same reserved-hint-space gap as .music-sequence-section's  comment,
     between this section and the Pattern name/Length/Tempo row above it. */
  margin-top: -12px;
}

/* One column per instrument up to minmax's  floor (440px - roughly what
   one .track-instrument-row needs to lay out its radio/swatch/selects/icon
   group without squeezing), auto-filling however many fit the current
   width and wrapping the rest onto new rows - no JS-measured column count
   needed, and grid's gap (not each item's individual margin) keeps
   items from ever butting up against each other in either direction,
   including the last item in a row that doesn't reach a following column. */
.track-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
  gap: 24px 16px;
  /* .music-section-label's  margin-bottom (4px) wasn't enough room for
     the first row's "Instrument" field label - a dense Vuetify select's
     floating label sits right at the top box, so with only 4px
     between them the two labels read as crowded/almost touching instead of
     as two clearly separate rows. */
  margin-top: 12px;
}

/* Enough vertical padding (no divider line) that dense v-selects' floating
   labels - which sit slightly above their box - can't read as
   overlapping the row above/below - handled by .track-grid's row gap
   now that instruments can sit side by side, not just this row's
   top/bottom padding (which would otherwise double up with that gap). */
.track-row {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.add-track-button {
  margin-top: 8px;
  margin-bottom: 12px;
}

/* The plus icon sits a couple pixels low against the button's  text
   baseline otherwise - Vuetify centers a v-icon against the button's full
   line-height box, not the text glyphs' visual baseline. */
.add-track-button .v-icon {
  vertical-align: 4px;
}

/* Matches .track-section .add-track-button's  margin-bottom above it
   (see that rule's comment) - the same 4px gap on both sides of the line. */
.instruments-piano-divider {
  margin-bottom: 4px;
}

/* flex-start (not space-between, its old value from before this row could
   wrap) - space-between computes its gap relative to whichever LINE each
   group ends up on once this row wraps, which put .piano-roll-zoom-controls/
   .pattern-playback-controls in an inconsistent spot (sometimes flush
   right, sometimes not) depending on exactly how much room
   .subdivision-controls left on line 1 - confirmed directly as a real bug,
   traced to .pattern-playback-controls' old margin-left: 8px (fixed
   there instead, see its comment) and .pattern-delete-btn's old
   margin-left: auto (also fixed at its source). space-between itself
   turned out not to be the culprit - it already does the right thing on
   its: pins .subdivision-controls to the left and
   .piano-roll-zoom-and-playback to the right when both fit on one line,
   but falls back to flex-start (left-aligned) for a lone item once that
   group wraps onto its line with nothing left to space "between". */
/* Sticky, same as .music-toolbar above - "top" is bound to that toolbar's
   live-measured height (musicToolbarHeight, see the comment on it in
   setup()) so this stacks directly below it with no gap/overlap as that
   toolbar's height changes between its scrolled/unscrolled padding.
   z-index 1 (not 2, .music-toolbar's) so that toolbar stays visually on
   top at the point where they're both pinned and something else scrolls
   underneath both. Opaque background for the same "scrolled content
   shouldn't show through" reason as every other sticky toolbar here. */
.piano-roll-zoom-row {
  position: sticky;
  z-index: 1;
  background-color: #fff;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 4px 0;
  margin-bottom: 4px;
}

/* Same "Soft Colors" override as .music-toolbar's
   .desaturate-app-colors rule just above. */
.desaturate-app-colors .piano-roll-zoom-row {
  background-color: #e1e1e1;
}

/* Groups the zoom controls with the pattern preview play/stop/loop buttons
   (moved in here from the pattern card's top-right toolbar) so they sit
   immediately next to each other. flex-wrap here lets
   .pattern-playback-controls drop to its line UNDER
   .piano-roll-zoom-controls when both don't fit side by side - but neither
   of those two groups ever splits apart internally (see their
   flex: 0 0 auto, no wrap), so it's always "zoom tools" and
   "playback buttons" wrapping as two whole blocks, never individual icons
   scattering onto separate lines.
   flex: 0 1 auto (flex-grow: 0, NOT 1) + min-width: 0 - this group has to
   be able to SHRINK down to whatever width it lands on (its wrapped
   line, once .subdivision-controls has taken the rest of line 1) before its
   internal flex-wrap has anything to trigger against, but must NOT
   grow past its content's natural width either: flex-grow: 1 let
   .piano-roll-zoom-row's space-between stretch this group's outer box
   to fill the row's full remaining width, while its children (with no
   justify-content: flex-end) stayed put at the group's LEFT
   edge - visually reading as "not right-aligned" even though the group's
   (empty, oversized) box really was flush against the row's right
   edge. flex-grow: 0 keeps this box exactly as wide as its content, so
   space-between has an accurately-sized item to push flush right. */
.piano-roll-zoom-and-playback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  flex: 0 1 auto;
  min-width: 0;
}

/* flex-shrink: 0 keeps this group (button/slider/label) at its  natural
   width instead of getting squeezed by .subdivision-select sharing the row
   with it now - confirmed directly as the cause of the slider rendering
   far narrower than its 200px flex-basis once the select moved in. */
.piano-roll-zoom-controls {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
}

/* No left margin (used to have one) - a margin here stayed
   attached to this group even when .piano-roll-zoom-and-playback's
   flex-wrap moved it down onto its line under .piano-roll-zoom-controls,
   leaving a stray gap before Export/Import that made the wrapped line
   look NOT left-aligned - confirmed directly as a real bug. The visual
   separation from the zoom icons (a slightly bigger gap than between the
   zoom icons themselves) now comes from .piano-roll-zoom-and-playback's
   gap instead, which only ever applies BETWEEN items on the same line
   (or between wrapped lines), never as leading space before the first item
   of a line. */
.pattern-playback-controls {
  display: flex;
  align-items: center;
}

/* Vuetify's icon buttons keep a 36px+ click target around the icon itself
   even at "small" size, so a plain small gap between them still reads as a
   wide visual gap - shrinking the buttons themselves (same approach as
   .player-icon-btn-size/.text-icon-btn-size elsewhere in the app) pulls the
   reset/zoom-out/zoom-in icons visibly closer to the slider and each other. */
.piano-roll-zoom-icon-btn {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0;
}

.piano-roll-zoom-slider {
  flex: 0 1 200px;
  min-width: 100px;
  margin: 0 2px;
}

/* flex: 0 0 auto (not the fixed 3.5em box this used to be) - that fixed
   width, combined with right-aligned text, left a wide gap of empty box
   BEFORE the actual digits for any value under 5 characters (e.g. "100%"
   in a box sized for "1600%") between this and the zoom-in button right
   before it, since there's nothing after this label for the fixed width
   to keep aligned against. tabular-nums still keeps digit-for-digit width
   consistent, so this only ever shifts by roughly one character's width
   between the shortest and longest possible readouts (100%-1600%), not
   worth a fixed box to prevent. */
.piano-roll-zoom-label {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-size: 0.85em;
  margin-left: 2px;
  /* Sits between the reset (Fit zoom) and zoom-out buttons (moved there
     per request), not at either end of the row - needs its right-hand
     clearance too, since .piano-roll-zoom-controls' gap: 0 relies on
     each child's margin for spacing, and .piano-roll-zoom-icon-btn
     (zoom-out, right after this) has none. */
  margin-right: 2px;
}

/* flex-end (not center) - the row mixes a 28px radio button with dense
   selects and a 14px swatch, all different heights; bottom-aligning them
   matches each field's text baseline far more consistently than
   centering against each element's full (very different) box height. No
   flex-wrap - the radio button/color dot/Instrument/Channel fields/icon
   buttons all stay together on one row, shrinking (see
   .track-instrument-select's min-width: 0) rather than wrapping apart
   from each other, so the icon buttons never end up looking detached from
   the instrument they belong to. */
.track-instrument-row {
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

/* Show/hide, mute, solo, copy, paste, delete - grouped tighter together
   than the rest of the row (which needs the breathing room for its
   dropdowns), since they're all just small icon actions for this one
   instrument. */
.track-icon-group {
  display: flex;
  flex: 0 0 auto;
  gap: 0;
}

/* Matches this row's  note color in the piano roll below (see
   instrumentColor in the script) - a quick visual legend for which color
   belongs to which instrument. Read-only here - set it via the color picker
   on this instrument's Sound tab card instead. */
.instrument-color-dot {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  margin-bottom: 7px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

/* flex-basis dropped from 200px, and no min-width floor at all (0, not
   60px) - this shrinks as far as the pattern card's available width
   needs it to, rather than forcing .track-channel-select right beside it
   to wrap away onto its line. Per request, Instrument/Channel stay on
   one row together even if that means a very narrow Instrument box. */
.track-instrument-select {
  flex: 1 1 80px;
  min-width: 0;
  max-width: 240px;
}

.track-channel-select {
  flex: 0 0 110px;
}

/* Piano-roll: a fixed-width note-name column on the left plus one column per
   step, styled after onlinesequencer.net's grid editor - click a cell to
   place/remove a note, drag a held note's right edge to change its length.

   ONE element (this one) owns both scroll axes, capped to a fixed size, so
   both its scrollbars sit at fixed spots along ITS edges - always in
   view - rather than trailing off after however many rows/steps of content
   (which is what happened when vertical and horizontal scroll were split
   across two nested elements instead). The step header and the row labels
   stay in view while scrolling via position: sticky (top and left
   respectively) instead of living outside the scrollable area, since they
   still need to scroll WITH their axis (a header has to track
   horizontal scroll, just not vertical; a row label has to track vertical
   scroll, just not horizontal).

   The volume row (see .piano-roll-volume-scroll below) is deliberately NOT
   a child of this element any more, despite otherwise wanting to scroll
   horizontally in lockstep with it (see handlePianoRollScroll) - if it
   were still nested in here, this element's native horizontal
   scrollbar would render at the very bottom of EVERYTHING (below the
   volume row too), rather than sitting right above it, right where the
   pitch rows actually end - confirmed directly as a real complaint once
   the volume row was first added inside here. max-height bumped up
   (284px -> 340px) to compensate for the volume row now taking its
   extra space below this, rather than shrinking the pitch-row area to fit
   it in. */
.piano-roll-scroll {
  /* max-height is now set inline (:style, bound to pianoRollHeight) -
     draggable via .piano-roll-height-resize-handle, see
     startPianoRollResize. */
  overflow: auto;
  /* Matches App.vue's darkened .v-sheet--outlined-equivalent card border
     color (see its comment) rather than Vuetify's default
     rgba(0, 0, 0, 0.12) - the piano roll's frame reads better a bit darker
     regardless of the surrounding (now border-less) pattern section. */
  border: 1px solid rgba(0, 0, 0, 0.24);
  border-radius: 2px;
  /* Dragging a Move/Select gesture across the grid otherwise also runs the
     browser's native text-selection drag underneath it, highlighting the
     row labels' note names (and the step ruler's numbers) blue - the
     mousedown-side event.preventDefault() in handleCellMouseDown already
     stops this for drags that start on a cell, but this covers every other
     starting point (e.g. a drag that starts on a label or the ruler) too. */
  user-select: none;
}

/* Groups the (scrollable) pitch-row grid with the (horizontally-mirrored,
   never independently scrolled) volume row right below it - see
   .piano-roll-scroll's comment for why they're siblings, not nested,
   despite visually reading as one continuous piece. */
.piano-roll-wrapper {
  display: flex;
  flex-direction: column;
}

/* overflow: hidden (not auto/scroll) - this never shows its  scrollbar
   or accepts direct dragging; its horizontal scroll position is only ever
   set programmatically, by handlePianoRollScroll mirroring
   .piano-roll-scroll's scrollLeft on every scroll event. */
.piano-roll-volume-scroll {
  overflow: hidden;
  /* Matches .piano-roll-scroll's  darkened border above - these two
     read as one continuous frame, so their shared edges have to match. */
  border: 1px solid rgba(0, 0, 0, 0.24);
  border-top: none;
  border-radius: 0 0 2px 2px;
}

.piano-roll-step-header {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
}

.piano-roll-label-spacer {
  flex: 0 0 58px;
  position: sticky;
  left: 0;
  z-index: 3;
  background-color: #fff;
}

/* "Soft Colors" (see App.vue's desaturate-app-colors class/comment) -
   matches the darker card tier this ruler/spacer sit on top of once that's
   on, instead of staying the plain white every other surface swaps away
   from. */
.desaturate-app-colors .piano-roll-step-header,
.desaturate-app-colors .piano-roll-label-spacer {
  background-color: #ebebeb;
}

/* flex-basis is set inline (see cellWidthPx), matching .piano-roll-cell's
   width so the header stays aligned with the grid below it. */
.piano-roll-step-number {
  text-align: center;
  font-size: 0.7rem;
  opacity: 0.6;
  cursor: pointer;
  /* Echoes .piano-roll-cell's  step-edge border-left, fainter (0.12 vs
     0.22) so the ruler's step divisions read as a quiet reference
     rather than competing with the piano roll's, more prominent grid -
     see headerSliceGridImage's comment for its slice-line counterpart. */
  border-left: 1px solid rgba(0, 0, 0, 0.12);
}

/* Steps beyond the pattern's current Length - visible so raising Length is
   discoverable, but visibly locked out until then (see the disabled-guard
   by itself @click, which skips seeking there entirely). */
.piano-roll-step-number-disabled {
  opacity: 0.25;
  cursor: default;
}

.piano-roll {
  width: fit-content;
}

.piano-roll-row {
  display: flex;
  align-items: stretch;
}

.piano-roll-row:nth-child(odd) {
  background-color: rgba(0, 0, 0, 0.035);
}

.piano-roll-label {
  flex: 0 0 58px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 6px;
  font-family: monospace;
  font-size: 0.7rem;
  opacity: 0.7;
  background-color: rgba(0, 0, 0, 0.04);
  position: sticky;
  left: 0;
}

/* A black key on a real piano (see isBlackKeyRow) - dark background/light
   text, like an actual black key with its note name printed on it,
   instead of the plain light .piano-roll-label above (a white key's
   look). opacity reset to 1 (not the plain label's 0.7) - dimming a
   light color reads as "muted", but dimming this dark one just makes the
   light text harder to read against it for no benefit. */
.piano-roll-label-black-key {
  opacity: 1;
  background-color: #6b6b6b;
  color: #fff;
}

/* Same "not available to the currently active track" treatment as
   .piano-roll-cell-row-unavailable, extended to the row's label too
   (see labelRowUnavailable) - the exact same literal background color
   (not a filter over whatever was already there) so an unavailable row's
   label actually matches its cells' grey instead of landing on some
   other shade - !important to win over .piano-roll-label-black-key's
   dark background when a black-key row is also unavailable. */
.piano-roll-label-row-unavailable {
  background-color: rgba(0, 0, 0, 0.18) !important;
  color: initial;
  cursor: not-allowed;
}

/* flex-basis is set inline (see cellWidthPx) - it scales with the piano
   roll's horizontal zoom control, so it can't be a fixed value here. */
.piano-roll-cell {
  position: relative;
  height: 20px;
  border-left: 1px solid rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
}

/* The Move tool drags a note rather than placing/erasing one on a plain
   click - a move cursor reads as "drag this" at a glance, the same reason
   PixelEditor.vue's Move tool swaps its cursor this way. */
.piano-roll-cell-move-cursor {
  cursor: move;
}

/* The Select tool drags a marquee box rather than placing/moving/erasing a
   note on a plain click - crosshair reads as "drag to select" the same way
   GraphicEditorToolbar.vue's marquee select tools already do. */
.piano-roll-cell-select-cursor {
  cursor: crosshair;
}

/* Fixed (not absolute) - sized directly off the drag's raw viewport
   clientX/clientY corners (see the template's :style binding), so it
   needs no container-relative offset math at all, unlike every other
   positioned element on this grid (which all measure against the
   scrolling .piano-roll-scroll instead). pointer-events: none so the drag
   this box is PREVIEWING (window-level mousemove/mouseup, not anything on
   the box itself) is never accidentally intercepted by it. */
.piano-roll-marquee-box {
  position: fixed;
  border: 1px solid rgba(33, 150, 243, 0.95);
  background-color: rgba(33, 150, 243, 0.15);
  pointer-events: none;
  z-index: 20;
}

/* A faint alternating tint per step column (odd-numbered steps only - the
   row's first child is .piano-roll-label, so every OTHER .piano-roll-
   cell lands on an even nth-child position), the same "helps you count
   steps at a glance" trick FL Studio's piano roll uses. Note colors
   (backgroundImage, set inline) always paint over this since it's a
   separate property, not competing for the same layer. */
.piano-roll-cell:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.012);
}

/* A cell's tint replaces its row's (they are separate background-color
   declarations, not layers), so the alternate columns on a shaded row carry the
   row's tint plus the column's, and the row bands stay unbroken. */
.piano-roll-row:nth-child(odd) .piano-roll-cell:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.047);
}

/* Precise hover feedback (matching exactly where/how long a click would
   place a note) is drawn via patternCellStyle's hoverPreview segment
   instead - a plain whole-cell highlight here would misleadingly suggest a
   click always fills the entire step, even when the current slice snap
   would only fill a fraction of it. */

/* Erases the seam between a held note's  cells so they read as one
   continuous bar instead of separate ticked-off steps. */
.piano-roll-cell-continuation {
  border-left-color: transparent;
}

/* A note belonging to an instrument other than the one currently selected
   for editing (see the radio buttons next to each instrument row) - still
   shown in its color so the whole pattern is visible at once, just
   dimmed and non-interactive since editing it requires selecting that
   instrument first. */
.piano-roll-cell-foreign {
  opacity: 0.55;
  cursor: default;
}

/* A foreign note sitting on a row the active track can't use at all (e.g. a
   tuned-note row while a noise-type instrument is selected) - fully
   desaturated and darkened on top of .piano-roll-cell-foreign's
   dimming, so it reads as clearly "not available to you" (matching
   .piano-roll-cell-disabled's weight for empty cells on that row) instead
   of looking like any other clickable note. !important to win over the
   plain .piano-roll-cell:nth-child step-alternation tint. */
.piano-roll-cell-row-unavailable {
  filter: grayscale(1) brightness(0.5);
  background-color: rgba(0, 0, 0, 0.18) !important;
  cursor: not-allowed;
}

/* !important so this always wins over the plain .piano-roll-cell:nth-child
   step-alternation tint above, regardless of selector specificity. Channel
   conflicts ("blocked") are painted precisely via patternCellStyle's
   gradient layer instead of a class here, since only part of a step can be
   blocked while the rest stays available - see blockedRangesInStep. */
.piano-roll-cell-disabled {
  background-color: rgba(0, 0, 0, 0.18) !important;
  cursor: not-allowed;
}

.piano-roll-cell-disabled:hover {
  background-color: rgba(0, 0, 0, 0.18) !important;
}

/* Steps beyond the pattern's current Length - same darkness as
   .piano-roll-cell-disabled now (both read as "not usable"); it used to be
   darker still, but that extra distinction wasn't obvious enough to be
   worth two different shades. */
.piano-roll-cell-length-disabled {
  background-color: rgba(0, 0, 0, 0.18) !important;
  cursor: not-allowed;
}

.piano-roll-cell-length-disabled:hover {
  background-color: rgba(0, 0, 0, 0.18) !important;
}

/* Only rendered on a held note's  last (rightmost) cell - drag this to
   change that note's length. */
/* left is set inline (see noteEndFraction) - the note's  end position
   within its tip cell, not always the cell's flat right edge, since a
   sub-step-length note (or a multi-step note's partial last step) can end
   partway across it. */
.piano-roll-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background-color: rgba(255, 255, 255, 0.5);
  /* A note ending at (or very near) a step boundary positions this right at
     its cell's right edge, overflowing a few px into the next cell's
     box (see noteEndFraction). Without this, that next cell - a later,
     same-stacking-level sibling - paints and hit-tests over that
     overflowing sliver, so the handle stays visible but stops being
     clickable right after a resize lands a note there. */
  z-index: 2;
}

/* The piano roll's "note properties" strip (currently just Volume,
   see noteVolumePercent/volumeBarStyleFor) - reuses .piano-roll-row/
   .piano-roll-label as-is (same left gutter width/sticky behavior as every
   pitch row above it) so it reads as one more row of the same grid, not a
   separate bolted-on section, satisfying "connected to the bottom of the
   piano roll." A thicker top border marks where the real pitch rows end
   and this starts. */
.piano-roll-volume-row {
  border-top: 2px solid rgba(0, 0, 0, 0.22);
}

/* Top-aligned (the plain .piano-roll-label it otherwise reuses centers
   vertically, which reads fine against a single line of pitch text but
   leaves "Vol" floating oddly next to this row's much taller 64px
   cells). */
.piano-roll-volume-label {
  align-items: flex-start;
  padding-top: 4px;
}

/* Taller than a plain 20px .piano-roll-cell (64px, the floor
   VOLUME_ROW_HEIGHT_MIN also uses) - a bar spanning a 0-100% range needs
   real vertical room to drag precisely; at 20px tall each percentage point
   would be little more than a fraction of a pixel. height is set inline
   now (see volumeRowHeight), draggable via .piano-roll-volume-resize-handle
   below - this is just the floor/starting point every song shares until
   dragged. */
.piano-roll-volume-cell {
  position: relative;
  border-left: 1px solid rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.piano-roll-volume-cell:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.012);
}

/* Drag this to resize the volume row (see startVolumeRowResize) - a plain
   horizontal strip along the row's bottom edge, same "semi-transparent
   white grab strip" language as .piano-roll-resize-handle/
   .piano-roll-volume-handle use for their (differently-oriented) drag
   handles, just full-width and a little taller so it's comfortable to grab
   without needing to land on a single note's handle first. */
.piano-roll-volume-resize-handle {
  height: 8px;
  cursor: ns-resize;
  background-color: rgba(0, 0, 0, 0.06);
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}

.piano-roll-volume-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.12);
}

/* Drag this to resize the pitch grid above it (see startPianoRollResize) -
   sits directly on the boundary between .piano-roll-scroll and
   .piano-roll-volume-scroll, a separate flex child of .piano-roll-wrapper
   rather than living inside either of those (unlike
   .piano-roll-volume-resize-handle, which is the volume row's LAST
   child - this boundary line belongs to neither side specifically). Same
   visual treatment as that handle for a consistent "this is draggable"
   affordance. */
.piano-roll-height-resize-handle {
  flex: 0 0 auto;
  height: 8px;
  cursor: ns-resize;
  background-color: rgba(0, 0, 0, 0.06);
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.piano-roll-height-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.12);
}

/* A step covered by a note that started in an earlier column (not this
   one) - erases the seam between the two cells' bars so a multi-step
   note's volume bar reads as one continuous shape, matching
   .piano-roll-cell-continuation's identical treatment in the grid above. */
.piano-roll-volume-cell-continuation {
  border-left-color: transparent;
}

/* Anchored to the cell's  bottom (position: absolute, not part of
   normal flow) - height alone (see volumeBarStyleFor's inline style)
   already represents the note's volume as a fraction of the cell's
   full height, growing up from 0 exactly like a level meter. left/width
   are set inline too (see noteStepSpanStyle) - a note that starts or ends
   mid-step only occupies its fraction of this column, not the whole
   thing, same as the note itself in the grid above. */
.piano-roll-volume-bar {
  position: absolute;
  bottom: 0;
}

/* A different track's  note at this same step (see
   otherTrackVolumeBars) - visible so switching the active instrument
   doesn't erase the rest of the pattern's volume shape from this row, but
   dimmed and click-through (matching .piano-roll-cell-foreign's
   treatment of a foreign note up in the grid) since it isn't editable
   from here. */
.piano-roll-volume-bar-ghost {
  opacity: 0.15;
  pointer-events: none;
}

/* Same look/purpose as .piano-roll-resize-handle (a semi-transparent white
   grab strip), just rotated 90 degrees - a horizontal strip along the
   bar's TOP edge instead of a vertical one along a note's right edge,
   since dragging here changes a vertical value (volume) instead of a
   horizontal one (length). */
.piano-roll-volume-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
  background-color: rgba(255, 255, 255, 0.5);
  z-index: 2;
}

/* Pushed further down from the bar's  top edge (was 1px) so it doesn't
   crowd .piano-roll-volume-handle right above it. Still floats above a
   short/quiet bar rather than being clipped inside it (this whole element
   is taller than a short bar's height, via overflow: visible below,
   the default) - reads fine as a small label near the bar's top, the
   same way a bar chart's value labels usually work.
   A real <input type="number"> now (see handleVolumePercentChange), not a
   plain <span> - typing an exact value here sets the note's volume
   directly instead of only being settable by dragging the bar. Reset back
   to looking like the plain label it replaced: no border/background/
   padding, and the browser's up/down spinner arrows hidden
   (they'd otherwise eat into this already-narrow column and don't fit the
   rest of the piano roll's flat styling). */
.piano-roll-volume-value {
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  width: 100%;
  text-align: center;
  /* Matches .piano-roll-label's  note-name text size, so the volume
     number reads as the same "size class" of text as the rest of the
     piano roll. */
  font-size: 0.7rem;
  line-height: 1;
  color: white;
  border: none;
  background: transparent;
  padding: 0;
  -moz-appearance: textfield;
}

.piano-roll-volume-value::-webkit-outer-spin-button,
.piano-roll-volume-value::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.piano-roll-volume-value:focus {
  outline: 1px solid rgba(255, 255, 255, 0.8);
}
</style>
