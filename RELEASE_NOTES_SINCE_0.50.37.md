# VCS Game Maker: everything since 0.50.37

This covers versions 0.50.38 through 0.51.38, grouped by area. The per-version
detail is in `CHANGES_SINCE_0.50.37.txt`.

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
