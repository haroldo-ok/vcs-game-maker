<template>
  <div>
    <v-card class="editor-container" :ripple="false" @click="deselectCard">
      <v-card-title>Sound</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message soundfx-intro-paragraph">
          Design sound effects here, then trigger one at runtime with a "Play sound effect"
          block (Actions tab). Each effect is a Frequency/Volume/Duration envelope (or a
          multi-step Arpeggio), with a Priority deciding which effect wins if two try to play on
          the same channel at once.
        </p>
      </v-card-text>
      <v-card-text class="soundfx-dim-section">
        <!-- Same sticky/full-bleed toolbar treatment as DataEditor.vue's
             .data-toolbar (see that file's comments for the full
             reasoning behind each piece - position: sticky, the bleed
             margin/padding trick, always rendered with buttons disabled
             rather than hidden outright). Bank-level actions (act on every
             sound effect at once) stay first, then a divider, then the
             Undo/Redo/Export/Import/Stop/Play controls that used to live on
             each individual card - a real reported request ("add a toolbar
             to the sound tab, next to the import/export sound bank icons,
             with the import, export, stop and play controls currently on
             each sound card... also add undo/redo"), acting on whichever
             card is selected (selectedSoundEffect) the same way
             DataEditor.vue's toolbar acts on selectedTable. @click.stop for
             the same reason GraphicEditorToolbar.vue's root div has it. -->
        <div
          class="soundfx-toolbar"
          :class="{'soundfx-toolbar-scrolled': isSoundFxToolbarScrolled}"
          @click.stop
        >
          <div class="soundfx-toolbar-row">
            <v-btn
              icon
              small
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :title="selectedSoundEffects.length > 1 ?
                `Save the ${selectedSoundEffects.length} selected sounds to a single .vcsbnk sound bank file` :
                'Save every sound effect/instrument in this project to a single .vcsbnk sound bank file (Shift+click or Ctrl+click cards to pick which)'"
              @click="handleExportSoundBank"
            >
              <!-- mdi-database-export/-import, not the plain mdi-export/
                   -import the single-sound-effect buttons below use - a
                   real reported request ("change the icons for sound bank
                   import/export to be different than single sound import/
                   export"): this one acts on every sound effect in the
                   project at once (a whole "bank" file, hence "database"),
                   not just the one card it's attached to the way the
                   per-sound buttons below are. mdi-folder-export/-import,
                   tried first, don't actually exist in this app's loaded
                   icon set (confirmed directly - every other icon on this
                   page renders a real glyph, these two rendered nothing at
                   all) despite reading as a plausible real icon name. -->
              <v-icon>mdi-database-export</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              class="soundfx-bank-btn soundfx-icon-btn-size"
              title="Load a .vcsbnk sound bank file - a sound effect whose name matches one already here has its parameters replaced; every other sound effect in the file is added as a new card"
              @click="handleImportSoundBank"
            >
              <v-icon>mdi-database-import</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <v-btn
              icon
              small
              :title="UNDO_TITLE"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!(selectedSoundEffect && canUndoEnvelope(selectedSoundEffect)) && !reorderCanUndo"
              @click="() => handleUndoEnvelope(selectedSoundEffect)"
            >
              <v-icon>mdi-undo</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              :title="REDO_TITLE"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!(selectedSoundEffect && canRedoEnvelope(selectedSoundEffect)) && !reorderCanRedo"
              @click="() => handleRedoEnvelope(selectedSoundEffect)"
            >
              <v-icon>mdi-redo</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <v-btn
              icon
              small
              :title="selectedSoundEffects.length > 1 ?
                `Export each of the ${selectedSoundEffects.length} selected sounds to a separate .vcssnd file (Shift+E)` :
                'Export sound effect to .vcssnd file (Shift+E)'"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!selectedSoundEffect"
              @click="handleExportSelectedSoundEffects"
            >
              <v-icon>mdi-export</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Import sound effect from .vcssnd file (Shift+I)"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!selectedSoundEffect"
              @click="() => handleImportSoundEffect(selectedSoundEffect)"
            >
              <v-icon>mdi-import</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <v-btn
              icon
              small
              :title="loopPreview ?
                'Loop the sound preview until stopped (on)' :
                'Loop the sound preview until stopped (off)'"
              :class="['soundfx-bank-btn', 'soundfx-icon-btn-size', 'soundfx-loop-btn', {'soundfx-loop-btn-active': loopPreview}]"
              @click="loopPreview = !loopPreview"
            >
              <v-icon small>{{ loopPreview ? 'mdi-repeat' : 'mdi-repeat-off' }}</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Stop the sound preview"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              @click="handleStopPreview"
            >
              <v-icon>mdi-stop</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Play this sound effect (Space)"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!selectedSoundEffect"
              @click="() => handlePlaySoundEffect(selectedSoundEffect, cardTia(selectedSoundEffect))"
            >
              <v-icon>mdi-play</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <div class="dim-controls" title="When DIM is on, every sound effect plays at the volume set here, as a percentage of its set volume (the same setting as the Music tab's DIM). Off: sound effects play at their set volume.">
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
            <v-divider class="soundfx-toolbar-divider soundfx-toolbar-divider-wide" vertical />
            <v-switch
              v-model="soundFxColumns"
              label="Columns"
              title="Lay sound effect cards out in multiple columns when there's room, instead of one full-width column."
              hide-details
              class="soundfx-columns-switch"
            />
            <v-divider class="soundfx-toolbar-divider soundfx-toolbar-divider-wide" vertical />
            <v-select
              v-model="soundFilter"
              prefix="Show"
              :items="soundFilterItems"
              dense
              single-line
              hide-details
              class="soundfx-filter"
            />
          </div>
        </div>

        <SoundBankImportDialog
          v-model="soundBankImportOpen"
          :entries="soundBankImportEntries"
          @confirm="handleConfirmSoundBankImport"
        />
        <v-list class="soundfx-list" :class="{'soundfx-list--single-column': !soundFxColumns}">
          <v-list-item
            v-for="(soundEffect, index) in state.soundEffects"
            v-show="matchesSoundFilter(soundEffect)"
            class="entry-list-item"
            v-bind:key="soundEffect.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="soundfx-card"
                :class="[dragCardClass(index), {'soundfx-card-selected': selectedCardIds.includes(soundEffect.id)}]"
                v-on="dragTargetListeners(index)"
                @mousedown.shift.prevent
                @click.stop="(event) => selectCard(soundEffect.id, event)"
              >
                <div
                  class="soundfx-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-btn
                  :title="isCollapsed(soundEffect) ? 'Expand this sound effect' : 'Collapse this sound effect'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="soundfx-collapse-btn"
                  @click="() => toggleCollapsed(soundEffect)"
                >
                  <v-icon>{{ isCollapsed(soundEffect) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="soundfx-id-badge">ID:{{ soundEffect.id }}</div>

                <!-- Same top-right corner/offset as DataEditor.vue's
                     .data-toolbar-top-right - a real reported request ("move
                     the delete button to the top right of each card, like
                     it is on data table cards. use the same positioning"). -->
                <div class="soundfx-toolbar-top-right">
                  <v-btn
                    icon
                    small
                    title="Duplicate this sound effect"
                    class="soundfx-play-btn soundfx-icon-btn-size"
                    @click.stop="() => handleDuplicateSoundEffect(soundEffect)"
                  >
                    <v-icon>mdi-content-duplicate</v-icon>
                  </v-btn>
                  <confirm-delete-menu
                    v-if="state.soundEffects.length > 1"
                    :title="deleteTitleFor(soundEffect)"
                    :selected="selectedCardId === soundEffect.id && selectedCardIds.includes(soundEffect.id)"
                    :activator-title="deleteTitleFor(soundEffect).replace('?', '')"
                    icon-btn-class="soundfx-delete-btn soundfx-icon-btn-size"
                    @confirm="handleDeleteSoundEffect(soundEffect)"
                  />
                </div>

                <v-card-text class="soundfx-name-section">
                  <div class="soundfx-name-row">
                    <color-swatch-picker
                      class="soundfx-color-picker"
                      :value="soundEffect.color"
                      :fallback-color="autoInstrumentColor(soundEffect.id)"
                      title="Click to set this instrument's note color on the Music tab"
                      @input="(byte) => handleSetSoundEffectColor(soundEffect, byte)"
                    />
                    <v-text-field
                      class="soundfx-name-field"
                      label="Sound name"
                      v-model="soundEffect.name"
                      @change="handleChildChange"
                    />
                    <v-select
                      label="Priority"
                      title="When this sound would overlap another sound on the same Music tab channel, the higher priority number always wins and keeps playing - the lower one is cut short instead. Equal priority: whichever note starts later still wins, same as before this existed."
                      v-model="soundEffect.priority"
                      :items="priorityOptionItems"
                      hide-details
                      @change="handleChildChange"
                      class="soundfx-priority"
                    />
                    <v-menu offset-y content-class="soundfx-kind-menu">
                      <template v-slot:activator="{on, attrs}">
                        <v-btn
                          icon
                          small
                          v-bind="attrs"
                          v-on="on"
                          class="soundfx-instrument-btn soundfx-icon-btn-size"
                          :title="soundKindFor(soundEffect).text + ' (click to change). A sound effect is played by a Play sound effect block, an instrument plays notes on the piano rows of the Music tab, and percussion plays its one pitch from the Hit row there. Any of them can be used both ways - this decides where each one is offered.'"
                        >
                          <!-- The icon is the kind itself: a waveform for a sound, a piano for an instrument, a drum for
                               percussion. -->
                          <v-icon small>{{ soundKindFor(soundEffect).icon }}</v-icon>
                        </v-btn>
                      </template>
                      <v-list dense>
                        <v-list-item v-for="kind in soundKinds" :key="kind.value" @click="() => handleSetSoundKind(soundEffect, kind.value)">
                          <v-list-item-icon><v-icon small>{{ kind.icon }}</v-icon></v-list-item-icon>
                          <v-list-item-content><v-list-item-title>{{ kind.text }}</v-list-item-title></v-list-item-content>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                </v-card-text>

                <v-card-text v-if="!isCollapsed(soundEffect)" class="soundfx-fields-section">
                  <div class="soundfx-fields">
                    <v-btn-toggle
                      v-if="dpcPlusSoundCards"
                      :value="cardView(soundEffect)"
                      mandatory
                      dense
                      class="soundfx-kernel-toggle"
                      @change="(view) => setCardView(soundEffect, view)"
                    >
                      <v-btn value="standard" small title="The sound the TIA plays, which is channel 1 and any sound that uses the Standard sound types">TIA</v-btn>
                      <v-btn value="dpcplus" small title="The sound the DPC+ chip plays, which the ARM mixes (channels 0, 2 and 3)">ARM</v-btn>
                    </v-btn-toggle>
                    <v-select
                      v-if="!cardDpc(soundEffect)"
                      label="Sound type"
                      v-model="soundEffect.audc"
                      :items="audcOptionItems"
                      @change="() => handleStandardChange(soundEffect, true)"
                      class="soundfx-audc"
                    />
                    <WaveformEditor
                      v-if="cardDpc(soundEffect)"
                      :sound="soundEffect"
                      class="soundfx-waveform"
                      @change="(wave) => handleWaveformChange(soundEffect, wave)"
                    />
                    <div class="soundfx-basic-fields-row">
                      <v-select
                        v-if="cardDpc(soundEffect)"
                        :label="soundEffect.isPercussion ? 'Pitch' : 'Note'"
                        title="The piano key the sound plays. A sound converted from the Standard kernel can have a pitch between two keys, shown as Custom."
                        :value="dpcPlusNoteValue(soundEffect)"
                        :items="dpcPlusNoteItems(soundEffect)"
                        @change="(value) => handleDpcPlusNoteChange(soundEffect, value)"
                        class="soundfx-frequency"
                      />
                      <v-select
                        v-else-if="audcHasTunableNotes(soundEffect.audc, cardTia(soundEffect)) && !soundEffect.isPercussion"
                        label="Frequency"
                        title="Limited to the AUDF values that play a clean, in-tune note on this sound type - same set the piano roll allows on the Music tab."
                        v-model.number="soundEffect.audf"
                        :items="frequencyItems(soundEffect.audc)"
                        @change="() => handleStandardChange(soundEffect)"
                        class="soundfx-frequency"
                      />
                      <v-text-field
                        v-else
                        label="Frequency"
                        v-model.number="soundEffect.audf"
                        type="number"
                        min="0"
                        max="31"
                        @change="() => handleStandardChange(soundEffect)"
                        class="soundfx-frequency"
                      />
                      <v-text-field
                        label="Volume"
                        v-model.number="soundEffect.audv"
                        type="number"
                        min="0"
                        max="15"
                        @change="handleChildChange"
                        class="soundfx-number"
                      />
                      <v-text-field
                        label="Duration"
                        v-model.number="soundEffect.duration"
                        type="number"
                        min="0"
                        max="255"
                        :disabled="!!soundEffect.envelope"
                        :title="soundEffect.envelope ? 'Set by the envelope: always its full length (Attack + Decay + Sustain + Release).' : ''"
                        @change="handleChildChange"
                        class="soundfx-number"
                      />
                    </div>
                    <div class="soundfx-arpeggio-block"
                      :class="{'soundfx-arpeggio-block--expanded': soundEffect.arpeggio}"
                    >
                      <v-switch
                        v-model="soundEffect.arpeggio"
                        label="Arpeggio"
                        title="Always on for every note played with this instrument on the Music tab, and when the sound is played from blocks - rapidly flips between the note's pitch and a second nearby pitch (set below) to fake a chord."
                        hide-details
                        class="soundfx-arpeggio-switch"
                        @change="handleChildChange"
                      />
                      <template v-if="soundEffect.arpeggio">
                        <v-select
                          label="Speed"
                          title="How often it flips pitch, relative to the song/pattern's tempo - speeds up and slows down with the song."
                          v-model="soundEffect.arpeggioDivision"
                          :items="arpeggioDivisionOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-number"
                        />
                        <v-text-field
                          label="Interval"
                          title="Fixed pitch jump between the note's pitch and the second alternating pitch."
                          v-model.number="soundEffect.arpeggioInterval"
                          type="number"
                          :min="MIN_ARPEGGIO_INTERVAL"
                          :max="MAX_ARPEGGIO_INTERVAL"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-number"
                        />
                        <v-select
                          label="Range"
                          title="1 OCT: cycles only between the note's pitch and pitch+interval. 2 OCT: plays that pattern, then repeats it one octave up before looping back."
                          v-model="soundEffect.arpeggioRange"
                          :items="arpeggioRangeOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-frequency"
                        />
                      </template>
                    </div>
                    <div class="soundfx-envelope-block"
                      :class="{'soundfx-envelope-block--expanded': soundEffect.envelope}"
                    >
                      <v-switch
                        v-model="soundEffect.envelope"
                        label="Envelope"
                        title="Shapes this sound's volume over time (Attack/Decay/Sustain/Release), instead of playing at a fixed volume until it ends. Applies both here and when this preset is used as a Music tab instrument."
                        hide-details
                        class="soundfx-envelope-switch"
                        @change="handleChildChange"
                      />
                      <template v-if="soundEffect.envelope">
                        <v-select
                          label="Attack"
                          title="Frames to ramp up from silence to full volume."
                          v-model="soundEffect.envelopeAttack"
                          :items="envelopeAttackReleaseFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Decay"
                          title="Frames to ramp down from full volume to the Decay End level."
                          v-model="soundEffect.envelopeDecay"
                          :items="envelopeStageFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Decay End Volume"
                          title="The volume level (percent of full volume) Decay ramps down to, and Sustain ramps from."
                          v-model="soundEffect.envelopeDecayEnd"
                          :items="envelopeVolumePercentOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Sustain length"
                          title="How many frames Sustain takes to glide from the Decay End level to the Release Start level, before Release begins - 0 skips straight from Decay into Release."
                          v-model="soundEffect.envelopeSustainLength"
                          :items="envelopeSustainFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Release Start Volume"
                          title="The volume level (percent of full volume) Sustain ramps to, and Release ramps down from - can be set higher than Decay End, so Sustain glides UP into Release instead of only ever down."
                          v-model="soundEffect.envelopeReleaseStart"
                          :items="envelopeVolumePercentOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Release"
                          title="Frames to ramp down from the Release Start level to silence, starting right after Sustain ends."
                          v-model="soundEffect.envelopeRelease"
                          :items="envelopeAttackReleaseFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <!-- The envelope in steps: each level held for a few frames, the levels multiples of a step; the graph shows it. -->
                        <div class="soundfx-sweep-switches">
                          <v-switch
                            v-model="soundEffect.staircase"
                            label="Staircase"
                            title="Plays the envelope in steps instead of gliding: the volume holds one level for a few frames, then jumps to the next. The graph shows the steps."
                            hide-details
                            dense
                            class="soundfx-sweep-switch"
                            @change="handleChildChange"
                          />
                        </div>
                        <div v-if="soundEffect.staircase" class="soundfx-sweep-fields">
                          <v-text-field
                            label="Step"
                            title="The volume levels are multiples of this (2 gives 2, 4, 6 ...)."
                            v-model.number="soundEffect.staircaseStep"
                            type="number"
                            min="1"
                            :max="MAX_STAIRCASE_STEP"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                          <v-select
                            label="Hold"
                            title="How many frames each level is held."
                            v-model="soundEffect.staircaseFrames"
                            :items="staircaseFrameOptionItems"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                        </div>
                        <div class="soundfx-envelope-graph-toolbar">
                          <v-btn
                            icon
                            small
                            title="Reset envelope to default"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            @click="() => handleResetEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-restore</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            :title="UNDO_TITLE"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            :disabled="!canUndoEnvelope(soundEffect) && !reorderCanUndo"
                            @click="() => handleUndoEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-undo</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            :title="REDO_TITLE"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            :disabled="!canRedoEnvelope(soundEffect) && !reorderCanRedo"
                            @click="() => handleRedoEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-redo</v-icon>
                          </v-btn>
                        </div>
                        <EnvelopeGraph
                          :staircase-step="soundEffect.staircase ? soundEffect.staircaseStep : 0"
                          :staircase-frames="soundEffect.staircase ? soundEffect.staircaseFrames : 0"
                          :peak-volume="soundEffect.audv"
                          :attack="soundEffect.envelopeAttack"
                          :decay="soundEffect.envelopeDecay"
                          :decay-end-percent="soundEffect.envelopeDecayEnd"
                          :sustain-length="soundEffect.envelopeSustainLength"
                          :release-start-percent="soundEffect.envelopeReleaseStart"
                          :release="soundEffect.envelopeRelease"
                          @update:attack="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeAttack', value)"
                          @update:decay="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeDecay', value)"
                          @update:decayEndPercent="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeDecayEnd', value)"
                          @update:releaseStartPercent="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeReleaseStart', value)"
                          @update:release="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeRelease', value)"
                        />
                      </template>
                    </div>
                    <!-- A sound of the DPC+ chip can play the pitches the TIA plays: the sweep, frequency envelope and arpeggio of the Standard settings. -->
                    <v-switch
                      v-if="cardDpc(soundEffect) && (soundEffect.sweep || soundEffect.pitchEnvelope || soundEffect.arpeggio)"
                      :input-value="dpcFollows(soundEffect)"
                      label="Same pitches as Standard"
                      title="On: the chip plays the same pitches as the TIA plays for this sound's sweep, frequency envelope and arpeggio (the settings of the Standard side, in steps of the frequency number), so the two sound alike. Off: the sweep moves in semitones to an End note."
                      hide-details
                      dense
                      class="soundfx-dpc-follow-switch"
                      @change="(value) => setDpcFollows(soundEffect, value)"
                    />
                    <!-- A frequency sweep: the pitch moves from the Frequency above to the end frequency while the sound plays. -->
                    <div class="soundfx-arpeggio-block soundfx-sweep-block"
                      :class="{'soundfx-arpeggio-block--expanded': soundEffect.sweep}"
                    >
                      <v-switch
                        v-model="soundEffect.sweep"
                        label="Frequency sweep"
                        title="The pitch moves from the Frequency (or Note) above to the end frequency while the sound plays, one step every few frames."
                        hide-details
                        class="soundfx-arpeggio-switch"
                        @change="() => handleSweepSwitch(soundEffect)"
                      />
                      <template v-if="soundEffect.sweep">
                        <!-- The numbers on one full-width row, the two switches under them. -->
                        <div class="soundfx-sweep-fields">
                          <!-- A sound of the DPC+ chip sweeps to a note of the piano, in semitones. -->
                          <v-select
                            v-if="cardDpc(soundEffect) && !dpcFollows(soundEffect)"
                            label="End note"
                            title="The note the sweep moves to."
                            v-model.number="soundEffect.dpcSweepEnd"
                            :items="pianoKeyItems"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                          <!-- Like the Frequency field: with a note beside the number where the sound type has in-tune notes. -->
                          <v-select
                            v-else-if="audcHasTunableNotes(soundEffect.audc, cardTia(soundEffect)) && !soundEffect.isPercussion"
                            label="End frequency"
                            title="The frequency (0 to 31) the sweep moves to. A higher number is a lower pitch."
                            v-model.number="soundEffect.sweepEnd"
                            :items="endFrequencyItems(soundEffect.audc)"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                          <v-text-field
                            v-else
                            label="End frequency"
                            title="The frequency (0 to 31) the sweep moves to. A higher number is a lower pitch."
                            v-model.number="soundEffect.sweepEnd"
                            type="number"
                            min="0"
                            max="31"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                          <v-text-field
                            label="Step"
                            :title="cardDpc(soundEffect) && !dpcFollows(soundEffect) ? 'How many semitones the pitch moves each time it steps.' : 'How far the frequency moves each time it steps.'"
                            v-model.number="soundEffect.sweepStep"
                            type="number"
                            min="1"
                            :max="cardDpc(soundEffect) && !dpcFollows(soundEffect) ? MAX_DPC_SWEEP_STEP : MAX_SWEEP_STEP"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                          <v-select
                            label="Every"
                            title="How many frames pass between steps."
                            v-model="soundEffect.sweepFrames"
                            :items="sweepFrameOptionItems"
                            hide-details
                            @change="handleChildChange"
                            class="soundfx-sweep-field"
                          />
                        </div>
                        <div class="soundfx-sweep-switches">
                          <v-switch
                            v-if="!cardDpc(soundEffect) || dpcFollows(soundEffect)"
                            v-model="soundEffect.sweepWrap"
                            label="Wrap"
                            title="The frequencies run from 0 to 31 and then start over. Off: the sweep takes the short way to the end frequency (30 to 20 plays 30, 29 ... 20). On: it takes the long way, past the end of the range (30 to 20 plays 30, 31, 0, 1 ... 20)."
                            hide-details
                            dense
                            class="soundfx-sweep-switch"
                            @change="handleChildChange"
                          />
                          <v-switch
                            v-model="soundEffect.sweepRepeat"
                            label="Repeat"
                            title="When the sweep reaches the end frequency it starts over from the Frequency above. Off: it stays on the end frequency."
                            hide-details
                            dense
                            class="soundfx-sweep-switch"
                            @change="handleChildChange"
                          />
                        </div>
                      </template>
                    </div>
                    <!-- A frequency envelope: the pitch moves by up to an amount, following the envelope's shape. -->
                    <div class="soundfx-envelope-block"
                      :class="{'soundfx-envelope-block--expanded': soundEffect.pitchEnvelope}"
                    >
                      <v-switch
                        v-model="soundEffect.pitchEnvelope"
                        label="Frequency envelope"
                        title="Shapes the pitch over time (Attack/Decay/Sustain/Release), like the volume Envelope shapes the volume: the frequency moves away from the Frequency above by up to the amount set here. Plays when the sound is played from blocks."
                        hide-details
                        class="soundfx-envelope-switch"
                        @change="handleChildChange"
                      />
                      <template v-if="soundEffect.pitchEnvelope">
                        <v-text-field
                          label="Amount"
                          :title="cardDpc(soundEffect) && !dpcFollows(soundEffect) ? 'How many semitones the pitch moves at the peak of the envelope, -31 to 31. A positive number is a higher pitch.' : 'How far the frequency moves at the peak of the envelope, -31 to 31. A positive number is a lower pitch.'"
                          v-model.number="soundEffect.pitchEnvelopeAmount"
                          type="number"
                          min="-31"
                          max="31"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Attack"
                          title="Frames to move from the Frequency to the full amount."
                          v-model="soundEffect.pitchEnvelopeAttack"
                          :items="envelopeAttackReleaseFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Decay"
                          title="Frames to move from the full amount to the Decay End level."
                          v-model="soundEffect.pitchEnvelopeDecay"
                          :items="envelopeStageFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Decay End"
                          title="The part of the amount (percent) Decay ends at, and Sustain starts from."
                          v-model="soundEffect.pitchEnvelopeDecayEnd"
                          :items="envelopeVolumePercentOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Sustain length"
                          title="How many frames Sustain takes to glide from the Decay End level to the Release Start level."
                          v-model="soundEffect.pitchEnvelopeSustainLength"
                          :items="envelopeSustainFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Release Start"
                          title="The part of the amount (percent) Sustain ends at, and Release starts from."
                          v-model="soundEffect.pitchEnvelopeReleaseStart"
                          :items="envelopeVolumePercentOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Release"
                          title="Frames to move from the Release Start level back to the Frequency."
                          v-model="soundEffect.pitchEnvelopeRelease"
                          :items="envelopeAttackReleaseFrameOptionItems"
                          hide-details
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <div class="soundfx-envelope-graph-toolbar">
                          <v-btn
                            icon
                            small
                            title="Reset the frequency envelope to default"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            @click="() => handleResetPitchEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-restore</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            :title="UNDO_TITLE"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            :disabled="!canUndoEnvelope(soundEffect) && !reorderCanUndo"
                            @click="() => handleUndoEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-undo</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            :title="REDO_TITLE"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            :disabled="!canRedoEnvelope(soundEffect) && !reorderCanRedo"
                            @click="() => handleRedoEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-redo</v-icon>
                          </v-btn>
                        </div>
                        <!-- The same graph as the volume envelope's: its height is the part of the Amount the pitch has moved. -->
                        <EnvelopeGraph
                          :attack="soundEffect.pitchEnvelopeAttack"
                          :decay="soundEffect.pitchEnvelopeDecay"
                          :decay-end-percent="soundEffect.pitchEnvelopeDecayEnd"
                          :sustain-length="soundEffect.pitchEnvelopeSustainLength"
                          :release-start-percent="soundEffect.pitchEnvelopeReleaseStart"
                          :release="soundEffect.pitchEnvelopeRelease"
                          @update:attack="(value) => handleEnvelopeGraphChange(soundEffect, 'pitchEnvelopeAttack', value)"
                          @update:decay="(value) => handleEnvelopeGraphChange(soundEffect, 'pitchEnvelopeDecay', value)"
                          @update:decayEndPercent="(value) => handleEnvelopeGraphChange(soundEffect, 'pitchEnvelopeDecayEnd', value)"
                          @update:releaseStartPercent="(value) => handleEnvelopeGraphChange(soundEffect, 'pitchEnvelopeReleaseStart', value)"
                          @update:release="(value) => handleEnvelopeGraphChange(soundEffect, 'pitchEnvelopeRelease', value)"
                        />
                      </template>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-soundfx-buttom"
      color="primary"
      title="Add sound effect"
      dark
      absolute
      right
      fab
      @click="handleAddSoundEffect"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import Vue from 'vue';
import {computed, defineComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useCardSelection} from '../hooks/card-selection';
import {canRedoReorder, canUndoReorder, noteEdit, settleEdits, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';
import {useConfigurationStorage, useDimSoundFxPercentStorage, useDimSoundFxStorage, useSoundEffectsStorage,
  useSoundFxColumnsStorage} from '../hooks/project';
import {frequencyForMidi, midiForPianoIndex, normalizeTiaShape, PIANO_KEY_COUNT} from '../utils/dpc-sound';
import {AUDC_OPTIONS} from '../blocks/sound';
import {DEFAULT_SOUND_EFFECTS, processSoundEffectsStorageDefaults, ARPEGGIO_DIVISION_OPTIONS,
  DEFAULT_ARPEGGIO_DIVISION, DEFAULT_ARPEGGIO_INTERVAL, MIN_ARPEGGIO_INTERVAL,
  MAX_ARPEGGIO_INTERVAL, DEFAULT_ARPEGGIO_RANGE, ARPEGGIO_RANGE_OPTIONS,
  ENVELOPE_STAGE_FRAME_OPTIONS, ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS, ENVELOPE_VOLUME_PERCENT_OPTIONS,
  ENVELOPE_SUSTAIN_FRAME_OPTIONS, DEFAULT_ENVELOPE_ATTACK, DEFAULT_ENVELOPE_DECAY, DEFAULT_ENVELOPE_VOLUME_PERCENT,
  DEFAULT_ENVELOPE_SUSTAIN_FRAMES, DEFAULT_ENVELOPE_RELEASE, NOISE_PRIORITY_OPTIONS,
  DEFAULT_NOISE_PRIORITY} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';
import {STAIRCASE_FRAME_OPTIONS, MAX_STAIRCASE_STEP, DEFAULT_STAIRCASE_STEP, DEFAULT_STAIRCASE_FRAMES} from '../utils/staircase';
import {dpcFollowsStandardPitch, dpcKeyForHz, MAX_DPC_SWEEP_STEP, SWEEP_FRAME_OPTIONS, DEFAULT_SWEEP_END, DEFAULT_SWEEP_STEP, DEFAULT_SWEEP_FRAMES, MAX_SWEEP_STEP,
  DEFAULT_PITCH_ENVELOPE_AMOUNT, DEFAULT_PITCH_ENVELOPE_ATTACK, DEFAULT_PITCH_ENVELOPE_DECAY,
  DEFAULT_PITCH_ENVELOPE_DECAY_END, DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH, DEFAULT_PITCH_ENVELOPE_RELEASE_START,
  DEFAULT_PITCH_ENVELOPE_RELEASE} from '../utils/pitch-table';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {previewSoundEffect, stopSoundEffectPreview} from '../utils/sound-preview';
import {previewDpcPlusSoundEffect} from '../utils/dpc-preview';
import {autoInstrumentColor} from '../utils/instrument-colors';
import {audcHasTunableNotes, notesForAudc} from '../utils/music-notes';
import {buildSoundBankImportEntries, importSoundBankEntries} from '../utils/sound-bank';
import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import WaveformEditor from '../components/WaveformEditor.vue';
import SoundBankImportDialog from '../components/SoundBankImportDialog.vue';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import EnvelopeGraph from '../components/EnvelopeGraph.vue';
import {REDO_TITLE, UNDO_TITLE, undoRedoKind} from '../utils/undo-hotkey';

export default defineComponent({
  components: {WaveformEditor, ColorSwatchPicker, ConfirmDeleteMenu, EnvelopeGraph, SoundBankImportDialog},
  setup() {
    const soundEffectsStorage = useSoundEffectsStorage();
    // App-wide preference, not part of this project's  saved
    // configuration - see useDimSoundFxStorage's  comment in
    // hooks/project.js.
    const dimSoundFx = useDimSoundFxStorage();
    const dimSoundFxPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT);
    // Same reasoning as MusicEditor.vue's  identical dimSoundFxPercentDisplay -
    // dimSoundFxPercent's  setter still does a synchronous localStorage
    // write on every call, which v-slider's v-model would otherwise trigger
    // on every "input" tick while dragging - the exact repeated-main-thread-
    // work pattern that caused the visible thumb to lag behind the mouse and
    // only catch up once dragging stopped (a real reported bug, originally
    // against the old, much heavier whole-configurationStorage-object write
    // this used to do). This cheap local ref absorbs every "input" tick
    // instead; the persisted write only happens once, on "change" (drag
    // release).
    const dimSoundFxPercentDisplay = ref(dimSoundFxPercent.value);
    watch(dimSoundFxPercent, (value) => {
      dimSoundFxPercentDisplay.value = value;
    });

    // Purely a visual "which card am I looking at" marker - same
    // selectCard/selectedCardId/deselectCard pattern as MusicEditor.vue's
    // song cards (see its  comment for the full reasoning): plain
    // local component state, not persisted, not wired into anything else.
    // Clicking anywhere in a sound effect's  card selects it; clicking
    // outside any card (this tab's  outer editor-container, see its
    // @click) clears the selection.
    const selectedCardId = ref(null);
    // Every selected card (Shift+click selects a range, Ctrl/Cmd+click adds or removes one); see hooks/card-selection.js.
    // selectedCardId stays the one the shared toolbar's per-sound buttons act on: the card clicked last.
    const {selectedCardIds, selectCard, deselectCard, getSelectedIndices, idsToDelete, deleteQuestion} = useCardSelection(
        () => state.value.soundEffects.map(({id}) => id), selectedCardId);
    // The sound effect the shared toolbar below acts on - whichever card is
    // currently selected, same pattern as DataEditor.vue's selectedTable
    // and MusicEditor.vue's activeSong().
    const selectedSoundEffect = computed(() =>
      state.value.soundEffects.find(({id}) => id === selectedCardId.value) || null);
    // The selected cards, in the order they are listed.
    const selectedSoundEffects = computed(() =>
      state.value.soundEffects.filter(({id}) => selectedCardIds.value.includes(id)));

    const state = computed({
      get() {
        try {
          return processSoundEffectsStorageDefaults(soundEffectsStorage);
        } catch (e) {
          console.error('Error loading sound effects from local storage', e);
          return DEFAULT_SOUND_EFFECTS;
        }
      },

      set(newState) {
        soundEffectsStorage.value = newState;
      },
    });

    // With the envelope on, Duration is always the envelope's full length
    // (Attack + Decay + Sustain + Release): a shorter Duration would cut the
    // envelope off, a longer one would leave dead silence on the end. Every
    // envelope-affecting change (each dropdown, EnvelopeGraph drags via
    // handleEnvelopeGraphChange, Reset, Undo/Redo, the Envelope switch) goes
    // through handleChildChange, so the sync lives there; it also runs once
    // when the editor opens, for projects saved before this applied. Iterates
    // every sound effect since the caller can't say which one changed.
    const syncEnvelopeDurations = () => {
      state.value.soundEffects.forEach((soundEffect) => {
        if (!soundEffect.envelope) return;
        // At most 255: a sound's frames are counted down in a byte (see clampEnvelopeStages).
        const combinedFrames = Math.min(255, (Number(soundEffect.envelopeAttack) || 0) + (Number(soundEffect.envelopeDecay) || 0) +
          (Number(soundEffect.envelopeSustainLength) || 0) + (Number(soundEffect.envelopeRelease) || 0));
        if (combinedFrames > 0 && Number(soundEffect.duration) !== combinedFrames) {
          soundEffect.duration = combinedFrames;
        }
      });
    };
    const configurationStorage = useConfigurationStorage();
    // Under DPC+ with its sound chip a sound is a waveform drawn on the card and a note, not a sound type.
    const dpcPlusSoundCards = computed(() => {
      const config = configurationStorage.value || {};
      return config.kernel === 'dpcplus' && config.enableDpcPlusAudio !== false;
    });
    // The developer and website from the project settings go into every exported file (not the title, version or email).
    const developerInfo = () => {
      const config = configurationStorage.value || {};
      return {
        ...(config.projectDeveloper ? {developer: config.projectDeveloper} : {}),
        ...(config.projectWebsite ? {website: config.projectWebsite} : {}),
      };
    };
    const handleChildChange = () => {
      syncEnvelopeDurations();

      state.value = state.value;
    };
    handleChildChange();

    // EnvelopeGraph.vue emits "update:<field>" events (dragging a handle,
    // snapped to the same option set the dropdowns use - see its
    // snapTo) rather than v-modeling the whole envelope shape as one
    // object, so dragging and picking from a dropdown both just set one
    // field on soundEffect and go through this exact same save path.
    const handleEnvelopeGraphChange = (soundEffect, field, value) => {
      soundEffect[field] = value;
      handleChildChange();
    };

    // Undo/redo for just the envelope shape (Attack/Decay/Sustain/Release),
    // one stack pair per sound effect id - same shape as MusicEditor.vue's
    // pattern undo/redo (patternUndoStacks/patternRedoStacks/
    // patternLastSnapshot), scoped down to just these 4 fields rather than
    // a whole sound effect's every field, since dragging the envelope graph
    // is the one interaction here fiddly enough to want stepping back
    // through.
    // The frequency envelope's shape is in the same history: Undo and Redo step back and forward through the edits of either graph.
    const ENVELOPE_HISTORY_KEYS = ['envelopeAttack', 'envelopeDecay', 'envelopeDecayEnd', 'envelopeSustainLength',
      'envelopeReleaseStart', 'envelopeRelease', 'pitchEnvelopeAttack', 'pitchEnvelopeDecay', 'pitchEnvelopeDecayEnd',
      'pitchEnvelopeSustainLength', 'pitchEnvelopeReleaseStart', 'pitchEnvelopeRelease'];
    const snapshotEnvelope = (soundEffect) => JSON.stringify(
        ENVELOPE_HISTORY_KEYS.reduce((acc, key) => {
          acc[key] = soundEffect[key]; return acc;
        }, {}));
    const envelopeUndoStacks = ref({});
    const envelopeRedoStacks = ref({});
    const envelopeLastSnapshot = {};
    state.value.soundEffects.forEach((soundEffect) => {
      envelopeLastSnapshot[soundEffect.id] = snapshotEnvelope(soundEffect);
    });
    let envelopeHistoryDebounce = null;
    watch(() => state.value.soundEffects, () => {
      clearTimeout(envelopeHistoryDebounce);
      envelopeHistoryDebounce = setTimeout(() => {
        state.value.soundEffects.forEach((soundEffect) => {
          const snapshot = snapshotEnvelope(soundEffect);
          const last = envelopeLastSnapshot[soundEffect.id];
          if (last !== undefined && last !== snapshot) {
            const stack = envelopeUndoStacks.value[soundEffect.id] || [];
            noteEdit();
            envelopeUndoStacks.value = {...envelopeUndoStacks.value, [soundEffect.id]: [...stack, last]};
            if ((envelopeRedoStacks.value[soundEffect.id] || []).length) {
              envelopeRedoStacks.value = {...envelopeRedoStacks.value, [soundEffect.id]: []};
            }
          }
          envelopeLastSnapshot[soundEffect.id] = snapshot;
        });
      }, 500);
    }, {deep: true});

    const applyEnvelopeSnapshot = (soundEffect, snapshotJson) => {
      const data = JSON.parse(snapshotJson);
      ENVELOPE_HISTORY_KEYS.forEach((key) => {
        soundEffect[key] = data[key];
      });
      // Written directly (not through the watcher above) so restoring a
      // snapshot is never itself mistaken for a new edit worth recording.
      envelopeLastSnapshot[soundEffect.id] = snapshotJson;
      handleChildChange();
    };
    const canUndoEnvelope = (soundEffect) => (envelopeUndoStacks.value[soundEffect.id] || []).length > 0;
    const canRedoEnvelope = (soundEffect) => (envelopeRedoStacks.value[soundEffect.id] || []).length > 0;
    const reorderCanUndo = computed(() => canUndoReorder());
    const reorderCanRedo = computed(() => canRedoReorder());
    const handleUndoEnvelope = (soundEffect) => {
      if (tryUndoReorder()) return;
      if (!soundEffect) return;
      const stack = envelopeUndoStacks.value[soundEffect.id] || [];
      if (!stack.length) return;
      const redoStack = envelopeRedoStacks.value[soundEffect.id] || [];
      envelopeRedoStacks.value = {...envelopeRedoStacks.value,
        [soundEffect.id]: [...redoStack, snapshotEnvelope(soundEffect)]};
      envelopeUndoStacks.value = {...envelopeUndoStacks.value, [soundEffect.id]: stack.slice(0, -1)};
      applyEnvelopeSnapshot(soundEffect, stack[stack.length - 1]);
      settleEdits();
    };
    const handleRedoEnvelope = (soundEffect) => {
      if (tryRedoReorder()) return;
      if (!soundEffect) return;
      const stack = envelopeRedoStacks.value[soundEffect.id] || [];
      if (!stack.length) return;
      const undoStack = envelopeUndoStacks.value[soundEffect.id] || [];
      envelopeUndoStacks.value = {...envelopeUndoStacks.value,
        [soundEffect.id]: [...undoStack, snapshotEnvelope(soundEffect)]};
      envelopeRedoStacks.value = {...envelopeRedoStacks.value, [soundEffect.id]: stack.slice(0, -1)};
      applyEnvelopeSnapshot(soundEffect, stack[stack.length - 1]);
    };
    const handleResetPitchEnvelope = (soundEffect) => {
      soundEffect.pitchEnvelopeAttack = DEFAULT_PITCH_ENVELOPE_ATTACK;
      soundEffect.pitchEnvelopeDecay = DEFAULT_PITCH_ENVELOPE_DECAY;
      soundEffect.pitchEnvelopeDecayEnd = DEFAULT_PITCH_ENVELOPE_DECAY_END;
      soundEffect.pitchEnvelopeSustainLength = DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH;
      soundEffect.pitchEnvelopeReleaseStart = DEFAULT_PITCH_ENVELOPE_RELEASE_START;
      soundEffect.pitchEnvelopeRelease = DEFAULT_PITCH_ENVELOPE_RELEASE;
      handleChildChange();
    };
    const handleResetEnvelope = (soundEffect) => {
      soundEffect.envelopeAttack = DEFAULT_ENVELOPE_ATTACK;
      soundEffect.envelopeDecay = DEFAULT_ENVELOPE_DECAY;
      soundEffect.envelopeDecayEnd = DEFAULT_ENVELOPE_VOLUME_PERCENT;
      soundEffect.envelopeSustainLength = DEFAULT_ENVELOPE_SUSTAIN_FRAMES;
      soundEffect.envelopeReleaseStart = DEFAULT_ENVELOPE_VOLUME_PERCENT;
      soundEffect.envelopeRelease = DEFAULT_ENVELOPE_RELEASE;
      handleChildChange();
    };

    const {isCollapsed, toggleCollapsed, collapseAll} = useCollapsedIds('soundfx', true);
    // Every sound card starts collapsed on every visit to this tab, not just
    // ones never expanded before (see collapseAll's  comment) - a
    // deliberate request, unlike every other card list in the app, which
    // remembers whichever ones a previous visit left expanded.
    collapseAll();

    // Purely a display filter for this tab's  card list (see the
    // Instrument checkbox in the name row) - not persisted, and doesn't
    // touch soundEffect.isInstrument itself or anything else that reads it.
    // Cards not matching stay in the underlying array/v-for at their
    // real index (v-show, not a filtered array or v-if - ESLint's
    // vue/no-use-v-if-with-v-for rule forbids the latter on the same
    // element as v-for anyway) specifically so drag-reorder (see
    // hooks/drag-reorder.js, which reorders by splicing the real array at
    // whatever index it's given) keeps working correctly even mid-filter,
    // rather than reordering against filtered-out indices that don't match
    // the real array at all.
    const soundFxColumns = useSoundFxColumnsStorage();
    const soundFilter = ref('all');
    const soundFilterItems = [
      {text: 'All', value: 'all'},
      {text: 'Instruments', value: 'instrument'},
      {text: 'Percussion', value: 'percussion'},
      {text: 'Sound effects', value: 'sound'},
    ];
    // The three kinds of sound a card can be (the button in its name row).
    const soundKinds = [
      {value: 'sound', text: 'Sound effect', icon: 'mdi-waveform'},
      {value: 'instrument', text: 'Instrument', icon: 'mdi-piano'},
      {value: 'percussion', text: 'Percussion', icon: '$drum'},
    ];
    const soundKindFor = (soundEffect) =>
      soundKinds.find(({value}) => (soundEffect.isPercussion ? value === 'percussion' :
        soundEffect.isInstrument ? value === 'instrument' : value === 'sound'));
    const matchesSoundFilter = (soundEffect) => {
      if (soundFilter.value === 'instrument') return !!soundEffect.isInstrument && !soundEffect.isPercussion;
      if (soundFilter.value === 'percussion') return !!soundEffect.isPercussion;
      if (soundFilter.value === 'sound') return !soundEffect.isInstrument && !soundEffect.isPercussion;
      return true;
    };

    // Card reordering (see hooks/drag-reorder.js and TextEditor.vue's
    // first use of this same hook) - sound effects are already referenced
    // everywhere by their  permanent id (see findSoundEffectById/
    // buildSoundEffectOptions in blocks/soundfx.js), never by array
    // position, so unlike the Text tab this needed no separate
    // display-order/ROM-order decoupling work - reordering is already safe.
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.soundEffects,
        (items) => {
          state.value.soundEffects = items;
          handleChildChange();
        },
        // Dragging one of several selected cards moves all of them.
        getSelectedIndices,
    );

    const instance = getCurrentInstance();

    // Same "growing padding + a bottom border once actually scrolled"
    // treatment as GraphicEditorToolbar.vue's .graphic-editor-toolbar/
    // isScrolled and DataEditor.vue's .data-toolbar/isDataToolbarScrolled
    // (same reasoning as that file's comment on why this searches for
    // .editor-container rather than reading $el directly).
    const isSoundFxToolbarScrolled = ref(false);
    let soundFxToolbarScrollContainer = null;
    const handleSoundFxToolbarScroll = (event) => {
      isSoundFxToolbarScrolled.value = event.target.scrollTop > 0;
    };
    // Space previews the selected sound effect (retriggering it from the
    // start if it's already playing - a one-shot preview has no real
    // "pause" state worth toggling, unlike Music tab's sustained song/
    // pattern playback, so this is just "play" rather than a true
    // play/stop toggle). Shift+E/Shift+I export/import that same selected
    // sound effect - same guard shape (Ctrl/Cmd/Alt excluded, Shift not;
    // never hijack a real text field) as GraphicEditorToolbar.vue's
    // handleToolHotkey.
    const handleSoundFxPlaybackHotkey = (event) => {
      const history = undoRedoKind(event);
      if (history) {
        const soundEffect = selectedSoundEffect.value;
        const can = history === 'undo' ?
          reorderCanUndo.value || (soundEffect && canUndoEnvelope(soundEffect)) :
          reorderCanRedo.value || (soundEffect && canRedoEnvelope(soundEffect));
        if (can) {
          event.preventDefault();
          (history === 'undo' ? handleUndoEnvelope : handleRedoEnvelope)(soundEffect);
        }
        return;
      }
      // event.repeat - true for every synthetic keydown the OS fires while
      // a key is held down (not just the first real press) - without this,
      // holding Space re-triggered the preview from scratch dozens of
      // times a second for as long as it was held, instead of once per
      // actual press (confirmed as a real reported bug).
      if (event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;
      if (!selectedSoundEffect.value) return;

      const key = event.key;
      if (key === ' ') {
        event.preventDefault();
        handlePlaySoundEffect(selectedSoundEffect.value, cardTia(selectedSoundEffect.value));
      } else if (key.toLowerCase() === 'e' && event.shiftKey) {
        event.preventDefault();
        handleExportSelectedSoundEffects();
      } else if (key.toLowerCase() === 'i' && event.shiftKey) {
        event.preventDefault();
        handleImportSoundEffect(selectedSoundEffect.value);
      }
    };

    onMounted(() => {
      state.value.soundEffects.forEach(normalizeTiaShape);
      soundFxToolbarScrollContainer = instance.proxy.$el.querySelector('.editor-container');
      if (soundFxToolbarScrollContainer) {
        soundFxToolbarScrollContainer.addEventListener('scroll', handleSoundFxToolbarScroll);
      }
      window.addEventListener('keydown', handleSoundFxPlaybackHotkey);
    });
    onBeforeUnmount(() => {
      if (soundFxToolbarScrollContainer) {
        soundFxToolbarScrollContainer.removeEventListener('scroll', handleSoundFxToolbarScroll);
      }
      window.removeEventListener('keydown', handleSoundFxPlaybackHotkey);
    });

    const handleAddSoundEffect = () => {
      const soundEffects = state.value.soundEffects;
      const maxId = max(soundEffects.map((o) => o.id)) || 0;
      const newSoundEffect = {
        id: maxId + 1,
        name: `Sound effect ${maxId + 1}`,
        audc: '4',
        audf: 16,
        audv: 15,
        duration: 5,
        envelope: false,
        envelopeAttack: DEFAULT_ENVELOPE_ATTACK,
        envelopeDecay: DEFAULT_ENVELOPE_DECAY,
        envelopeDecayEnd: DEFAULT_ENVELOPE_VOLUME_PERCENT,
        envelopeSustainLength: DEFAULT_ENVELOPE_SUSTAIN_FRAMES,
        envelopeReleaseStart: DEFAULT_ENVELOPE_VOLUME_PERCENT,
        envelopeRelease: DEFAULT_ENVELOPE_RELEASE,
        priority: DEFAULT_NOISE_PRIORITY,
        arpeggio: false,
        arpeggioDivision: DEFAULT_ARPEGGIO_DIVISION,
        arpeggioInterval: DEFAULT_ARPEGGIO_INTERVAL,
        arpeggioRange: DEFAULT_ARPEGGIO_RANGE,
        color: null,
        isInstrument: false,
        isPercussion: false,
        sweep: false,
        sweepEnd: DEFAULT_SWEEP_END,
        sweepStep: DEFAULT_SWEEP_STEP,
        sweepFrames: DEFAULT_SWEEP_FRAMES,
        sweepRepeat: false,
        sweepWrap: false,
        staircase: false,
        staircaseStep: DEFAULT_STAIRCASE_STEP,
        staircaseFrames: DEFAULT_STAIRCASE_FRAMES,
        pitchEnvelope: false,
        pitchEnvelopeAmount: DEFAULT_PITCH_ENVELOPE_AMOUNT,
        pitchEnvelopeAttack: DEFAULT_PITCH_ENVELOPE_ATTACK,
        pitchEnvelopeDecay: DEFAULT_PITCH_ENVELOPE_DECAY,
        pitchEnvelopeDecayEnd: DEFAULT_PITCH_ENVELOPE_DECAY_END,
        pitchEnvelopeSustainLength: DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH,
        pitchEnvelopeReleaseStart: DEFAULT_PITCH_ENVELOPE_RELEASE_START,
        pitchEnvelopeRelease: DEFAULT_PITCH_ENVELOPE_RELEASE,
      };

      state.value.soundEffects.push(newSoundEffect);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // A copy of a sound effect (every parameter, its color and instrument tag) added at the end
    // of the list under a new id, so no existing id or block that uses one changes.
    const handleDuplicateSoundEffect = (soundEffect) => {
      const soundEffects = state.value.soundEffects;
      const copy = JSON.parse(JSON.stringify(soundEffect));
      copy.id = (max(soundEffects.map((o) => o.id)) || 0) + 1;
      copy.name = `${soundEffect.name || 'Sound effect'} copy`;
      soundEffects.push(copy);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // With several cards selected, deleting one of them deletes them all (the first stays if they are every sound there is).
    const deleteTitleFor = (soundEffect) => deleteQuestion(soundEffect.id, 'sound effect', 1);
    const handleDeleteSoundEffect = (soundEffect) => {
      const doomed = idsToDelete(soundEffect.id, 1);
      state.value.soundEffects = state.value.soundEffects.filter(({id}) => !doomed.includes(id));
      if (doomed.length > 1) deselectCard();
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Sound effect data as a standalone .vcssnd file, for sharing an
    // instrument between projects or keeping an external backup - same
    // pattern as MusicEditor.vue's  handleExportSong/handleImportSong
    // (including leaving the card's  id out of the export, kept as the
    // IMPORTING card's id on import instead, since ids only mean anything
    // within a single project's  storage).
    const handleExportSoundEffect = (soundEffect) => {
      // eslint-disable-next-line no-unused-vars
      const {id, ...rest} = soundEffect;
      // The kernel the sound was made for goes first in the file.
      const soundEffectData = {kernel: (configurationStorage.value || {}).kernel || 'standard', ...developerInfo(), ...rest};
      const blob = new Blob([JSON.stringify(soundEffectData, null, 2)], {type: 'application/json'});
      const filename = (soundEffect.name || `sound-${soundEffect.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `Sound_${filename}-${getDateInfix()}.vcssnd`);
    };

    // One .vcssnd file for the selected card, or one for each when several are selected.
    const handleExportSelectedSoundEffects = () => {
      const chosen = selectedSoundEffects.value.length > 1 ? selectedSoundEffects.value : [selectedSoundEffect.value];
      chosen.filter(Boolean).forEach((soundEffect) => handleExportSoundEffect(soundEffect));
    };

    // Overwrites this sound effect card's  data with a previously
    // exported .vcssnd file's contents - keeps this card's  id (see
    // handleExportSoundEffect) untouched so every soundfx_play block and
    // Music tab track already pointing at this card keeps working.
    const handleImportSoundEffect = (soundEffect) => {
      openFileDialog('.vcssnd,.vcsbnk,.json')
          .then((file) => file.text())
          .then((text) => {
            const soundEffectData = JSON.parse(text);
            if (!soundEffectData || typeof soundEffectData !== 'object' || !('audc' in soundEffectData)) {
              throw new Error('File does not contain valid sound effect data');
            }
            // eslint-disable-next-line no-unused-vars
            const {kernel, developer, website, ...importedFields} = soundEffectData;
            delete soundEffect.dpcShape;
            delete soundEffect.dpcFrequency;
            delete soundEffect.dpcWave;
            delete soundEffect.dpcWaveBars;
            Object.assign(soundEffect, importedFields, {id: soundEffect.id});
            // Not just handleChildChange() - an imported file's  audf
            // (especially one hand-edited, or exported from a build before
            // the curated "in tune" Frequency list existed) can be a raw
            // byte that isn't one of the current AUDC type's  valid
            // options, which left the Frequency select showing blank
            // forever (a value with no matching item never displays one)
            // even though the data underneath was actually imported fine.
            // handleAudcChange already does exactly this snap-to-closest-
            // valid-value fixup on an AUDC change; running it here re-uses
            // that same fixup for an AUDF that came in invalid instead
            // (this also calls handleChildChange() itself).
            handleAudcChange(soundEffect);
            instance.proxy.$forceUpdate();
          })
          .catch((e) => console.error('Failed to import sound effect', e));
    };

    // Every sound effect/instrument in this project as one standalone .vcsbnk
    // "sound bank" file - same per-card export shape as handleExportSoundEffect
    // above (id stripped, since it only ever meant anything within this one
    // project's  storage), just the whole array at once instead of a
    // single card. "type" is a lightweight self-description (not read back
    // on import, matching Project.vue's  convention of tagging a saved
    // file's kind) purely so a stray file opened outside this app is
    // recognizable at a glance.
    // With two or more cards selected, only those go in the bank.
    const handleExportSoundBank = () => {
      const chosen = selectedSoundEffects.value.length > 1 ? selectedSoundEffects.value : state.value.soundEffects;
      const soundEffects = chosen.map(({id, ...rest}) => rest); // eslint-disable-line no-unused-vars
      const blob = new Blob(
          [JSON.stringify({type: 'VCS Game Maker Sound Bank', kernel: (configurationStorage.value || {}).kernel || 'standard',
            ...developerInfo(), soundEffects}, null, 2)],
          {type: 'application/json'});
      saveAs(blob, `SoundBank-${getDateInfix()}.vcsbnk`);
    };

    // Which entries from the bank file most recently opened (see
    // handleImportSoundBank below) are checked in the "Import Sound Bank"
    // dialog - {data: the raw bank entry, name, selected, isExisting}, one
    // per sound in the file. isExisting mirrors the same by-NAME match
    // handleConfirmSoundBankImport itself uses, purely so the dialog can
    // warn "(replaces existing)" next to anything that would overwrite a
    // card already in this project, before the user actually confirms it.
    const soundBankImportOpen = ref(false);
    const soundBankImportEntries = ref([]);

    // Loads a previously exported sound bank file and opens the picker
    // dialog for it - same "click a card, then confirm what it does" shape
    // as the emulator's Input Mapping dialog (App.vue/
    // KeyMappingDialog.vue), rather than importing every sound in the file
    // immediately and unconditionally the moment it's picked, which left no
    // way to bring in just a few sounds from a bank without also
    // overwriting/adding every other one it happened to contain.
    const handleImportSoundBank = () => {
      openFileDialog('.vcssnd,.vcsbnk,.json')
          .then((file) => file.text())
          .then((text) => {
            soundBankImportEntries.value = buildSoundBankImportEntries(JSON.parse(text), state.value.soundEffects);
            soundBankImportOpen.value = true;
          })
          .catch((e) => console.error('Failed to import sound bank', e));
    };

    // Imports only the entries checked in the dialog - matches by NAME (see
    // importSoundBankEntries in utils/sound-bank.js).
    const handleConfirmSoundBankImport = () => {
      importSoundBankEntries(state.value.soundEffects, soundBankImportEntries.value);
      handleChildChange();
      instance.proxy.$forceUpdate();
      soundBankImportOpen.value = false;
    };

    // tia: play it the way the TIA does (channel 1 under DPC+) rather than the way the DPC+ chip does.
    const handlePlaySoundEffect = (soundEffect, tia = false) => {
      // Matches how loud the emulator plays it with DIM on (it scales its output by the same
      // percentage) - previewing at the un-dimmed volume would make the preview lie about what
      // the game sounds like in the emulator.
      const audv = dimSoundFx.value ?
        dimVolume(soundEffect.audv, dimSoundFxPercent.value) : soundEffect.audv;
      if (dpcPlusSoundCards.value && !tia) {
        // The DPC+ sound chip has no 0-15 volume steps to round to: the emulator just plays it quieter.
        const dimMultiplier = dimSoundFx.value ? (Number(dimSoundFxPercent.value) || 0) / 100 : 1;
        previewDpcPlusSoundEffect(soundEffect, configurationStorage.value || {}, dimMultiplier, loopPreview.value);
      } else {
        previewSoundEffect({...soundEffect, audv, loop: loopPreview.value});
      }
    };

    // The preview plays again each time it ends, until Stop (or another sound's preview) ends it.
    const loopPreview = ref(false);

    const handleStopPreview = () => stopSoundEffectPreview();

    const handleSetSoundEffectColor = (soundEffect, colorByte) => {
      soundEffect.color = colorByte;
      handleChildChange();
    };

    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pianoKeyItems = Array.from({length: PIANO_KEY_COUNT}, (_, i) => {
      const midi = midiForPianoIndex(i + 1);
      return {text: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1} (${Math.round(frequencyForMidi(midi) * 10) / 10} Hz)`,
        value: midi};
    });
    // The piano key a sound's pitch is, or 'custom' for a pitch between keys.
    const dpcPlusNoteValue = (soundEffect) => {
      const hz = Number(soundEffect.dpcFrequency) || 0;
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      return hz > 0 && midi >= 21 && midi <= 108 && Math.abs(frequencyForMidi(midi) - hz) < 0.01 * hz ? midi : 'custom';
    };
    const dpcPlusNoteItems = (soundEffect) => (dpcPlusNoteValue(soundEffect) === 'custom' ?
      [{text: `Custom (${soundEffect.dpcFrequency} Hz)`, value: 'custom'}, ...pianoKeyItems] : pianoKeyItems);
    // Switching a sweep on gives a sound of the DPC+ chip an end note (an octave up) when it has none.
    const dpcFollows = (soundEffect) => dpcFollowsStandardPitch(soundEffect);
    const setDpcFollows = (soundEffect, value) => {
      Vue.set(soundEffect, 'dpcSweepMatch', !!value);
      // Turning it off gives a sweep the end note (an octave up) it moves to in semitones.
      if (!value) handleSweepSwitch(soundEffect);
      else handleChildChange();
    };
    const handleSweepSwitch = (soundEffect) => {
      if (cardDpc(soundEffect) && soundEffect.sweep && !soundEffect.dpcSweepEnd) {
        const key = dpcKeyForHz(Number(soundEffect.dpcFrequency) || 440);
        soundEffect.dpcSweepEnd = Math.min(108, key + 20 + 12);
      }
      handleChildChange();
    };
    const handleDpcPlusNoteChange = (soundEffect, midi) => {
      if (midi === 'custom') return;
      Vue.set(soundEffect, 'dpcFrequency', Math.round(frequencyForMidi(midi) * 100) / 100);
      handleChildChange();
    };
    const handleWaveformChange = (soundEffect, {wave, bars, shape}) => {
      // Vue.set, since a sound brought in from a file or converted earlier may not have these fields yet, and a field
      // added to an object any other way is not seen by the card.
      Vue.set(soundEffect, 'dpcWave', wave);
      Vue.set(soundEffect, 'dpcWaveBars', bars);
      Vue.set(soundEffect, 'dpcShape', shape);
      handleChildChange();
    };

    // Changing the Standard sound type or frequency of a sound under DPC+ (what channel 1 plays): it is remembered that
    // they were set by hand, so switching the project to the Standard kernel keeps them.
    // Which settings a card shows under DPC+: the chip's or the TIA's (Standard).
    const soundViews = ref({});
    const cardView = (soundEffect) => (soundViews.value[soundEffect.id] || 'dpcplus');
    const setCardView = (soundEffect, view) => Vue.set(soundViews.value, soundEffect.id, view);
    const cardTia = (soundEffect) => !!soundEffect && dpcPlusSoundCards.value && cardView(soundEffect) === 'standard';
    const cardDpc = (soundEffect) => dpcPlusSoundCards.value && !cardTia(soundEffect);
    const handleStandardChange = (soundEffect, typeChanged = false) => {
      if (cardTia(soundEffect)) handleTiaChange(soundEffect, typeChanged);
      else if (typeChanged) handleAudcChange(soundEffect);
      else handleChildChange();
    };
    const handleTiaChange = (soundEffect, typeChanged = false) => {
      Vue.set(soundEffect, 'dpcTiaEdited', true);
      if (typeChanged) handleAudcChange(soundEffect);
      else handleChildChange();
    };

    const handleSetSoundKind = (soundEffect, kind) => {
      soundEffect.isInstrument = kind === 'instrument';
      soundEffect.isPercussion = kind === 'percussion';
      handleChildChange();
    };

    // Same "in tune" AUDF set the piano roll limits its  rows to for a
    // given instrument (see utils/music-notes.js's notesForAudc) - the
    // Frequency field only offers a value picked from here instead of any
    // 0-31 byte, so it can't land on an AUDF this sound type can't actually
    // play a clean note at. The note name is shown right alongside the raw
    // AUDF value (not instead of it) since the underlying byte is still
    // what's stored/generated.
    const frequencyItems = (audc) =>
      notesForAudc(audc, true).map(({value, label}) => ({text: `${value} (${label})`, value}));

    // Every frequency 0 to 31 (a sweep can end on any of them), with the note beside the ones that are in tune.
    const endFrequencyItems = (audc) => {
      const notes = new Map(notesForAudc(audc, true).map(({value, label}) => [value, label]));
      return Array.from({length: 32}, (_, value) => ({text: notes.has(value) ? `${value} (${notes.get(value)})` : `${value}`, value}));
    };

    // AUDC types with no well-defined pitch (most percussion/noise sounds)
    // keep the old plain 0-31 number field instead - there's no "valid
    // frequency" set to limit to, every byte is equally as (un)musical.
    const handleAudcChange = (soundEffect) => {
      if (audcHasTunableNotes(soundEffect.audc, true)) {
        const items = frequencyItems(soundEffect.audc);
        if (!items.some(({value}) => value === soundEffect.audf)) {
          // Snaps to the closest still-valid AUDF rather than always
          // resetting to the same default, so switching between two
          // similar instruments tends to land near the same pitch instead
          // of jumping around.
          let closest = items[0];
          items.forEach((item) => {
            if (Math.abs(item.value - soundEffect.audf) < Math.abs(closest.value - soundEffect.audf)) {
              closest = item;
            }
          });
          soundEffect.audf = closest.value;
        }
      }
      handleChildChange();
    };

    return {
      selectedCardId, selectedCardIds, selectCard, deselectCard, selectedSoundEffect, selectedSoundEffects,
      handleExportSelectedSoundEffects, isSoundFxToolbarScrolled,
      state, handleChildChange, handleAddSoundEffect, handleDeleteSoundEffect, deleteTitleFor, handleDuplicateSoundEffect,
      handlePlaySoundEffect,
      handleExportSoundEffect, handleImportSoundEffect,
      handleExportSoundBank, handleImportSoundBank,
      soundBankImportOpen, soundBankImportEntries, handleConfirmSoundBankImport,
      canUndoEnvelope, canRedoEnvelope, handleUndoEnvelope, handleRedoEnvelope, reorderCanUndo, reorderCanRedo, UNDO_TITLE, REDO_TITLE, handleResetEnvelope,
      handleResetPitchEnvelope,
      handleStopPreview, loopPreview, handleSetSoundEffectColor, autoInstrumentColor,
      isCollapsed, toggleCollapsed,
      audcHasTunableNotes, frequencyItems, endFrequencyItems, handleAudcChange,
      dimSoundFx, dimSoundFxPercent, dimSoundFxPercentDisplay,
      soundFxColumns, soundFilter, soundFilterItems, matchesSoundFilter, soundKinds, soundKindFor, handleSetSoundKind, dpcPlusSoundCards, dpcPlusNoteValue, dpcPlusNoteItems,
      handleSweepSwitch, dpcFollows, setDpcFollows, pianoKeyItems, MAX_DPC_SWEEP_STEP, MAX_STAIRCASE_STEP,
      staircaseFrameOptionItems: STAIRCASE_FRAME_OPTIONS.map((value) => ({text: `${value} ${value === 1 ? 'frame' : 'frames'}`, value})),
      handleDpcPlusNoteChange, handleWaveformChange, handleTiaChange,
      cardView, setCardView, cardTia, cardDpc, handleStandardChange,
      audcOptionItems: AUDC_OPTIONS.map(([text, value]) => ({text, value})),
      arpeggioRangeOptionItems: ARPEGGIO_RANGE_OPTIONS.map(([text, value]) => ({text, value})),
      arpeggioDivisionOptionItems: ARPEGGIO_DIVISION_OPTIONS.map((value) => ({text: `1/${value}`, value})),
      envelopeStageFrameOptionItems: ENVELOPE_STAGE_FRAME_OPTIONS.map((value) => ({text: `${value} frames`, value})),
      // Attack/Release only (Decay stays on the smaller set above) - see
      // ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS' comment in blocks/soundfx.js.
      envelopeAttackReleaseFrameOptionItems:
        ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS.map((value) => ({text: `${value} frames`, value})),
      // Shared by both Decay End and Release Start - see
      // ENVELOPE_VOLUME_PERCENT_OPTIONS' comment in blocks/soundfx.js.
      envelopeVolumePercentOptionItems: ENVELOPE_VOLUME_PERCENT_OPTIONS.map((value) => ({text: `${value}%`, value})),
      envelopeSustainFrameOptionItems: ENVELOPE_SUSTAIN_FRAME_OPTIONS.map((value) => ({text: `${value} frames`, value})),
      priorityOptionItems: NOISE_PRIORITY_OPTIONS.map((value) => ({text: `${value}`, value})),
      sweepFrameOptionItems: SWEEP_FRAME_OPTIONS.map((value) => ({text: `${value} ${value === 1 ? 'frame' : 'frames'}`, value})),
      MAX_SWEEP_STEP,
      handleEnvelopeGraphChange,
      MIN_ARPEGGIO_INTERVAL, MAX_ARPEGGIO_INTERVAL,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
    };
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* v-list-item's  default left/right padding (16px each side) stacks on
   top of v-card-text's, pushing the sound effect card in from both edges
   instead of it actually filling the full available width - confirmed as
   the source of a visible gap past the card's right edge, same fix as
   PlayerEditor.vue's identical .entry-list-item rule. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

/* Multi-column grid - narrower windows naturally fall back to one column
   per row once there's no room for a 360px-minimum card beside another. */
.soundfx-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 8px;
  /* 4px margin-top, same fix as DataEditor.vue's .data-list (see that
     file's comment for why margin on this element, not the sticky toolbar
     above it, is the safe way to close this gap) - no padding-top
     override here, unlike an earlier version of this rule, which zeroed
     v-list's default 8px padding-top out entirely: that left the toolbar-
     to-first-card gap at a flat 4px, not the 4 + 8 = 12px
     GraphicEditorToolbar.vue's list (PlayerEditor.vue's
     .animation-list, left at its default padding-top too) actually
     measures - a real reported case of this specifically, not just the
     box-to-box gap, reading as "too close" once actually compared
     ("spacing below music toolbar and music cards looks too close,
     matching spacing from graphic editor toolbar and sprite card"...
     "yes use same padding everywhere for consistency"). */
  margin-top: 4px;
  /* Grid items stretch to fill their row's height by default - a collapsed
     card next to an expanded one in the same row would otherwise stretch
     tall to match it, instead of sitting flush at the top like its card
     content actually sizes to. */
  align-items: start;
}

/* overflow: visible added alongside the existing padding reset - Vuetify's
   default "overflow: hidden" here (normally there to ellipsis-truncate
   long list-item text, not relevant to a card filling this whole slot) was
   clipping the selected card's 2px outline (see .soundfx-card-selected
   - an outline draws outside the border edge, in the few pixels of this
   parent's box the card doesn't otherwise use), a real reported bug.
   min-width: 0 is needed ALONGSIDE that change (see MusicEditor.vue's
   identical fix for the full explanation) - a flex item's min-width
   defaults to "auto" (its content's intrinsic width) UNLESS overflow is
   something other than visible, in which case the default is 0 instead;
   switching to overflow: visible silently undid that, letting a card
   refuse to shrink below its widest content instead of the tab's width. */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
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

/* The "Show" select and Columns switch sit in the toolbar row, after the Play
   button - one 26px row tall like the icon buttons. */
.soundfx-filter {
  flex: 0 0 auto;
  width: 190px;
  margin: 0 !important;
  /* Room between the divider before it and the select, on top of the row's
     4px gap. */
  margin-left: 8px !important;
  padding: 0 !important;
}

.soundfx-filter >>> .v-input__slot {
  min-height: 26px;
  margin: 0;
}

.soundfx-filter >>> .v-select__selections {
  min-height: 26px;
}

.soundfx-filter >>> .v-input__append-inner {
  margin-top: 0;
  align-self: center;
}

/* Room between the divider before it and the switch itself, on top of the
   row's 4px gap (the same 8px as the Data tab's Columns switch). */
.soundfx-columns-switch {
  flex: 0 0 auto;
  margin: 0 !important;
  margin-left: 8px !important;
  padding: 0 !important;
}

/* Same sticky/full-bleed toolbar treatment as DataEditor.vue's
   .data-toolbar (see that file's comments for the full reasoning behind
   each piece - position: sticky, the bleed margin/padding trick, the
   measured 16px-above/4px-below gaps). Replaces the old
   .soundfx-bank-actions (a plain v-card-actions row that only ever held
   the two bank-level buttons) now that this same bar also holds the
   Undo/Redo/Export/Import/Stop/Play controls moved off each card - a real
   reported request ("add a toolbar to the sound tab... with the import,
   export, stop and play controls currently on each sound card"). */
.soundfx-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
  padding-top: 4px;
  padding-bottom: 4px;
  /* Close under the intro text while it is not pinned. The intro paragraph's
     16px bottom margin collapses with this one, so a positive value
     here changes nothing - this negative one pulls the toolbar up to a 6px
     gap (16px matched the graphic editor toolbar, but with the DIM controls
     inside the toolbar it read as too large). */
  margin-top: -10px;
  margin-left: -16px;
  margin-right: -16px;
  padding-left: 16px;
  padding-right: 16px;
  transition: padding 0.15s ease;
}

.soundfx-toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Zeroes .soundfx-icon-btn-size's margin: 0 1px (needed elsewhere on this
   tab, where there's no shared flex gap doing the spacing) - same
   reasoning as DataEditor.vue's .data-toolbar-row >>> .data-icon-btn-size. */
.soundfx-toolbar-row >>> .soundfx-icon-btn-size {
  margin: 0;
}

.soundfx-toolbar-divider {
  margin: 0;
}

/* The loop button's icon takes the theme color while looping is on, like the Music tab's. */
.soundfx-loop-btn-active >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* The divider between the Columns switch and the Show select: the same 8px
   of room on its left as the select gives it on its right, so it sits
   centered between them. (The divider after the Play button keeps the
   toolbar's usual 4px on its left.) */
.soundfx-toolbar-divider-wide {
  margin-left: 8px;
}

/* Same "grows + gains a bottom border once actually scrolled" treatment as
   GraphicEditorToolbar.vue's .graphic-editor-toolbar-scrolled. */
.soundfx-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

/* "Soft Colors" (see App.vue's desaturate-app-colors class/comment) -
   matches the darker .editor-container this bar is pinned inside of once
   that's on, instead of staying the plain white every other surface swaps
   away from. */
.desaturate-app-colors .soundfx-toolbar {
  background-color: #e1e1e1;
}


/* Tightens the gap between the "Sound" title above and the DIM controls
   right below it - v-card-text's default 16px top padding read as too
   much space there. */
.soundfx-dim-section {
  padding-top: 0;
}


/* Flat, transparent background (no default hover circle), fade-in-on-
   hover/blue-on-press icon colour transitions - matching Project.vue's
   .project-flat-icon-btn - now shared by every button in the tab's
   top-level toolbar row (not just the two bank-level ones this class name
   still refers to), since all of them sit in the same bar. margin-left
   forced to 0 is redundant now that .soundfx-toolbar-row's gap/margin
   fix handles spacing between every button here, but left in place rather
   than risk a regression for the two sites that already relied on it. */
.soundfx-bank-btn {
  margin-left: 0 !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.soundfx-bank-btn::before {
  display: none;
}

.soundfx-bank-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.soundfx-bank-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.soundfx-bank-btn:active >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* Single full-width column instead of the grid .soundfx-list defaults to
   (see that rule's comment) - toggled via the "Columns" switch above. */
.soundfx-list--single-column {
  display: flex;
  flex-direction: column;
}

/* Grid's  default stretch (align-items: start on .soundfx-list overrides
   that for the grid case, but each item still fills its column width)
   isn't automatic here - .entry-list-item (Vuetify's v-list-item, the
   actual flex child) doesn't stretch to the container's full width on its
   , leaving .soundfx-card's width: 100% only filling 100% of that
   un-stretched item instead of the whole row. */
.soundfx-list--single-column .entry-list-item {
  width: 100%;
}

/* No max-width (used to cap at 640px) - that was capping each card well
   short 1fr share of .soundfx-list's grid row on a wide window,
   leaving unused space to its right instead of the card actually filling
   the full width its grid column allotted it. */
.soundfx-card {
  position: relative;
  width: 100%;
}

/* Card-level click-to-select styling (cursor/ripple/hover suppression on
   .soundfx-card.v-card--link/.editor-container.v-card--link, and the actual
   .soundfx-card-selected outline) lives in App.vue's global stylesheet
   now, shared with MusicEditor.vue's identical .song-card treatment rather
   than duplicated per-tab - see its comment there. */

/* Same reasoning/placement as TextEditor.vue's identical .text-drag-handle
   rule (see hooks/drag-reorder.js's comment) - only this top strip is
   actually draggable, so click-and-drag still selects text everywhere else
   in the card. */
.soundfx-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* Same two classes/reasoning as hooks/drag-reorder.js's  comment and
   TextEditor.vue's identical rules (its first use of this hook). */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Same placement/style as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - sound effects are referenced by this same numeric id
   (see findSoundEffectById in blocks/soundfx.js). Shifted right to clear
   .soundfx-collapse-btn, which sits in the same row to its left. */
.soundfx-id-badge {
  position: absolute;
  top: 10px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same top-edge fix as .soundfx-delete-btn, positioned at the opposite
   corner - a smaller top offset than .soundfx-delete-btn's, since this one
   has to line up against .soundfx-id-badge's text baseline right next to
   it, not just sit inside the card. */
.soundfx-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same 4px gap as the Music tab's .track-instrument-row, but flex-start
   (not flex-end) - unlike that row's dense, hide-details fields, Sound
   name is a full-size v-text-field with a good deal of reserved underline
   space below its value text, so bottom-aligning the swatch to the
   field's outer box (like the Music tab's shorter fields) would land it in
   that empty space, below the visible text rather than next to it. */
.soundfx-name-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

/* Clears .soundfx-collapse-btn/.soundfx-id-badge at the top of the card -
   matches the Music tab's song cards' card-top-to-label gap (measured
   directly: 36.67px there vs this field's 40.67px at 24px margin-top, so
   20px lines the two up) - was 36px originally. */
.soundfx-name-field {
  margin-top: 20px;
  flex: 1 1 auto;
}

/* Same 20px top nudge as .soundfx-name-field right before it - a v-select
   floats its label the same way a v-text-field does, so it needs the
   same alignment fix to sit level with the name field and the instrument
   button (see that button's comment) rather than sitting higher than
   both. Fixed, narrow width (unlike the name field's flex-grow) - just
   a single small 1-5 number, no need to compete for the row's spare
   width. */
.soundfx-priority {
  flex: 0 0 80px;
  margin-top: 20px;
  /* The row's gap is 4px; this brings the Sound name -> Priority space to
     8px, the same as Frequency -> Volume (.soundfx-basic-fields-row's gap). */
  margin-left: 4px;
}

/* Same flat-icon, fade-in-on-hover treatment as .soundfx-stop-btn/
   .soundfx-play-btn below (its icon swaps between a waveform and a piano rather
   than being tinted when on). 30px roughly centers it against .soundfx-name-field's
   floating label/text (20px offset) - not a measured value, nudge if it
   doesn't quite line up. !important because this element also carries
   .soundfx-icon-btn-size (defined later in this same file), whose
   "margin: 0 1px" shorthand resets margin-top to 0 and would otherwise win
   on source order alone despite matching specificity - confirmed as the
   actual cause of this button rendering hard against the row's top
   edge instead of lined up with the name field next to it. */
.soundfx-instrument-btn {
  flex: 0 0 auto;
  margin-top: 38px !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.soundfx-instrument-btn::before {
  display: none;
}

.soundfx-instrument-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.soundfx-instrument-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}


/* Vuetify's v-menu renders its activator slot content as a SIBLING of its
   (empty, zero-size) root element, not nested inside it - a class on
   <color-swatch-picker> itself lands on that invisible marker, not on the
   actual visible swatch, so this has to pierce into the component's
   internal .color-swatch-picker-dot class instead. 41px (.soundfx-name-
   field's 20px margin-top, plus 21px to reach the vertical center of
   its floating label + value text) - measured directly against the
   rendered field, since a fixed field like this one doesn't share the
   Instrument row's dense/hide-details proportions to eyeball from. */
.soundfx-name-row >>> .color-swatch-picker-dot {
  margin-top: 41px;
  margin-left: -6px;
}

/* Same flat-icon, fade-in-on-hover treatment as the pixel editor's
   toolbar icons (PixelEditor.vue's .pixel-editor-tools rules) instead of
   Vuetify's default grey circle: dim at rest, darker on hover, no ripple. */
.soundfx-stop-btn,
.soundfx-play-btn {
  flex: 0 0 auto;
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Vuetify paints its  grey hover/focus overlay here - removed in favor of
   the icon colour transition below. */
.soundfx-stop-btn::before,
.soundfx-play-btn::before {
  display: none;
}

.soundfx-stop-btn >>> .v-icon,
.soundfx-play-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.soundfx-stop-btn:hover >>> .v-icon,
.soundfx-play-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

/* .soundfx-icon-btn-size's size/icon-font-size rules - see App.vue's
   shared, unscoped copy. */

/* Split from the rest of the card's content (soundfx-fields-section) so the
   name field can stay visible while collapsed - v-card-text's default
   padding-bottom would otherwise open a gap between them that the original,
   single v-card-text never had. margin-bottom: -8px on top of that -
   confirmed directly against the real rendered card that this row still
   left about 8px more room below it than DataEditor.vue's equivalent
   .data-name-section, matching that same ~22px gap exactly instead. */
.soundfx-name-section {
  padding-bottom: 0;
  margin-bottom: -8px;
}

.soundfx-fields-section {
  padding-top: 0;
  /* Was 0 - the card's actual bottom clearance used to come from
     .soundfx-delete-section's padding-bottom (8px) further below it,
     back when that was a real section instead of moving into the card's
     top-right corner. Zero here left this (now the card's last section)
     with no clearance at all once that moved out - a real reported bug
     ("the bottom of sound cards is too close to the envelope toggle when
     the envelope toggle is turned off" - visible specifically then since
     the Envelope switch, not the taller EnvelopeGraph, is this section's
     last row in that state). The 8px the deleted section used to
     provide, plus 8px more. */
  padding-bottom: 16px;
}

/* Same top-right corner/offset as DataEditor.vue's .data-toolbar-top-
   right - a real reported request ("move the delete button to the top
   right of each card, like it is on data table cards. use the same
   positioning"), replacing this card's previous spot at the bottom (a
   plain in-flow row below every field, so it stayed reachable with the
   card collapsed - that reasoning no longer applies now that this sits
   outside the collapsible section entirely, same as .soundfx-collapse-btn
   already does for the top-left corner). */
.soundfx-toolbar-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  z-index: 1;
}

/* ">>>" deep combinator - this class lands on ConfirmDeleteMenu.vue's
   internal activator button (passed down via its "icon-btn-class" prop), a
   CHILD component's element that never carries this file's scope
   attribute, so a plain scoped selector would silently never match it. */
.soundfx-toolbar-top-right >>> .soundfx-delete-btn {
  box-shadow: none !important;
}

/* row-gap 4px (not the same 8px as column-gap) to match the gap above this
   section, between the Sound name row and this one (soundfx-name-section's
   padding-bottom: 0 / soundfx-fields-section's padding-top: 0) -
   without splitting it out, the plain 8px shorthand made a wrapped row
   within this section sit visibly farther from its neighbor above/below
   than the Sound name row sits from Sound type. */
.soundfx-fields {
  display: flex;
  align-items: center;
  row-gap: 0;
  column-gap: 8px;
  flex-wrap: wrap;
}

.soundfx-kernel-toggle {
  flex: 1 1 100%;
  margin: 4px 0 8px;
}

.soundfx-kernel-toggle .v-btn.v-btn--active {
  background-color: var(--v-primary-base, #1976d2) !important;
  color: #fff !important;
}

.soundfx-waveform {
  /* The shape drawn on the card takes the card's whole width, on a line by itself. */
  flex: 1 1 100%;
  width: 100%;
  margin: 4px 0 20px;
}

.soundfx-audc {
  flex: 1 1 260px;
  min-width: 220px;
}

/* row, nested flex container (rather than Frequency/Volume/Duration
   being flat siblings of Sound type in the shared .soundfx-fields wrap) -
   forces Sound type onto its line and keeps these 3 always together as
   one row, instead of the exact wrapping being at the mercy of whatever
   width happens to be left over after Sound type on a given card width
   (confirmed as a real problem: at some widths Frequency wrapped next to
   Sound type while Volume/Duration split onto their row instead). */
.soundfx-basic-fields-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.soundfx-number {
  flex: 0 0 90px;
}

/* Unlike Arpeggio's  row (2 fixed-width fields plus one growing Range
   field to soak up the rest), Envelope's 4 fields are all the same kind of
   control (a small option dropdown) with no natural single field to grow -
   so all 4 grow evenly together instead, filling the same full row width
   Arpeggio's row already does rather than leaving empty space after
   Release. */
.soundfx-envelope-field {
  flex: 1 1 90px;
}

/* Wider than .soundfx-number's fixed 90px (Frequency's  options - a
   v-select of note names, or a plain 0-31 number field - read better with
   more room than Volume/Duration's plain 2-digit numbers need), but still
   sized to fit alongside both of them on the same row within the card's
   ~350px width, rather than growing enough to wrap them onto their
   separate row. */
.soundfx-frequency {
  flex: 1 1 140px;
  min-width: 110px;
}

/* Each switch and its  conditional field(s) sit in one row (wrapping onto
   a second line if the card isn't wide enough), rather than the fields
   stacking in their row underneath the switch. */
.soundfx-arpeggio-block, .soundfx-envelope-block {
  display: flex;
  /* flex-start, not center - with center, a taller item (e.g. Envelope's
     dropdowns) sharing a wrapped line with the switch grows that
     line's height, and "center" then pulls the switch down to that
     line's new midpoint - a real reported bug (the switch visibly shifting
     position purely from toggling its fields on, which grow the line
     it's sharing). flex-start pins every item to the top line
     regardless of what else joins it there. */
  align-items: flex-start;
  /* Separate row/column gap (was a single "gap: 8px") - column spacing
     between fields on the same row stays 8px, but wrapped rows (narrow
     window) sit much closer together than that. */
  row-gap: 8px;
  column-gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

/* .soundfx-fields'  row-gap is 0 (see its  comment), so with
   Arpeggio's controls collapsed (just its switch row) there'd otherwise
   be no visible separation at all between the Arpeggio and Envelope
   switches - they'd read as one run-on row. Only needed when Arpeggio's
   extra controls AREN'T also adding their visual separation
   underneath it. */
.soundfx-envelope-block {
  margin-top: 12px;
}

.hide-description-text .soundfx-envelope-block {
  margin-top: 14px;
}

/* Arpeggio's  expanded fields already add their  visual separation
   above Envelope (see the un-scoped rule above's comment, written for
   the collapsed case) - the same margin-top on top of THAT read as too
   much. */
.soundfx-arpeggio-block--expanded + .soundfx-envelope-block {
  margin-top: 14px;
}

.hide-description-text .soundfx-arpeggio-block--expanded + .soundfx-envelope-block {
  margin-top: 14px;
}

/* The Frequency sweep block follows the volume Envelope the way Envelope follows Arpeggio, so it has the same gap above it: 12px
   (14px in Expert mode), 14px under an expanded block. */
.soundfx-sweep-block {
  margin-top: 12px;
}

.hide-description-text .soundfx-sweep-block {
  margin-top: 14px;
}

.soundfx-envelope-block--expanded + .soundfx-sweep-block {
  margin-top: 14px;
}

/* The sweep's numbers share one full-width row, equal widths; its two switches sit under them. */
.soundfx-sweep-fields {
  display: flex;
  width: 100%;
  gap: 8px;
}

.soundfx-sweep-field {
  flex: 1 1 0;
  min-width: 0;
}

.soundfx-sweep-switches {
  display: flex;
  width: 100%;
  gap: 24px;
}

.soundfx-sweep-switch {
  flex: 0 0 auto;
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* Full width so it forces its  line above the graph, same "100%-width
   flex child forces a line break" mechanism .envelope-graph itself relies
   on within this same wrapping row. */
.soundfx-envelope-graph-toolbar {
  display: flex;
  width: 100%;
  gap: 4px;
  /* Breathing room from the Attack/Decay/Sustain/Release fields above
     (.soundfx-envelope-block's row-gap is 0, so without this the
     fields' bottom edge and this row's divider line sit flush). */
  margin-top: 8px;
  /* Right-aligned, under the graph's  right edge (where Release ends),
     rather than the left edge (where Attack starts). */
  justify-content: flex-end;
  /* Separates the graph's  reset/undo/redo controls from the Attack/
     Decay/Sustain/Release dropdowns above them - same border colour
     EnvelopeGraph.vue's .envelope-graph frame uses, so this reads as
     the same "framed panel" visual language rather than an unrelated line. */
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.24);
}

/* Same margin-top override as SoundFXEditor's .dim-switch - Vuetify's
   selection-control margin-top (meant for stacking below other fields)
   otherwise pushes this out of line with the dropdowns next to it. Also
   zeroes its 4px padding-top (a v-switch default, unlike the plain
   text fields/selects elsewhere in this card) so this row sits a few
   pixels closer to the row above it, matching their spacing more closely. */
.soundfx-arpeggio-switch, .soundfx-envelope-switch {
  flex: 0 0 auto;
  margin-top: -4px !important;
  padding-top: 0 !important;
}

/* Extra push-down ONLY while the block is expanded (fields showing beside
   the switch) - collapsed, the switch is alone by itself line and the
   base -4px above already looks right. Under align-items: flex-start (see
   that rule's comment for why it replaced center), every item pins to
   the TOP of its line, which for a v-select/v-text-field means the top of
   its LABEL text, well above where its actual input box sits - this was
   applied unconditionally before, which correctly aligned the switch with
   its fields when expanded but left an oversized gap above a COLLAPSED
   switch that has no taller sibling to align with at all. */
.soundfx-arpeggio-block--expanded .soundfx-arpeggio-switch,
.soundfx-envelope-block--expanded .soundfx-envelope-switch {
  margin-top: 16px !important;
}

/* Extra breathing room between each switch's  label text and the field(s)
   right next to it - the shared 8px row gap (also used between Speed/
   Interval/Range themselves) read as too tight specifically here, where a
   switch's label text sits right up against its edge. */
.soundfx-arpeggio-switch, .soundfx-envelope-switch {
  margin-right: 12px !important;
}

.soundfx-arpeggio-btn.soundfx-arpeggio-btn-active >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* Grows (unlike .soundfx-number's fixed 90px, used for Volume/Duration
   above) to fill the full width of .soundfx-arpeggio-controls' row -
   these 3 fields have nothing else sharing that row with them, so there's
   no reason to leave the rest of the card's width empty next to them. */
.soundfx-arpeggio-field {
  flex: 1 1 0;
  min-width: 90px;
}

.add-soundfx-buttom {
  bottom: 8px;
}
</style>

<style>
/* The sound kind menu is drawn outside the card (see the kind button in a card's name row), so its style is not scoped. */
.soundfx-kind-menu {
  border: 1px solid rgba(128, 128, 128, 0.7);
}
</style>
