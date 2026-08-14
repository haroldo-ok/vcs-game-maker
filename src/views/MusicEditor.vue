<template>
  <div>
    <v-card flat class="editor-container">
      <v-card-title>Music (alpha)</v-card-title>
      <v-alert type="warning" dense outlined :icon="false" class="alpha-notice">
        This feature is in early alpha. Features may change or break. In fact, it's guaranteed. You've been warned!
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
            v-model="dimSoundFxPercent"
            :disabled="!dimSoundFx"
            min="0"
            max="100"
            step="1"
            hide-details
            class="dim-slider"
          />
          <span class="dim-percent">{{ dimSoundFxPercent }}%</span>
        </div>
        <p class="dim-hint">
          When DIM is on, every note plays at the volume above, as a percentage of its own set volume - same
          setting as the Sound tab's own DIM (changing it here changes it there too). Off: notes play at their
          own set volume.
        </p>
      </v-card-text>
      <v-card-text>
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
                <div class="music-id-badge">ID: {{ song.id }}</div>

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
                    <div class="music-section-label">Sequence (play order)</div>
                  </div>
                  <div v-if="!isSequenceCollapsed(song)" class="sequence-row">
                    <div
                      v-for="(patternId, index) in song.sequence"
                      v-bind:key="index"
                      class="sequence-chip-wrap"
                      :class="{
                        'sequence-chip-dragging': isSequenceStepDragging(song, index),
                        'sequence-chip-drag-over-before': sequenceDragOverSide(song, index) === 'before',
                        'sequence-chip-drag-over-after': sequenceDragOverSide(song, index) === 'after',
                      }"
                      draggable="true"
                      title="Drag to reorder"
                      v-on="sequenceChipListeners(song, index)"
                    >
                      <v-chip
                        small
                        close
                        dark
                        :color="patternSequenceColor(patternId)"
                        :class="{'sequence-chip-playing': isSequenceStepPlaying(song, index)}"
                        title="Click to edit this pattern"
                        @click="() => handleSequenceChipClick(song, index, patternId)"
                        @click:close="() => handleRemoveSequenceStep(song, index)"
                      >
                        {{ patternName(song, patternId) }}
                      </v-chip>
                    </div>
                    <v-select
                      v-bind:key="'seqadd-' + song.id + '-' + song.sequence.length"
                      class="sequence-add-select"
                      dense
                      hide-details
                      label="Add pattern"
                      :items="patternOptions(song)"
                      :value="null"
                      @change="(patternId) => handleAddSequenceStep(song, patternId)"
                    />
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
                    <div class="music-id-badge">ID: {{ activePattern(song).id }}</div>
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
                        :title="activePattern(song).loop ?
                          'Loop this pattern\'s preview playback until stopped (on)' :
                          'Loop this pattern\'s preview playback until stopped (off)'"
                        :class="['music-flat-icon-btn', 'music-icon-btn-size',
                          {'music-icon-btn-active': activePattern(song).loop}]"
                        @click="() => handleToggleLoopPattern(activePattern(song))"
                      >
                        <v-icon small>{{ activePattern(song).loop ? 'mdi-repeat' : 'mdi-repeat-off' }}</v-icon>
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
                        <v-btn
                          v-if="song.patterns.length > 1"
                          icon
                          small
                          title="Delete this pattern"
                          class="delete-icon-btn"
                          @click="() => handleDeletePattern(song, activePattern(song))"
                        >
                          <v-icon small>mdi-delete</v-icon>
                        </v-btn>
                      </div>
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
                          Instruments (click one to choose which its notes go to below)
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
                              :title="isTrackMuted(activePattern(song), track) ?
                                'Unmute this instrument during playback' : 'Mute this instrument during playback'"
                              @click="() => handleToggleTrackMute(activePattern(song), track)"
                            >
                              <v-icon small>{{ isTrackMuted(activePattern(song), track) ? 'mdi-volume-off' : 'mdi-volume-high' }}</v-icon>
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
                              <v-icon small>mdi-close</v-icon>
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

                      <div class="piano-roll-zoom-row" v-if="activePattern(song).tracks.length">
                        <div class="subdivision-controls">
                          <v-icon class="subdivision-icon" title="Note duration snap (slices per step)">mdi-magnet</v-icon>
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
                            <v-btn icon small class="piano-roll-zoom-icon-btn" title="Fit zoom to this pattern's length"
                              @click="() => handleFitZoom(song, activePattern(song))">
                              <v-icon small>mdi-backup-restore</v-icon>
                            </v-btn>
                            <span class="piano-roll-zoom-label">{{ Math.round(pianoRollZoom * 100) }}%</span>
                            <v-btn icon small class="piano-roll-zoom-icon-btn" title="Zoom out" @click="() => stepPianoRollZoom(-1)">
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
                            <v-btn icon small class="piano-roll-zoom-icon-btn" title="Zoom in" @click="() => stepPianoRollZoom(1)">
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
                              :title="activePattern(song).loop ?
                                'Loop this pattern\'s preview playback until stopped (on)' :
                                'Loop this pattern\'s preview playback until stopped (off)'"
                              :class="['music-flat-icon-btn', 'music-icon-btn-size',
                                {'music-icon-btn-active': activePattern(song).loop}]"
                              @click="() => handleToggleLoopPattern(activePattern(song))"
                            >
                              <v-icon small>{{ activePattern(song).loop ? 'mdi-repeat' : 'mdi-repeat-off' }}</v-icon>
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

                      <div class="piano-roll-scroll" v-if="activePattern(song).tracks.length">
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
                              :style="[patternCellStyle(activePattern(song), row, stepIndex - 1), {flex: `0 0 ${cellWidthPx()}px`}]"
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
  computed, defineComponent, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref,
} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useMusicEditorActiveState} from '../hooks/music-editor-state';
import {useConfigurationStorage, useSongsStorage, useSoundEffectsStorage} from '../hooks/project';
import {
  clampTempo, DEFAULT_PATTERN_STEPS, DEFAULT_SONGS, DEFAULT_TEMPO, DURATION_SUBDIVISION_OPTIONS,
  LENGTH_UNITS_PER_STEP, MAX_PATTERN_STEPS, MAX_TEMPO, MIN_TEMPO, PATTERN_STEP_OPTIONS,
  processSongsStorageDefaults,
} from '../blocks/music';
import {processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT} from '../generators/bbasic/soundfx';
import {CHANNEL_OPTIONS} from '../blocks/sound';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {audcHasTunableNotes, audfByMidiForAudc, CANONICAL_NOTE_ROWS} from '../utils/music-notes';
import {effectiveTempo, getPlaybackHead, playPattern, playSequence, previewPatternNote, setTrackMuted,
  stopPatternPlayback} from '../utils/music-playback';
