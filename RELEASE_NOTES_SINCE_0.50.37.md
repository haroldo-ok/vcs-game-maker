# VCS Game Maker: everything since 0.50.37

This summary covers versions 0.50.38 through 0.51.38, grouped by area. The per-version
detail, through the latest version, follows it under "Per-version detail".

## Emulator and TV standard

- The preview emulator is now gopher2600 compiled to WebAssembly (replacing
  Javatari), with real DPC+/CDF coprocessor support.
- Keyboard and keypad input is a configurable mapping with a click-to-capture
  dialog; it is saved and applies right away.
- New TV standard option (NTSC or PAL60) at the top of the ROM options. PAL60
  keeps NTSC's 60 Hz timing, swaps every build-time color for the closest PAL
  color, and makes the Sound and Music previews use the PAL audio clock.
- The emulator runs in a web worker at 60 frames per second on any refresh rate, with an
  adaptive frame skipping option; gamepads are mapped per player in the Input Mapping dialog.
- New camera button saves the emulator screen as a PNG.
- Creating or importing a project clears the emulator.
- The blank screen (no ROM running) has the same proportions as a running game.
- A once-a-second safety check restores the emulator canvas if it goes missing.
- The last loaded ROM survives a page refresh.
- The preview now runs on 6502.ts by default (about seven times faster), with gopher2600 as the
  other choice; a keypad ROM switches to gopher2600. The cog next to the Input Mapping button opens
  Emulator Settings: TV signal, phosphor, scanlines, gamma, scaling, CPU accuracy, and the full
  screen resolution and scaling. A full screen button sits next to the screenshot button.
- Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y undo and redo in the graphic editors, Data, Music patterns and
  Sound FX envelopes, and they put back cards, frames and rows dragged into a new order.
- The emulator's volume follows the Sound and Music DIM setting while it plays.
- A debug overlay for the 6502.ts emulator shows registers, the program counter, scanlines, CPU busy
  cycles and a table of chosen variable values; a Debug Info popup picks the variables and the choice is
  saved with the project. The emulator and its sound stop while a ROM compiles. A variable the title screen
  shares a slot with shows its title screen name while the kernel runs.
- The 6502.ts emulator plays Keypad Controllers on either port, so a project that uses Keypad blocks no longer
  moves to gopher2600.

## Blocks and code generation

- **Title screen:** scroll-by block with stop at edge, and a block that runs when a scroll
  reaches its top or bottom. **Background:** fade playfield rows to the row colors, and a
  12th playfield row without Superchip. **Player:** "restart" option on set animation.
- **Sprites:** Inertia (accelerate/decelerate) blocks, a unified bounce block,
  16-direction Fire, and blocks that make sprites follow playfield scrolling.
  Player 0/1 and Missile 0/1 are now single dropdown-driven blocks (existing
  projects migrate automatically).
- **Animations:** "Player set animation to" blocks, a "current animation ID"
  getter, a "finished" watch block, and a loop checkbox on every way of setting
  an animation. Both players now start on the first animation.
- **Backgrounds:** tall backgrounds scroll through their full height with a
  shorter routine; new "Set background scroll to row" and "When background
  scroll reaches the Top/Bottom" blocks; scroll directions are limited under
  Superchip RAM.
- **Generator savings:** fewer redundant loads in the Music, Sound effect,
  Background fade and Sprite throttle code; several build failures fixed.
- **Fixes:** blocks failing to load or drag after opening a project, Blockly
  undo wiping all blocks, copy/paste errors, blocks undersized after an undo,
  and the grid snap toggle.
- **Title screen (new blocks):** end the title screen and carry on as the game, recolor a
  graphic, jump a graphic to a frame (hold it, then loop or play once), set and reset the
  background color, and switch the picture background on or off and recolor it. Player sprites
  cards play their animation by themselves. Newer: an "Animate title screen graphic" block (forward or in
  reverse, loop or play once, acting as a trigger), a "When title screen graphic animation finishes" block,
  and a "Play animation once" switch on each graphic.
- **Title screen to gameplay:** a project with no block that sets or changes a sprite's position starts gameplay
  with the sprites at the positions a new project begins with.
- **Sprites:** setting a player's animation no longer changes a missile's width; missile widths are kept in a
  byte that only projects setting a missile width use. Ball width and playfield priority set before the title
  screen are put back when it ends.
- **Sprites and data:** a Visibility option in the Player get block, a Switch block mode that runs once each
  time a switch is turned on, and blocks for the size of a data table.
- **Sprites:** "Set fired speed" block, a "Width/quantity" choice in the Player get block, and
  16-direction angles that lean now move at the right speed along the right path.
- **Scrolling text:** one speed and one pause shared by every message are built in as numbers
  and take no variables. Title screen variables share slots with game-only variables.

## Graphic editors (Sprites, Background, Title, Score, Text)

- One shared graphic editor toolbar across all tabs.
- New tools: Fill, Line, Rectangle, Oval, rectangle/circle/polygon selection,
  Move, and Flip, with hotkeys (B/E/G/L/R/O/V/M/C/P, Shift+H/V).
- Delete clears a selection; a stroke dragged off the canvas is cancelled.
- Import from Aseprite on the Sprites and Title tabs.
- Quick colors and frame import on the Title tab, and a per-card Test preview.
- On the Sprites tab, export/import/Aseprite icons sit left of undo/redo.
- Fixes for pixel aspect ratios, stray preview pixels and disabled-button looks.
- **Title tab:** each frame of a 48-wide graphic can have a different picture background, with a preview
  on the canvas; graphics use the emulator's proportions; screens and graphics can be imported,
  exported and duplicated. Animation Duration fields cannot go below 1.
- Color swatches look the same everywhere, including the block color picker, and row color
  changes can be undone.
- Title graphics store less in ROM: a picture repeated under different row colors, identical pictures and
  identical color lists are stored once. Frames can be dragged into a new order, copy their picture
  background, and the import popups can keep row and box colors when replacing frames.

## Music and Sound

- Music is a single-song editor with a dedicated toolbar, a collapsible Pattern
  Editor (open or closed for the whole tab), and piano roll tools: Move, Draw,
  Erase, Select.
- Song bank export/import on the Music tab, and dedicated file extensions:
  `.vcsbnk` for sounds and `.vcsmus` for music (old `.json` files still import).
- The DIM controls moved into the Sound and Music toolbars.
- Hotkeys: Shift+E/I for export/import, Space and Shift+Space for playback.
- Fixed the Music tab freezing and crashing the browser during playback (a
  piano roll render went from 300+ ms and ~170 MB to ~45 ms and a few MB), shared
  one audio context, and cleaned up audio nodes. Fixed a click at the start of
  each note.
- Sound bank import now has a checkbox picker.

## Data tab

- Notes are per value (with a table-wide note when no cell is selected).
- Each cell has a mode menu with Decimal, Binary, Hex, Color swatch, Title
  screen, Sprite animation, Background, Sound effect, Song and Text string.
- Toolbar with undo/redo, export/import CSV, duplicate/copy/paste and a Columns
  switch.

## Project tab

- New Sound Banks view (piano icon): sounds (`.vcssnd`) and banks (`.vcsbnk`) from the
  GitHub repo's `soundbanks` folder, with a preview button per card and the import popup
  for the open project. Saved projects always include a screenshot.
- New Example Projects view: a grid of cards (screenshot, title, version,
  "by" developer) with a details popup and an Open example button. Examples are
  downloaded from the GitHub repo's `examples` folder once per page load,
  stored in the browser, and removed locally when removed from the repo.
- Saved projects include a screenshot of the emulator.
- A pinned toolbar matching the graphic editor toolbar, with a Project Settings
  button, and the tab remembers which view you were on.
- Fixed `.vcsgm` files dropping Title screen pages and graphics.
- Save with "Increment on Save" on writes a new file with the next version number each time,
  asking for the folder once per session.

## Options, themes and layout

- **Options:** TV standard, "Fill blank lines with missile0" replacing "Show
  blank lines", and tighter spacing between fields.
- **Themes:** new Dark Mode, and Soft Colors renamed Subdued Palette (it also
  covers popups).
- **Popups and toolbars:** shared delete-confirmation menu; popups use a plain
  border instead of a shadow; toolbars on every tab sit the same distance under
  the intro text; toggle switches match the Options tab's style.
- **Other tabs:** the Generated tab toolbar matches the graphic editor toolbar.
  The About tab has a Supported Kernels/Minikernels section and Official and
  Experimental links, which open in the system browser in the desktop app.
- Build errors for exceeding the ROM size name the configured size.
- The Create New Project popup is one color with Subdued Palette or Dark Mode on.

## DPC+ kernel

- DPC+ projects build and run in the 6502.ts emulator, with the default project, backgrounds and scrolling, row
  colors, score colors and the score background color matching the standard kernel. The playfield resolution is a
  field with presets, and the Superchip toggle is hidden and ignored.
- More variables: DPC+'s extra variables, the memory of unused sprites, and a 256-byte stack with Push, Pull and
  Stack position blocks.
- Players 2 to 9 are available in the Player blocks, Fire, Seek, Inertia, Bounce, Collided and Undo last move.
  Rainbow colors and ROM noise work for Player 0.
- New **Background scroll colors** block scrolls only the row colors; the playfield rainbow works on DPC+.
- The Data tab has a **Data table** cell type.

## Per-version detail

Every version from 0.50.37 on, in order, as it was committed.

