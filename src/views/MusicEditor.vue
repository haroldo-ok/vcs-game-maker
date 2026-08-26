<template>
  <div>
    <v-card flat class="editor-container">
      <v-card-title>Music (alpha 0.35)</v-card-title>
      <v-alert type="warning" dense outlined :icon="false" class="alpha-notice">
        This feature is in early alpha. Things may change or break. In fact, it's guaranteed. You've been warned!
      </v-alert>
      <v-card-text class="dim-section">
        <div class="dim-controls">
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
            hide-details
            class="dim-slider"
          />
          <span class="dim-percent">{{ dimSoundFxPercentDisplay }}%</span>
        </div>
        <p class="dim-hint v-messages theme--light v-messages__message">
          When DIM is on, every note plays at the volume above, as a percentage of its own set volume - same
          setting as the Sound tab's own DIM (changing it here changes it there too). Off: notes play at their
          own set volume.
        </p>
      </v-card-text>
      <v-card-text class="song-list-section">
        <v-list class="song-list">
          <v-list-item
            class="entry-list-item"
            v-for="(song, index) in state.songs"
            v-bind:key="song.id"
            :data-song-id="song.id"
          >
            <v-list-item-content>
              <v-card outlined class="song-card" :class="dragCardClass(index)" v-on="dragTargetListeners(index)">
                <div
                  class="song-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-btn
                  :title="isSongCollapsed(song) ? 'Expand this song' : 'Collapse this song'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="music-collapse-btn"
                  @click="() => toggleSongCollapsed(song)"
                >
                  <v-icon>{{ isSongCollapsed(song) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="music-id-badge">ID:{{ song.id }}</div>

                <div class="music-toolbar-top-right">
                  <v-btn
                    icon
                    small
                    title="Export song to .JSON file"
                    class="music-flat-icon-btn music-icon-btn-size"
                    @click="() => handleExportSong(song)"
                  >
                    <v-icon>mdi-export</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Import song from .JSON file"
                    class="music-flat-icon-btn music-icon-btn-size"
                    @click="() => handleImportSong(song)"
                  >
                    <v-icon>mdi-import</v-icon>
                  </v-btn>
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
                    :title="song.loop ?
                      'Loop this song\'s preview playback until stopped (on)' :
                      'Loop this song\'s preview playback until stopped (off)'"
                    :class="['music-flat-icon-btn', 'music-icon-btn-size', {'music-icon-btn-active': song.loop}]"
                    @click="() => handleToggleLoopSong(song)"
                  >
                    <v-icon small>{{ song.loop ? 'mdi-repeat' : 'mdi-repeat-off' }}</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Stop playback"
                    class="music-flat-icon-btn music-icon-btn-size"
                    @click="handleStop"
                  >
                    <v-icon>mdi-stop</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :title="playingSongId === song.id ? 'Playing...' : 'Play the full pattern sequence'"
                    :class="['music-flat-icon-btn', 'music-icon-btn-size', {'music-icon-btn-active': playingSongId === song.id}]"
                    @click="() => handlePlaySong(song)"
                  >
                    <v-icon>{{ playingSongId === song.id ? 'mdi-volume-high' : 'mdi-play' }}</v-icon>
                  </v-btn>
                  <v-menu v-if="state.songs.length > 1" top>
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        title="Delete this song"
                        icon
                        small
                        class="delete-icon-btn music-icon-btn-size"
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon>mdi-delete</v-icon>
                      </v-btn>
                    </template>
                    <v-card>
                      <v-card-title>Delete this song?</v-card-title>
                      <v-list>
                        <v-list-item @click="handleDeleteSong(song)">
                          <v-list-item-icon><v-icon>mdi-check</v-icon></v-list-item-icon>
                          <v-list-item-title>Yes, delete</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-icon><v-icon>mdi-cancel</v-icon></v-list-item-icon>
                          <v-list-item-title>No, don't delete</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-card>
                  </v-menu>
                </div>

                <v-card-text class="music-name-section pattern-name-row song-name-row">
                  <v-text-field
                    class="music-name-field"
                    label="Song name"
                    v-model="song.name"
                    @change="handleChildChange"
                  />
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

                <v-card-text v-if="!isSongCollapsed(song)" class="music-sequence-section">
                  <div class="instruments-label-row">
                    <v-btn
                      icon
                      x-small
                      :title="isSequenceCollapsed(song) ? 'Show this song\'s sequence' : 'Hide this song\'s sequence'"
                      class="instruments-collapse-btn"
                      @click="() => toggleSequenceCollapsed(song)"
                    >
                      <v-icon small>{{ isSequenceCollapsed(song) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
                    </v-btn>
                    <div class="music-section-label">Sequence</div>
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
                          title="This chip's own position in the sequence (1 = first) - see the &quot;When sequence chip has finished playing&quot; block. Changes if you reorder, insert, or delete chips before it."
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

                  <v-card outlined v-if="activePattern(song)" class="pattern-card">
                    <v-btn
                      :title="isPatternCollapsed(song, activePattern(song)) ? 'Expand this pattern' : 'Collapse this pattern'"
                      icon
                      small
                      absolute
                      top
                      left
                      class="music-collapse-btn"
                      @click="() => togglePatternCollapsed(song, activePattern(song))"
                    >
                      <v-icon>{{ isPatternCollapsed(song, activePattern(song)) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                    </v-btn>
                    <div class="music-id-badge">ID:{{ activePattern(song).id }}</div>
                    <!-- Hidden entirely while collapsed for now - the play/export/
                    import controls shown there instead (.music-toolbar-top-right
                    right below) sit in this exact same top-right corner and
                    were overlapping this button. -->
                    <v-btn
                      v-if="song.patterns.length > 1 && !isPatternCollapsed(song, activePattern(song))"
                      icon
                      small
                      absolute
                      top
                      right
                      title="Delete this pattern"
                      class="delete-btn-inset delete-icon-btn music-icon-btn-size"
                      @click="() => handleDeletePattern(song, activePattern(song))"
                    >
                      <v-icon small>mdi-delete</v-icon>
                    </v-btn>
                    <!-- Same controls as .pattern-playback-controls further down (next
                    to the zoom controls) - duplicated, not shared, because that one
                    only exists inside .track-section, which is entirely hidden while
                    collapsed (see isPatternCollapsed) - same "expanded vs collapsed
                    gets its own copy of a control that must stay reachable either way"
                    precedent as SoundFXEditor.vue's own .soundfx-delete-section. -->
                    <div v-if="isPatternCollapsed(song, activePattern(song))" class="music-toolbar-top-right">
                      <v-btn
                        icon
                        small
                        title="Export pattern to .JSON file"
                        class="music-flat-icon-btn music-icon-btn-size"
                        @click="() => handleExportPattern(activePattern(song))"
                      >
                        <v-icon>mdi-export</v-icon>
                      </v-btn>
                      <v-btn
                        icon
                        small
                        title="Import pattern from .JSON file"
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
                        title="Stop playback"
                        class="music-flat-icon-btn music-icon-btn-size"
                        @click="handleStop"
                      >
                        <v-icon>mdi-stop</v-icon>
                      </v-btn>
                      <v-btn
                        icon
                        small
                        :title="playingPatternId === activePattern(song).id ? 'Playing...' : 'Play this pattern'"
                        :class="['music-flat-icon-btn', 'music-icon-btn-size',
                          {'music-icon-btn-active': playingPatternId === activePattern(song).id}]"
                        @click="() => handlePlayPattern(song, activePattern(song))"
                      >
                        <v-icon>{{ playingPatternId === activePattern(song).id ? 'mdi-volume-high' : 'mdi-play' }}</v-icon>
                      </v-btn>
                    </div>
                    <v-card-text class="music-name-section pattern-name-row">
                      <v-combobox
                        class="music-name-field"
                        label="Pattern name"
                        item-text="text"
                        :items="patternOptions(song)"
                        :value="patternName(song, activePatternId(song))"
                        @change="(value) => handlePatternFieldChange(song, value)"
                      />
                      <div class="pattern-actions-row">
                        <v-btn icon small title="Add pattern" @click="() => handleAddPattern(song)">
                          <v-icon small>mdi-plus</v-icon>
                        </v-btn>
                        <v-btn icon small title="Duplicate this pattern" @click="() => handleDuplicatePattern(song, activePattern(song))">
                          <v-icon small>mdi-content-duplicate</v-icon>
                        </v-btn>
                      </div>
                      <div class="pattern-length-tempo-group">
                        <v-select
                          class="steps-field"
                          label="Length (steps)"
                          :items="patternStepOptionItems"
                          v-model="activePattern(song).stepCount"
                          @change="() => handleStepCountChange(song, activePattern(song))"
                        />
                        <v-checkbox
                          class="use-song-tempo-checkbox"
                          title="Use this pattern's own tempo instead of the song's"
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

                    <v-card-text v-if="!isPatternCollapsed(song, activePattern(song))" class="track-section">
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
                            <v-btn
                              v-if="activePattern(song).tracks.length > 1"
                              icon
                              small
                              class="music-flat-icon-btn music-icon-btn-size"
                              title="Remove this instrument row"
                              @click="() => handleDeleteTrack(activePattern(song), track)"
                            >
                              <v-icon small>mdi-delete</v-icon>
                            </v-btn>
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
                          :class="{'instrument-summary-chip-active': isActiveTrack(activePattern(song), track)}"
                          title="Click to edit this instrument's notes"
                          @click="() => setActiveTrack(activePattern(song), track)"
                        >
                          {{ trackSoundEffect(track) ? (trackSoundEffect(track).name || 'Unnamed') : 'No instrument set' }}
                        </v-chip>
                      </div>

                      <v-divider v-if="activePattern(song).tracks.length" class="instruments-piano-divider"></v-divider>

                      <div class="piano-roll-zoom-row" v-if="activePattern(song).tracks.length">
                        <div class="subdivision-controls">
                          <v-btn
                            icon
                            small
                            title="Undo"
                            class="music-flat-icon-btn music-icon-btn-size"
                            :disabled="!canUndoPattern(activePattern(song))"
                            @click="() => handleUndoPattern(song, activePattern(song))"
                          >
                            <v-icon small>mdi-undo</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            title="Redo"
                            class="music-flat-icon-btn music-icon-btn-size"
                            :disabled="!canRedoPattern(activePattern(song))"
                            @click="() => handleRedoPattern(song, activePattern(song))"
                          >
                            <v-icon small>mdi-redo</v-icon>
                          </v-btn>
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
                              title="Export pattern to .JSON file"
                              class="music-flat-icon-btn music-icon-btn-size"
                              @click="() => handleExportPattern(activePattern(song))"
                            >
                              <v-icon>mdi-export</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              title="Import pattern from .JSON file"
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
                              title="Stop playback"
                              class="music-flat-icon-btn music-icon-btn-size"
                              @click="handleStop"
                            >
                              <v-icon>mdi-stop</v-icon>
                            </v-btn>
                            <v-btn
                              icon
                              small
                              :title="playingPatternId === activePattern(song).id ? 'Playing...' : 'Play this pattern'"
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
                      <div class="piano-roll-scroll" @scroll="(event) => handlePianoRollScroll(song, event)">
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
                            <div class="piano-roll-label">{{ row.label }}</div>
                            <div
                              v-for="stepIndex in maxPatternSteps"
                              v-bind:key="stepIndex"
                              class="piano-roll-cell"
                              :style="[patternCellStyle(song, activePattern(song), row, stepIndex - 1), {flex: `0 0 ${cellWidthPx()}px`}]"
                              :class="patternCellClasses(activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)))"
                              :title="patternCellTitle(activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)))"
                              @click="(event) => handlePatternCellClick(song, activePattern(song), row, stepIndex - 1, stepsFor(activePattern(song)), event)"
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

                      <div class="piano-roll-volume-scroll">
                        <div class="piano-roll-row piano-roll-volume-row">
                          <div class="piano-roll-label piano-roll-volume-label">Vol</div>
                          <div
                            v-for="stepIndex in maxPatternSteps"
                            v-bind:key="stepIndex"
                            class="piano-roll-volume-cell"
                            :class="{'piano-roll-volume-cell-continuation':
                              volumeCellIsContinuation(activePattern(song), stepIndex - 1)}"
                            :style="{flex: `0 0 ${cellWidthPx()}px`}"
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
                              :title="'Drag to change this note\'s own volume (' +
                                noteVolumePercent(note, activePattern(song)) +
                                '% of the instrument\'s own base volume, for just this note)'"
                            >
                              <div
                                class="piano-roll-volume-handle"
                                @mousedown="(event) => handleVolumeBarPointerDown(note, activePattern(song), event)"
                              />
                              <span
                                v-if="noteStartStep(note) === stepIndex - 1"
                                class="piano-roll-volume-value"
                              >{{ noteVolumePercent(note, activePattern(song)) }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-song-button"
      color="primary"
      title="Add song"
      dark
      absolute
      right
      fab
      @click="handleAddSong"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {
  computed, defineComponent, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch,
} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useMusicEditorActiveState} from '../hooks/music-editor-state';
import {useDimSoundFxPercentStorage, useDimSoundFxStorage, useSongsStorage,
  useSoundEffectsStorage, loadMutedMusicTrackIds, loadSoloedMusicTrackIds, MUTED_MUSIC_TRACKS_KEY,
  SOLOED_MUSIC_TRACKS_KEY, isMusicTrackMuted} from '../hooks/project';
import {
  clampTempo, DEFAULT_PATTERN_STEPS, DEFAULT_SONGS, DEFAULT_TEMPO, DURATION_SUBDIVISION_OPTIONS,
  LENGTH_UNITS_PER_STEP, MAX_PATTERN_STEPS, MAX_TEMPO, MIN_TEMPO, normalizeSequenceGroups, PATTERN_STEP_OPTIONS,
  processSongsStorageDefaults,
} from '../blocks/music';
import {processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT} from '../generators/bbasic/soundfx';
import {CHANNEL_OPTIONS} from '../blocks/sound';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {audcHasTunableNotes, audfByMidiForAudc, CANONICAL_NOTE_ROWS, noteAudv} from '../utils/music-notes';
import {effectiveTempo, getPlaybackHead, playPattern, playSequence, previewPatternNote, setTrackMuted,
  stopPatternPlayback} from '../utils/music-playback';
import {autoInstrumentColor, instrumentColorFor, isLightColor,
  mixColorWithWhite, mixColorWithTransparent} from '../utils/instrument-colors';

// The piano roll's own zoom range (25%-1600%) goes well past the shared
// hooks/zoom.js's own discrete ZOOM_LEVELS (used by the sprite/background/
// score editors, capped at 400%) - a plain continuous slider here instead,
// stored separately so it doesn't disturb those editors' own zoom levels.
const PIANO_ROLL_ZOOM_KEY = 'vcs-game-maker.zoom.music-piano-roll';
const clampPianoRollZoom = (value) => (Number.isFinite(value) ? Math.min(16, Math.max(0.25, value)) : 1);

// Which instrument rows are muted/soloed for pattern/song preview playback -
// a view preference (see mutedTrackIds/soloedTrackIds below), but one that
// should survive navigating away to another tab and back, not just reset
// silently. Loading/keys/the effective-mute formula (isTrackMuted below)
// now live in hooks/project.js, shared with generators/bbasic/music.js so
// the compiled ROM honors the exact same mute/solo state as this tab's own
// preview - see isMusicTrackMuted's own comment there.

// The only "row" an untunable instrument (see utils/music-notes.js) ever
// gets - it has no clean pitch to offer a real piano roll for, just an
// on/off hit per note event.
const HIT_ROW = [{midi: 'hit', label: 'Hit'}];

// The piano roll only zooms horizontally (steps get wider) - there's no
// vertical zoom, so this is the step width at 100% zoom; multiply by the
// current zoom factor (see pianoRollZoom below) to get the actual width.
const PIANO_ROLL_CELL_WIDTH_BASE = 28;
// Matches .piano-roll-label-spacer/.piano-roll-label's own flex-basis -
// the row-label column's width doesn't scale with zoom, so it has to be
// subtracted before dividing the remaining space among this pattern's own
// steps (see handleFitZoom).
const PIANO_ROLL_LABEL_WIDTH = 44;

// Every new instrument row defaults to channel 0 - TIA only has 2 real
// hardware sound channels, and a row plays fine on its own without the user
// having to pick a channel first; they can still switch a row to channel 1
// via its own Channel dropdown once they actually want two playing at once.
const emptyTrack = (id, soundEffectId, channel = 0) => ({
  id,
  soundEffectId,
  channel,
  notes: [],
});

export default defineComponent({
  setup() {
    const songsStorage = useSongsStorage();
    const soundEffectsStorage = useSoundEffectsStorage();
    // Same shared app-wide storage keys as SoundFXEditor.vue's own identical
    // dimSoundFx/dimSoundFxPercent pair (see useDimSoundFxStorage's own
    // comment in hooks/project.js - a standing app preference, not part of
    // this project's own saved configuration) - deliberately not scoped to
    // this tab, so toggling/adjusting either one here or on the Sound tab
    // updates the exact same underlying value both read from, no separate
    // sync logic needed. Music's own note volumes already read these same
    // two keys (see generators/bbasic/music.js's own buildMusicPlayResetBody/
    // flattenPatternEvents), so this UI is the only piece that was actually
    // missing.
    const dimSoundFx = useDimSoundFxStorage();
    const dimSoundFxPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT);
    // The slider's own visible thumb position/percentage - deliberately NOT
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
    // Sound tab's own identical slider, since both read/write the same
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

    // A fixed multiplicative step (not a fixed percentage-point step, the
    // way hooks/zoom.js's own discrete ZOOM_LEVELS effectively are) - this
    // slider's own range (25%-1600%, a 64x span, see clampPianoRollZoom)
    // is far too wide for a flat +25-point step to feel usable at either
    // end: fine-grained down near 25%, but would take dozens of clicks to
    // reach 1600%. Clamped by pianoRollZoom's own setter above either way.
    const stepPianoRollZoom = (direction) => {
      pianoRollZoom.value = direction > 0 ? pianoRollZoom.value * 1.25 : pianoRollZoom.value / 1.25;
    };
    // The step width 100% zoom itself means - always recalibrated (see
    // recalculateFitBaseWidth) to whatever width makes the CURRENT pattern's
    // own steps exactly fill the visible area, so 100% always reads as "fit
    // to this pattern's Length" rather than some arbitrary fixed pixel size
    // - the slider still zooms in/out relative to that baseline exactly like
    // it would against a fixed one. Starts at the plain default
    // (PIANO_ROLL_CELL_WIDTH_BASE) before the first measurement lands.
    const pianoRollBaseWidth = ref(PIANO_ROLL_CELL_WIDTH_BASE);
    const cellWidthPx = () => pianoRollBaseWidth.value * pianoRollZoom.value;

    // Finds this song's own piano-roll-scroll via its data-song-id (see the
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

    // Keeps the volume row's own horizontal position matching the main
    // grid's - they're two separate scrollable elements now (see the
    // template's own .piano-roll-scroll/.piano-roll-volume-scroll split),
    // not one shared scroll container, specifically so the grid's own
    // native scrollbar renders at ITS OWN bottom edge (right above the
    // volume row) instead of below everything, including the volume row
    // itself. Same data-song-id lookup technique as
    // recalculateFitBaseWidth above, for the same reason (a v-for'd
    // template ref isn't reliable here). The volume strip's own
    // overflow is hidden (see its own CSS), not auto/scroll - it never
    // shows its own scrollbar or accepts direct dragging, purely mirrors
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
    // on) the separate Sound tab, whose own edits go through the exact same
    // "mutate in place, then reassign the same object reference" pattern as
    // this file's own handleChildChange - a computed() here would go stale
    // the moment the Sound tab changed anything, since Vue's ref reactivity
    // skips notifying dependents when a ref is set to a value that's
    // reference-equal to what it already held.
    const soundEffects = () => {
      try {
        return processSoundEffectsStorageDefaults(soundEffectsStorage).soundEffects;
      } catch (e) {
        console.error('Error loading sound effects from local storage', e);
        return [];
      }
    };

    const soundEffectOptions = () => soundEffects().map(
        (soundEffect) => ({text: soundEffect.name || `Unnamed ${soundEffect.id}`, value: soundEffect.id}));

    const handleChildChange = () => {
      state.value = state.value;
    };

    // Undo/redo for the pattern editor - one stack pair per pattern id
    // (patternUndoStacks/patternRedoStacks, reactive so the toolbar buttons'
    // own disabled state updates), storing plain-JSON snapshots of just the
    // fields a pattern edit can actually touch (name/tempo/useOwnTempo/
    // stepCount/loop/tracks - the same shape handleExportPattern already
    // treats as "this pattern's own content"), never its id. patternLastSnapshot
    // is a plain (non-reactive) module-level cache, not project data itself -
    // just this file's own bookkeeping for detecting "did this pattern
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
    // need this same seeding - its own first watcher fire already IS its
    // true baseline, nothing existed before it to lose.
    state.value.songs.forEach((song) => song.patterns.forEach((pattern) => {
      patternLastSnapshot[pattern.id] = snapshotPattern(pattern);
    }));

    // Debounced (not one push per keystroke/drag-frame): a fast gesture like
    // dragging a note's resize handle or typing a pattern name fires this
    // watcher many times a second, and coalescing those into one undo step
    // per PAUSE in editing (not one per underlying mutation) matches how a
    // typical undo history actually reads to a user - see stopResize's own
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
    const handleUndoPattern = (song, pattern) => {
      const stack = patternUndoStacks.value[pattern.id] || [];
      if (!stack.length) return;
      const redoStack = patternRedoStacks.value[pattern.id] || [];
      patternRedoStacks.value = {...patternRedoStacks.value, [pattern.id]: [...redoStack, snapshotPattern(pattern)]};
      patternUndoStacks.value = {...patternUndoStacks.value, [pattern.id]: stack.slice(0, -1)};
      applyPatternSnapshot(pattern, stack[stack.length - 1]);
      recalculateFitBaseWidth(song, pattern);
      handleChildChange();
      forceUpdate();
    };
    const handleRedoPattern = (song, pattern) => {
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

    // The Tempo (BPM) field's own min/max HTML attributes alone don't
    // actually stop a value typed outside that range from being applied
    // (they only affect the spin-button arrows and the input's own
    // :invalid styling, not v-model) - this is what actually enforces it,
    // called from both the song- and pattern-level Tempo fields' own
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
    // stored per pattern - see its own migration comment in blocks/music.js
    // for why (switching which pattern is active, e.g. clicking a Sequence
    // chip, used to silently carry over whatever THAT pattern's own stored
    // loop flag happened to be). Plain assignment (not $set) is safe here -
    // processSongsStorageDefaults' own migration guarantees
    // song.patternPreviewLoop already exists as a real boolean on every song
    // by the time this can run, unlike song.loop when THAT field was new.
    const handleToggleLoopPattern = (song) => {
      song.patternPreviewLoop = !song.patternPreviewLoop;
      handleChildChange();
    };

    const {isCollapsed: isSongCollapsed, toggleCollapsed: toggleSongCollapsed} = useCollapsedIds('music-song');

    // Pattern ids are only unique WITHIN their own song (see
    // handleAddPattern/handleDuplicatePattern), not globally, unlike
    // song.id/soundEffect.id elsewhere - useCollapsedIds keys purely off
    // entry.id, so a plain pattern object would collide between two
    // different songs' own "Pattern 1". A synthetic {id: "songId:patternId"}
    // entry (see patternCollapseEntry) disambiguates that without needing
    // to change useCollapsedIds itself. Two independent collapse states
    // share this same keying: the whole pattern sub-card (collapsing hides
    // everything below the Pattern name/Length/Tempo row - instruments,
    // piano roll, zoom/playback controls, all of it), and, nested one level
    // in, just the Instruments list on its own (collapsing that alone still
    // leaves the piano roll and zoom/playback controls visible).
    const patternCollapseEntry = (song, pattern) => ({id: `${song.id}:${pattern.id}`});
    const {isCollapsed: isPatternCollapsedRaw, toggleCollapsed: togglePatternCollapsedRaw} =
      useCollapsedIds('music-pattern');
    const isPatternCollapsed = (song, pattern) => isPatternCollapsedRaw(patternCollapseEntry(song, pattern));
    const togglePatternCollapsed = (song, pattern) => togglePatternCollapsedRaw(patternCollapseEntry(song, pattern));
    // Keyed by song alone (not song+pattern like patternCollapseEntry above)
    // - one shared expanded/collapsed state for the whole song's Instruments
    // section, not a separate one remembered per pattern. song.id is
    // already globally unique (see toggleSequenceCollapsed's own comment
    // just below), so no synthetic compound entry is needed here either.
    const {isCollapsed: isInstrumentsCollapsedRaw, toggleCollapsed: toggleInstrumentsCollapsedRaw} =
      useCollapsedIds('music-instruments');
    const isInstrumentsCollapsed = (song) => isInstrumentsCollapsedRaw(song);
    const toggleInstrumentsCollapsed = (song) => toggleInstrumentsCollapsedRaw(song);

    // Same idea, one level up - the whole Sequence (play order) row (every
    // chip, plus the "Add pattern to sequence" select) collapsed away to
    // just its own label. song.id is already globally unique (unlike
    // pattern.id - see patternCollapseEntry's own comment), so this can
    // key off the song object directly instead of needing a synthetic
    // compound entry.
    const {isCollapsed: isSequenceCollapsed, toggleCollapsed: toggleSequenceCollapsed} =
      useCollapsedIds('music-sequence');

    // Card reordering (see hooks/drag-reorder.js and TextEditor.vue/
    // SoundFXEditor.vue's own uses of this same hook) - songs are already
    // referenced everywhere by their own permanent id (see findSongById/
    // buildSongOptions in blocks/music.js), never by array position, so
    // reordering the display order here is already safe.
    const {dragAttrs, dragCardClass: rawDragCardClass, dragHandleListeners,
      dragTargetListeners: rawDragTargetListeners} = useDragReorder(
        () => state.value.songs,
        (items) => {
          state.value.songs = items;
          handleChildChange();
        },
    );

    // Suppresses the song card's own drag-over highlight/drop handling
    // while a SEQUENCE CHIP (not a song card) is what's actually being
    // dragged (see draggedSequenceStep below, and sequenceChipListeners'
    // own comment on stopPropagation) - stopPropagation alone only stops a
    // chip drag's own events from bubbling INTO the card once they've
    // already fired on the chip, but dragover also fires directly on the
    // card itself whenever the pointer is over the card's own body (e.g.
    // the gap around a chip), which was never routed through the chip's
    // handlers to begin with, so nothing to stop propagation on - the
    // card lit up its own "drop a song here" border simply because the
    // browser doesn't know or care that some OTHER drag is in progress; it
    // reacts to any drag hovering over it. Checked at call time (not
    // memoized) so it always reflects whichever drag (song or chip, if
    // either) is currently active.
    const dragCardClass = (index) => (draggedSequenceStep.value ? {} : rawDragCardClass(index));
    // Wraps each individual handler (not just conditionally swapping the
    // WHOLE listeners object the way dragCardClass above does) so the real
    // guard check happens synchronously at the moment an event actually
    // fires, not only after Vue's own (batched, async) re-render has had a
    // chance to re-evaluate this v-on binding with the swapped-in {}
    // object. Confirmed directly as a real bug with the swap-the-whole-
    // object approach alone: dragstart sets draggedSequenceStep
    // synchronously, but the browser can still dispatch a dragover (or
    // even drop) on the song card BEFORE Vue's next tick actually detaches
    // its old listeners, since HTML5 drag events aren't batched the way
    // Vue's own reactivity is - letting the song card's own reorder
    // highlight/drop briefly fire mid-chip-drag despite this guard. A
    // plain ref read inside each wrapped handler has no such delay.
    const dragTargetListeners = (index) => {
      const raw = rawDragTargetListeners(index);
      const guarded = {};
      Object.keys(raw).forEach((eventName) => {
        guarded[eventName] = (event) => {
          if (draggedSequenceStep.value) return;
          raw[eventName](event);
        };
      });
      return guarded;
    };

    const instance = getCurrentInstance();
    const forceUpdate = () => instance.proxy.$forceUpdate();

    // Plain assignment (song.loop = ...) doesn't work for a song saved
    // before this field existed - Vue 2 can't detect a brand new property
    // being added to an already-reactive object that way (see
    // processSongsStorageDefaults' own migration in blocks/music.js, which
    // is where such a song's song.loop first gets set), so the toggle
    // button's own icon/active-state bindings never re-evaluate. $set (same
    // fix DataEditor.vue's handleColumnsInput/handleColumnsChange use) plus
    // forceUpdate is what actually makes the change visible immediately -
    // confirmed directly as the cause of "can't toggle song preview
    // looping." handleToggleLoopPattern right above doesn't need this same
    // fix even though song.patternPreviewLoop is also a migrated field:
    // processSongsStorageDefaults' own migration guarantees it already
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

    // Whether the "Note duration snap" dropdown's own value is actually
    // applied right now - a page-local UI preference (not project data,
    // same as autoFollowPlayback), separate from state.subdivision itself
    // so toggling this off and back on always restores exactly whatever
    // slice count was last selected, rather than the dropdown's own value
    // having to change (e.g. to 1) to temporarily get unsnapped placement.
    const snapEnabled = ref(true);
    const handleToggleSnap = () => {
      snapEnabled.value = !snapEnabled.value;
      forceUpdate();
    };
    // The slice count actually in effect for note placement/resizing and
    // the grid lines that reflect it - the dropdown's own value when snap
    // is on, or 1 (the whole step, i.e. no sub-step snapping at all) when
    // it's off. Every place that used to read state.value.subdivision
    // directly reads this instead, so flipping the toggle takes effect
    // everywhere at once without touching the stored dropdown value.
    const effectiveSubdivision = () => (snapEnabled.value ? Math.max(1, Math.round(state.value.subdivision || 1)) : 1);

    // Which pattern is shown in each song's single pattern editor - a view
    // preference, not project data, so it isn't stored alongside the song
    // itself (same reasoning as hooks/collapse.js's collapsed-card state).
    // Backed by useMusicEditorActiveState's own module-level ref (persisted
    // to localStorage) rather than a plain local ref, so it survives Vue
    // Router destroying and recreating this component when the user leaves
    // and returns to the Music tab.
    const {activePatternIdsRef, activeTrackIdsRef, setActivePatternId, setActiveTrackId} =
      useMusicEditorActiveState();
    const activePatternId = (song) =>
      activePatternIdsRef.value[song.id] || (song.patterns[0] && song.patterns[0].id);
    const setActivePattern = (song, patternId) => {
      // Captured before switching: the instrument (soundEffectId) the
      // OUTGOING pattern currently has active. Track ids are only unique
      // WITHIN a pattern (see hiddenTrackKey's own comment), so the
      // per-pattern activeTrackIdsRef entry below can't carry "the same
      // instrument" across patterns on its own - matching by soundEffectId
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
      if (pattern) recalculateFitBaseWidth(song, pattern);
      if (pattern && previousSoundEffectId != null) {
        const matchingTrack = pattern.tracks
            .find((track) => track.soundEffectId === previousSoundEffectId);
        if (matchingTrack) setActiveTrack(pattern, matchingTrack);
      }
      if (pattern && shouldFollowPlayback) handlePlayPattern(song, pattern);
      // Switching patterns can swap in a whole new set of tracks whose own
      // v-selects (Channel, Instrument) Vue's own v-for keying (by
      // track.id) may reuse the SAME DOM node for, if the new pattern
      // happens to have a track sharing that id with the old one's (e.g.
      // both patterns' first track is id 1) - a plain reactive update
      // alone left a reused select showing the PREVIOUS pattern's own
      // value rather than the new track's, same class of stale-Vuetify-
      // select bug as the Sound tab's own Frequency field and this same
      // Channel field's own default-value display, both already fixed the
      // same way. Bare forceUpdate() (not handleChildChange - no project
      // data actually changed here, just which pattern is being viewed).
      forceUpdate();
    };
    const activePattern = (song) =>
      song.patterns.find(({id}) => id === activePatternId(song)) || song.patterns[0];

    // Combined "Editing pattern"/"Pattern name" field (see the template's
    // own v-combobox) - picking an EXISTING pattern from its dropdown
    // switches which one is active, exactly like the old separate
    // "Editing pattern" select did; typing something that doesn't match
    // any OTHER existing pattern's own name instead renames whichever
    // pattern is CURRENTLY active, exactly like the old separate
    // "Pattern name" field did. Both cases arrive here as a plain string
    // (v-combobox's own model is the display text itself, not a
    // patternId - unlike v-select, it doesn't do an item-value lookup for
    // an externally-set :value, so binding this to an id the way the old
    // "Editing pattern" select could just showed the raw id number
    // instead of the pattern's own name - confirmed directly), so which
    // case this is has to be told apart by matching that text against
    // every OTHER pattern's own name instead.
    const handlePatternFieldChange = (song, text) => {
      // v-combobox's own @change can hand back the raw {text, value} ITEM
      // object instead of a plain string - happens whenever the typed text
      // lands on an existing option (item-text is set here, but no
      // item-value, so nothing tells it to collapse a selected item down to
      // a primitive) - confirmed directly as a real bug: renaming silently
      // did nothing (the typeof guard below bounced the object straight
      // back out) while the input's own leftover typed text stayed
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
      // Starts collapsed rather than the default expanded state new ids
      // otherwise get (see isSongCollapsed/hooks/collapse.js) - a fresh song
      // is just an empty pattern until it's actually built out, so leaving
      // it expanded only pushes every other song card further down the page
      // for no reason yet.
      toggleSongCollapsed(newSong);
      handleChildChange();
      forceUpdate();
      // pianoRollBaseWidth/pianoRollZoom are shared across every song (not
      // per-song state), so a freshly added song otherwise just inherits
      // whatever was left over from the last song/pattern edited, rather
      // than a real 100% fit to its OWN piano-roll-scroll width - the same
      // gap handleFitZoom's own button fixes for an EXISTING pattern.
      // nextTick is required here (unlike handleFitZoom's other callers,
      // which all recalculate against an already-rendered container) since
      // this new song's own .piano-roll-scroll element doesn't exist in
      // the DOM yet at this point - recalculateFitBaseWidth's own
      // querySelector would find nothing and silently fall back to the
      // unmeasured default width instead.
      nextTick(() => handleFitZoom(newSong, newSong.patterns[0]));
    };

    const handleDeleteSong = (song) => {
      state.value.songs = state.value.songs.filter(({id}) => id != song.id);
      handleChildChange();
      forceUpdate();
    };

    // Song data (name/tempo/loop/patterns/sequence) as a standalone .json
    // file, for sharing a song between projects or keeping an external
    // backup - the song's own id isn't included (see handleImportSong,
    // which keeps the IMPORTING song's id rather than the file's), since
    // ids are only meaningful within a single project's own storage. Also
    // bundles every Sound tab instrument any of this song's tracks
    // actually points at (see soundEffectIdsUsedBySong/handleImportSong's
    // own importSoundEffects) - without this, a song exported and opened
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
      saveAs(blob, `Song_${filename}-${getDateInfix()}.json`);
    };

    // Adds whichever of an imported song's own bundled instruments (see
    // handleExportSong above) aren't already covered by an EXISTING Sound
    // tab card of the same name - matched by name rather than by the
    // file's own id, since that id only ever meant something in the
    // project the song was originally exported from, and could collide
    // with an unrelated instrument already sitting at that same id here.
    // A name match instead means re-importing a song into the SAME
    // project (or one that already has that instrument, e.g. from a
    // previous import) reuses the existing card instead of piling up
    // duplicates. Returns oldId -> newId (or reused existing id), for
    // handleImportSong to rewrite the incoming patterns' own track.
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

    // Overwrites this song card's own data with a previously exported .json
    // file's contents - keeps this song's own id (see handleExportSong)
    // untouched so every music_play_song/music_song_stopped block already
    // pointing at this card keeps working, exactly like handleImportCsv in
    // DataEditor.vue keeps a data table's own id on import.
    const handleImportSong = (song) => {
      openFileDialog('.json,application/json')
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
            // Normalized the same way a stored project's own sequence is
            // (see processSongsStorageDefaults in blocks/music.js) - an
            // OLDER exported song .json file (from before repeat groups
            // existed) would otherwise still have its own sequence as a
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

    // Same bundled-instruments reasoning as soundEffectIdsUsedBySong above,
    // just scoped to one pattern's own tracks instead of every pattern in
    // a whole song.
    const soundEffectIdsUsedByPattern = (pattern) => {
      const ids = new Set();
      (pattern.tracks || []).forEach((track) => {
        if (track.soundEffectId != null) ids.add(String(track.soundEffectId));
      });
      return ids;
    };

    // Same shape/reasoning as handleExportSong above, one level down - a
    // single pattern (with its own bundled instruments) as a standalone
    // .json file, for reusing one pattern across songs/projects without
    // dragging the whole song along with it.
    const handleExportPattern = (pattern) => {
      const usedIds = soundEffectIdsUsedByPattern(pattern);
      const usedSoundEffects = soundEffects().filter(({id}) => usedIds.has(String(id)));
      // eslint-disable-next-line no-unused-vars
      const {id, ...patternData} = pattern;
      const exportData = {...patternData, soundEffects: usedSoundEffects};
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
      const filename = (pattern.name || `pattern-${pattern.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `${filename}-${getDateInfix()}.json`);
    };

    // Overwrites this pattern's own data with a previously exported .json
    // file's contents - keeps this pattern's own id (see
    // handleExportPattern) untouched so the song's own Sequence list
    // (which references patterns by id, not position - see
    // handleAddSequenceStep) keeps pointing at the same slot. Reuses
    // importSoundEffects (see handleImportSong above) for the same
    // name-matched instrument reuse/creation.
    const handleImportPattern = (song, pattern) => {
      openFileDialog('.json,application/json')
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
      const maxUnits = pattern.stepCount * LENGTH_UNITS_PER_STEP;
      pattern.tracks.forEach((track) => {
        track.notes = track.notes
            .filter((note) => note.step < maxUnits)
            .map((note) => ({...note, length: Math.min(note.length, maxUnits - note.step)}));
      });
      recalculateFitBaseWidth(song, pattern);
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
    };

    // Which instrument rows' notes are hidden from the shared piano roll - a
    // view preference (not project data), purely visual: hiding a track
    // doesn't change monophonic/channel blocking or anything else about it,
    // just whether its own note bars are drawn. Keyed by pattern id (not
    // just track id) since track ids are only unique WITHIN a pattern, not
    // globally - two different patterns can each have their own "track 1".
    const hiddenTrackIds = ref({});
    const hiddenTrackKey = (pattern, track) => `${pattern.id}:${track.id}`;
    const isTrackHidden = (pattern, track) => !!hiddenTrackIds.value[hiddenTrackKey(pattern, track)];
    const handleToggleTrackVisibility = (pattern, track) => {
      const key = hiddenTrackKey(pattern, track);
      hiddenTrackIds.value = {...hiddenTrackIds.value, [key]: !hiddenTrackIds.value[key]};
    };

    // Which instrument rows are explicitly silenced during pattern/song
    // preview playback - same "view preference, not project data" shape as
    // hiddenTrackIds above, just for audio instead of the piano roll's own
    // display (doesn't touch the compiled ROM at all - that has no concept
    // of muting, only the Music tab's own browser preview does). This is
    // only HALF of a track's own effective muted state now - see
    // isTrackMuted below, which also factors in soloedTrackIds.
    //
    // Keyed by SONG id + track id (not pattern id like hiddenTrackIds
    // above) - a single mute/solo toggle is meant to apply across every
    // pattern in the song at once (e.g. muting "track 1" mutes that same
    // instrument slot in every one of the song's patterns), not just the
    // one pattern whose button was clicked. This relies on track ids being
    // assigned consistently pattern-to-pattern within a song (see
    // handleAddTrack - each pattern's own tracks are numbered 1, 2, ... in
    // the order they were added), the same assumption the rest of the app
    // already leans on for a song's patterns to read as "the same
    // instruments, different notes."
    const mutedTrackIds = ref(loadMutedMusicTrackIds());
    const mutedTrackKey = (song, track) => `${song.id}:${track.id}`;
    const explicitlyMutedTrack = (song, track) => !!mutedTrackIds.value[mutedTrackKey(song, track)];

    // Which instrument rows are soloed - see isMusicTrackMuted's own
    // comment (hooks/project.js) for why this is a separate set from
    // mutedTrackIds rather than folded into it. Song-scoped for the same
    // reason as mutedTrackIds above.
    const soloedTrackIds = ref(loadSoloedMusicTrackIds());
    const soloedTrackKey = (song, track) => `${song.id}:${track.id}`;
    const isTrackSoloed = (song, track) => !!soloedTrackIds.value[soloedTrackKey(song, track)];

    // A track's REAL, effective muted state, used everywhere actual
    // playback/note-color decisions are made (schedulePattern's own
    // isTrackMuted callback in utils/music-playback.js, patternCellStyle's
    // note-dimming) - see isMusicTrackMuted in hooks/project.js (shared with
    // the ROM generator, so the compiled output honors the exact same
    // mute/solo state as this tab's own preview) for the actual solo-
    // overrides-mute formula.
    const isTrackMuted = (song, pattern, track) =>
      isMusicTrackMuted(mutedTrackIds.value, soloedTrackIds.value, song, pattern, track);

    // Re-applies every track's own EFFECTIVE muted state (see isTrackMuted)
    // to whatever's currently playing, not just the next pattern/song play
    // - see setTrackMuted's own comment. Needed on any mute OR solo toggle,
    // for every track in the pattern (not just the one just clicked) since
    // toggling solo on one track changes every other track's own effective
    // state too. Only reaches the pattern whose own button was clicked
    // (same pre-existing limitation as before this became song-scoped) -
    // if a DIFFERENT pattern in the same song happens to be mid-playback
    // right now (e.g. as part of a playing Sequence), its own live audio
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
    // different pattern) without touching the target's own instrument/
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
    // fresh Add adds to the LAST group's own count instead of always
    // pushing a new one whenever it already matches, so repeatedly picking
    // the same pattern from the dropdown behaves the same as dragging the
    // resize handle would.
    // A chip's own "id" IS its current 1-based position in song.sequence -
    // not a separate, permanent identity tracked alongside position (an
    // earlier version of this kept the two as distinct values, one stable
    // across reordering and one just for display - reverted at the user's
    // own explicit request in favor of a single number that always means
    // "position right now"). Called after every mutation that can change
    // ANY chip's own position (add, remove, reorder) so id never drifts out
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

    // Roughly one chip's own width in px - drags are snapped to whole
    // multiples of this (see handleSequenceResizeStart), matching the
    // "1x long, 2x long, 3x long" whole-repeat-only requirement rather
    // than free-form pixel widths that wouldn't map onto a real repeat
    // count at all.
    const SEQUENCE_CHIP_UNIT_WIDTH = 64;

    // {songId, groupId, startCount, previewCount} of whichever chip is
    // currently being resize-dragged, or null - previewCount is the LIVE
    // (not yet committed) repeat count while dragging, read by
    // sequenceGroupPreviewCount/sequenceGroupChipStyle below so the chip's
    // own label/width visibly track the drag before it's released; the
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
    // A lighter tint of the chip's own color (see patternSequenceColor),
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
    // semantics. preventDefault on mousedown (and the handle's own
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

    // Drag-and-drop reordering for one song's own Sequence chips - not built
    // on hooks/drag-reorder.js's own useDragReorder, since that hook's
    // draggedIndex/dragOverIndex refs assume exactly one reorderable list
    // exists at a time. Every song on this tab has its OWN independent
    // sequence, so the dragged/drag-over state here is keyed by song id as
    // well as index, to keep dragging a chip in one song's sequence from
    // being misread as a drag-over hit in a different song's identically-
    // indexed chip. The whole chip is the drag handle (not a separate strip
    // like .song-drag-handle) since, unlike a song/pattern card, a chip has
    // no text field or other free-form click-and-drag-to-select content for
    // `draggable` to conflict with.
    const draggedSequenceStep = ref(null);
    // {songId, groupId, side} - groupId identifies which Sequence group
    // (see blocks/music.js's own {id, patternId, count} shape) is being
    // dragged toward, side is 'before' or 'after', which HALF of that chip
    // the pointer is currently over (see dragOverSideFor below) - a chip
    // being dragged toward doesn't just mean "insert before it" the way a
    // single-index version would always draw its highlight; a chip dragged
    // to a position AFTER a target needs the highlight (and the actual drop) to
    // land on that target's own right side, not its left.
    const dragOverSequenceStep = ref(null);
    const isSequenceStepDragging = (song, group) =>
      !!draggedSequenceStep.value &&
      draggedSequenceStep.value.songId === song.id && draggedSequenceStep.value.groupId === group.id;
    const isSequenceStepDragOver = (song, group) =>
      !!dragOverSequenceStep.value &&
      dragOverSequenceStep.value.songId === song.id && dragOverSequenceStep.value.groupId === group.id &&
      !isSequenceStepDragging(song, group);
    // Which side of this chip's own highlight to show, for the template's
    // :class binding - null when this chip isn't the current drag-over
    // target at all (see isSequenceStepDragOver above, which this reuses
    // so the two never disagree).
    const sequenceDragOverSide = (song, group) =>
      isSequenceStepDragOver(song, group) ? dragOverSequenceStep.value.side : null;
    // Left half of the chip's own bounding box means "insert before it",
    // right half means "insert after it" - the same halfway-point
    // convention most drag-reorder UIs use (e.g. a Kanban board's own
    // card-drop indicator), so the highlight always lands on whichever
    // side the pointer is actually closer to instead of unconditionally
    // always showing "before".
    const dragOverSideFor = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    };
    // Dragging a chip moves its own group object within song.sequence - a
    // repeated chip (count > 1) is still just ONE array entry (see
    // blocks/music.js's own {id, patternId, count} shape), so this is a
    // plain single-item move, same as before repeat groups existed.
    const sequenceChipListeners = (song, group) => ({
      dragstart: (event) => {
        // Stops this drag from ALSO being seen by the song card's own
        // dragTargetListeners (see useDragReorder(state.value.songs, ...)
        // above) - that hook's dragover/dragleave/drop are bound to the
        // whole .song-card, which every sequence chip sits inside, so
        // without this every one of these events would bubble straight
        // into it: the card wrongly showed its own "drag a song here"
        // border-top highlight while dragging a chip, since it has no way
        // to tell a bubbled chip-drag apart from an actual song-card drag.
        event.stopPropagation();
        draggedSequenceStep.value = {songId: song.id, groupId: group.id};
        event.dataTransfer.effectAllowed = 'move';
        // Same Firefox requirement as hooks/drag-reorder.js's own
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
        // A chip's own child elements (its label, the close icon) are
        // still part of this same wrap div visually, but the browser
        // fires dragleave/dragenter at every element boundary crossing,
        // including moving from the wrap onto one of its own children -
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
        // Computed fresh off the actual drop event's own pointer position
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
        // (pre-removal) array's own indices: right before the target for
        // 'before', right after it for 'after'. Removing the dragged chip
        // first shifts every index after its own OLD position left by
        // one, so that has to be corrected for before this target
        // position is actually used to splice it back in - see
        // dragOverSideFor's own comment for why "before/after a target"
        // is tracked at all instead of always inserting before it.
        let insertAt = side === 'after' ? targetIndex + 1 : targetIndex;
        if (fromIndex < insertAt) insertAt--;
        if (insertAt === fromIndex) return;
        const [moved] = sequence.splice(fromIndex, 1);
        sequence.splice(insertAt, 0, moved);
        song.sequence = sequence;
        renumberSequenceIds(song);
        handleChildChange();
        forceUpdate();
      },
    });

    // Only one of a pattern or a song's full sequence can be playing at a
    // time (they share the same underlying audio engine - see
    // utils/music-playback.js), so starting either one clears the other.
    const playingPatternId = ref(null);
    const playingSongId = ref(null);

    // {patternId, elapsedUnits} of whatever's currently playing (either a
    // single pattern or one step of a song's sequence), or null - drives the
    // piano roll's own moving playhead (see patternCellStyle) and the
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
    const startPlaybackHeadPolling = () => {
      const tick = () => {
        playbackHead.value = getPlaybackHead();
        playbackHeadFrame = window.requestAnimationFrame(tick);
      };
      if (playbackHeadFrame == null) tick();
    };
    onBeforeUnmount(stopPlaybackHeadPolling);

    // Toggle for the auto-follow watcher just below - a page-local UI
    // preference (not persisted project data, same reasoning/mechanism as
    // ActionEditor.vue's own gridSnapEnabled), since this only affects what
    // you're LOOKING at while a song plays, never the song itself. Defaults
    // off - the icon (see the template, in the song toolbar next to the
    // Stop/Play buttons) turns it on for whoever wants the piano roll to
    // follow along automatically instead of staying on whichever pattern
    // they had open.
    const autoFollowPlayback = ref(false);

    // Makes the viewed/edited pattern follow a SONG's own playback as its
    // sequence advances from one pattern to the next - without this, the
    // piano roll (and everything scoped to activePattern, including the
    // per-sound-type valid-note graying out in patternCellClasses) stayed
    // frozen on whichever pattern was selected when Play was clicked, never
    // showing the instruments/notes actually sounding a moment later. Only
    // acts on the patternId actually changing (not every playbackHead tick,
    // which fires every animation frame) and only while a SONG (not a lone
    // pattern) is playing - setActivePattern's own shouldFollowPlayback
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
        // own comment).
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

    // Clicking the piano roll's own step ruler (see the template) always
    // arms that position as where Play will start from next (see
    // handlePlayPattern's own default, and patternDisplayedHead, which shows
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
    // hover affordance (see patternDisplayedHead's own ARMED/live pair for
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

    // A sequence chip's own click does two things while the song's own
    // sequence is mid-playback: JUMPS playback there (restarting
    // handlePlaySong at that step, the same "click seeks" affordance the
    // piano roll's own step ruler already gives a single playing pattern -
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

    // Whether THIS specific sequence GROUP (see blocks/music.js's own
    // {id, patternId, count} shape - one chip, possibly repeating count > 1
    // times in a row) is the one currently sounding - only meaningful
    // during song (not lone pattern) playback, since a sequence step only
    // exists in that context. Matched by this group's own POSITION in
    // song.sequence (playSequence in music-playback.js tags every one of a
    // group's own repeats with that same position as sequenceIndex - see
    // its own comment), not by patternId alone, so a pattern used in more
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

    // Only pure-tone AUDC values (see utils/music-notes.js) have a clean,
    // tunable pitch - anything else can only be triggered on/off per step,
    // via the shared "Hit" row instead of a real pitch.
    const trackSoundEffect = (track) => soundEffects().find(({id}) => id == track.soundEffectId);

    // The color is set on the Sound tab (see ColorSwatchPicker there) - the
    // Music tab only displays it, keyed off whichever sound effect the
    // track is currently pointed at.
    const instrumentColor = (track) => instrumentColorFor(trackSoundEffect(track));

    // Chip text color for the collapsed instrument summary below - a
    // hardcoded white (see the chip's own former "dark" prop) read poorly
    // against a light instrument color (e.g. a pale user-picked TIA color),
    // so this switches to dark text whenever the instrument's own color is
    // light enough to need it.
    const instrumentTextColor = (track) => isLightColor(instrumentColor(track)) ? '#000' : '#fff';

    const rowIsAvailable = (track, row) => {
      const soundEffect = trackSoundEffect(track);
      if (!soundEffect) return false;
      // Hit is only meaningful for an instrument with no real tunable pitch
      // of its own (noise/untuned types) - a tunable instrument already has
      // its own proper pitched rows, so Hit is greyed out for it instead of
      // offering a redundant, pitch-less way to trigger the same sound.
      if (row.midi === 'hit') return !audcHasTunableNotes(soundEffect.audc);
      return audfByMidiForAudc(soundEffect.audc).has(row.midi);
    };
    const rowAudf = (track, row) => {
      if (row.midi === 'hit') return null;
      const soundEffect = trackSoundEffect(track);
      if (!soundEffect) return null;
      return audfByMidiForAudc(soundEffect.audc).get(row.midi);
    };

    // One "slice" of a step, in LENGTH_UNITS_PER_STEP units, per the "Note
    // duration snap" dropdown - a fresh note is exactly one slice long, and
    // a resize drag snaps to multiples of it.
    const subdivisionUnitLength = () =>
      Math.max(1, Math.round(LENGTH_UNITS_PER_STEP / effectiveSubdivision()));

    // Both a note's step (start) and length are in LENGTH_UNITS_PER_STEP
    // units now (not whole steps) - a note can start at any sub-step slice,
    // not just a step's own beginning (see the subdivision dropdown). These
    // convert that back to whole-step indices, for the step-level
    // containment checks (monophonic blocking, resize boundaries, which
    // rendered cell a note's tip falls in) that the rest of this file's grid
    // logic is built around.
    const noteStartStep = (note) => Math.floor(note.step / LENGTH_UNITS_PER_STEP);
    const noteEndStepExclusive = (note) => Math.ceil((note.step + note.length) / LENGTH_UNITS_PER_STEP);

    // Where (0-1, from this step's own left edge) a note's tip actually
    // sits - not simply how much of the step it covers, which only happens
    // to match the tip's true position when the note starts right at the
    // step's own beginning. A note starting partway into the step (any
    // slice other than the first) needs its real end position measured
    // from the step's edge, not its own width, or the resize handle lands
    // in the wrong spot.
    const noteEndFraction = (note, step) => {
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const noteEndUnits = note.step + note.length;
      return Math.max(0, Math.min(1, (noteEndUnits - stepStartUnits) / LENGTH_UNITS_PER_STEP));
    };

    // Every ACTIVE TRACK note whose own unit range overlaps this step - not
    // just whichever one happens to be first (unlike the old noteAt-based
    // lookup this replaced). A step can hold several short, non-overlapping
    // notes at different slices (see the subdivision dropdown, and
    // notesInCell's own identical reasoning for the main grid above) - each
    // needs its own bar/handle here too, since volume is set per NOTE, not
    // per step.
    const volumeBarNotesAt = (pattern, step) => {
      const activeTrack = activeTrackFor(pattern);
      if (!activeTrack) return [];
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const stepEndUnits = stepStartUnits + LENGTH_UNITS_PER_STEP;
      return (activeTrack.notes || []).filter((note) =>
        note.step < stepEndUnits && note.step + note.length > stepStartUnits);
    };

    // This step's own left border seam should disappear only where a note
    // actually continues through it from an earlier column - erasing it
    // just because SOME note starts here (while another note's bar sits at
    // the cell's own right edge) would wrongly blend two unrelated notes
    // together.
    const volumeCellIsContinuation = (pattern, step) =>
      volumeBarNotesAt(pattern, step).some((note) => noteStartStep(note) < step);

    // This note's own volume, as a percentage of its INSTRUMENT's own base
    // volume (soundEffect.audv) rather than a raw 0-15 AUDV number - a note
    // with no override of its own reads as a clean 100% (it just plays at
    // the instrument's own volume), and dragging the bar scales down from
    // there, rather than making users think in raw hardware AUDV units.
    // 0% for a silent (audv 0) instrument, since there's no base volume to
    // express a fraction of.
    const notePercentOf = (note, soundEffect) => {
      const base = Number(soundEffect.audv) || 0;
      if (base <= 0) return 0;
      return Math.round((noteAudv(note, soundEffect) / base) * 100);
    };

    const noteVolumePercent = (note, pattern) => {
      const activeTrack = activeTrackFor(pattern);
      const soundEffect = activeTrack && trackSoundEffect(activeTrack);
      return soundEffect ? notePercentOf(note, soundEffect) : 0;
    };

    // How much of THIS step's own column a note actually occupies, as a
    // left offset + width (0-100%) - same startPercent/endPercent math as
    // segmentGradient uses for the main grid's own note coloring, just
    // returned as box-position styles instead of a gradient string. A note
    // starting or ending mid-step (see the "Note duration snap" slices)
    // only fills its own fraction of that step's column, not the whole
    // thing - and since .piano-roll-volume-handle is positioned relative
    // to its own parent bar (left: 0; right: 0 there), giving the bar
    // itself this narrower box automatically narrows the handle to match,
    // with no separate handle-sizing logic needed. Also what lets several
    // notes sharing one step (see volumeBarNotesAt) render side by side
    // instead of overlapping - each one's own slice range gets its own
    // slice of the column's width.
    const noteStepSpanStyle = (note, step) => {
      const stepStartUnits = step * LENGTH_UNITS_PER_STEP;
      const startPercent = Math.max(0, ((note.step - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      const endPercent = Math.min(100, ((note.step + note.length - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      return {left: `${startPercent}%`, width: `${endPercent - startPercent}%`};
    };

    // Bar height is this note's own volume as a percentage of the
    // instrument's own base volume (see notePercentOf), clamped to 100% -
    // dragging can't push a note louder than its own instrument's base
    // (see handleVolumeBarPointerDown/handleVolumeBarMove), but existing
    // data from before that cap existed could still be stored above it,
    // so the bar's own height stays visually capped even if the raw
    // percentage shown in the value label doesn't need to be. Same
    // instrument colour the note itself already shows in the grid above
    // (instrumentColor), so the bar reads as clearly belonging to the
    // same note/instrument. Rendered (via volumeBarNotesAt in the
    // template) across every step the note covers, not just its own first
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

    // Every OTHER track's own note(s) overlapping this step (if any) -
    // shown as faint, non-interactive bars behind the active track's own,
    // so a channel/instrument switch doesn't make the rest of the
    // pattern's volume shape disappear from this row entirely. Mirrors
    // .piano-roll-cell-foreign's own "still visible, just dimmed and
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
    // (non-overlapping) notes can still share one step, each at its own
    // slice (see the subdivision dropdown). Whole-step versions of these
    // (below) are for the grid's own per-step rendering/grey-out; the click
    // handler itself checks the exact clicked unit range instead, so
    // placing a note in one free slice never gets blocked by an unrelated
    // note elsewhere in the same step.
    const noteAt = (track, step) =>
      ((track && track.notes) || [])
          .find((note) => step >= noteStartStep(note) && step < noteEndStepExclusive(note)) || null;

    const trackNoteOverlappingUnits = (track, startUnits, endUnits) =>
      ((track && track.notes) || [])
          .find((note) => note.step < endUnits && note.step + note.length > startUnits) || null;

    // TIA has 2 real hardware channels - two tracks on DIFFERENT channels can
    // genuinely sound at once, so only a track sharing the active track's own
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
      return ranges;
    };

    // A single step's cell can now show more than one note (several short
    // ones on the same row, at different slices) - returns every {note,
    // track} touching (row.midi, step), active track's own notes first, so
    // they're never hidden behind an overlapping different-channel track's
    // note when both are drawn.
    const notesInCell = (pattern, row, step) => {
      const activeTrack = activeTrackFor(pattern);
      const notesInTrack = (track) => (track.notes || [])
          .filter((candidate) => candidate.midi === row.midi && step >= noteStartStep(candidate) &&
            step < noteEndStepExclusive(candidate))
          .map((note) => ({note, track}));
      const found = (activeTrack && !isTrackHidden(pattern, activeTrack)) ? notesInTrack(activeTrack) : [];
      pattern.tracks.forEach((track) => {
        if (track !== activeTrack && !isTrackHidden(pattern, track)) found.push(...notesInTrack(track));
      });
      return found;
    };

    // The single note this cell would report for simple (title/tip/resize)
    // purposes - the active track's own note here if it has one, otherwise
    // whichever other note is drawn. Cells with several notes (see
    // notesInCell) only ever get a resize handle for the active track's own
    // one anyway.
    const findDisplayedNote = (pattern, row, step) => notesInCell(pattern, row, step)[0] || null;

    const patternCellClasses = (pattern, row, step, stepCount) => {
      if (step >= stepCount) return {'piano-roll-cell-length-disabled': true};
      const displayed = findDisplayedNote(pattern, row, step);
      const activeTrack = activeTrackFor(pattern);
      // A note belonging to a DIFFERENT CHANNEL isn't a real conflict for
      // the active track - the TIA's two channels play independently, so
      // that note being here doesn't stop the active track from placing
      // its own. Most visible on the shared "Hit" row, since every
      // untunable instrument on EITHER channel shares that one row, so two
      // different channels both wanting a Hit note at the same step is
      // common - without this, the second channel's own Hit row looked
      // dimmed/blocked (piano-roll-cell-foreign below) even though
      // clicking it would have worked fine. Falls through to the same
      // empty-cell classing as if this note weren't here at all; its own
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
          // because it's the active track's own note but its instrument's
          // Sound type changed to something untunable AFTER the note was
          // placed (notes are never deleted or rewritten when that
          // happens - see flattenSongEvents' own note on this - so a
          // once-valid note can be sitting on a row that's no longer valid
          // for its own instrument). Either way, without this it looked
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
    // itself already draws those via its own border-left) so a step's own
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
    // both that function's own slice lines (0.08) and .piano-roll-cell's own
    // step-edge border (0.22), so the ruler stays a quiet reference rather
    // than competing with the piano roll's own, more prominent grid.
    const headerSliceGridImage = () => {
      const subdivision = effectiveSubdivision();
      if (subdivision <= 1) return null;
      const slicePercent = 100 / subdivision;
      return `repeating-linear-gradient(to right, rgba(0, 0, 0, 0.05) 0, rgba(0, 0, 0, 0.05) 1px, ` +
        `transparent 1px, transparent ${slicePercent}%)`;
    };

    // A note shorter than a full step (or a multi-step note's own tail) only
    // fills part of the cell; a step can also hold several short, sequential
    // notes at once (see notesInCell) - all rendered as colored bands within
    // a single gradient image layered over the slice grid (rather than
    // separate overlay elements), so the rest of the cell (border, hover,
    // etc.) stays untouched.
    // Each kind of thing a cell can show is its own gradient layer (not
    // stops concatenated into one gradient) - keeps the hover preview's own
    // 4 stops independent of however many note segments are also in this
    // cell, so there's no risk of out-of-order stop positions between them.
    // Layers are listed topmost-first: the hover preview always paints over
    // real notes, so it's visible even hovering a slice/step that already
    // has something placed there.
    // Fades a note's own color toward the cell background when its
    // instrument is muted, so muted notes stay visible (still show where
    // they are) without competing with unmuted ones for attention.
    // mixColorWithTransparent works uniformly whether the source color is
    // hsl(...) (an auto-assigned instrument color - see autoInstrumentColor)
    // or the rgb(...)/hex a user picked explicitly on the Sound tab, unlike
    // trying to parse/rewrite the color string's own alpha channel
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
    // for touching something already there (this instrument's own note,
    // either replaced at a different pitch - see the 'overwrite' mode below
    // - or removed outright at the same pitch), red for a slot this click
    // can't use at all (see canPlaceNoteAt - wrong row for this instrument,
    // or a different track already holding the channel here). Blended (via
    // normal alpha stacking) over an existing note's own color for
    // overwrite/remove, or over the empty cell for add/blocked, so each
    // still reads clearly despite sharing a color with its sibling mode.
    const HOVER_PREVIEW_COLORS = {
      add: 'rgba(25, 118, 210, 0.4)',
      overwrite: 'rgba(156, 39, 176, 0.4)',
      remove: 'rgba(156, 39, 176, 0.4)',
      blocked: 'rgba(200, 30, 30, 0.35)',
    };
    // Same dark tone as .piano-roll-cell-disabled/.piano-roll-cell-length-disabled
    // - "unusable" reads consistently whether that's because the whole row
    // is wrong for this instrument or just this slice's channel is busy.
    const BLOCKED_RANGE_COLOR = 'rgba(0, 0, 0, 0.18)';
    // Translucent rather than solid, so a note/other layer underneath the
    // currently-playing slice still shows through it. Vuetify's own default
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

    // Shared by patternCellStyle (the piano roll itself) and rulerCellStyle
    // (the step-number row above it) so both always agree on exactly which
    // slice a given elapsedUnits falls into, and don't drift out of sync
    // with each other. Snapped to the same "Note duration snap" slice width
    // notes themselves snap to (see subdivisionUnitLength), like a DAW step
    // sequencer's own playhead - a continuous, unsnapped position would
    // drift smoothly across a step instead of visibly landing on each of its
    // slices in turn as the song plays. Null (no layer) when elapsedUnits'
    // own slice doesn't fall within this particular step at all.
    const playheadSliceLayer = (elapsedUnits, stepStartUnits, color) => {
      const slice = subdivisionUnitLength();
      const sliceStart = Math.floor(elapsedUnits / slice) * slice;
      const sliceEnd = sliceStart + slice;
      if (sliceEnd <= stepStartUnits || sliceStart >= stepStartUnits + LENGTH_UNITS_PER_STEP) return null;
      return segmentGradient(stepStartUnits, sliceStart, sliceEnd, color);
    };

    // The step-number ruler's own background - the same playhead (live or
    // armed - see patternDisplayedHead) and hover preview (see seekHover)
    // the piano roll itself shows, plus the ruler's own always-on slice
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
      // to that other note, since the active track can still place its own
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

    // Every ACTIVE TRACK note whose own last occupied step is this one - a
    // step can hold several short notes at different slices (see
    // notesInCell), and each needs its OWN resize handle. This used to go
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
    // own start) a click landed, snapped to the current "Note duration snap"
    // slices - so clicking partway across a step starts a new note at that
    // slice, not always at the step's own beginning. Falls back to the
    // step's start if there's no usable click-position info (offsetX only
    // means something when the click's own target was the cell itself,
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
    // active track's OWN overlapping note (if any) isn't a blocker here -
    // placing a new note where this instrument already has one just
    // replaces it (see handlePatternCellClick) - only a DIFFERENT track
    // sharing the channel is a real hardware conflict.
    const canPlaceNoteAt = (pattern, activeTrack, row, startUnits, endUnits) => {
      const conflictingTrack = pattern.tracks.find((track) =>
        track !== activeTrack && track.channel === activeTrack.channel &&
        trackNoteOverlappingUnits(track, startUnits, endUnits));
      if (conflictingTrack) return false;
      return rowIsAvailable(activeTrack, row);
    };

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
      const endUnits = startUnits + subdivisionUnitLength();
      const ownNoteHere = (activeTrack.notes || [])
          .find((note) => startUnits >= note.step && startUnits < note.step + note.length);
      if (ownNoteHere && ownNoteHere.midi === row.midi) {
        // Clicking this exact note (same pitch) removes it.
        hoverPreview.value = {mode: 'remove', trackId: activeTrack.id, midi: row.midi, step,
          startUnits: ownNoteHere.step, endUnits: ownNoteHere.step + ownNoteHere.length};
        return;
      }
      // A different pitch where this instrument already has a note falls
      // through to the same placeable check as an empty slot - a channel
      // can only hold one note at a time anyway, so clicking here replaces
      // whatever's there instead of being blocked by it (see
      // canPlaceNoteAt, and handlePatternCellClick which does the actual
      // replacing). Still flagged as its own 'overwrite' mode (rather than
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
      // browser fires its own native "click" for that same mouseup right
      // after, landing on the cell underneath the (now-moved) resize
      // handle. Without this guard, that stray click hit the "clicking an
      // existing own note removes it" branch below, deleting the note the
      // user had just finished resizing. See stopResize, which sets this
      // flag right as the drag ends and clears it shortly after.
      if (suppressNextCellClick) return;
      if (step >= stepCount) return;
      const activeTrack = activeTrackFor(pattern);
      if (!activeTrack) return;

      const noteStartUnits = step * LENGTH_UNITS_PER_STEP + clickedSliceOffsetUnits(event);
      const noteEndUnits = noteStartUnits + subdivisionUnitLength();

      // Clicking on top of the active track's own note (at the clicked
      // slice, not just anywhere in the step) removes it, with nothing
      // replacing it, if it's the exact same pitch already there.
      const ownNoteHere = (activeTrack.notes || [])
          .find((note) => noteStartUnits >= note.step && noteStartUnits < note.step + note.length);
      if (ownNoteHere && ownNoteHere.midi === row.midi) {
        activeTrack.notes = activeTrack.notes.filter((note) => note !== ownNoteHere);
        handleChildChange();
        return;
      }
      // Blocking is checked against the EXACT slice range being placed, not
      // the whole step - a track is still monophonic (only one note playing
      // at any given instant), but several short, non-overlapping notes can
      // share one step at different slices (see the subdivision dropdown).
      // Only a DIFFERENT track sharing the channel can actually block this -
      // the active track's own note(s) overlapping this range (ownNoteHere
      // above, at a different pitch, or any other note of its own the wider
      // range happens to reach) get replaced below instead.
      if (!canPlaceNoteAt(pattern, activeTrack, row, noteStartUnits, noteEndUnits)) return;
      const soundEffect = trackSoundEffect(activeTrack);
      if (!soundEffect) return;
      const audf = rowAudf(activeTrack, row);
      const ownOverlapping = (activeTrack.notes || []).filter((note) =>
        note.step < noteEndUnits && note.step + note.length > noteStartUnits);
      if (ownOverlapping.length) {
        activeTrack.notes = activeTrack.notes.filter((note) => !ownOverlapping.includes(note));
      }
      activeTrack.notes.push({step: noteStartUnits, midi: row.midi, audf, length: subdivisionUnitLength()});
      hoverPreview.value = null;
      handleChildChange();
      if (!isTrackMuted(song, pattern, activeTrack)) {
        previewPatternNote({
          audc: soundEffect.audc,
          audf: audf == null ? soundEffect.audf : audf,
          audv: soundEffect.audv,
          arpeggio: soundEffect.arpeggio,
          arpeggioDivision: soundEffect.arpeggioDivision,
          arpeggioInterval: soundEffect.arpeggioInterval,
          arpeggioRange: soundEffect.arpeggioRange,
          tempo: effectiveTempo(song, pattern),
        });
      }
    };

    // Dragging a held note's right edge changes its length, independent of
    // the instrument preset's own Duration field - length is in
    // LENGTH_UNITS_PER_STEP units, snapped to whatever the subdivision
    // dropdown is currently set to (so a drag can produce a note shorter
    // than one full step, not just whole steps).
    const resizing = ref(null);
    // See handlePatternCellClick's own comment - suppresses the one stray
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
      // comes first: this same track's own next note, OR a different
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
    // cursor's Y position (relative to the cell's own top/height, captured
    // once at mousedown rather than re-measured every move, since the
    // cell's own position can't change mid-drag) to a percentage of the
    // instrument's own base volume (baseAudv, captured at mousedown too)
    // instead of an X-delta to a note length. top=100% (as loud as the
    // instrument's own base volume), bottom=0% (silent) - dragging can
    // never make a note louder than its own instrument's base, only
    // quieter, matching "100%" reading as "this note's own instrument
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
      volumeDragging.value = null;
      handleChildChange();
      window.removeEventListener('mousemove', handleVolumeBarMove);
      window.removeEventListener('mouseup', stopVolumeDrag);
    };
    // The note itself now comes straight from the template's own v-for
    // (see volumeBarNotesAt) rather than being looked up here by step -
    // several notes can share one step (different slices), so a step
    // number alone is no longer enough to say which one a drag meant.
    const handleVolumeBarPointerDown = (note, pattern, event) => {
      const activeTrack = activeTrackFor(pattern);
      const soundEffect = activeTrack && trackSoundEffect(activeTrack);
      const baseAudv = soundEffect ? (Number(soundEffect.audv) || 0) : 0;
      // The drag now starts from the handle strip (see the template - only
      // it shows the ns-resize cursor, not the whole column), so the full
      // column's own rect has to be found by walking up to it rather than
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
    onBeforeUnmount(() => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('mousemove', handleVolumeBarMove);
      window.removeEventListener('mouseup', stopVolumeDrag);
      window.removeEventListener('resize', handleWindowResize);
    });

    // So 100% already reads as "fit" on first load/navigation too, not only
    // after some later interaction - and keeps fitting if the browser
    // window itself is resized.
    const handleWindowResize = () => {
      state.value.songs.forEach((song) => {
        if (isSongCollapsed(song)) return;
        recalculateFitBaseWidth(song, activePattern(song));
      });
    };
    onMounted(() => {
      handleWindowResize();
      window.addEventListener('resize', handleWindowResize);
    });

    return {
      dimSoundFx, dimSoundFxPercent, dimSoundFxPercentDisplay,
      state, handleChildChange, handleChangeSubdivision, snapEnabled, handleToggleSnap,
      handleTempoChange, minTempo: MIN_TEMPO, maxTempo: MAX_TEMPO,
      handleAddSong, handleDeleteSong, handleExportSong, handleImportSong,
      handleAddPattern, handleDuplicatePattern, handleDeletePattern, handleStepCountChange,
      handlePatternFieldChange,
      canUndoPattern, canRedoPattern, handleUndoPattern, handleRedoPattern,
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
      handleVolumeBarPointerDown, handlePianoRollScroll,
      rulerCellStyle, handleSeekHover, handleSeekHoverLeave,
      instrumentColor, instrumentTextColor,
      soundEffectOptions,
      // CHANNEL_OPTIONS' own values are strings ('0'/'1') - a requirement
      // of Blockly's FieldDropdown (see blocks/sound.js, which also feeds
      // this same array to a Blockly block), not of the Music tab's own
      // track.channel, which has always been stored as a NUMBER (see
      // emptyTrack/DEFAULT_SONGS in blocks/music.js). Vuetify's v-select
      // matches its own :items value against v-model by strict ===, so a
      // numeric track.channel of 0 never matched the string item '0' here
      // - the Channel dropdown showed blank/placeholder even for a
      // perfectly valid, already-set channel 0 (same class of bug as the
      // Sound tab's own Frequency field before its own fix). Number(value)
      // converts back to match what's actually stored.
      channelOptionItems: CHANNEL_OPTIONS.map(([text, value]) => ({text, value: Number(value)})),
      patternStepOptionItems: PATTERN_STEP_OPTIONS.map((steps) => ({text: `${steps}`, value: steps})),
      subdivisionOptionItems: DURATION_SUBDIVISION_OPTIONS.map((n) => ({text: `${n}`, value: n})),
      maxPatternSteps: MAX_PATTERN_STEPS,
      pianoRollZoom, stepPianoRollZoom, cellWidthPx, handleFitZoom,
      sharedNoteRows: [...CANONICAL_NOTE_ROWS, ...HIT_ROW],
      isSongCollapsed, toggleSongCollapsed,
      isPatternCollapsed, togglePatternCollapsed, isInstrumentsCollapsed, toggleInstrumentsCollapsed,
      isSequenceCollapsed, toggleSequenceCollapsed,
      trackSoundEffect,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
    };
  },
});
</script>
<style scoped>
.alpha-notice {
  margin: 0 16px 8px;
}

.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* Same control layout/spacing as SoundFXEditor.vue's own identical
   .dim-controls/.dim-switch/.dim-slider/.dim-percent/.dim-hint rules -
   this tab and that one share the same underlying config values (see
   this component's own dimSoundFx/dimSoundFxPercent), so the two controls
   are kept visually identical too. */
.dim-section {
  padding-bottom: 0;
}

.dim-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.dim-switch {
  flex: 0 0 auto;
  margin-top: 0 !important;
}

.dim-slider {
  flex: 0 1 200px;
  margin-right: -12px;
  margin-top: 3px;
}

.dim-percent {
  flex: 0 0 auto;
  min-width: 2.5em;
}

/* font-size/color/line-height now come from the "v-messages theme--light
   v-messages__message" classes on the element itself (see the template) -
   the same classes every hint/description paragraph in the app uses. */
.dim-hint {
  margin-top: 8px;
  margin-bottom: 0;
}

/* Zeroed (was the default 16px v-card-text padding) - between .dim-section's
   own zeroed padding-bottom and .dim-hint's own zeroed margin-bottom above,
   nothing else was left putting space here, so this was stacking a third,
   easy-to-miss gap on top of .song-list's own 12px margin-top, leaving a lot
   of empty space between the DIM controls and the first song card. */
.song-list-section {
  padding-top: 0;
}

/* Vuetify's default v-list-item padding is 0 16px - zeroing only the left
   side (as this used to) left the right side with an extra 16px beyond the
   surrounding v-card-text's own padding that the left side didn't have,
   making the song card visibly narrower on the right than the left (and
   misaligned with the alpha warning alert above, which sits directly in
   v-card-text with no list-item wrapper of its own). Zeroing both sides
   makes the card's actual width match v-card-text's padding evenly, same as
   the alert. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

/* Same fix, and matching 8px/12px values, as BackgroundEditor.vue's own
   .background-list/.entry-list-item rules - v-list-item__content's default
   12px top/bottom padding was adding extra space between cards beyond
   anything explicitly set (there was no explicit gap here at all before),
   so this tab's own card spacing didn't match the Background tab's.
   flex+gap plays the role .background-list's own CSS grid gap does (this
   tab stays single-column); margin-top puts back the space above the FIRST
   card that zeroing v-list-item__content's own padding would otherwise
   have also removed. */
.song-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.entry-list-item >>> .v-list-item__content {
  padding: 0;
}

/* Narrow - the options themselves (1/2/4/8/16) are at most 2 characters,
   room for up to 3 is plenty; this used to be a full-width field up top
   with a long label of its own, before moving next to each card's own
   zoom control (see .piano-roll-zoom-row). flex-shrink: 0 keeps it from
   being squeezed by .piano-roll-zoom-controls' own claim on space (see its
   own comment); the deep selectors strip Vuetify's own default input
   padding/min-width, which otherwise renders wider than 56px regardless of
   this flex-basis, the same fix DataEditor.vue's .data-value-field uses. */
/* Replaces the select's own floating "Snap" label (removed) - a magnet icon
   reads as "snap" without needing text, and sitting outside the select's own
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

/* Vuetify's own default (non-outlined) text-field/select style still
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

/* No max-width cap (unlike e.g. SoundFXEditor's .soundfx-card) - lets a
   song card grow as wide as the alpha warning alert above it, at the user's
   own request, rather than staying capped at a fixed width regardless of
   how much room the tab actually has. */
.song-card {
  position: relative;
  width: 100%;
}

/* Same reasoning/placement as TextEditor.vue's .text-drag-handle (see
   hooks/drag-reorder.js's own comment) - only this top strip is actually
   draggable, so click-and-drag still selects text everywhere else in the
   card. */
.song-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* Same two classes/reasoning as hooks/drag-reorder.js's own comment and
   TextEditor.vue's identical rules (its own first use of this hook). */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

.music-id-badge {
  position: absolute;
  top: 10px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
  /* Without an explicit value, this inherits whatever line-height its
     surrounding context happens to resolve to - which isn't the same
     everywhere this badge is used: the song card's own badge sits in a
     context that resolves to a tight ~13px, but the pattern card's own
     (nested one level deeper) resolves to Vuetify's default ~22px
     instead, visibly pushing the id text down within that taller line
     box even though top: 10px itself was identical in both. A fixed,
     tight value keeps this badge's own text position independent of
     wherever it's placed. */
  line-height: 1;
}

/* Same monospace/tight-line-height idea as .music-id-badge just above, but
   lives INSIDE the chip (see the template) rather than floating over/beside
   it. No explicit color here - the chip itself always carries Vuetify's
   "dark" prop (white text), regardless of the chip's own actual background
   lightness/darkness (see .sequence-chip's own "dark" in the template), so
   this just inherits that same white rather than computing its own
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

.music-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

.music-toolbar-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  z-index: 1;
}

/* Same flat-icon, fade-in-on-hover treatment as the Sound tab's own
   play/stop buttons (SoundFXEditor.vue's .soundfx-play-btn/.soundfx-stop-btn)
   instead of Vuetify's default grey circle. */
.music-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.music-flat-icon-btn::before {
  display: none;
}

.music-flat-icon-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.music-flat-icon-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

/* Momentary press feedback - the same blue as the "currently on" tint right
   below (.music-icon-btn-active), just while the mouse button's actually
   down, for a one-shot action button (Undo, zoom reset, etc.) that has no
   ongoing on/off state of its own to show that color persistently. */
.music-flat-icon-btn:active >>> .v-icon {
  color: #1976d2 !important;
}

/* "This is currently on/playing" tint for any .music-flat-icon-btn toggle -
   the pattern loop button when looping is on, and the pattern/song Play
   buttons while their own playback is active. Same blue as the piano roll's
   own playhead/zoom slider (Vuetify's default theme "primary", #1976D2 - no
   custom theme colors are set, see plugins/vuetify.js). Needs the extra
   .music-flat-icon-btn specificity to win over that class's own blanket
   !important color rule above - a plain :color="primary" prop on the v-icon
   itself loses to it silently. */
.music-flat-icon-btn.music-icon-btn-active >>> .v-icon {
  color: #1976d2 !important;
}

.music-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

.music-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

.music-name-field {
  margin-top: 12px;
}

/* This class is shared with plain text fields too (e.g. Song name), which
   have no dropdown icon at all - harmless no-op there. The Pattern name
   field is a v-combobox (editable text AND a dropdown - see
   handlePatternFieldChange), so Vuetify gives it its own dropdown arrow
   icon; without this, that icon inherited the field's own text-input
   cursor (a text I-beam) instead of a pointer, reading as if clicking the
   arrow wouldn't do anything even though it does open the dropdown. */
.music-name-field >>> .v-input__append-inner {
  cursor: pointer;
}

.music-name-section {
  padding-bottom: 0;
}

/* Extra clearance from the song card's own top-right toolbar
   (.music-toolbar-top-right, absolutely positioned so it doesn't take up
   flow space on its own) sitting right above this row - on top of
   .music-name-field's own existing 12px margin-top (rather than setting
   padding-top directly, which would override - and shrink - this
   v-card-text's larger Vuetify default padding instead of adding to it).
   The pattern card's own equivalent row doesn't need this: its own
   toolbar was moved down next to the piano roll's zoom controls (see
   .pattern-playback-controls), so nothing sits above it to clear. */
.song-name-row .music-name-field,
.song-name-row .tempo-field {
  /* Matches the pattern card's own collapse-arrow-to-label gap exactly
     (measured directly: 6px there vs this row's own 2px before this),
     since both cards now have their own collapse toggle sitting over the
     same corner - was 16px. */
  margin-top: 20px;
}

.music-sequence-section {
  padding-top: 0;
  /* Zeroed (was 6px) so "Add pattern"'s own gap down to the pattern
     sub-card below matches "Add instrument"'s gap down to
     .instruments-piano-divider (see .sequence-add-row .add-track-button's
     own margin-bottom, which is what actually sets this gap now). */
  padding-bottom: 0;
  /* Pulls this section up closer to the Song name/Tempo row above it -
     that row's own v-text-fields reserve space for a hint/error line even
     though hide-details isn't set on them, which read as a bigger gap
     (measured at 22px) than padding-top: 0 alone accounts for. */
  margin-top: -12px;
}

/* .pattern-card's own collapse toggle (.music-collapse-btn, top: 2px,
   ~26px tall) sits absolutely positioned over this row's own top-left
   corner - this needs enough padding-top to clear it (the small 10px this
   used to be, from when nothing sat above this row - see .pattern-card,
   which had its own now-removed top-right toolbar back then instead - was
   too little once the collapse button was added, crowding right up
   against the Pattern name label). */
.pattern-card .music-name-section {
  padding-top: 28px;
}

/* flex-wrap lets .pattern-length-tempo-group (Length/tempo-checkbox/Tempo)
   drop to its own line under the Pattern name field when both don't fit
   side by side - same "two atomic blocks" pattern as
   .piano-roll-zoom-and-playback/.track-instrument-row (see their own
   comments). Also shared by the song card's own name row (.song-name-row),
   which only ever has two fields and so rarely needs to wrap at all - this
   doesn't change its normal single-line layout. */
.pattern-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
}

/* Scoped to .pattern-card specifically, NOT .pattern-name-row - the song
   card's own name row (see the template) carries BOTH .song-name-row AND
   .pattern-name-row (they share layout, just not this spacing), so a
   .pattern-name-row-scoped rule here would win the specificity tie
   against .song-name-row's own 16px override above (same specificity,
   later in the file) and wrongly flatten the song row's spacing down to
   this pattern-only value too - confirmed directly as the cause of the
   song row suddenly looking too cramped right after this was added.
   .pattern-card only ever wraps the pattern sub-card's own row. Also
   covers .steps-field (Length (steps)) now - its own base rule below sets
   a flat 12px unconditionally, which left it sitting visibly lower than
   this row's other fields once they were pulled up to 8px here without
   it. */
.pattern-card .music-name-field,
.pattern-card .tempo-field,
.pattern-card .steps-field {
  margin-top: 8px;
}

.pattern-name-row .music-name-field {
  flex: 1 1 auto;
}

/* No flex-wrap of its own (unlike .pattern-name-row) - Length/tempo-checkbox/
   Tempo always move as one block, matching the "atomic group" pattern used
   elsewhere on this tab. */
.pattern-length-tempo-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 0 0 auto;
}

/* Add/Duplicate/Delete pattern - tight gap (not this row's own 12px,
   meant for spacing separate FIELDS apart, not a group of icon buttons
   next to each other) and a margin-top nudge to line these up against
   the combobox's own input line/underline rather than Vuetify's default
   icon-button margin, which read as sitting noticeably higher and
   further apart than the field beside them. */
.pattern-actions-row {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
  margin-top: 22px;
}

.tempo-field {
  flex: 0 0 110px;
  margin-top: 12px;
}

/* Same margin-top override as SoundFXEditor's own .dim-switch -
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

/* Matches a Vuetify field's own floated label exactly (e.g. "Editing
   pattern" below) - that's rendered at 16px scaled down by the fixed 0.75
   Vuetify itself applies to a floated label, so 12px is the real equivalent
   here, not a separate scale. */
.music-section-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 4px;
}

.instruments-label-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Vuetify keeps a much taller invisible click-target box around even an
   x-small icon button (same issue .piano-roll-zoom-icon-btn's own comment
   describes) - .instruments-label-row's own align-items: center was
   centering that whole oversized box against the "Instruments" text
   next to it, which visibly reads as the chevron itself sitting too low
   against the text's own baseline. A fixed, tight height/width (matching
   this row's own 12px label line-height) fixes that the same way
   .piano-roll-zoom-icon-btn does for the zoom row's own icon buttons. */
.instruments-collapse-btn {
  margin-left: -4px;
  margin-top: -6px;
  min-width: 0;
  height: 16px !important;
  width: 16px !important;
}

/* Same "same width/height, no shadow" treatment as the other flat icon
   buttons on this tab (.music-flat-icon-btn/.music-icon-btn-size), just a
   step smaller (x-small) to match this row's own 12px label text instead
   of dwarfing it. */
.instruments-collapse-btn.v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Shown instead of the Instruments list/Add instrument button while that
   section is collapsed (see isInstrumentsCollapsed) - one small chip per
   track, colored the same way each track's own note color dot is
   (instrumentColor) so a glance still identifies which instruments this
   pattern uses without expanding it back out. */
.instruments-collapsed-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  margin-bottom: 12px;
}

.instruments-collapsed-summary .v-chip {
  cursor: pointer;
}

/* Same white-then-primary double ring as .sequence-chip-playing (see its
   own comment on why a single white ring alone isn't visible against this
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

/* No margin-bottom of its own - Vuetify's v-btn is inline-flex, so its own
   margin-bottom (see .sequence-add-row .add-track-button below) doesn't
   collapse into this wrapper div's margin the way two plain block boxes'
   margins would, and a margin here on TOP of the button's own would just
   double the gap down to the pattern sub-card below instead of matching
   it. */
.sequence-add-row {
  margin-bottom: 0;
}

/* Overrides .add-track-button's own 8px margin-top/12px margin-bottom
   (shared with the Instruments section's "Add instrument" button) - here
   it sits right under the sequence chips instead of a whole card-text row
   below a collapse-toggle heading, so it doesn't need as much clearance
   above, and its own gap to the pattern sub-card below is meant to match
   "Add instrument"'s own gap to .instruments-piano-divider (see that
   button's own override right below), not this shared class's base value. */
.sequence-add-row .add-track-button {
  margin-top: 4px;
  margin-bottom: 8px;
}

/* Matches .sequence-add-row .add-track-button's own margin-bottom above -
   "Add instrument"'s gap down to the divider below it is meant to read the
   same as "Add pattern"'s own gap down to the pattern sub-card below IT. */
.track-section .add-track-button {
  margin-bottom: 8px;
}

.sequence-chip-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  cursor: grab;
}

/* Same reasoning as hooks/drag-reorder.js's own CSS_CLASS_DRAGGING/
   CSS_CLASS_DRAG_OVER (see sequenceChipListeners' own comment on why this
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

/* A double ring (white, then the app's own primary color) rather than
   swapping the chip's own (per-pattern) color, so it reads as "this one's
   playing right now" without fighting/hiding the color that identifies
   WHICH pattern it is - see patternSequenceColor. A single white ring
   alone (this rule's own previous version) turned out to be invisible in
   practice: .song-card's own background is white/near-white, so a white
   ring around a chip sitting on it had no contrast against the card at
   all, only against the chip's own (usually darker/saturated) color -
   confirmed as the reason this looked like it was never implemented, even
   though the class WAS being applied correctly the whole time. The
   primary-color outer ring is what actually shows up against the card;
   the white ring is kept as an inner separator so the two don't blend
   into the chip's own color either, on a light or dark chip color alike.
   Applied to the WHOLE wrap (chip + its own resize handle together, see
   .sequence-chip-wrap), not just the chip on its own - confirmed directly
   as a real bug otherwise: once the resize handle became a visually fused
   part of the same chip (flush edges, matching height - see
   .sequence-chip-resize-handle), a ring drawn around the chip ALONE
   stopped short of the handle, reading as a highlight that didn't match
   the shape of the control it was supposedly outlining. Rounded to match
   the combined shape's own corners (the chip's rounded left end, the
   handle's rounded right end). */
.sequence-chip-wrap-playing {
  border-radius: 12px;
  box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v-primary-base, #1976d2);
}

/* Label stays pinned to the left edge and the close (x) icon to the right
   edge even once the chip is stretched wider than its own content (see
   sequenceGroupChipStyle's minWidth, for a chip repeating more than once) -
   Vuetify's own .v-chip__content only ever sizes to its own content by
   default, so a wider outer chip otherwise left both floating together in
   the middle instead of spreading to the chip's own full width. */
.sequence-chip >>> .v-chip__content {
  width: 100%;
  justify-content: space-between;
}

/* No gap between the chip and its own resize handle (see
   .sequence-chip-wrap below) and no rounding on the chip's own right
   corners, where the handle sits flush against it - together with the
   handle's own matching left corners (0) and matching height, this reads
   as ONE pill-shaped control (chip + handle) rather than two separate
   controls sitting side by side. */
.sequence-chip {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  /* Vuetify's own default right padding leaves noticeable empty space
     between the close (x) icon and the chip's own right edge - tightened
     here so it sits closer to that edge, same reasoning as the icon's own
     already-tight left-side spacing. Left padding untouched (the text
     label's own spacing is unaffected). */
  padding-right: 8px !important;
}

/* A grip fused onto a sequence chip's own right edge (see .sequence-chip
   above) - dragging it repeats the chip's own pattern more (or fewer)
   times in a row (see handleSequenceResizeStart), snapped to whole
   repeats. Same height as the chip itself (a "small" v-chip's own fixed
   24px) and rounded only on its own outer (right) corners, matching the
   chip's own pill shape on that side, so the combined shape reads as one
   continuous capsule. Its own background color (see
   sequenceGroupHandleStyle) is a lighter tint of the chip's own color, not
   a fixed grey, for the same "part of the same chip" reason. ew-resize
   (not the wrap's own grab cursor) signals this is a horizontal resize,
   not a reorder drag, even though both live in the same small area. */
.sequence-chip-resize-handle {
  /* At least as wide as its own 12px corner radius (matching the chip's
     own left-edge radius - see .sequence-chip) - CSS scales corner radii
     DOWN to fit when they'd otherwise exceed the box's own width, so a
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

.pattern-card {
  position: relative;
  /* The song card's own .music-sequence-section (which wraps this) has its
     own padding-bottom zeroed out (see that class's own comment), so this
     margin is the ONLY thing separating the pattern sub-card's own bottom
     edge from the song card's outer frame below it. */
  margin-bottom: 20px;
}

.track-section {
  padding-top: 0;
  /* Same reserved-hint-space gap as .music-sequence-section's own comment,
     between this section and the Pattern name/Length/Tempo row above it. */
  margin-top: -12px;
}

/* One column per instrument up to minmax's own floor (440px - roughly what
   one .track-instrument-row needs to lay out its radio/swatch/selects/icon
   group without squeezing), auto-filling however many fit the current
   width and wrapping the rest onto new rows - no JS-measured column count
   needed, and grid's own gap (not each item's individual margin) keeps
   items from ever butting up against each other in either direction,
   including the last item in a row that doesn't reach a following column. */
.track-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
  gap: 24px 16px;
  /* .music-section-label's own margin-bottom (4px) wasn't enough room for
     the first row's own "Instrument" field label - a dense Vuetify select's
     floating label sits right at the top of its own box, so with only 4px
     between them the two labels read as crowded/almost touching instead of
     as two clearly separate rows. */
  margin-top: 12px;
}

/* Enough vertical padding (no divider line) that dense v-selects' floating
   labels - which sit slightly above their own box - can't read as
   overlapping the row above/below - handled by .track-grid's own row gap
   now that instruments can sit side by side, not just this row's own
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

/* The plus icon sits a couple pixels low against the button's own text
   baseline otherwise - Vuetify centers a v-icon against the button's full
   line-height box, not the text glyphs' own visual baseline. */
.add-track-button .v-icon {
  vertical-align: 4px;
}

/* Matches .track-section .add-track-button's own margin-bottom above it
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
   traced to .pattern-playback-controls' own old margin-left: 8px (fixed
   there instead, see its own comment) and .pattern-delete-btn's old
   margin-left: auto (also fixed at its own source). space-between itself
   turned out not to be the culprit - it already does the right thing on
   its own: pins .subdivision-controls to the left and
   .piano-roll-zoom-and-playback to the right when both fit on one line,
   but falls back to flex-start (left-aligned) for a lone item once that
   group wraps onto its own line with nothing left to space "between". */
.piano-roll-zoom-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  margin-bottom: 4px;
}

/* Groups the zoom controls with the pattern preview play/stop/loop buttons
   (moved in here from the pattern card's own top-right toolbar) so they sit
   immediately next to each other. flex-wrap here lets
   .pattern-playback-controls drop to its own line UNDER
   .piano-roll-zoom-controls when both don't fit side by side - but neither
   of those two groups ever splits apart internally (see their own
   flex: 0 0 auto, no wrap of their own), so it's always "zoom tools" and
   "playback buttons" wrapping as two whole blocks, never individual icons
   scattering onto separate lines of their own.
   flex: 0 1 auto (flex-grow: 0, NOT 1) + min-width: 0 - this group has to
   be able to SHRINK down to whatever width it lands on (its own wrapped
   line, once .subdivision-controls has taken the rest of line 1) before its
   own internal flex-wrap has anything to trigger against, but must NOT
   grow past its own content's natural width either: flex-grow: 1 let
   .piano-roll-zoom-row's own space-between stretch this group's outer box
   to fill the row's full remaining width, while its own children (with no
   justify-content: flex-end of their own) stayed put at the group's LEFT
   edge - visually reading as "not right-aligned" even though the group's
   own (empty, oversized) box really was flush against the row's right
   edge. flex-grow: 0 keeps this box exactly as wide as its own content, so
   space-between has an accurately-sized item to push flush right. */
.piano-roll-zoom-and-playback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  flex: 0 1 auto;
  min-width: 0;
}

/* flex-shrink: 0 keeps this group (button/slider/label) at its own natural
   width instead of getting squeezed by .subdivision-select sharing the row
   with it now - confirmed directly as the cause of the slider rendering
   far narrower than its own 200px flex-basis once the select moved in. */
.piano-roll-zoom-controls {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
}

/* No left margin of its own (used to have one) - a margin here stayed
   attached to this group even when .piano-roll-zoom-and-playback's own
   flex-wrap moved it down onto its own line under .piano-roll-zoom-controls,
   leaving a stray gap before Export/Import that made the wrapped line
   look NOT left-aligned - confirmed directly as a real bug. The visual
   separation from the zoom icons (a slightly bigger gap than between the
   zoom icons themselves) now comes from .piano-roll-zoom-and-playback's
   own gap instead, which only ever applies BETWEEN items on the same line
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
     per request), not at either end of the row - needs its own right-hand
     clearance too, since .piano-roll-zoom-controls' own gap: 0 relies on
     each child's own margin for spacing, and .piano-roll-zoom-icon-btn
     (zoom-out, right after this) has none. */
  margin-right: 2px;
}

/* flex-end (not center) - the row mixes a 28px radio button with dense
   selects and a 14px swatch, all different heights; bottom-aligning them
   matches each field's own text baseline far more consistently than
   centering against each element's full (very different) box height. No
   flex-wrap - the radio button/color dot/Instrument/Channel fields/icon
   buttons all stay together on one row, shrinking (see
   .track-instrument-select's own min-width: 0) rather than wrapping apart
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

/* Matches this row's own note color in the piano roll below (see
   instrumentColor in the script) - a quick visual legend for which color
   belongs to which instrument. Read-only here - set it via the color picker
   on this instrument's own Sound tab card instead. */
.instrument-color-dot {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  margin-bottom: 7px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

/* flex-basis dropped from 200px, and no min-width floor at all (0, not
   60px) - this shrinks as far as the pattern card's own available width
   needs it to, rather than forcing .track-channel-select right beside it
   to wrap away onto its own line. Per request, Instrument/Channel stay on
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
   both its scrollbars sit at fixed spots along ITS OWN edges - always in
   view - rather than trailing off after however many rows/steps of content
   (which is what happened when vertical and horizontal scroll were split
   across two nested elements instead). The step header and the row labels
   stay in view while scrolling via position: sticky (top and left
   respectively) instead of living outside the scrollable area, since they
   still need to scroll WITH their own axis (a header has to track
   horizontal scroll, just not vertical; a row label has to track vertical
   scroll, just not horizontal).

   The volume row (see .piano-roll-volume-scroll below) is deliberately NOT
   a child of this element any more, despite otherwise wanting to scroll
   horizontally in lockstep with it (see handlePianoRollScroll) - if it
   were still nested in here, this element's own native horizontal
   scrollbar would render at the very bottom of EVERYTHING (below the
   volume row too), rather than sitting right above it, right where the
   pitch rows actually end - confirmed directly as a real complaint once
   the volume row was first added inside here. max-height bumped up
   (284px -> 340px) to compensate for the volume row now taking its own
   extra space below this, rather than shrinking the pitch-row area to fit
   it in. */
.piano-roll-scroll {
  max-height: 340px;
  overflow: auto;
  /* Matches App.vue's darkened .v-sheet--outlined-equivalent card border
     color (see its own comment) rather than Vuetify's default
     rgba(0, 0, 0, 0.12) - .pattern-card itself deliberately stays at the
     lighter default (it's a sub-frame nested inside .song-card), but the
     piano roll's own frame reads better a bit darker regardless. */
  border: 1px solid rgba(0, 0, 0, 0.24);
  border-radius: 2px;
}

/* Groups the (scrollable) pitch-row grid with the (horizontally-mirrored,
   never independently scrolled) volume row right below it - see
   .piano-roll-scroll's own comment for why they're siblings, not nested,
   despite visually reading as one continuous piece. */
.piano-roll-wrapper {
  display: flex;
  flex-direction: column;
}

/* overflow: hidden (not auto/scroll) - this never shows its own scrollbar
   or accepts direct dragging; its horizontal scroll position is only ever
   set programmatically, by handlePianoRollScroll mirroring
   .piano-roll-scroll's own scrollLeft on every scroll event. */
.piano-roll-volume-scroll {
  overflow: hidden;
  /* Matches .piano-roll-scroll's own darkened border above - these two
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
  flex: 0 0 44px;
  position: sticky;
  left: 0;
  z-index: 3;
  background-color: #fff;
}

/* flex-basis is set inline (see cellWidthPx), matching .piano-roll-cell's
   own width so the header stays aligned with the grid below it. */
.piano-roll-step-number {
  text-align: center;
  font-size: 0.7rem;
  opacity: 0.6;
  cursor: pointer;
  /* Echoes .piano-roll-cell's own step-edge border-left, fainter (0.12 vs
     0.22) so the ruler's own step divisions read as a quiet reference
     rather than competing with the piano roll's own, more prominent grid -
     see headerSliceGridImage's own comment for its slice-line counterpart. */
  border-left: 1px solid rgba(0, 0, 0, 0.12);
}

/* Steps beyond the pattern's current Length - visible so raising Length is
   discoverable, but visibly locked out until then (see the disabled-guard
   on its own @click, which skips seeking there entirely). */
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
  background-color: rgba(0, 0, 0, 0.02);
}

.piano-roll-label {
  flex: 0 0 44px;
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

/* flex-basis is set inline (see cellWidthPx) - it scales with the piano
   roll's own horizontal zoom control, so it can't be a fixed value here. */
.piano-roll-cell {
  position: relative;
  height: 20px;
  border-left: 1px solid rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
}

/* A faint alternating tint per step column (odd-numbered steps only - the
   row's own first child is .piano-roll-label, so every OTHER .piano-roll-
   cell lands on an even nth-child position), the same "helps you count
   steps at a glance" trick FL Studio's own piano roll uses. Note colors
   (backgroundImage, set inline) always paint over this since it's a
   separate property, not competing for the same layer. */
.piano-roll-cell:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.025);
}

/* Precise hover feedback (matching exactly where/how long a click would
   place a note) is drawn via patternCellStyle's hoverPreview segment
   instead - a plain whole-cell highlight here would misleadingly suggest a
   click always fills the entire step, even when the current slice snap
   would only fill a fraction of it. */

/* Erases the seam between a held note's own cells so they read as one
   continuous bar instead of separate ticked-off steps. */
.piano-roll-cell-continuation {
  border-left-color: transparent;
}

/* A note belonging to an instrument other than the one currently selected
   for editing (see the radio buttons next to each instrument row) - still
   shown in its own color so the whole pattern is visible at once, just
   dimmed and non-interactive since editing it requires selecting that
   instrument first. */
.piano-roll-cell-foreign {
  opacity: 0.55;
  cursor: default;
}

/* A foreign note sitting on a row the active track can't use at all (e.g. a
   tuned-note row while a noise-type instrument is selected) - fully
   desaturated and darkened on top of .piano-roll-cell-foreign's own
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
   conflicts ("blocked") are painted precisely via patternCellStyle's own
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

/* Only rendered on a held note's own last (rightmost) cell - drag this to
   change that note's length. */
/* left is set inline (see noteEndFraction) - the note's own end position
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
     its own cell's right edge, overflowing a few px into the next cell's
     box (see noteEndFraction). Without this, that next cell - a later,
     same-stacking-level sibling - paints and hit-tests over that
     overflowing sliver, so the handle stays visible but stops being
     clickable right after a resize lands a note there. */
  z-index: 2;
}

/* The piano roll's own "note properties" strip (currently just Volume,
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
   leaves "Vol" floating oddly next to this row's own much taller 64px
   cells). */
.piano-roll-volume-label {
  align-items: flex-start;
  padding-top: 4px;
}

/* Taller than a plain 20px .piano-roll-cell (64px) - a bar spanning a
   0-100% range needs real vertical room to drag precisely; at 20px tall
   each percentage point would be little more than a fraction of a
   pixel. */
.piano-roll-volume-cell {
  position: relative;
  height: 64px;
  border-left: 1px solid rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.piano-roll-volume-cell:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.025);
}

/* A step covered by a note that started in an earlier column (not this
   one) - erases the seam between the two cells' bars so a multi-step
   note's own volume bar reads as one continuous shape, matching
   .piano-roll-cell-continuation's identical treatment in the grid above. */
.piano-roll-volume-cell-continuation {
  border-left-color: transparent;
}

/* Anchored to the cell's own bottom (position: absolute, not part of
   normal flow) - height alone (see volumeBarStyleFor's own inline style)
   already represents the note's own volume as a fraction of the cell's
   full height, growing up from 0 exactly like a level meter. left/width
   are set inline too (see noteStepSpanStyle) - a note that starts or ends
   mid-step only occupies its own fraction of this column, not the whole
   thing, same as the note itself in the grid above. */
.piano-roll-volume-bar {
  position: absolute;
  bottom: 0;
}

/* A different track's own note at this same step (see
   otherTrackVolumeBars) - visible so switching the active instrument
   doesn't erase the rest of the pattern's volume shape from this row, but
   dimmed and click-through (matching .piano-roll-cell-foreign's own
   treatment of a foreign note up in the grid) since it isn't editable
   from here. */
.piano-roll-volume-bar-ghost {
  opacity: 0.35;
  pointer-events: none;
}

/* Same look/purpose as .piano-roll-resize-handle (a semi-transparent white
   grab strip), just rotated 90 degrees - a horizontal strip along the
   bar's own TOP edge instead of a vertical one along a note's right edge,
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

/* Pushed further down from the bar's own top edge (was 1px) so it doesn't
   crowd .piano-roll-volume-handle right above it. Still floats above a
   short/quiet bar rather than being clipped inside it (this whole element
   is taller than a short bar's own height, via overflow: visible below,
   the default) - reads fine as a small label near the bar's own top, the
   same way a bar chart's own value labels usually work. */
.piano-roll-volume-value {
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  text-align: center;
  /* Matches .piano-roll-label's own note-name text size, so the volume
     number reads as the same "size class" of text as the rest of the
     piano roll. */
  font-size: 0.7rem;
  line-height: 1;
  color: white;
}

.add-song-button {
  bottom: 8px;
}
</style>