import {autoInstrumentColor, instrumentColorFor, isLightColor} from '../utils/instrument-colors';

// The piano roll's own zoom range (25%-1600%) goes well past the shared
// hooks/zoom.js's own discrete ZOOM_LEVELS (used by the sprite/background/
// score editors, capped at 400%) - a plain continuous slider here instead,
// stored separately so it doesn't disturb those editors' own zoom levels.
const PIANO_ROLL_ZOOM_KEY = 'vcs-game-maker.zoom.music-piano-roll';
const clampPianoRollZoom = (value) => (Number.isFinite(value) ? Math.min(16, Math.max(0.25, value)) : 1);

// Which instrument rows are muted for pattern/song preview playback - a view
// preference (see mutedTrackIds below), but one that should survive
// navigating away to another tab and back, not just reset silently. Same
// localStorage-backed shape as PIANO_ROLL_ZOOM_KEY above.
const MUTED_TRACKS_KEY = 'vcs-game-maker.muted.music-tracks';
const loadMutedTrackIds = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(MUTED_TRACKS_KEY));
    return (stored && typeof stored === 'object') ? stored : {};
  } catch (e) {
    return {};
  }
};

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
    // Same shared configurationStorage keys as SoundFXEditor.vue's own
    // identical dimSoundFx/dimSoundFxPercent computed pair - deliberately
    // not scoped to this tab, so toggling/adjusting either one here or on
    // the Sound tab updates the exact same underlying value both read from,
    // no separate sync logic needed. Music's own note volumes already read
    // these same two config keys (see generators/bbasic/music.js's own
    // buildMusicPlayResetBody/flattenPatternEvents), so this UI is the only
    // piece that was actually missing.
    const configurationStorage = useConfigurationStorage();
    const dimSoundFx = computed({
      get() {
        return !!(configurationStorage.value || {}).dimSoundFx;
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          dimSoundFx: value,
        };
      },
    });
    const dimSoundFxPercent = computed({
      get() {
        return (configurationStorage.value || {}).dimSoundFxPercent ?? DEFAULT_DIM_PERCENT;
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          dimSoundFxPercent: value,
        };
      },
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

    const handleToggleLoopPattern = (pattern) => {
      pattern.loop = !pattern.loop;
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
    const dragTargetListeners = (index) => (draggedSequenceStep.value ? {} : rawDragTargetListeners(index));

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
    // fix: pattern.loop has existed since patterns themselves did, so it's
    // never a NEW property on an existing pattern the way song.loop can be
    // on an existing song.
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
        sequence: [1],
      };
      songs.push(newSong);
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
      saveAs(blob, `${filename}-${getDateInfix()}.json`);
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

    // Which instrument rows are silenced during pattern/song preview
    // playback - same "view preference, not project data" shape as
    // hiddenTrackIds above, just for audio instead of the piano roll's own
    // display (doesn't touch the compiled ROM at all - that has no concept
    // of muting, only the Music tab's own browser preview does).
    const mutedTrackIds = ref(loadMutedTrackIds());
    const mutedTrackKey = (pattern, track) => `${pattern.id}:${track.id}`;
    const isTrackMuted = (pattern, track) => !!mutedTrackIds.value[mutedTrackKey(pattern, track)];
    const handleToggleTrackMute = (pattern, track) => {
      const key = mutedTrackKey(pattern, track);
      const muted = !mutedTrackIds.value[key];
      mutedTrackIds.value = {...mutedTrackIds.value, [key]: muted};
      localStorage.setItem(MUTED_TRACKS_KEY, JSON.stringify(mutedTrackIds.value));
      // Applies immediately to whatever's currently playing, not just the
      // NEXT pattern/song play - see setTrackMuted's own comment.
      setTrackMuted(pattern, track, muted);
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

    const handleAddSequenceStep = (song, patternId) => {
      if (patternId == null) return;
      song.sequence.push(patternId);
      handleChildChange();
      forceUpdate();
    };

    const handleRemoveSequenceStep = (song, index) => {
      song.sequence.splice(index, 1);
      handleChildChange();
      forceUpdate();
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
    // {songId, index, side} - side is 'before' or 'after', which HALF of
    // chip `index` the pointer is currently over (see dragOverSideFor
    // below) - a chip being dragged toward doesn't just mean "insert
    // before it" the way the old single-index version always drew its
    // highlight; a chip dragged to a position AFTER a target needs the
    // highlight (and the actual drop) to land on that target's own right
    // side, not its left.
    const dragOverSequenceStep = ref(null);
    const isSequenceStepDragging = (song, index) =>
      !!draggedSequenceStep.value &&
      draggedSequenceStep.value.songId === song.id && draggedSequenceStep.value.index === index;
    const isSequenceStepDragOver = (song, index) =>
      !!dragOverSequenceStep.value &&
      dragOverSequenceStep.value.songId === song.id && dragOverSequenceStep.value.index === index &&
      !isSequenceStepDragging(song, index);
    // Which side of chip `index`'s own highlight to show, for the
    // template's :class binding - null when this chip isn't the current
    // drag-over target at all (see isSequenceStepDragOver above, which
    // this reuses so the two never disagree).
    const sequenceDragOverSide = (song, index) =>
      isSequenceStepDragOver(song, index) ? dragOverSequenceStep.value.side : null;
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
    const sequenceChipListeners = (song, index) => ({
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
        draggedSequenceStep.value = {songId: song.id, index};
        event.dataTransfer.effectAllowed = 'move';
        // Same Firefox requirement as hooks/drag-reorder.js's own
        // dragHandleListeners - the value itself is never read back.
        event.dataTransfer.setData('text/plain', String(index));
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
        // actually writing the ref when the target (index OR which half
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
        if (!current || current.songId !== song.id || current.index !== index || current.side !== side) {
          dragOverSequenceStep.value = {songId: song.id, index, side};
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
        if (isSequenceStepDragOver(song, index) || isSequenceStepDragging(song, index)) {
          dragOverSequenceStep.value = null;
        }
      },
      drop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = draggedSequenceStep.value;
        draggedSequenceStep.value = null;
        dragOverSequenceStep.value = null;
        if (!from || from.songId !== song.id) return;
        // Computed fresh off the actual drop event's own pointer position
        // (not read back off dragOverSequenceStep) so the drop always
        // matches exactly what the highlight it lands on last showed, even
        // in the (browser-dependent) edge case where a final dragover
        // right before the drop didn't get a chance to update that ref.
        const side = dragOverSideFor(event);
        // Where the dragged chip should land, in terms of the ORIGINAL
        // (pre-removal) array's own indices: right before `index` for
        // 'before', right after it for 'after'. Removing the dragged chip
        // first shifts every index after its own OLD position left by
        // one, so that has to be corrected for before this target
        // position is actually used to splice it back in - see
        // dragOverSideFor's own comment for why "before/after a target"
        // is tracked at all instead of always inserting before it.
        let insertAt = side === 'after' ? index + 1 : index;
        if (from.index < insertAt) insertAt--;
        if (insertAt === from.index) return;
        const sequence = song.sequence.slice();
        const [moved] = sequence.splice(from.index, 1);
        sequence.splice(insertAt, 0, moved);
        song.sequence = sequence;
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
    // Sequence list's playing-pattern highlight (see isSequenceStepPlaying).
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
        isTrackMuted,
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
        isTrackMuted,
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

    // A sequence chip's own click has two different meanings depending on
    // whether this song is actually playing right now: normally it just
    // switches which pattern is being viewed/edited (see setActivePattern),
    // but while the song's own sequence is mid-playback, clicking a chip
    // instead JUMPS playback there (restarting handlePlaySong at that
    // step), the same "click seeks" affordance the piano roll's own step
    // ruler already gives a single playing pattern (see handleSeekToStep).
    const handleSequenceChipClick = (song, index, patternId) => {
      if (playingSongId.value === song.id) {
        handlePlaySong(song, index);
      } else {
        setActivePattern(song, patternId);
      }
    };

    // Whether THIS specific sequence entry (identified by its own index in
    // song.sequence, not just its patternId) is the one currently sounding -
    // only meaningful during song (not lone pattern) playback, since a
    // sequence step only exists in that context. Matched by index rather
    // than patternId alone so a pattern used more than once in the same
    // sequence (e.g. an intro pattern reused later) only highlights the one
    // chip actually playing right now, not every chip for that pattern at
    // once (see sequenceIndex in music-playback.js's getPlaybackHead).
    const isSequenceStepPlaying = (song, sequenceIndex) =>
      playingSongId.value === song.id && !!playbackHead.value && playbackHead.value.sequenceIndex === sequenceIndex;

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
        (pattern) => ({text: pattern.name || `Pattern ${pattern.id}`, value: pattern.id}));

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
      Math.max(1, Math.round(LENGTH_UNITS_PER_STEP / (state.value.subdivision || 1)));

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
      const subdivision = Math.max(1, Math.round(state.value.subdivision || 1));
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
      const subdivision = Math.max(1, Math.round(state.value.subdivision || 1));
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
    // they are) without competing with unmuted ones for attention. color-mix
    // works uniformly whether the source color is hsl(...) (an
    // auto-assigned instrument color - see autoInstrumentColor) or the
    // rgb(...)/hex a user picked explicitly on the Sound tab, unlike trying
    // to parse/rewrite the color string's own alpha channel per-format.
    const mutedNoteColor = (color) => `color-mix(in srgb, ${color} 35%, transparent)`;

    const segmentGradient = (stepStartUnits, startUnits, endUnits, color) => {
      const startPercent = Math.max(0, ((startUnits - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      const endPercent = Math.min(100, ((endUnits - stepStartUnits) / LENGTH_UNITS_PER_STEP) * 100);
      return `linear-gradient(to right, transparent ${startPercent}%, ${color} ${startPercent}%, ` +
        `${color} ${endPercent}%, transparent ${endPercent}%)`;
    };

    // The same hover accent color (the app's own purple) for both add and
    // remove - previously "remove" used a near-opaque white wash instead,
    // which read as fading/lightening an already-placed note out rather
    // than tinting it. Blended (via normal alpha stacking) over an existing
    // note's own color for remove, or over the empty cell for add, so the
    // two still look distinct from each other despite sharing one color.
    const HOVER_PREVIEW_COLORS = {
      add: 'rgba(156, 39, 176, 0.4)',
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

    const patternCellStyle = (pattern, row, step) => {
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
              const color = isTrackMuted(pattern, track) ?
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
      const subdivision = Math.max(1, Math.round(state.value.subdivision || 1));
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
      // replacing).
      const placeable = canPlaceNoteAt(pattern, activeTrack, row, startUnits, endUnits);
      hoverPreview.value = {
        mode: placeable ? 'add' : 'blocked',
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
      if (!isTrackMuted(pattern, activeTrack)) {
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
    onBeforeUnmount(() => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', stopResize);
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
      dimSoundFx, dimSoundFxPercent,
      state, handleChildChange, handleChangeSubdivision,
      handleTempoChange, minTempo: MIN_TEMPO, maxTempo: MAX_TEMPO,
      handleAddSong, handleDeleteSong, handleExportSong, handleImportSong,
      handleAddPattern, handleDuplicatePattern, handleDeletePattern, handleStepCountChange,
      handlePatternFieldChange,
      handleExportPattern, handleImportPattern,
      handleAddTrack, handleDeleteTrack, copiedTrackNotes, handleCopyTrack, handlePasteTrack,
      handleAddSequenceStep, handleRemoveSequenceStep,
      sequenceChipListeners, isSequenceStepDragging, sequenceDragOverSide,
      handlePlayPattern, handlePlaySong, handleSequenceChipClick, handleStop,
      handleToggleLoopPattern, handleToggleLoopSong,
      handleSeekToStep,
      playingPatternId, playingSongId,
      isSequenceStepPlaying, patternSequenceColor,
      handlePatternCellClick, handleCellHover, handleCellLeave, startResize,
      activePatternId, setActivePattern, activePattern,
      activeTrackFor, isActiveTrack, setActiveTrack,
      isTrackHidden, handleToggleTrackVisibility, isTrackMuted, handleToggleTrackMute,
      patternName, patternOptions, stepsFor,
      patternCellClasses, patternCellStyle, patternCellTitle, activeTrackNoteTips, noteEndFraction, noteAt,
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

.dim-hint {
  margin-top: 8px;
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.75rem;
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

/* Fixed 26px box, same as .piano-roll-zoom-icon-btn's own button box on the
   other side of the row - keeps the icon centered on the exact same
   baseline as the reset-zoom button instead of sizing to (and sitting
   wherever) its own glyph's natural line-height would otherwise put it.
   16px matches the reset/zoom-in/zoom-out buttons' own <v-icon small>. */
.subdivision-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  font-size: 16px !important;
}

/* Vuetify's own default (non-outlined) text-field/select style still
   reserves some top padding for where a floating label would normally sit,
   even with single-line - forcing the slot/control down to a 26px min-height
   alone wasn't enough to cancel that out, so the field kept sitting visibly
   lower than its 26px-tall neighbors (.subdivision-icon, the reset-zoom
   button). The negative margin-top pulls the whole field's box up to
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
  /* Half this same v-card-text's own left/right padding (16px, Vuetify's
     default, left untouched) - matching it exactly (16px) combined with
     .pattern-card's own 12px margin-bottom still read as too much once
     seen together. */
  padding-bottom: 6px;
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

.pattern-name-row {
  display: flex;
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

/* Same margin-top override as SoundFXEditor's own .dim-switch/.soundfx-fade -
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
  margin-bottom: 16px;
}

.sequence-add-select {
  max-width: 220px;
  margin-top: -4px;
}

.sequence-chip-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
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
   into the chip's own color either, on a light or dark chip color alike. */
.sequence-chip-playing {
  box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v-primary-base, #1976d2);
}

.pattern-card {
  position: relative;
  margin-bottom: 12px;
}

.track-section {
  padding-top: 0;
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

/* space-between (not flex-end, its old value from before the subdivision
   select moved in here) pins the subdivision select to the row's own left
   edge - flush with the piano roll area right below it - while the
   fit-zoom button/slider/label group (see .piano-roll-zoom-controls) still
   sits on the right, exactly where it always has. */
.piano-roll-zoom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 4px;
}

/* Groups the zoom controls with the pattern preview play/stop/loop buttons
   (moved in here from the pattern card's own top-right toolbar) so they sit
   immediately next to each other - .piano-roll-zoom-row's own
   space-between still puts .subdivision-controls on the far left and this
   whole group on the far right, exactly as before adding a second group to
   it would otherwise have shifted .piano-roll-zoom-controls into the
   middle instead. */
.piano-roll-zoom-and-playback {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
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

/* Small left margin (not the zoom controls' own 0 gap) - these buttons are
   a visually separate group (preview playback, not zoom), so a slightly
   bigger gap than between the zoom icons themselves reads as two groups
   sitting next to each other rather than one continuous row of buttons. */
.pattern-playback-controls {
  display: flex;
  align-items: center;
  margin-left: 8px;
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
   centering against each element's full (very different) box height. */
.track-instrument-row {
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

/* Show/hide, mute, copy, paste, delete - grouped tighter together than the
   rest of the row (which needs the breathing room for its dropdowns), since
   they're all just small icon actions for this one instrument. */
.track-icon-group {
  display: flex;
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

.track-instrument-select {
  flex: 1 1 200px;
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
   scroll, just not horizontal). */
.piano-roll-scroll {
  max-height: 284px;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 2px;
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

.add-song-button {
  bottom: 8px;
}
</style>