```
=== 0.50.37 ===
Merge remote-tracking branch 'origin/main'

Scrub "own" from the Title tab's Score card hint text

=== 0.50.38 ===
Add sprite Inertia/Bounce, 16-way Fire directions, music/cycle optimizations; bump version

- Inertia: new accelerate/decelerate blocks (velocity, per-axis max speed,
  8/16-way) for all 5 sprites, and a unified object_bounce block covering
  Fire's angle and Inertia's velocity together, replacing the old separate
  missile/ball bounce blocks (auto-migrated on project load).
- Fire: 16-directional angle scale with a dynamic "default" dropdown that
  tracks the 8/16-way toggle; fixed a throttle-countdown seeding bug that
  made the first post-fire/seek step happen a frame early instead of
  waiting the full interval.
- "Show blank lines" toggle inverted to "Fill blank lines ... with
  missile0" (display-only; the stored config value keeps its original
  polarity).
- Music generator: fewer redundant loads - back-to-back instrument checks
  on a shared channel no longer re-load the same value, the duration read
  is reused by the arpeggio branch, and the arpeggio speed/range variable
  is read once instead of three times.
- Soundfx generator: each channel's unpacked envelope nibble is kept in X
  instead of re-reading and re-masking envelopeConfig before the dispatch.
  Also fixed a "Branch out of range" build failure once a project
  registered enough envelope configs (5 in the reported case) by using a
  BNE-over-JMP long branch to the channel's done label.
- Background generator: the fade checks now build their active/finished
  mask tests directly on the flags byte they just loaded instead of
  reloading it (the two masks are disjoint bits), and share one color
  variable resolution instead of duplicating it.
- Sprite generator: missile fire/seek throttling computes its half-rate
  step (speed/2, clamped to at least 1) once per frame instead of at every
  use.
- Combined Player 0/1 and Missile 0/1 blocks into single dropdown-driven
  block types (existing projects auto-migrate).

=== 0.51.0 ===
Replace Javatari preview with gopher2600-wasm; add keyboard/keypad mapping UI

Swaps the emulator preview to a WebAssembly build of gopher2600 (real DPC+/CDF
coprocessor support, unlike Javatari), pinned to NTSC to avoid a TV-spec
reclassification bug that caused black-screen freezes on long frames.

Keyboard input is now a configurable mapping instead of a hardcoded switch:
main.go exposes setKeyMapping/setKeypadMode, and a new keyboard-mapping
dialog (click a button, press a key) lets joystick and keypad bindings be
customized and persisted, following the same click-to-capture pattern as
this project's earlier Javatari-based key remapping.

Also fixes a hover-highlight bug on every "No, don't delete" confirmation
list item across the editors (missing the `link` prop Vuetify needs to
apply its interactive/hover styling), and folds in the accumulated
"own"-wording scrub and dev-var cleanup from recent sessions.

Add unified GraphicEditorToolbar across all tabs; sound bank import picker; nav-drawer polish

- Extract shared GraphicEditorToolbar.vue used by Sprites, Background,
  Title, Score, and Text tabs, replacing per-tab toolbar duplication and
  the fully-removed internal PixelEditor toolbar/resize-all-frames code
- Fix disabled Paste buttons looking clickable across all graphic tabs
- Fix toolbar clicks deselecting the active card
- Add a checkbox picker dialog when importing a JSON sound bank
- Bump Music/Title tab alpha labels, shrink alpha warning box to content
- Flush the Actions tab to the top of the left nav drawer and replace the
  selected tab's rounded pill with a square bar reaching the drawer edge

Add Title screen animation/scroll fix, Quick colors + frame import on Title/Sprites tabs, Soft Colors theme, keyboard mapping fix

- Fix Title screen card animation/scrolling: bmp_KEY_index was a raw ROM byte (writes silently no-op'd); now aliased to a real dev var so it lands in RAM
- Add Quick colors palette to the Title tab, matching Backgrounds/Sprites
- Add "Import card frames from image files" to Title screen bitmap cards, matching the Sprites tab's animation frame import
- Fix Title screen row colors not resizing when a card's height changes via "Set height"
- Add a per-card "Test this title screen" preview button using an isolated build pipeline that can't corrupt the real project's compiled ROM
- Add a "Soft Colors" desaturated theme option
- Fix keyboard mapping not applying until the Keyboard Mapping dialog was opened once
- Give the Text/Score font tabs their own default zoom level

=== 0.51.1 ===
Fix Title Screen preview builds, project save/load, and reload-triggered UI resets; port shared undo/tool state and swatch styling

- Give the Title Screen preview build its own dedicated bank (matching the Titlescreen Kernel docs) and only bump romsize when the project's real setting can't fit it
- Fix .vcsgm save/load silently dropping Title Screen pages/graphics
- Persist the last-loaded ROM across a page reload so "Refresh emulator" doesn't blank the preview
- Fix collapse-all-on-first-visit re-collapsing every card after a page reload
- Add shared quick-color-deletion undo and shared pixel tool selection across graphic editors
- Add a shared square swatch style for Text/Score/Title background color pickers

=== 0.51.2 ===
Unify UI popup styling, zoom levels, and card delete/undo; drop abandoned 32x2/24x2 title screen kernel prototypes

Polishes Set Height dialogs, popup borders/backgrounds, tab intro spacing, and toolbar padding across editors; adds per-tab zoom level overrides, a shared clear-colors action, and delete-with-undo for title screen/graphic cards.

=== 0.51.4 ===
Add Fill/Line/Rectangle/Oval graphic editor tools with hotkeys; fix emulator preview disappearing after crash recovery and title screen shape-tool trail bug; clean up build warnings

Adds a flood-fill Bucket tool, a Shift-to-45-degree Line tool, and Shift-to-square/circle Rectangle and Oval tools to the shared graphic editor toolbar, with Photoshop-style hotkeys (B/E/G/L/R/O, '/Shift+', H) and equal icon spacing. Fixes App.vue's dead gopher2600-ready listener so the emulator pane re-syncs after an auto-recovered WASM crash, and fixes two PixelEditor.vue call sites that pushed spurious undo-history entries during a drag, which left a visible trail when drawing shapes on title screen cards with row colors. Also fixes named-export-from-default-export warnings, raises webpack's asset/entrypoint size limits, suppresses benign CSS chunk-order warnings, and raises the PWA precache size limit so the emulator WASM is actually cached.

Rework Music tab to a single-song editor with a dedicated toolbar; fix note volume/envelope-graph/instrument defaults; darken Subdued Palette cards

Replaces the Music tab's list of song cards with a single active-song editor (song select/add/duplicate combobox mirroring the existing pattern picker, persisted activeSongId), moves Export/Import/playback controls into their own sticky toolbar above a full-width divider, and turns the pattern editor into a collapsible section matching the Options screen's own header style instead of a nested card. Fixes a new pattern/song always starting collapsed, a newly placed note inheriting an unrelated instrument's custom volume instead of its own instrument's base volume, the envelope graph drawing a redundant overlapping point when Decay or Sustain length is zero, and the default sound card not being usable as a Music tab instrument out of the box. Also darkens Subdued Palette's card background ~2%.

=== 0.51.5 ===
Add Move/marquee selection tools, graphic flip, and background aspect-ratio fix

- Add Rectangle/Circle/Polygon marquee selection and a Move tool to the
  shared graphic toolbar, with Shift-to-add-to-selection, Escape to
  deselect, and hotkeys (V/M/C/P) for all four
- Add Flip Horizontal/Flip Vertical (Shift+H/Shift+V)
- Move Undo/Redo to the front of the toolbar; dim disabled toolbar icons
  so they read as inactive
- Match the Music tab piano roll's Undo/Redo spacing/press style to the
  graphic toolbar's, with a divider before the note-snap toggle
- Fix Background pixels rendering stretched vertically at non-default
  Superchip pfres (aspect ratio is a fixed 4:3, not row-count-dependent)
- Bump Title tab to alpha 0.75

Add sprites-follow-playfield-scroll blocks; restrict Background scroll direction under Superchip; reorder Background toolbox

- Add "set/is scrolling with playfield" blocks for Player 0/1, Missile
  0/1, and the Ball, reusing the existing vertical backgroundScrollRow
  tracker directly to nudge a flagged sprite's Y on each Up/Down scroll
  rather than keeping a separate per-sprite offset
- Hide Left/Right from Background scroll's direction picker while
  Superchip RAM is enabled (unsupported on that kernel), and default
  the direction to Up instead of Left
- Move "Draw screen" to the bottom of the Background toolbox category

Add piano roll Move/Draw/Erase/Select tools; fix Blockly undo wiping all blocks; unify duplicate icon-button CSS app-wide

- Add Move/Draw/Erase/Select tools to the Music tab's piano roll (same
  V/B/E/M hotkeys and marquee-select icon as the Graphic Editor Toolbar),
  with group-move for multi-selected notes and note-length-accurate
  selection/highlighting
- Fix note-drag lag and play the dragged note back on pitch/step change
- Fix Blockly undo sometimes wiping every block: v-model resyncs were
  firing real BLOCK_CREATE events that polluted Blockly's native undo
  stack; now wrapped in Blockly.Events.disable()/enable()
- Fix sprite "Player 1 set" blocks silently writing to Player 0's
  variables when switching the Player dropdown after duplicating a block,
  including Horizontal flip specifically missing its own translation
- Fix sprite pixel aspect ratio (square at 1x) and background pixel
  aspect ratio (now derived from the real per-background row count and
  scanline height, not a flat constant)
- Add a pixel-hover highlight to the Graphic Editor Toolbar's canvas
- Unify duplicate icon-button CSS (size, flat/hover/disabled treatment)
  scattered across Player/Background/Title/Score/Data/Sound/Music into
  App.vue's shared stylesheet; fixes an invalid ">>>" selector bug that
  had silently dropped this styling everywhere
- Match the Music toolbar's buttons to the Graphic Editor Toolbar's exactly
  (press-scale instead of color change, disabled dimming)
- Add a Grid toggle to the Score/Text tabs' toolbars
- Add Title tab alpha warning banner; minor Music tab spacing tweak

=== 0.51.6 ===
Fix a headless-build crash, music preview clicks, Blockly block mis-sizing, and toggle style inconsistencies; add an About tab Kernels/Minikernels section

- Fix "stopTrackingAll is not a function" build crash: two ARG-visibility
  sync extensions (sprites.js, input.js) called input.setVisible() before
  checking whether the workspace was headless, not after
- Fix an audible click at the start of every note during Music tab preview
  playback: widen the buffer edge fade and add a scheduling lead-in to the
  single-note preview, both needed for the fade ramps to actually render
  before output starts
- Fix Blockly blocks staying undersized after an undo, tab switch, or
  project load: the IBM Plex Mono font-load re-render fix only ever ran
  once, at the very first mount
- Fix the piano roll marquee tool's selection highlight never showing and
  bleeding over the row-label column during a drag
- Unify toggle switches app-wide to the Options tab's plain (non-dense)
  style
- Add a message naming the configured ROM size to the end of a build
  failure caused by exceeding it
- Add a "Supported Kernels/Minikernels" section to the About tab, crediting
  the Standard/Titlescreen/Text kernels

=== 0.51.7 ===
Add Dark Mode, rename Soft Colors to Subdued Palette, unify toolbar/popup styling across tabs

- Add a Dark Mode toggle in Options (filter-invert technique, same
  architecture as Subdued Palette), composing with Subdued Palette with
  no extra combined-state code; excludes real TIA-color content
  (emulator screen, pixel editor canvases, color swatches, logo) from
  inversion
- Rename "Soft Colors" to "Subdued Palette" and extend it to popups
  (v-menu/v-dialog content)
- Invert popups (v-menu/v-dialog) under Dark Mode; give them a plain
  border instead of a drop shadow (shadows can't selectively skip the
  invert filter)
- Consolidate every tab's duplicated inline delete-confirmation markup
  into a single shared ConfirmDeleteMenu component
- Add a Data tab toolbar (Undo/Redo/Duplicate/Copy/Paste/Export/Import)
  and a Sound tab toolbar (bank Export/Import, Undo/Redo, sound
  Export/Import, Stop/Play), matching the Graphic Editor Toolbar's
  spacing/icon sizing exactly; bring the Music tab's toolbar in line
  with the same reference
- Move the Sound tab's delete button to the top-right of each card,
  matching the Data tab
- Fix Blockly zoom/trashcan icon sizing and alignment in Dark Mode;
  exclude the Generated Code pane and workspace-search box from
  inversion

=== 0.51.8 ===
Add Aseprite sprite-sheet import, Player animation loop/finished blocks, and a Blockly copy/paste fix

- Add "Import from Aseprite" to the Sprites and Title tabs' graphic
  editor toolbars - imports a sprite strip + its Aseprite-exported
  .json as whole new animations (Sprites, one per frame tag) or into
  the selected card (Title, single animation only), converting frame
  durations from milliseconds to NTSC frames
- Add "Player set animation to [name]"/"...to ID" one-step blocks, a
  "Player current animation ID" getter, and a "Player animation has
  finished" watch block; add a "loop" checkbox (on by default) to
  every way of setting a player's animation - off plays it once and
  fires the finished watch instead of repeating
- Fix Blockly copy/paste (Ctrl+C/Ctrl+V) throwing "Cannot read
  properties of undefined (reading 'type')" on every use, caused by
  the workspace-multiselect plugin's clipboard format going stale
  against the Blockly 10.4 upgrade - bumped the plugin to 0.1.12
- Make the Music tab's piano roll toolbar sticky, stacking below the
  main Music toolbar as both scroll
- Tighten the gap between the alpha warning banner and the intro text
  on the Music/Title tabs

=== 0.51.9 ===
Add playback/export/import hotkeys; fix a key-repeat bug and dim the logo under Dark Mode

- Add Shift+E/Shift+I (Export/Import) to the Graphic Editor Toolbar, Sound
  tab (selected sound effect), and Music tab (active pattern)
- Add Space (Sound tab: preview the selected sound; Music tab: play/stop
  the song) and Shift+Space (Music tab: play/stop the open pattern)
- Fix holding Space re-triggering playback dozens of times a second
  instead of once per press (missing an event.repeat guard)
- Dim the app logo under Dark Mode - full brightness read as too
  glaring against the rest of the now-dark UI


=== 0.51.10 ===
Rewrite tall-background vertical scrolling; fix grid snap, XY labels and canvas drawing bugs

- Backgrounds taller than the playfield now scroll through their full height:
  pfscroll rotates the window and only the one stale edge row is patched from
  a per-background table by a single shared routine (Superchip-aware writes,
  wraps around when not stopping at the edges, stop-at-edge settles cleanly
  on the first/last row)
- Scroll vars reduced: one packed row+background byte, row max read from ROM,
  patch inputs in scratch temps; projects with no tall backgrounds and no
  stop-at-edge, scroll position getter or sprite scroll reserve none
- Fix the Blockly grid snap toggle doing nothing (Blockly 10 setter)
- Fix pixel coordinate (XY) labels showing while the pixel grid is off
- Delete/Backspace clears the pixels inside a marquee selection
- Dragging a drawing or marquee tool off the canvas cancels the stroke, and
  clicking outside the canvas (not the toolbar) deselects marquee tools
- Fix stray pixels left by line/rectangle/circle previews after a late
  update from the page redrew an older preview

=== 0.51.11 ===
Add a TV standard option (NTSC / PAL60), scroll start/edge blocks and faster tall-background scrolling

- New "TV standard" dropdown at the top of the Options tab's ROM Options,
  above ROM size (ntsc or pal60; projects saved before this existed stay
  NTSC). PAL60 is a PAL console's color signal at NTSC's 60 Hz timing, so
  frame-based values (durations, tempo) are identical between the two, and
  the ROM is built with NTSC's frame timing (batari Basic's "set tv
  pal60" makes a 312-line frame that sits 15 lines lower on screen).
- The preview emulator (gopher2600-wasm) is no longer fixed to NTSC: it is
  created with the project's TV standard for each ROM it loads (still pinned
  to that one spec, never auto-detected - auto-detection once mistook a
  single slow frame for a different TV standard and blanked the screen).
  The standard a loaded ROM was built for is remembered across a page
  reload.
- PAL60 colors: the same color byte is a different color on PAL, so a PAL60
  build replaces every color fixed at build time (Color blocks, sprite and
  playfield row colors, score/text colors, title screen colors) with the
  PAL color that looks closest to the NTSC one the emulator draws
  (nearest in CIE Lab between the emulator's two palettes - see
  tools/gopher2600-wasm/palgen). The editors keep showing the NTSC palette
  and the stored color bytes don't change. Colors the game computes while
  running (fades, rainbow colors) step through the PAL palette's hues
  and brightness.
- PAL60 audio: the Sound and Music previews use the PAL audio clock (about
  0.7% lower than NTSC, roughly 12 cents flat), and the note names shown for
  an AUDC/AUDF pair follow it.
- About tab: new Official and Experimental links (itch.io and
  abstractpolygon.com). They open in a new tab in the browser; the desktop
  build now opens any web link or window.open() in the system browser
  instead of a new app window.
- Fixed the preview sometimes showing wrong colors after changing the TV
  standard: the emulator's TV spec was read after the (async) compile
  finished, so changing the standard mid-build could pair a ROM built for
  one standard with the other's spec. It is now read when the code is
  generated.
- Creating a new project or importing one now clears the emulator: the
  screen goes blank and the previous project's ROM is forgotten (it can no
  longer be saved or tested in Stella until the new project is built).
- Tall-background scrolling: the stop-at-edge check now tests playfieldpos
  before fetching the row/maximum, so only the call that wraps a row pays for
  it (previously every downward call ran a gosub for the maximum), a wrapping
  downward call reuses the maximum instead of fetching it twice, and the row
  copy routine tests its rarer modes first and no longer reloads temp5 or
  re-dispatches (about 15 cycles less per row-step). Checked frame-for-frame
  against the previous build for down/up, with and without stop-at-edge.
- New Background blocks: "Set background scroll to row [n]" starts or jumps
  the scroll of a tall background at any row (it works before or after a
  "Set background" block in the same event; the row is clamped to the last
  scrollable one), and "When background scroll reaches the [Top/Bottom]"
  runs its blocks once each time Up/Down scrolling lands on that edge.
  Each costs RAM only when used (one flags byte / one pending-row byte).
- Fixed a build failure ("Unknown Mnemonic 'lda backgroundScrollRow'") for a
  project with a tall background but no scroll block: the scroll routine was
  emitted without the variables it reads.

=== 0.51.12 ===
Fix the Music tab's pattern row overflowing in narrow windows

- The Pattern editor's Length (steps) field moved to the left, beside the
  pattern name's buttons, and the pattern Tempo field stays at the right edge
  in line with the song's Tempo field. In a narrow window (the desktop app's
  default 800 px) the old Length/Tempo group was wider than the row, so it
  stuck out past the right edge, pushed Tempo out of line with the song's and
  made the window scroll sideways.

=== 0.51.13 ===
Fix blocks not loading / not draggable after opening a project; widen the gap between Sound name and Priority

- Opening a project containing a "Stop" Inertia/Accelerate block or a
  "Joystick fire released" block could abort partway through loading the
  Actions tab: the rest of the blocks never appeared, and Blockly's render
  queue was left stuck so blocks dragged out of the toolbox didn't show up
  (they appeared again after switching tabs). Those blocks now ask Blockly to
  draw them on its next frame instead of rendering in the middle of loading.
  Also guarded the delayed re-renders against blocks that no longer exist.
- Sound tab: more space between the Sound name and Priority fields (8 px,
  matching the gap between Frequency and Volume).
- Emulator: new camera button, left of the keyboard-mapping button, that saves
  the emulator screen as a PNG (screenshot-<date-time>.png), at the shape it
  is shown on screen (twice as wide as the console's raw pixels) with sharp
  pixel edges. It shares the keyboard button's flat-icon styling (faint at
  rest, darker on hover, including with Soft Colors on) and both are 28 px so
  the toolbar still fits the default emulator width.
- Dark Mode: the Music tab's sequence chips and the collapsed instrument chips
  keep their real colors instead of being inverted.
- Music tab: the Pattern Editor section is now open or closed as one setting
  for the whole tab, instead of being remembered separately for every song
  and pattern. Switching patterns, or adding or duplicating a pattern or
  song, leaves it as you set it.
- Fixed the Music tab freezing and then crashing the browser tab while a song
  or pattern played. Every re-render of a large piano roll (about 3,700 cells
  in a typical song) took 300+ ms and allocated roughly 170 MB, and playback
  re-rendered it many times a second to move the playhead; the heap reached
  several GB. A render now takes about 45 ms and allocates a few MB: notes,
  instrument lookups, colors, blocked ranges and the per-note AUDC tables
  are worked out once per render instead of once per cell, and the playhead
  only updates when it reaches another slice, at most 10 times a second.
- Music and Sound previews: both tabs now share one audio context (they used
  two); each note's gain nodes are disconnected when it finishes and the
  per-track gains when playback stops, instead of staying connected for the
  session; the synthesized-buffer cache is capped at 400; and envelopes only
  schedule the frames where the level changes.

=== 0.51.14 ===
Song bank import/export on the Music tab, new .vcsbnk/.vcsmus file extensions, Data tab cell types, and tighter toolbar spacing under tab intro text

- Data tab: the Notes field is now per value. Click a value cell (outlined in
  blue while selected) and the field shows and edits that value's note; with
  no cell selected (click anywhere else on the card, or click the selected
  number again) it is the note for the
  whole table, as before. A value that has a note has its number underlined
  and shows the note when hovered. Notes follow their values when they are
  reordered or removed, and are copied by the copy/paste and duplicate
  buttons and covered by undo/redo.
- Data tab: the icon button in each value cell now opens a menu listing every
  entry mode (Decimal, Binary, Hex, Color swatch, Background, Player 0
  animation, Player 1 animation, Sound effect, Song, Text string), with the
  current one highlighted, instead of cycling to the next mode on each click.
- Data tab: the Columns switch moved from above the toolbar into it, after the
  import/export icons and a divider. The toolbar's icons now match the
  graphic editor toolbar's states and spacing: the same dimmer disabled color,
  hover only while enabled, and the small press-in; its height and divider
  length line up with that toolbar too.
- Sound tab: the Show filter and the Columns switch moved from above the
  toolbar into it, to the right of the Play button.
- Sound and Music tabs: the DIM switch and its (shorter) volume slider moved
  into the toolbar, to the right of the Play button after a divider (on the
  Sound tab before the Columns switch and Show filter); the DIM description is
  now the controls' hover text. The toolbars sit closer under the tab's intro
  text. The Columns/DIM switches use the same size, label and spacing as the
  Options tab's switches (they had a smaller "dense" size, and the Data tab's
  Columns switch a narrower gap before its label).
- Score tab: the score background color swatch and the Score fade switch sit
  closer under the Score font dropdown (12 px instead of 30 px).
- Score tab (custom fonts): the "Use extra glyphs" switch and the "Add score
  padding" dropdown now sit on the same line, and the row is closer to the
  text above it.
- Music tab: new song bank export/import buttons at the left of the toolbar
  (the same database icons as the Sound tab's sound bank). Export saves every
  song, with the instruments they use, to one .JSON file. Import adds every
  song in the file; a song whose name matches one already in the project has
  its contents replaced (keeping its id, so blocks pointing at it still
  work), and instruments are matched by name like importing a single song.
- Sound and Music tabs: exported files now use dedicated extensions: .vcsbnk
  for sounds (single sound and sound bank) and .vcsmus for music (song, song
  bank and pattern). Importing still accepts older .json files too.
- Data, Sprites, Background, Title, Generated, Project and Text tabs: the toolbar sits close under the intro text (the same 6px gap as the Sound tab), also with Expert mode on, where the gap had doubled. The
  Data tab's toolbar margin comment is updated to match.
- Data tab: a cell's mode menu has one "Sprite animation" entry instead of
  separate Player 0 / Player 1 animation entries (both listed the same
  animations). Cells saved as Player 1 animation show as Sprite animation.
- Data tab: new "Title screen" cell type, a dropdown of the project's title
  screens (stores the screen's id), listed above Sprite animation.
- Options tab: the TV standard, ROM size, "Show score" and Override row height fields sit closer
  together.
- Emulator: with no ROM running (a fresh page, or after a new/imported
  project clears it) the blank screen now has the same proportions as a
  running game (it was drawn shorter, so it looked too wide, and after
  clearing it kept whatever size the previous game used).

=== 0.51.15 ===
Example Projects on the Project tab (downloaded from GitHub), a screenshot saved in each project file, and a matching pinned Project toolbar

- Emulator: a once-a-second check puts the canvas back if it has gone missing
  from its panel, is hidden, or its panel's height no longer matches it, and
  logs what it found to the browser console ("Emulator canvas problem") so a
  repeat of the vanishing canvas can be traced.
- Saving a project (.vcsgm) now also stores a screenshot of the emulator, the
  same picture the camera button saves, as a PNG in a "screenshot" field. It
  is only taken while a ROM is running, and nothing reads it back on load.
- Project tab: new Example Projects button in the toolbar. It swaps the Project
  Settings section for the Example Projects section, a grid of cards with the
  project's saved screenshot, title, version and developer. Clicking a card
  opens a popup with all of that project's settings (including email, website
  and description) and Open example / Close buttons. The examples come from
  the repo's examples folder (see src/hooks/examples.js): once per page load
  the app checks the folder, downloads new or changed .vcsgm files into the
  browser's IndexedDB, and deletes local copies of files removed from the
  folder. The list works offline from the stored copies.
  While the app checks for or downloads example projects, the Example
  Projects toolbar button shows a spinner and the section shows "Downloading
  example projects (n of m)..." (or "Checking for example projects...").
  The folder check bypasses the browser's one-minute cache of GitHub's
  listing (so added/removed example files show on the next page load), and
  each file is fetched by its hash from GitHub's git blob API so old content
  is never stored under a new hash.
- Project tab: the toolbar now matches the graphic editor toolbar - same icon
  size and hover/pressed/disabled states, and it stays pinned to the top of
  the window while the tab scrolls, with a bottom border once content has
  scrolled under it.

=== 0.51.16 ===
Both players start on the first sprite animation, Project and Generated toolbars match the graphic editor toolbar, and Data/Sprites tab toolbar and menu tweaks

- Data tab: the menu that changes a cell's mode has a thin border, the same
  color as other popup borders.
- Data tab: the import/export icons moved to the right of undo/redo, ahead of
  duplicate/copy/paste.
- Project tab: a Project Settings (gear) button now sits next to the Example
  Projects button in the toolbar; the two switch between the views, and the
  one currently showing is highlighted.
- Generated tab: the toolbar now matches the graphic editor toolbar - same
  icon size and hover/pressed states, and a bottom border once the code has
  scrolled under it. The Project tab remembers whether it was showing Project
  Settings or Example Projects across page refreshes.
- Sprites tab: the import/export/Aseprite icons moved to the left of the
  undo/redo icons.
- Sprite animations: both players now start on animation 0 (the first one in
  the list). Player 0 used to start on the second animation when there was
  more than one, and Player 1 was never set, so the two started on different
  animations.

=== 0.51.17 ===
Fix the Create New Project popup colors with Subdued Palette or Dark Mode on

- Project tab: the Create New Project popup's title bar is no longer a fixed
  light grey, so the whole popup is one color with Subdued Palette or Dark
  Mode on (the title bar used to stay lighter than the rest).
- ROM noise: fixed the playfield shifting on some rows when the offset was
  large (for example the frame counter as the offset, which runs through 0-255).
  The kernel reads the noise sprite with an indexed load that takes an extra
  cycle whenever it crosses a 256-byte page, which pushed the playfield timing
  later on those rows. The offset is now folded into the range where no row of
  the sprite can cross a page (0 to 255 minus the height).
- Blockly: the box that opens over a text field while you type (comment
  blocks, number fields) now has a solid white background, so the field's
  text no longer shows through and overlaps what you type.
- Fire and Inertia "16 directions": the halfway angles leaned toward the wrong
  axis (for example "Up (leaning right)" moved mostly right), so the angles
  were out of order. Each halfway direction now moves at full speed on its
  main axis and half speed on the other, matching its label.
- Background: "Find playfield pixel [sprite] collided with" now has a version
  that takes one direction (0-7 clockwise from Up, the same as the Fire
  block's angle and the joystick direction; 255 or anything else for none)
  instead of the two "moving right / moving down" inputs, so all four
  directions and the diagonals work. Straight directions take the pixel
  ahead of the sprite; diagonals check the column, then the row, then both.
  The new block replaces the old one in the toolbox; the old block still
  works in existing projects. The Shoot the Wall example uses it.
- Sprites: new "Stop fired [object]" block (next to Fire in the Sprites
  toolbox) that stops a missile or ball a Fire block launched, leaving it
  where it is. Its height and visibility are not touched.
- Joystick [0/1] Up/Down/Left/Right block: all eight directions are now in the
  dropdown (the four diagonals are true while both of their directions are
  pushed), listed clockwise from Up. Existing blocks are unchanged.

=== 0.51.18 ===
Fire "check playfield while moving" and Bounce "off screen edges" options, correct Background canvas shape for every pfres, and a Find playfield pixel default

- Fire (missile and ball): new "check playfield while moving" checkbox. A fast
  missile could jump over a thin playfield pixel without ever touching it, so
  no collision was detected. With the box ticked the object moves one pixel at
  a time, checks the playfield after each one, and stops on the first lit pixel
  it reaches, so the usual "Collided ... and Playfield" check still fires. It
  costs a little extra time each frame while the object is moving.
- Find playfield pixel: a newly placed block now starts on Missile 0.
- Background tab: the canvas was too wide for its height. The playfield is 32
  columns of 4 pixels, 128 of the screen's 160 pixels wide, but the aspect
  ratio used 5 pixels per column (160). With the default 11 rows the canvas is
  now 1.455 wide to tall (it was 1.818), matching what the emulator shows.
- Playfield row height with Superchip on: the kernel divides 96 by pfres and
  drops the fraction (pfres 11 gives 8, not 9), but the app rounded to the
  nearest whole number, so for every pfres that does not divide 96 evenly
  (5, 7, 9, 10, 11, 13, 14, 17, 20, 21, 25...) the Background tab canvas was
  the wrong shape and the sprite/playfield row conversions were off. Both now
  round down, like the kernel. Checked against the emulator for pfres 2-14,
  16, 17, 20, 21, 24, 25, 27, 31 and 32.
- Bounce: new "off screen edges" checkbox. Ticked, the block needs no
  collision: run every frame (for example in Gameplay update) it bounces the
  object off the left, right, top and bottom edges of the screen (X 0-159,
  Y 8-96), flipping the matching direction of Fire and/or Inertia, putting the
  object back on the edge, and keeping a fired missile or ball moving instead
  of letting it stop off-screen. Unticked, the block works as before.

=== 0.51.19 ===
Bounce manual angle, Background rainbow colors, shared bounce routine, sound envelope duration, Find playfield pixel fixes

- Bounce: new "set angle manually" checkbox. Unticked, the reflection is
  automatic as before and the angle field is hidden. Ticked, a number field
  appears and a fired missile or ball leaves the surface at that angle (0-7, or
  0-15 with 16 directions). Collision bounces only.
  The angle is applied on every call while the object is still touching what it
  hit, so the give-up turn-around can no longer replace it.
- Bounce: the playfield-reflection code is now shared by every Bounce block on the
  same object (one subroutine, which can move to another bank) instead of being
  copied into each block. A project with several Bounce blocks was overflowing
  bank 1 and failing to build.
- Sound tab: a sound effect with Envelope on now always has its Duration set to the
  envelope's full length (Attack + Decay + Sustain + Release), shrinking as well
  as growing, and the Duration field is locked while the envelope is on.
- Player: "stop rainbow colors" now puts the player back to the sprite colors it had
  before rainbow colors started. A player whose colors
  come from its animation frames also no longer has them replaced by a plain
  white table every frame while rainbow colors is used on that project.
- Background: new "Background rainbow colors, offset" block (and "Stop background
  rainbow colors"), the playfield twin of the player rainbow colors block. It
  gives every playfield row a different color from ROM bytes, shimmering with the
  frame counter unless an offset is plugged in. Needs Playfield row colors turned
  on in Options.
  Stop puts the rows back to the loaded background's row colors.
- Find playfield pixel with a Fire angle from a Fire block set to 16 directions:
  the block only understood 0-7, so angles 8-15 and the half-step angles found
  nothing. It now reads the full 0-15 range when its direction is that Fire
  angle.
- Find playfield pixel with a Fire angle as its direction: after Bounce had
  already turned the object around, the Fire angle pointed away from the pixel
  that was hit, so no pixel was found on many collisions. While a bounce is
  settling, the block now uses the heading from before the bounce.
- Sprites: the Fire block for the ball is now the same block as the missile
  one: a single "Fire [Missile 0 / Missile 1 / Ball]" block with a dropdown
  (orange for Ball). Projects with the old ball Fire block are converted
  automatically when they are opened.
- Fire: the speed is now an input that takes a number block (or a variable or
  any expression) instead of a 1-7 dropdown, with a 1 already plugged in. 0
  stands still, and anything above 7 is held at 7. Saved projects keep their
  speed. Tested on the ball: speeds 1, 3 and 7 moved it 1, 3 and 7 pixels
  a frame, 0 did not move it, and 12 moved it as 7.
- Bounce "off screen edges": the bottom edge now follows the playfield (Y 96
  with the default 11 rows, 100 with Superchip and pfres 24) instead of a fixed
  96, which bounced objects off early on Superchip builds before they reached
  the bottom playfield pixels.
- Bounce (collision mode): now works out which way to reflect from the playfield
  pixels around the object instead of guessing. Straight up/down/left/right
  movement flips just that axis; on a diagonal, the pixels next to the object
  along x and along y say whether a vertical wall, a horizontal wall or a corner
  was hit. The old guess turned a ball heading straight up or down sideways
  (up became up-right), then flipped it again a frame later, so it wandered
  off after a hit. Frames after the first one, while the object is still
  touching the wall, are ignored for a short time so it can move away, and if it
  is still stuck it reverses outright as before. Its state fits in one variable per object.
- Fire angle block: new "Fire angle of [Missile 0 / Missile 1 / Ball]" block
  that gives the direction an object a Fire block launched is travelling in.
- Actions tab: copy and paste of blocks now also goes through the system
  clipboard, so blocks copied in one browser window can be pasted into another
  even when the two windows do not share storage (a different browser or
  profile, or the desktop app next to the web app). Ctrl+C / Ctrl+X put the
  blocks on the clipboard as a "VCSGM-BLOCKS:" line; Ctrl+V reads the clipboard
  through the paste event, so the browser never asks for permission,
  and falls back to the previous behaviour when it holds nothing from this app.
- Fewer variables used by blocks: Fire only reserves its throttle countdown
  variables when a Fire block on that object has throttle movement ticked; Bounce
  keeps its whole state for an object in one variable (it was three); Find
  playfield pixel no longer reserves two scratch variables; Background rainbow
  colors no longer keeps a variable for the top row color; player Rainbow colors
  no longer keeps two variables per player; the joystick Fire button blocks use
  two variables per joystick instead of three. Superchip RAM for Breakanoid went
  from 41 to 37 of 44 bytes and read/write variables from 11 to 4 of 44.

=== 0.51.20 ===
Fewer variables (packed flag bytes, read/write pool), Find playfield pixel covers the cells beside and below a sprite, unread data tables left out of the ROM, song size in bytes, no clipboard permission prompt

- Fewer variables, part 2: a Fire block whose speed is the same plain number everywhere
  keeps the speed as a constant (no variable, no half-speed variable); the
  "check playfield while moving" step counter no longer needs a variable; rainbow
  colors blocks whose offset is a number, a variable or left empty read it where
  it is used instead of storing a copy; Background rainbow colors keeps one
  variable (which background is loaded) instead of two.
- Background rainbow colors: Stop now sets the top row color correctly. It had been
  taken from the second row. Stop restores the loaded background color table
  through a small shared routine, with a copy of the table for each background.
- Find playfield pixel (direction version): now looks at every cell the ball or
  missile touches (a sprite 2, 4 or 8 pixels wide can sit in two columns), then the
  cells straight above or below it, then the cell beside it in the direction it is
  moving, then the diagonal one. A pixel directly above or below a sprite moving at
  an angle is now found even when nothing is beside it. The code is one shared
  routine per sprite instead of a copy in every block.
- Background rainbow colors: Stop keeps the two table address variables (the table is
  found again from them) and the top row color comes back by itself on the next frame,
  since the rainbow now writes the top row color to COLUPF instead of the saved color.
- Actions tab: pasting blocks no longer makes the browser ask for permission to read the
  clipboard. Copy, cut and paste now use the browser copy, cut and paste events.
- Fewer variables, part 3: the single-bit flag bytes of ROM noise, Rainbow colors, Fire,
  Seek, Seek arrived, sprites following the playfield scroll and Inertia accelerate and
  decelerate are now packed together into shared bytes, one bit per thing the project
  actually uses (Fire for the ball and the rainbow blocks used to take a byte each, and
  now share one). The background color table address, the rainbow offsets and the Fire
  speed and half speed are kept in the Superchip read/write pool, which frees ordinary
  variables on Superchip builds. For Breakanoid, Superchip RAM went from 41 to 31 of 44.
- Data tables that no block reads are no longer put in the ROM (before, an unread table
  still took space in bank 1) and are no longer listed under a bank on the Project tab.
- Project tab bank listing: each song now shows its data size in bytes next to its pattern
  count (the note data and sequence tables of that song; the instrument tables shared by
  every song and the music engine code are not counted).
- Find playfield pixel (direction version): also looks at the row the ball or missile reaches
  into when it is taller than one row unit, and allows a pixel more on the right and
  bottom edges, so a pixel beside or a little below a sprite moving at an angle is found
  and cleared. The cells are tried in this order: the ones the sprite touches, the ones
  above or below it, the ones beside it, then the diagonal one.

=== 0.51.21 ===
Fix for a build failure with a plain sound effect while another sound effect has an envelope

- Sound effects: a build failed with "Unknown Mnemonic envelopeStage1" when a plain Play
  sound effect (no envelope) was on a channel with nothing enveloped, while another
  sound effect somewhere had an envelope, and Mute in-game audio was off. The plain sound
  tried to reset a stage counter that was never declared for that channel. It now only
  does that for a channel that has one.

=== 0.51.22 ===
Play previews for backgrounds and sprites, mirror drawing, filter-free Dark Mode and fewer cycles for Bounce and Fire

- Backgrounds that no block ever switches to are no longer put in the ROM (before, every
  background on the Background tab was). The first background always stays, since the game
  starts on it, and every background stays when one is chosen from a variable or other
  expression. Scrolling a background taller than the screen works from the same shortened
  list, so the position of each background in its tables follows the ones that are left out.
  Player animations nothing selects were already left out.
  A Background select block inside a disabled event or block does not count as a use.
- Quick colors are now saved in the project file and come back when it is opened, and a new
  project starts with an empty shortlist. A project saved before this keeps the current
  shortlist when opened.
- Background: new "Background area from X Y to X Y is clear" block (true when every playfield
  pixel in the rectangle is off). The corners can be in either order and anything outside
  the playfield is ignored. It reads the pixels one at a time through a shared routine, so
  use it now and then rather than every frame; it needs one variable and cannot be used
  inside a custom function.
- Backgrounds, Sprites: every card has a Play button (left of the delete button, like Title
  screen cards) that builds a throwaway ROM and plays it in the emulator, without touching
  the real ROM or its up-to-date status. A background preview shows just that background
  (players hidden). A sprite preview shows that animation on Player 0, centered on a black
  screen with no playfield, white unless the animation has row colors (they show even if
  per-row sprite colors is off). Both show the name on the first line of the Text
  Minikernel: centered up to 12 characters, scrolling when longer. The score, the score
  debug displays and the project's Text tab messages are left out of the preview.
- Sprites: Add frame copies the selected frame (placed after it) instead of the last one,
  and frames can be dragged to rearrange, from a strip at the top of each frame.
- Graphic editors: two on/off buttons (left of Flip) mirror what you draw horizontally,
  vertically, or both. Drawing over a pixel that is already on now gets its row color.
- Scaling a graphic's height with "Scale existing contents" also scales its row colors
  (Sprites, Backgrounds, Title screen).
- Colors: every swatch, picker and pixel editor now shows the palette the emulator draws.
- Dark Mode no longer filters the whole app: it uses the Vuetify dark theme, so pixel
  editors, color swatches and the emulator screen keep their true colors. The tab area is
  black (cards the same), with Subdued Palette on it is dark grey with lighter cards.
  Popup lists match their popup, and the sidebar icons take their tab's color.
- Fix: Ctrl+Z on a tab other than Actions no longer throws "Workspace is null".
- Bounce and Fire use fewer cycles: a fired object's heading is now handled with one computed
  jump instead of a chain of 12 (8 directions) or 20 (16 directions) compare lines, both when
  it moves each frame and when Bounce works out how to reflect it. A heading outside the valid
  range behaves as before.
- Sprites: the Play preview centers the sprite vertically by its height (a player's y is the
  bottom of the sprite), and the height cap is now 128 rows (it was 64).
- Graphic editors: switching to a drawing tool from the marquee select tools or Move clears
  the selection (moving between the selection tools and Move keeps it).
- Dark Mode: the build console keeps red error text, dropdown menus are opaque and on top,
  and the Music tab's piano roll is readable: light and dark keys in the note column, lighter
  valid steps and black invalid ones. In light mode the part of a step another instrument on
  the same channel uses is a lighter shade, and the alternating step and row shading is softer.
- Fix: the ball (and missiles) are one pixel further left than a player for the same x, but
  the playfield column was worked out as if they weren't, so about a quarter of the time Find
  playfield pixel, Bounce and the collision check while firing looked one column too far
  right: the ball bounced but the brick pixel wasn't found. They now use (x - 18) / 4 for a
  ball or missile (players stay (x - 17) / 4).
- Fix: Undo in a graphic editor no longer wipes the graphic (loading it was recorded as an
  edit), and a pixel left outside the grid by a tool no longer throws an error.
- Backgrounds: dragging a background to a new position renumbers them 1, 2, 3... and points
  everything that referred to one by id at its new id: Background select blocks, the
  Background value block, a plain number plugged into "Background set to", and Data table
  cells set to the Background format.
- Fewer variables: a joystick checked only with "Fire held" no longer reserves the
  "how long the last press lasted" variable, a project with one Title Screen page no longer
  reserves the page number variable, and only the sound channels in use get a duration variable.
- Sprites: frames can be dragged from almost anywhere on the frame, not only a thin strip.

=== 0.51.23 ===
Save ROM as .bin or .a26, named after the project

- Save ROM: the save window's "Save as type" list has separate Atari 2600 ROM (.bin) and
  (.a26) entries in browsers with a save-file picker (Chrome, Edge); in others the button
  opens a small menu to pick .bin or .a26. The file is named after the Project tab's Title
  and Version (My_Game_1-0-0), or compiled-rom when there is no Title.
- Project tab: the Example Projects button is first in the toolbar with a joystick icon,
  dividers separate it and the Settings button from the rest, and the icon size and spacing
  match the graphic editor toolbar. The example projects were removed from the repository.
- Dark Mode: the top toolbar and sidebar tab colors are the same as in light mode (with
  Subdued Palette they are only desaturated, not darkened as well), About is a softer grey
  with Subdued Palette, the Blockly grid snap icon is white when off and stays blue when on,
  and the Examples arrow in the Actions toolbox is white.
- The emulator pane's resize handle uses exactly the same colors as the console log's (rest,
  hover and grip), in light mode, Dark Mode and Subdued Palette.

=== 0.51.24 ===
Sound Banks screen, title screen scroll blocks, playfield row fade, 12th playfield row

- Project tab: a Sound Banks button (piano icon) right of the Examples button lists the
  sounds (.vcssnd) and sound banks (.vcsbnk) in the repository's new soundbanks folder (and
  its subfolders). Each card has a preview button; clicking a card opens the import popup for
  the open project, with a single "Replace existing" checkbox. Single sounds export as .vcssnd,
  banks stay .vcsbnk, and the Sound tab icons' hover text names those extensions. The screen
  you were on (Settings, Examples or Sound Banks) is kept across a refresh, and the title says
  Project Settings on the settings screen. The example info popup lost its field underlines
  and the description box, the website is a clickable link opening in a new window, and only
  the description scrolls.
- Title screen scrolling: "Scroll title screen graphic [Up/Down] by [n]" with a "stop at edge"
  checkbox (graphic top against window top, graphic bottom against window bottom, for the frame
  currently showing), and "When title screen scroll of [graphic] reaches the Top/Bottom".
  Start anywhere with "Set title screen scroll position".
- Background: "Fade playfield rows from [color] up/down to playfield colors over [n] frames"
  fades every row from the chosen color's brightness to its real row color (needs per-row
  playfield colors). Without Superchip RAM, backgrounds get a 12th row (the hidden row the
  standard kernel scrolls into view); backgrounds opened in the editor are padded to match.
- Player set animation blocks have a "restart" checkbox before "loop" (on by default): on plays
  the new animation from its first frame, off carries on from the current position.
- A saved project always includes a screenshot: one is taken after every successful build, and
  Save/Save As build first if there is none yet.
- Pixel editors: cells outside the grid are dropped, which fixes stray pixels left behind by
  Shift-snapped lines, squares and ovals dragged past an edge.
- The emulator pane and console log resize handles are the normal grey with Subdued Palette
  alone; the white ones are for Dark Mode only. Create New Project is before Save, then Open.

=== 0.51.25 ===
New app icon, default background border, grid snap and comment box fixes

- New app icon (the VCS badge) in every size: favicons, web icons, and .ico/.icns/PNG files in
  build/icons that the Windows, macOS and Linux (.deb/.rpm) packaging uses.
- A new project's starting background is a border of lit pixels along all four edges, across the
  full row count (12 rows without Superchip RAM, 11 of them visible).
- Sound Banks: the preview buttons play at the DIM volume when DIM is on.
- Fixed the Blockly grid snap icon being white (invisible) in light mode, and the comment block
  editor wrapping words while typing.

=== 0.51.26 ===
Smoother circles, score hiding with text, 12th row not drawn, default background

- Circles and ovals are drawn as an even one pixel line that stays inside the dragged box and
  reaches all four sides, instead of the bumpy outline from rounding points around the edge.
- "Show score" off hides only the score digits (and their space) when the Text Minikernel is
  in use, via noscoretxt; the text lines still render. The Play preview of a background always
  shows the name, and the compile log names the background being previewed.
- Without Superchip RAM the extra 12th playfield row is no longer put in the game's playfield
  data (it glitched the text drawn on the same screen); it stays in the Background editor, and
  a project that scrolls the playfield still loads it, since it is the row that scrolls into view.
- A new project's starting background is the border on the top, left and right edges with two
  filled rows at the bottom, across the full row count.

=== 0.51.27 ===
Scroll playfield colors, scroll direction, mirror draw preview, Sprites zoom

- Background scroll: a "scroll playfield colors" checkbox (and "stop at top/bottom edge" is now a
  checkbox in front of its text, spaced like the Player blocks) moves each row's color along with
  its pixels. It works with Superchip RAM on or off, in bankswitched ROMs, and for backgrounds of
  any height. The color tables go in the kernel's bank, in 256 byte pages, so the kernel's timing
  is not disturbed.
- Background scroll direction is the same for every background size: Down moves the background
  down and Up moves it up (backgrounds taller than the screen used to scroll the other way). The
  edge-reached events follow: Up reaches the bottom edge, Down the top edge.
- Mirror draw: with a mirror switch on, the hover highlight also shows the pixels a draw tool
  would also change.
- Sprites tab: the zoom goes down to 25%.
- New gopher2600-palettes folder with the NTSC and PAL palettes as an Aseprite extension (copy it to
  Aseprite's data/extensions folder).

=== 0.51.28 ===
Gamepads, 64k fixes, smaller generated code, faster emulator

- Gamepads: the Input Mapping dialog (the old Key Mapping dialog) maps keyboard and gamepad
  controls for each player separately, both at once. Select and Restart (the console's switches)
  can be mapped too. Player 2's fire is Right Ctrl by default, and the two players' default
  keyboard joysticks are swapped. A quick tap of the joystick or fire is no longer missed.
- 64k ROMs: a subroutine called from another bank now returns to the right bank (the picture used
  to roll, or sprites vanished when a collision ran a relocated routine), and the Text Minikernel
  score routine has its 64k cases.
- Generated code is smaller: if/while conditions are inverted so they jump less, always-true and
  always-false conditions are removed, jumps to the next label are dropped, and several flags,
  counters and line variables share bytes or use the Superchip read/write RAM. The two shake
  screen blocks are merged (up to 127 frames).
- Emulator: runs in a web worker at a steady 60 frames per second on any monitor refresh rate,
  pauses while a ROM compiles, and has an "Adaptive frame skipping" option (on by default) that
  draws only some frames on a slow computer. Frames are about a third faster to emulate: no
  allocation per CPU instruction, profile-guided optimization, heavier inlining, idle sprites no
  longer force a full pixel update, and the frame is converted to RGBA through a color table.
  The desktop app uses Electron 44 (was 22) and Node 24 builds the project.
- Save ROM shows its error message instead of throwing.

=== 0.51.29 ===
6502.ts emulator, emulator settings, undo shortcuts, row colors that move with pixels

- Emulator: the preview now runs on 6502.ts (about seven times faster than gopher2600 in the
  browser, pixel-identical on the 16k, 32k, 64k and DPC+ ROMs tried). gopher2600 stays as the other
  choice, and a ROM that uses a keypad runs on it automatically. New Emulator Settings popup (the
  cog next to the Input Mapping button): which emulator, TV signal (composite, S-Video), phosphor
  glow, scanlines, gamma, scaling, CPU accuracy, and the full screen resolution and scaling.
- New full screen button next to the screenshot button; the toolbar icons now match the graphic
  editor toolbar.
- The color swatches and the Aseprite palette files (now the 6502ts-palettes folder) use the
  6502.ts colors.
- Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes in the graphic editors, the Data tab, the
  Music pattern editor and the Sound FX envelopes; the buttons' tooltips show them.
- Moving selected pixels with the Move tool takes their row colors with them (backgrounds,
  sprite frames and title screen cards), and undo and redo restore them.
- Score fonts: every font can be redrawn, the edits are kept for that font only and saved with the
  project, and a Reset brings back the original digits.
- Sound Banks: icons show whether a download is a sound, a sound bank or an instrument, a filter
  chooses which to list, sound cards swap between a waveform and a piano icon, and have a Duplicate
  button. The example blip is a sound effect.
- Playfield vertical resolution above 24: the ball and missiles collide with the playfield again
  (a division routine landed in the wrong bank and reset the ROM). Changing the playfield
  resolution no longer deletes background rows.
- Dark mode: active toolbar icons keep their blue.
- Project tab: Settings is the first icon, then New, Open, Save and Save As, then Example Projects
  and Sound Banks.
- Options: the playfield vertical resolution label is no longer cut off.

=== 0.51.30 ===
Undo for reordering, sound multi-select, Blockly sizing

- Dragging cards, frames, backgrounds, title cards, data tables and values, music sequence chips,
  text cards and quick colors into a new order can be undone and redone (Ctrl+Z, Ctrl+Shift+Z or
  Ctrl+Y, and the Undo and Redo buttons). A reorder is undone first only when it is the most
  recent change on the tab, and it is dropped if cards were added or deleted since.
- Sound FX tab: Shift+click selects the cards between two clicks, Ctrl+click adds or removes one.
  Saving a sound bank with several selected saves only those sounds, and Export saves each
  selected sound to a separate file.
- Blocks are measured again after the font loads, so they are no longer the wrong size after a
  page reload.

=== 0.51.31 ===
Title screen blocks and automatic playback, picture background per frame, Save with a new version, fire speed

- Title screen: new blocks to end the title screen from inside Title screen update and carry on as the
  game, to recolor a graphic, to jump a graphic to a frame (with "hold it", and "then loop" or "then
  play once"), to set the background color and put it back, and to switch the picture background (the
  colored area behind a 48-wide graphic) on or off and recolor it. Title screen start puts all of
  these back to what the Title tab says.
- Title screen: Player sprites cards play their animation by themselves, using each frame's Duration;
  "Set title screen player sprite frame" jumps to a frame and has the same loop and play once choice.
  A Player sprites card with an empty animation slot no longer fails the build.
- Title screen variables share slots with variables only used while the game runs, and the game
  variables are cleared when the game starts.
- Title tab: each frame of a 48-wide graphic can have a different picture background, set with a swatch and a row
  of blocks under the graphic, and the canvas previews it. Clear colors also resets it. Graphics are drawn
  in the proportions the emulator uses, "Window height" sits above the graphic, a graphic or a whole title
  screen can be imported, exported and duplicated, and the play button is the rightmost icon of the card row.
- Animation Duration fields (Player sprites and Title graphics) cannot go below 1.
- Sprites: "Set fired speed" block; "Width/quantity" choice in the Player get block; 16-direction
  angles that lean move at the right speed and follow the right path, also when "Check playfield while
  moving" is on; the flip getter reads the right value.
- Scrolling text: when every message uses the same speed and the same pause, they are built in as
  numbers and take no variables.
- Emulator volume follows the Sound and Music DIM setting while playing.
- Save with "Increment on Save" on writes a new file with the next version number each time and asks for
  the folder once per session.
- Color swatches look the same in every editor and in the block color picker.
- Changing row colors can be undone and redone.

=== 0.51.32 ===
Title screen animation blocks and smaller stored data, emulator debug info, Player visibility, data table size

- Title screen: "Animate title screen graphic" block (forward or in reverse, then loop or play once) that
  acts as a trigger, and "When title screen graphic animation finishes". A graphic's Title tab switch
  "Play animation once" plays it through once; an animation only runs while its page is the one drawn.
  Animations can last 255 ticks in all; the build says so when one is longer.
- Title tab: frames can be dragged into a new order; Add frame copies the selected frame; frames copy
  their picture background along with pixels; row colors can be copied and pasted on their own; Fill
  works on the row color bar; Set height and the selection act on the right graphic when several pages
  use the same ids; the import popups have a "Keep row and box colors" switch next to "Replace frames".
- Title screen data takes less ROM: a graphic that repeats one picture under different row colors stores the
  picture once and each color list once (48x2), identical pictures and identical color lists are shared
  between graphics, and blocks that point at deleted graphics no longer cost variables or flag bits.
  Subroutines are kept out of the bank the title screen kernel is in.
- Sprites: frames that repeat a picture or its row colors are stored once; the Player get block has a
  Visibility option; the Switch block can run once each time a switch is turned on; 16-direction Fire
  keeps one speed at every angle and the joystick Fire timer starts over when a Fire tapped block runs.
- Data: blocks for the size of a data table, by its dropdown or by id.
- Emulator: a debug overlay for the 6502.ts emulator (registers, program counter, scanlines, CPU busy
  cycles, and a table of chosen variable values) with a Debug Info popup to pick the variables; the
  list and choice are saved in the project. The emulator and its sound stop while a ROM compiles.
- Variables: system variables that nothing but the template used are left out of the build, and the
  capacity list shows variables that share a slot.
- Popups, toolbars and previews: bottom popup buttons look like the Select, Reset and Refresh emulator
  buttons; the line under the toolbar icons spans the full width; Quick colors take less room;
  background previews hide the score and use a black background; screenshots keep the screen shape.

=== 0.51.33 ===
Debug info shows title screen names for shared variables, sprites start from their default positions after the title screen

- Debug info: a variable that shares its slot with a title screen variable is shown by the title screen name
  while the Titlescreen Kernel runs, and by the game name the rest of the time.
- Debug Info popup: Select all and Select none in the first row of each section, styled as a two-button toggle.
- A project with no block that sets or changes where a sprite is starts gameplay with the players, missiles
  and ball back at the positions a new project begins with, since the Titlescreen Kernel moves them around.

=== 0.51.34 ===
Keypad controllers in the 6502.ts emulator

- The 6502.ts emulator plays Keypad Controllers on either port, so a project that uses Keypad blocks no longer
  moves to gopher2600. The keys bound to a port's digits are the keypad's buttons while a keypad is plugged
  into the port, and the joystick controls otherwise.

=== 0.51.35 ===
Setting a player's animation no longer changes a missile's width

- Player set animation to (and Player animation change) no longer changes the width of the missile. The
  animation's loop and finished flags shared two bits with the missile width, so each changed the other.
  Missile widths are now kept in a separate byte, only used by projects that set a missile width.

=== 0.51.36 ===
Ball width and playfield priority survive the title screen

- The Titlescreen Kernel leaves the CTRLPF register at the value it needs, so a ball width or playfield
  priority set before the title screen was lost. Gameplay start, Gameover start and End title screen now
  put them back.

=== 0.51.37 ===
DPC+ kernel support, with Players 2 to 9 and a Background scroll colors block

- DPC+ projects compile and run in the 6502.ts emulator: default project, background scrolling, row colors, score
  colors, the score background color, animations and sprite positions match the standard kernel. Playfield rows are
  set by a DPC+ resolution field with a preset dropdown; the Superchip toggle is hidden and ignored on DPC+.
- DPC+ variables: the 9 extra variables, the memory of the sprites a project does not use, and the 256-byte stack
  (Push, Pull and Stack position blocks). Sound envelopes and shared slots no longer use fixed bytes there.
- Players 2 to 9 on DPC+: position, size, animation, color, Fire, Seek, Inertia, Bounce, Collided, scroll with
  playfield and Undo last move. Player rainbow colors and ROM noise work for Player 0 on DPC+.
- New Background scroll colors block: scrolls only the playfield row colors (stop at top/bottom edge available),
  a scanline at a time on DPC+ and a playfield row at a time on the standard kernel. The playfield rainbow colors
  block works on DPC+ too.
- Data tab: a Data table cell type that points at another table.
- The Fire block can launch players. Background fixes: smooth scrolling and colors that line up with the
  playfield pixels on DPC+, aspect ratios under DPC+, dropdown menus with a border and a scrollbar inside them,
  playfield resolution label no longer cut off. The pixel editor no longer shows pixels as filled that were not
  drawn when a stroke leaves the grid.
- System variables for the background and playfield colors become constants when nothing changes them.

=== 0.51.38 ===
Text Minikernel on DPC+, and the standard kernel's text code moves out of the kernel bank

- The Text Minikernel works with the DPC+ kernel: wrapped second row, the scroll cursor and custom text fonts. The
  main screen is shortened by the lines the text takes, to a height the kernel can end cleanly (see
  text-minikernel-files.js). A hidden score under DPC+ text is drawn in black. DPC+ is labelled Experimental in
  the kernel dropdown.
- On the standard kernel (16k and larger ROMs) the text drawing code and message data go in the bank below the kernel
  bank (textbank), freeing space in the kernel bank.
- The second text row is only compiled in when a block can show a message that wraps.
- Title Screen variables can share a slot with the direction byte of a fired object that only gameplay fires.
- Backgrounds are no longer padded when the Background tab opens, so changing pfres or the kernel never resizes them.
- DPC+ background and animation previews build and center their sprite; whole-number row heights are used where a
  block cannot divide by a fraction of a row.

=== 0.52.0 ===
DPC+ sound chip audio, content repository, search

- The DPC+ kernel plays sounds and music on its sound chip (three voices, each a 32 sample waveform at a pitch from
  the chip's frequency table); the ARM coprocessor rebuilds each voice's waveform. Sound cards get a waveform editor
  and a piano key pitch selector, and the Music tab plays on the chip's voices.
- Example projects and sound banks load from a content repository instead of the app, with a search box on both
  screens.

=== 0.52.1 ===
Cycle score on DPC+, search on examples and sound banks

- The cycling score display works with the DPC+ kernel.
- Search on the Examples and Sound Banks screens.

=== 0.52.2 ===
Per-background pfres on DPC+, run-once flags in display RAM, labels and goto, DPC+ divide fix, row color eyedropper, variable sharing

- DPC+: every background can have a different number of rows (pfres); the scroll, box, collision and sprite blocks
  follow the background that is showing.
- The flags of Run once blocks live in display RAM on DPC+.
- New Label and Go to label blocks.
- A DPC+ divide that returned a wrong value is fixed.
- The eyedropper picks the color of a row on a row color bar.
- Title Screen variables share slots with variables the project does not use at the same time.

=== 0.52.3 ===
Text on Title Screen pages, text starts higher with the score hidden, multiselect leaves out wrappers, eraser clears row colors to white

- Title Screen pages can show text.
- With the score hidden, text starts closer to the playfield.
- Selecting several blocks leaves out the wrapper blocks around them.
- The eraser sets a row color back to white.

=== 0.52.4 ===
5 digit score option

- New switch on the Score tab: the score shows five digits, the leftmost digit is left out and the five that remain
  are centered. Works with the standard, DPC+ and Text Minikernel score digits.

=== 0.52.5 ===
DPC+ 5 digit score fix, animation name block

- The 5 digit score is drawn correctly on DPC+.
- The Animation name block no longer has a player and takes the color of the block it is plugged into.

=== 0.52.6 ===
Title screen variable sharing, End title screen anywhere, fade block for title graphics

- Title Screen variables share slots with user variables that only run after End title screen, and across pages.
- End title screen can sit anywhere in a stack.
- New fade block for title graphics.
- Importing a graphic replaces the page with the same name.
- Hiding a sprite keeps its animation going.

=== 0.52.7 ===
5 digit score centered with the Text Minikernel, Gopher2600 loads ELF/PXE ROMs, debug overlay

- The 5 digit score and the text are centered under the playfield with the Text Minikernel.
- Gopher2600 loads ELF and PXE ROMs from memory.
- The debug overlay lists variables in order of address and shows the scanlines used out of 262.
- Kernel options are listed above the ROM options on the Options tab.

=== 0.52.8 ===
About text, links

- The About text names both emulators, with links to Blockly, batari Basic, 6502.ts and Gopher2600, and each entry
  shows its URL on a separate line.
- Links that leave the app open in a new tab: the About entries open a tab instead of a window, and a click handler
  catches any other link that leaves the app.
- README: the description matches the wiki home page.

=== 0.52.9 ===
Content repository moved

- Examples and sound banks load from AbstractPolygon/vcs-game-maker-content.

=== 0.52.10 ===
DPC+ missile colors

- With the DPC+ kernel the Missile 0/1 blocks have a Color option (the kernel's COLUM0 and COLUM1 registers); a
  missile is no longer fixed to its starting color.
- Fade Player 0/1 color also fades that player's missile under DPC+.
- A missile height of 0 hides a DPC+ missile and a height of 1 draws it on every other line; the Missile set
  tooltip says so.

=== 0.52.11 ===
DPC+ players change color during a fade

- A DPC+ player is colored by a ROM table per color, so a fade used to leave the player in its default color. When a
  project fades a player to a fixed color, tables are now built for every brightness of the hues the player uses, plus
  the target, and each step of the fade that changes the color loads the right table. A fade to a calculated color
  still cannot be shown on a DPC+ player.

=== 0.52.12 ===
macOS builds and GitHub Actions desktop builds

- A GitHub Actions workflow builds the desktop app on Windows, macOS and Linux and attaches the installers to a
  release tagged with the version: the Windows installer, the Linux deb and rpm, and for macOS a zip and a dmg for
  Apple Silicon and for Intel.
- Linux packages name the program vcs-game-maker so the deb and rpm makers find it; package.json declares the MIT
  license, which the rpm maker needs.

=== 0.52.13 ===
No menu bar in desktop builds

- The desktop app has no menu bar on Windows and Linux (the window's menu is removed and its menu bar stays hidden).
  macOS keeps a hidden Edit menu, since its Cmd+C, Cmd+V and Cmd+A shortcuts come from it.

=== 0.52.14 ===
Startup tips, and links on the About tab

- A tip pops up when the app starts, a different one each time (99 to begin with). Each tip links to the wiki page and
  the exact entry it is about. The tips are in src/data/tips.json, so they are easy to edit. The popup has previous and
  next arrows, the icon of the tab the tip is about, and a "Don't show again" checkbox.
- New "Show Tips at startup" switch under VCSGM Options. The checkbox turns it off and then opens a notice with a
  link that goes to that switch.
- The About tab has a Documentation/Wiki link, and the space after each label is no longer part of its link.

=== 0.52.15 ===
Show Tips at startup

- The Options switch for the startup tips is named "Show Tips at startup".

=== 0.52.16 ===
Tip popup polish, Ctrl+Y for redo, Delete key hint

- Each tip shows what it is about in bold, and its link is named after the entry it goes to (for example "Define
  function" instead of "Actions"). The popup also has a "Full documentation" link in a fixed spot, previous and next
  arrows, and the "Don't show again" checkbox sits level with the buttons.
- Redo is Ctrl+Y (Cmd+Y) on every tab, the same as on the Actions tab; Ctrl+Shift+Z no longer redoes outside it.
- The tooltip of a delete button names the Delete key where the key deletes the selected card or frame.
- Popups: the buttons in the bottom row are as far from the bottom edge as from the sides, and the label of every
  checkbox sits closer to its box.
- The macOS build installs appdmg again when npm skipped it.

=== 0.52.17 ===
Tip popup icons, web build

- The icon in the tip popup's title is centered with the "Tip" text by the middle of its drawing as well as of its
  box, and no longer slides when the arrows change the tip.
- The GitHub Action also builds the web version and attaches it to the release as VCS-Game-Maker-web-<version>.zip,
  next to the Windows, macOS and Linux installers.

=== 0.52.18 ===
DPC+ missiles and fired objects, collision speed, new variable blocks

- DPC+: a missile or the ball one line tall was drawn on every other y only, so shots could be invisible and miss the
  playfield. Setting a height of 1 now gives 2 on that kernel.
- Fire: an object that leaves the screen stops, is hidden at the top left corner and no longer shows up on the other
  side. New block "Fired [object] has gone off screen" (true until the next Fire). DPC+ counts 212 lines for the
  bottom edge.
- DPC+: Find playfield pixel, bounce and the playfield check use the missile's and ball's lines for the row, and a
  player's height; Player 1 ROM noise has the right height and position, and rainbow colors work on Player 1.
- Undo last move can go back 1 or 2 frames.
- Playfield box test: the standard kernel reads the playfield bytes directly, and a sprite with one copy skips the copy
  checks. ROM noise with one fixed height no longer takes a variable.
- New Variables blocks: first or last 4 bits of a variable (0 to 15), read and set. Display RAM blocks use the variable
  block color.
- The debug variable list includes the DPC+ bonus variables (such as the shared flag byte) and Superchip read/write
  variables.
- The Sound tab preview of a DPC+ sound follows the DIM percentage the way the emulator does.
- Fixed a build error when a Set block sets Player 2 to 9's animation on DPC+.

=== 0.52.19 ===
Playfield rename, toolbar labels and sidebar sizes, Colorblind Mode

- The Background menu is now Playfield: the toolbar category, the tab's menu entries and the labels of its blocks. Saved
  projects load as before, and the dropdowns are unchanged.
- The top toolbar shows each tab's name in small type under its icon. The left sidebar can be dragged between wide
  (names beside the icons) and narrow (names under them). Expert mode takes all of these names away and the sidebar
  shows only the icons.
- New Colorblind Mode switch under Subdued Palette: the icons and names in the left and top toolbars are black, or
  white in Dark Mode (a softer grey with Subdued Palette).
- Thinner scrollbars everywhere, the Blockly ones the same width as the rest.
- The resize handles (sidebar, emulator, console) use the outline color at rest and a stronger one on hover, in Dark
  Mode as well.
- The tip popup shows "Tip X / Y" next to its arrows, its checkbox lines up with the arrows and the text above it, and
  there is a new tip about Dark Mode and Subdued Palette.

=== 0.52.20 ===
Toolbar and emulator pane polish

- In the top toolbar, the highlight of the current tab is wide enough for the name under its icon, and the icons stay
  evenly spaced.
- When the emulator pane is too narrow for its tool icons next to the Refresh emulator button, all of them move to a
  line below it, centered.
- In Dark Mode, the text typed into the block search field of the toolbox is light, so it can be read.

=== 0.52.21 ===
Toolbar switches, Greyscale, Prefabs, toolbox look

- The Colorblind Mode switch is now named Greyscale. Subdued Palette and Greyscale have shorter descriptions, and with
  Dark Mode on, Subdued Palette also makes the Actions toolbox text a softer grey.
- New "Never show top toolbar" switch above "Never show left toolbar" (renamed from "Never show the left sidebar").
  Neither needs Expert mode any more, only one of the two can be on at a time (each greys out the other), and Expert
  mode's switch is below them. The left toolbar is never hidden because of the window's width.
- Blockly toolbox: the Examples category is now Prefabs, its arrows are thin chevrons, there is a line down the right edge
  in the toolbar border color, the drawer of blocks has square corners, and the text typed into the search field is
  readable in Dark Mode.
- The resize handles are solid greys in every color mode.
- The emulator pane's collapse button is 8px from the pane and drawn above the toolbox and its drawers. When the pane
  is too narrow for its tool icons, the Refresh emulator button is centered above them.

=== 0.52.22 ===
Playfield offset block

- New "Playfield offset" block in the Playfield category: moves the pixels of the whole playfield, or of an area of it,
  by one pixel in a direction (alternate rows left and right, all left, all right, all up or all down), wrapping round.
  A pixel that leaves the end of a row carries on at the start of the next row and the last row feeds the first, so the
  holes of a wall drift along, like the shield in Yars' Revenge. An area's left and right edges are whole bytes of the
  playfield (columns 0-7, 8-15, 16-23 and 24-31) and its top and bottom are rows counted from 0. It needs no variables
  and works with the standard kernel (with or without Superchip RAM) and DPC+.

=== 0.52.23 ===
High Contrast, Expert mode sidebar

- The Greyscale switch is now named High Contrast.
- In Expert mode the left toolbar has no color bar beside each icon, and its icons are centered in the narrower bar.

=== 0.52.24 ===
Sound loops, sweeps, frequency envelopes and staircase volume, smaller music engine, Windows installer, DPC+ data streams and Display RAM blocks, PolyForm Shield license

- New Data stream blocks (Variables category, DPC+ only): point stream 1, 2 or 3 at a Display RAM area and byte, then
  read or write the bytes one after another; the stream moves on by one byte each time. A stream is lost at drawscreen.
- New Display RAM fill and Display RAM copy blocks fill or copy a run of up to 255 Display RAM bytes in one block.
- With DPC+, a background can have up to 255 rows. One that is too tall to wrap seamlessly with the rows on screen
  scrolls without wrapping and stops at its top and bottom.
- A DPC+ project that runs out of variable space now keeps the extra variables in Display RAM automatically (only variables used by
  the Set, Get and Change blocks, and not in a Repeat while condition). The ROM capacity list shows where each one is.
- Display RAM get and Data stream read: a statement can now have more than two of them (extra scratch bytes are reserved when needed).
- Score bar "set health" / "set lives" / "change" with 0 leave nothing behind (a batari Basic for loop always runs its body once).
- Fired objects in 16 directions: the halfway angles keep their leftover sixteenths of a pixel in a byte of their own, so they move at
  the speed of a diagonal and smoothly, also when the movement is throttled; with "Check playfield while moving" the cell is looked at
  after each axis moves, so an object cannot slip between two lit cells that touch at a corner.
- "Fade playfield rows from color" keeps each row color table once, however many backgrounds and fades use it, and finds the table
  with far fewer comparisons: a project with 9 backgrounds went from 59 tables to 13 and builds in 32k again.
- The cycle score always has six digits (the 5 score digits switch is off and disabled while it is on).
- Fewer cycles on every frame: the background color fade checks and the "Run once" flag reset are only called when there is
  something to do (a call into another bank costs about a hundred cycles each). The Passage title screen has 256 more cycles
  to spare.
- Variables kept in Display RAM (DPC+) start at 0, like the others (the memory powers up with random contents).
- A binary file given to the compiler along with the program (the DPC+ coprocessor program of the sound engine or of Faster multiply
  and divide) reaches the assembler as it is: it used to be read back as text between the compiler's steps, which damaged its bytes.
- Options: "Hide toolbar text labels", a switch under Expert mode (only available while Expert mode is on), takes the names away from
  the left and top toolbars; Expert mode alone now keeps them.
- Linux releases include an AppImage (x64 and arm64), packed in a .tar.gz so it stays executable.
- Dividing by a number that is not a power of 2 on DPC+ always uses the coprocessor (Faster multiply and divide is always on there):
  big answers take a fixed, short time instead of a long count.
- DPC+: when the project has more variables than room, the generated code is looked at first: the unused system variables give their
  slots up, and variables the code only sets and tests in plain statements (fade timers, wait counters, ...) are kept in Display RAM too,
  along with the user variables, instead of stopping with "Too many variables". A variable used in any other way stays where it is.
- Large DPC+ projects fit again: the playfield and background row fades run as a subroutine that can sit in any bank (called only
  while a fade is running), a bank that holds no music is no longer set aside for it, and units are placed in the banks by their
  size in bytes, not by how many there are. When the assembler reports that a bank is over, units move out of that bank, and
  several move at once when the main bank is far over, so a big build takes seconds instead of minutes.
- Variables the Text Minikernel's own code reads are no longer moved into Display RAM when a DPC+ project has too many variables.
- Every unit that can leave the main bank now does, before the first build: events, backgrounds, animations, subroutines. The units
  go to the other banks by size, and the main bank only gets the ones that do not fit anywhere else. With DPC+ the code that loads
  the backgrounds is one subroutine in another bank, called only on the frame a background changes.
- The Superchip RAM setting stays as it is when the kernel is changed to DPC+, and is ignored there.
- The free space shown for a DPC+ ROM counts all of its banks and the display data's region (about 28K), where it showed about half.
- After a build that works, the units still in the main bank are tried in the free room the other banks measured; a move that does
  not fit is taken back.
- DPC+: the internal variables that can live in Display RAM go there first, whether or not the letters would have run out, so the
  letters are left to the variables of the project.
- Calling a Function from a block now passes only as many arguments as a call connects or a Function reads, not always six: the
  unused argument slots no longer take a variable each, and a call no longer stores zeros into them.
- Units are packed into as few banks as possible: every bank that holds code also holds a copy of the data tables it reads.
- DPC+: your variables go in Display RAM before the letters too, when they can (the letters are only used for the ones that cannot).
- DPC+: the system variables (frame counter, colors, sizes, animations, frames, the selected background) can be in Display RAM too, when
  they are used in plain places and not many times (each use of one costs about a dozen bytes and cycles). The Display RAM spill now
  also handles a bit of a variable, an if that does one plain statement (with an else), and writes that sit next to other uses of
  the scratch bytes.
- DPC+: a variable of the project that a block uses in a way the Display RAM handling of its own does not cover is looked at in the
  generated code like any internal variable, and goes to Display RAM when every use is in a plain place. How many uses of the
  system variables may be spilled depends on how much room the last build left (a few when it was nearly full, many when not).
- DPC+: the memory the kernel leaves free (the unused virtual sprites' bytes) is used for variables before the letters, not after.
- A variable used as an array index (table[variable]) is now seen by the Display RAM spill, so it can move there too.
- The Display RAM spill is held to a number of uses (each costs about a dozen bytes and cycles): a few when the last build was nearly
  full, many when it left room.
- Variables in Display RAM take less code and fewer cycles: a run of tests of the same variable one after another (the fades make long
  ones) reads it once, a variable set to a number is loaded straight from the number, "x = x + 1" and "x = x - 1" read and write in one
  go, and setting or clearing a bit is done in the accumulator. That made room for more variables there (Passage: 15 of 25 letters).
- Compiling a big project no longer runs the browser out of memory: the compiler's output is kept in chunks instead of an array of numbers, the
  assembler's listing (which nothing read) is no longer written, and the variables the first pass found unfit for Display RAM are
  remembered for the later passes.
- Nothing else goes in the bank the Title Screen Kernel is in, and when a build keeps overflowing, the variables that did not have to
  go in Display RAM stay on their letters, so a project with a title screen fits on DPC+.
- With the top toolbar hidden and the sidebar narrow, the round logo is at the top of the sidebar with the version under it.
- The bytes free list shows what is in bank 1 (and DPC+'s bank 2): the main loop and common game logic, and the kernel.
- Expert mode hides the colored bars beside the sidebar's options by itself (the active option keeps its bar); the Hide toolbar text labels switch no longer decides it.
- The Options switches Never show top toolbar and Never show left toolbar are now called Hide top toolbar and Hide left toolbar.
- Fixed fired objects (the ball and the missiles) getting stuck in playfield blocks when Check playfield while moving is on: a Bounce turned
  the object round, but the movement stopped it on the first step out of the block (the cell it was leaving is lit too), so it crept out one
  pixel a frame and the Bounce gave up and turned it back into the wall. While a Bounce is still working on an object it no longer stops on
  a lit cell. The Bounce also finds the cell outside the wall by stepping back along the axis the object came in on, not both, so a
  halfway (lean) direction no longer turns the wrong way at a wall.
- DPC+: the ball and the missiles are drawn two pixels further left than with the standard kernel for the same x, so the playfield column they
  are in is (x - 20) / 4, not (x - 18) / 4. Check playfield while moving, Bounce and the playfield collision blocks looked two pixels too far
  ahead and stopped the object short of a wall.
- Fixed a Bounce turning an object round again on every frame it was still touching the wall (a small ball stuck jittering in a block): the
  start-of-frame step that clears the "a Bounce ran last frame" mark also cleared the stage, so the stage could never get past the first one.
  It now clears only the mark.
- With the top toolbar hidden, the wide sidebar shows the full VCS Game Maker logo and the version under it, as the top toolbar does.
- Under DPC+ a player is drawn one pixel further right than on the standard kernel for the same X, so the Playfield collision blocks (sprite touches playfield, row/column of a player) now use the column (X - 16) / 4 for a player on DPC+.
- The left sidebar's drag handle and its highlight sit on the sidebar's edge in Expert mode when the sidebar is narrow (it was left at the old width).
- The Windows installer is now an .msi package that installs for all users into Program Files and adds a Start Menu shortcut with the icon (it was a per user installer in the AppData folder).
- The Linux deb and rpm packages add a menu entry with the app's icon, in the Development and Game sections (the AppImage is run as it is and adds none).
- A big DPC+ build that has to move units out of a bank other than the main one moves several at once (the biggest first, until about the overflow the assembler reports is out), so a cold Bricks build takes 11 attempts and about 4 seconds, where it took 20 and 14.
- The Windows installer has a Customize page where the Desktop shortcut can be left out (it is on by default; the Start Menu shortcut is always added).
- The Sound tab's playback controls have a loop button after Stop (like the Music tab's): the preview plays again each time it ends until Stop is pressed.
- Sound blocks: "Play sound effect" and "Play sound" have a Loop checkbox (off by default): the sound starts over each time it ends, until
  another sound is played on its channel or a new "Stop sound on" block ends it. A new "Set max sound volume to" block (0 to 15) holds the
  volume of every sound and music note to that number until it is set again.
- Sound cards have a Frequency sweep (the pitch moves from the Frequency to an end frequency, one step every 1 to 8 frames, once or repeating)
  and a Frequency envelope (the pitch moves by up to an amount, following Attack/Decay/Sustain/Release like the volume envelope). The
  Arpeggio of a sound card also plays when the sound is played from a block, not only on the Music tab. All of them are in the Sound tab's
  preview and in the ROM (standard kernel and the TIA channel under DPC+); a sound that loops or changes pitch uses one variable on its
  channel for both, and "Set max sound volume" one variable. The sounds of the DPC+ sound chip do not use sweeps or frequency envelopes.
- The Frequency envelope of a sound card has a graph like the volume envelope's, to drag its Attack, Decay End, Release Start and Release.
- The Music tab plays everything set on the sound card: a note of an instrument with a Frequency sweep or a Frequency envelope plays with the
  pitch (and the volume envelope) of each frame, in the preview and in the ROM (as one event for each stretch of frames with the same
  pitch and volume; not for the sounds of the DPC+ chip).
- The Frequency sweep has a Wrap option: it goes the other way round, through 31 and 0 (30 to 20 plays 30, 31, 0, 1 ... 20).
- The envelope's Attack, Decay, Sustain length and Release can be 64 frames (they stopped at 32, Decay at 16); the stages together are held to 255 frames.
- A sound that loops plays all of its frames every time round (it repeated every duration minus 1 frames). A note that lands on a note of
  a Music tab instrument with a sweep or frequency envelope cuts it and lets it carry on afterwards, where it was dropped. The Music tab's click preview of
  a note plays the sweep and frequency envelope. The frequency envelope has Reset, Undo and Redo, sharing the volume envelope's history.
- Sounds of the DPC+ sound chip have the Frequency sweep, the Frequency envelope and the Arpeggio when played from blocks and on the Music tab: the
  sweep goes from the card's note to an end note in semitones (Step is a number of semitones), the frequency envelope moves the pitch by up
  to an amount of semitones, and each frame's pitch is an entry of the chip's frequency table (a whole semitone from a piano key is a piano key,
  so it costs no entry). In the card, the preview and the ROM (built, and the pitch written to the chip's note register; not heard).
- The volume Envelope of a sound card has a Staircase option: the envelope plays in steps instead of gliding, each level held for 1 to 32 frames
  and the levels multiples of a step (the hum of Yars' Revenge is a 64 frame Attack with a step of 2 held 8 frames). The envelope graph shows the
  steps. It plays from blocks, on the Music tab (a note of such an instrument plays the steps of its envelope) and in both previews, and it
  uses one of the 15 envelope shapes a project can have.
- The Music tab's piano roll has a Freq 0 to Freq 31 row under the Hit row (for every sound but percussion; a sound type with in-tune notes keeps its piano rows too): a note on
  a row plays that frequency, in the preview and in the ROM (the Hit row stays, with the sound's own frequency). Not for percussion sounds or the DPC+ chip.
- A project can have up to 254 different volume shapes (envelopes and staircases together) instead of 14: the number of the shape each channel plays is
  a byte of its own (envelopeConfig0 to envelopeConfig3, one more variable than before for two channels) instead of half a byte.
- Sound banks show the kernels their sounds have settings for: a sound made under DPC+ has Standard and DPC+ settings, so a bank of them (and the
  sound in the Import Sound Bank popup) says "Standard and DPC+" where it said the one kernel in its header; a bank of sounds never converted says "Standard".
- Sound cards under the DPC+ kernel have a "TIA" / "ARM" switch at the top: the Standard side shows the Standard sound type, frequency, sweep and envelope settings (for sounds played by the TIA on channel 1) and the Play button previews the way the TIA plays it.
- DPC+ sounds: after the picture the sound chip voices hold their middle volume level instead of dropping to 0, which removes a 60 Hz hum under every sound and brings them closer to the Standard kernel (display and other registers checked unchanged in the 6502.ts DPC+ harness).
- Sound and music envelopes: with four or more envelope shapes in a project, the shape of a sound is found through a table of addresses (about 35 cycles a frame per channel whatever the number of shapes, and no code for each shape) instead of comparing with each shape in turn (5 cycles a shape, and code for each); the audio register writes were checked unchanged on the standard kernel.
- Sound loops and pitch tables: with four or more looping sounds on a channel, or four or more sounds that change pitch in a project, the code or table of a sound is found through a table of addresses (about the same cycles whatever the number of sounds) instead of by comparing with each sound in turn; checked on the standard kernel over 450 frames with a looping sweep restarting on channel 0 (audio register writes unchanged).
- DPC+ and other builds with sound envelopes no longer fail with "Bank 1 is over capacity": every project with an envelope sound included the multiply and divide routines (about 100 bytes of bank 1) for a nibble packing that no longer exists; they are now left out unless something else needs them. The sound duration checks of looping sounds also go in the same moved unit as the envelope checks.
- Music engine: reading a note's two bytes from a song's data is now assembly instead of three batari Basic statements, 6 to 30 bytes smaller a song (audio register writes of the Hum and Blast songs checked unchanged over 900 frames).
- Music engine: the arpeggio tick (counter, phase and range each frame) is now assembly, about 110 bytes of batari Basic down to 55, and no longer calls the multiply routine on each flip, so a project whose arpeggio was the only user of multiply and divide leaves that routine (about 100 bytes) out; a looping arpeggio song gave the same audio register writes over 400 frames, 63 bytes of ROM smaller.
- Sound blocks with Set max sound volume: the volume of a started sound is limited with a few assembly instructions instead of four batari Basic statements and two temp variables (same register writes in the ROM trace).
- DPC+ sounds with more than one chip voice: the middle level held when the picture is over is worked out once a frame in the sound routine (in a bank that can move) and the kernel only copies it, 12 to 18 bytes smaller in the kernel bank than adding up the voices there.
- Sound cards: the Duration stops at 255 frames (the frames a sound has left are one byte); a longer sound from an older project is cut at 255 instead of wrapping round.
- Sound and music envelopes: when all the shapes of a project fit in 256 bytes together they are one table and each channel keeps just its place in it, so a channel needs no variable for the shape number and about 20 cycles a frame less are used (the old way is kept for projects with more shapes than that).
- Sound envelopes (when the shapes are too many for the one table): a channel that only Sound blocks put envelopes on and that has loops or pitch changes takes the shape from the number of the sound playing, one variable fewer a channel, and the same audio register writes in the ROM trace.

=== 0.52.25 ===
Smaller arpeggio code in the music engine

- Music engine: the arpeggio range and phase tests are one compare and branch each on a value loaded once, 38 bytes smaller and about 6 cycles less a test (audio register writes unchanged for all six arpeggio ranges).
=== 0.52.26 ===
Jump block for platformer games, sound card and DPC+ sound chip additions

- Sound cards: an Attack or Release of 56 frames can be chosen (the rising hum of Yars' Revenge is 7 steps of 8 frames).
- DPC+ sounds: a sweep, frequency envelope or arpeggio of a sound made for the Standard kernel is played by the chip at the pitches the TIA plays (the frequency number of each frame turned into the same frequency), with a "Same pitches as Standard" switch on the DPC+ side of the card to choose between that and a sweep in semitones to an End note; a Music tab note on a Freq row plays the pitch the TIA has for that number on the chip too, and the chip's frequency table puts such pitches in the places the piano keys the project does not play would be, so a project has room for many more of them.
- DPC+ sound chip: the frequency table holds up to 255 pitches (it was 127); the emulator leaves entries 20 to 215 alone and writes junk over the rest, so pitches placed above entry 215 are only right on hardware.
- New platformer blocks in the Sprites category (Players 0 and 1, and 2 to 9 on DPC+, and Missile 0, Missile 1 and the Ball on both kernels): "Jump [player] jump speed gravity max fall speed multi-jump up to [n] jumps" goes inside an if block (with a joystick fire block, say), and each time it runs it asks for a jump. The numbers are sockets for number, math or variable blocks (jump speed and max fall speed 1 to 16 pixels a frame, gravity 1 to 16 eighths of a pixel a frame, at most 4 jumps). A new press makes the player jump, in the air too with multi-jump on. The gravity and landing run by themselves every frame for each player that has a Jump block: gravity pulls the player down, and it stops on top of a lit playfield pixel (and under one above it). Every move is tried first with a software box test, one pixel at a time, so the player is exactly on top of the pixels (the hardware collision flag is clear there, checked on the emulator, with 1x, 2x and 4x wide players) and a player standing on a pixel does not move at all, so it does not jitter; walking off an edge makes it fall and counts as a jump. "[player] is jumping / falling / on the ground" is a true/false block for if blocks. The code is written in assembly and keeps its numbers, speed and state in five bytes a player.
- Creating a variable no longer fails with "prompt() is not supported": the name dialog is hooked in with Blockly 10's setPrompt, which the earlier fix no longer reached.
- The number sockets of the Jump block in the toolbox are filled with number blocks (not greyed ones), so they can be dragged off or edited like any block.
- The Jump block for Missile 0, Missile 1 and the Ball lands them exactly on top of playfield pixels: the playfield box test uses the lines each of these is drawn on, measured against the hardware collision flag on the emulator (they differ by object and kernel), and no frame of a jump, fall or landing showed a collision on either kernel.
=== 0.52.27 ===
Music engine savings, black background rows, taller DPC+ preview picture

- Music engine: each channel checks "not paused and playing" with one test instead of two (7 cycles less every frame for every channel, 7 bytes), the note index moves on with INC (2 bytes where the addition was 7, up to 6 places a channel), and a dead store is gone from every note read (2 bytes each, 13 bytes in all for a one-instrument channel on the standard kernel). Checked identical register writes for three songs on the standard kernel (fire pressed to change song); DPC+ builds.
- DPC+ background rows (Options: per-row background colors) that nobody colored are black in the Background editor and in the ROM, where they started out as a copy of the playfield colors (light grey), so a new background showed white behind the pixels and it was hard to see them.
- Background row colors that all still hold the old starting color are black too (an existing project that had them white shows black), and the Eraser and Clear in the Background editor put those rows back to black.
- DPC+ background and sprite previews in the emulator: the picture is taller (170 lines, it was 162, a whole row more of the playfield shows) and the frame is the full 262 lines (it was 254). The kernel was built for a shown score while the preview hides it, so it took lines away for a score row that is not there.
```
- Jump block: no screen roll and no overlap with the playfield at any DPC+ pfres (checked 12, 16, 24, 32 and 48 and a project at 24 with a 16 line tall player, against the hardware collision flag and the frame length: 261.7 lines every frame), and on the standard kernel (default rows, no blank lines, players at 1x, 2x and 4x, and Missile 0, Missile 1 and the Ball on both kernels). The DPC+ playfield box test (used by the other playfield blocks too) had the first row starting 4 lines too low, so a player ended up 3 or 4 lines into pixels; it now works the row out the way the kernel does (the line times DFxFRACINC, divided by 256) and reads the playfield through the data fetchers instead of the coprocessor, a few hundred cycles where it was thousands. The Jump block looks at the lines it is going to move through in one go (a sweep that finds the first lit row) and puts the sprite right against that row, instead of testing each pixel, so a fall of 6 pixels is one test. A standard kernel player is a line taller in the box test (its height variable is one less than its lines).
- Undo last move: the player's whole box (its full width and height, whatever pixels are lit in it) is tested against the playfield with the software box test after the blocks that move it have run, so the player is never drawn inside the playfield and cannot stick to a wall; it was read from the hardware collision flag a frame late. The part of a move along a clear axis is kept (a player slides along a wall and keeps falling while it pushes into one). The frames setting is kept for older projects and has no effect. The box test of a player that is not stretched starts at x - 16 on DPC+ (it was x - 17).
- The playfield box test of a project with a Jump block gave a wrong answer for a plain test (no sweep): it skipped the rows the sprite is in. Fixed, and the column and row work of the test is assembly now (about 15 percent fewer cycles).
- DPC+ backgrounds with different numbers of rows: the rows of a line and the first line of a row for the Jump block's playfield test are worked out by the coprocessor (new functions in the DPC+ program, four more builds of it).
- Jump block: the label reads "allow [ ] multi-jump up to N jumps".
- Saving a ROM from the online version inside an iframe: the browser refuses the save dialog there, so the ROM is saved as a download instead.
- The jumping / falling / on the ground check has a fourth choice, moving: true when the player's x or y changed in the last frame (in any direction), for walk animations. It needs a Jump block for the player.
- The X,Y labels over the Background grid are white or black, whichever reads best against the color of their cell (a pixel in its row color, an empty cell in its backdrop color), so they can be read on black pixels and on every other color.
- DPC+: a block that sets or fades the color of a player now works when the player's animations have row colors: the set color wins over the row colors from then on (a color given as a plain number or color block; a color worked out while the game runs still cannot be shown on a DPC+ player).
- DPC+ Players 2 to 9: the blocks that set a color, or read a color, frame or animation, no longer fail to build (the variable got a renamed copy of its name that nothing declared, as the animation one did before).
- Playfield offset, moving an area: the left and right edge of the area are number sockets like the top and bottom (any column from 0 to 31, a variable works too) instead of a choice of whole bytes of eight columns. A project saved with the old choice keeps the same area (byte 1 becomes columns 8 to 15, and so on). The area is moved with masks, and the pixel that leaves an edge goes in at the other edge of the next row as before. Checked against a model on the standard kernel, with Superchip and on DPC+, for every direction with random edges, single columns and edges on the byte boundaries. It uses 9 bytes of RAM while the block is in the project.
- Jump block: a new "stop at walls left and right" box. Ticked, a move of the player to the left or right that would put its whole box in a lit playfield pixel is taken back (the box test looks at the pixels only when the player has moved into other playfield columns), so the Jump block alone is enough for a platformer. It is not needed with an Undo last move block for the same player, which does it already. The block in the toolbox has it ticked; blocks in older projects keep it unticked.
- DPC+ playfield box test with rows that are not a power of two lines tall (16, 20, 32 rows and so on): a table of the row each line is in was read with an indexed load that, when the table sat in the first page of a bank or crossed a page, made the cartridge treat the extra read as a write to its registers and put a byte in the playfield. The tables are aligned now (on a page, and on 8 or 16 bytes for the small ones), so the test agrees with the geometry at every row count checked (12, 16, 24 and 32).
- The standing check of the Jump block and the walls check skip the box test while the player stays in the same playfield columns, and the two are not done in the same frame: frames while the player walks are about 3 lines shorter and more even (the screen could roll while the player moved left and right).
- DPC+ with the score hidden: the row where the score would be no longer takes the color of the Score tab's background color setting (the routine that sets it is left out).
- Playfield set, clear and flip pixel (and the horizontal and vertical line and get pixel blocks): a coordinate that is worked out (a division, for example, such as the player's x divided by 6) could put the other coordinate out, because the routine that divides uses the same scratch bytes, so a pixel was set or cleared in the wrong place. The coordinates are held in other bytes while they are worked out. Checked against a model with 80 random pixels on the standard and DPC+ kernels, and with divisions in X and Y.
- The "Collided ... and ..." block has a "use box" checkbox: with a player and the Playfield it answers with the whole box of the player (full width and height, whatever pixels are lit in it) instead of the hardware flag, as of the end of the last frame. Works for every player, wide players included.
- DPC+: the Playfield offset block is done by the coprocessor, for any area (any columns, any rows, all five directions): a 2 row alternate offset every 4 frames costs 4 scanlines instead of 16, and a bigger area costs about the same. The program is placed in the ROM as data in a bank that has room (the main bank only gets 56 bytes of stub), so the main bank loses nothing to it. Checked against a model with 30 random blocks at 23 rows and 12 blocks at 12 rows. The coprocessor program now comes in sixteen builds.
- Undo last move: a move along x that keeps the box in the same playfield columns is seen in assembly in the end of frame check, without the call across banks to the box test (2 scanlines less on frames while walking).
- DPC+: the box test of a player (Undo last move, the Jump block, "Collided ... with Playfield" with "use box") is done by the coprocessor when the player has no copies and the project has one row height: a test that was about 14 scanlines is about 2. Walking frames in the platformer example: median 279 to 274 scanlines, worst 297 to 287. The same player positions as the 6502 test over 3 random playthroughs of 3000 frames at 24 and 16 rows.
- Fixed a build failure when a project compared two different pairs of sprites with the Collided block (the labels of the pairs were the same, "Label mismatch"); the same for two sprites with Inertia. The comparison of the sprite boxes is a subroutine that can move to another bank, which also frees room in the main bank for projects with several pairs.
- DPC+: the box test by the coprocessor also works for players with copies (NUSIZ 1 to 4 and 6) and double and quad width players. Checked against the 6502 test for 3, double and quad: the same positions over 3 random playthroughs of 3000 frames each. The standard kernel was checked again (no overlap with the playfield in 5000 frames of random walking and jumping, with Undo last move, and with the Jump block's walls).
- Fewer variables: a player whose width and copies no block changes, and that is not two sprites wide, keeps no bytes for the width and the copies of its box when it is compared with another sprite (4 bytes a player); the Jump block keeps no byte for a number (jump speed, max fall speed, gravity, jumps) that is the same plain number in all of its Jump blocks, and the Playfield offset block of the coprocessor uses the bytes of the box test and of the Jump block while the events run. The platformer example went from 30 to 18 such bytes, and plays the same over 3 random playthroughs.
- The Playfield tab's Preview of a background (DPC+ with a color for each row of the background) shows the background row colors: the preview no longer sets the screen behind the playfield to black over them.
- Undo last move keeps no byte for "ran this frame": the x it saves is one more than the x (0 says the block did not run). Fewer bytes: a player is no longer taken as one whose width a block changes just because its horizontal flip is set (the flip is a bit of the size byte, the width and the copies are not). The platformer example is down from 30 to 13 such bytes, and plays the same over 3 random playthroughs; the standard kernel test platformer plays the same too.
- DPC+ with the score hidden and the Text Minikernel on: the lines of the hidden score row, between the picture and the text, showed the default background color (green) instead of continuing the color the picture ended in; the routine that set the score row color is now empty while the score is hidden.
- Playfield offset: "alternate rows right and left" (the first row goes right, the next left), for every kernel, checked against a model like the others.
- DPC+ Text Minikernel with "Show text row" blocks: the picture is 154 lines tall instead of 150 and the frame is as long as it should be: the working values for the height of the picture had gaps (183, 185 and 188 work too) and the second row costs 17 lines of the frame, not 12. A disabled block no longer counts in any look at the project (a disabled "Show text row" block shortened the picture).
- DPC+ with the score on: the last line of the playfield is finished before the score area starts (it was cut short and drawn in the score background color); the score row's background color and the cleared playfield start with the next line.
- Reading the y of a player under DPC+ gives it in the units "set y" takes, so a player is put where another is by setting its x and y to the other's.
- "When animation has finished" runs its blocks once, on the frame the animation ends (it ran on every frame the animation stayed on its last frame).
- "Set animation to" has "restart at frame N": the animation starts from that frame (1 is the first).
- Sprites tab: putting animations in another order or deleting one changes the blocks of the Actions tab that name an animation, so they keep the same one.
- Text: "Clear text after N frames" (1 to 255), after any block that shows text.
- The block that reads a built-in variable lists the variables the blocks of the project make (the Jump block's state, speed and fraction, a Seek's target, the clear text timer).
- Sound tab: each sound remembers whether it is set to TIA or to the coprocessor (ARM), after leaving the tab and when the project is saved and loaded.
- The coprocessor program of the Playfield offset block and the box test is found by the ROM through a number put in it once the ROM is assembled (36 bytes less of the main bank for a DPC+ project than before, and the 6502 gives the coprocessor no address with each call).

- DPC+: with a Player 2 to 9 in the project, "Collided Player 1 and ..." (the playfield, Player 0, a missile or the ball) now compares the box of Player 1 itself. The hardware flag of Player 1 stands for all the virtual sprites together, so it was true when any of them touched, and the playfield offset could push a Player 1 that was nowhere near.
- Example projects and sound banks saved by a newer version of the app than the one running are no longer listed.
- Sounds, sound banks, songs, song banks, patterns and title screens are saved with the version of the app that exported them ("app-version", as projects already were).
- Project tab, Sound Banks: a sound with a DPC+ waveform previews with the DPC+ sound chip, so each waveform of a bank sounds like itself (the preview played every one with the same Standard settings, like one instrument repeating).
- DPC+: variables kept in the memory of the sprites above "dpcspritemax" start at 0 again. The startup code set the y of all nine virtual sprites to 224, which also set whatever variable lived in that memory (a player's size byte started with its pause bit set, so its animation never played).
- Fewer variables: the "a color was set" mark of each player and the answer of each pair of sprites compared by their boxes are single bits of shared bytes (eight to a byte) instead of a byte each.
- DPC+ text kernel: four scratch bytes it kept as variables (textoffset8 to textoffset11) now use bytes of the kernel that are free below the picture, so a project that shows text has four more variables to use.
- DPC+ text kernel: a project that shows plain text takes one variable for it instead of four. The byte for the second row is taken only when a message has a second row or the scroll cursor is on, and the two bytes of the message pointer only when a score bar block is used.
- DPC+: setting a player's y to a calculation on another player's, missile's or the ball's y (such as Player 0 y + 2) puts it where it should be; the calculation was doubled before.
- Resizing the window while a number or text in a block inside another block is being edited no longer fills the console with "Block has parent" errors.
