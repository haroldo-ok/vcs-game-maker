# PXE plan: where each item stands

Source: `PLAN.txt`, steps 17–39 and the list P1–P22. Nothing here is committed or pushed, and PXE is still not offered in Options.

**Key:** ✅ done and tested in the emulator · 🟡 partly done · ⬜ not started · ⏸ held back on purpose

---

## Done

| # | Item | Notes |
|---|------|-------|
| P1 | Wide playfields | ✅ 32 / 40 / 64 / 120 columns (Options, steps 34–35). The Background editor draws a guide at column 40 and 80. |
| P3 | Per column control | ✅ Per group of 8 columns: vertical scroll and row step (parallax), steps 38 and 40. Separate write offsets and colors per column not done. |
| P4 | Reading the scroll position | ✅ Horizontal column, column group top row, and the Playfield scroll position block now builds on PXE (step 40). |
| P2 | Horizontal scrolling | ✅ Scroll left/right by pixels (stop or go round), scroll to column, scroll column getter (step 35, 39). Fine pixel mode not done. |
| P5 | 48 pixel sprite | ✅ PXE screen block, third choice. Best with a 64 or 120 column playfield (step 36). |
| P6 | GFX_MODE | ✅ Score at the bottom / no score (step 32), plus the 48 pixel mode (step 36). No Options setting yet. |
| P8 | Quadtari joysticks | ✅ Joysticks 2 and 3 in the joystick blocks (step 37). No keys in the preview. |
| P10 | Palette | ✅ Show color A as B, read a color (steps 29–30). |
| P11 | Sprite masking | ✅ Edge masking on/off for Players 1–16 (step 31). |
| P15 | Reading the playfield from the 6502 | ✅ pfread and pfpixel based blocks (earlier steps). |
| P16 | NTSC / PAL | ✅ "PXE console is PAL" block (step 30). No PAL60 choice. |

## Partly done

| # | Item | Done | Still to do |
|---|------|------|-------------|
| P13 | Save data in full | 🟡 Memory and high score blocks use one save slot (step 20) | Two slots, a block to write a slot of variables |
| P14 | More variables | 🟡 var0–var60, extended RAM used by Display RAM blocks and the offset block | `autodim` arrays, user variables kept in the extended RAM |
| P19 | Emulators | 🟡 Preview runs on 6502.ts | gopher2600 can't run PXE, PlusCart and Chameleon Cart untested |

## Not started

| # | Item | Notes |
|---|------|-------|
| P7 | Sprites mode of the newest includes | Sprites made of cels, `SPRITE_n`, `CEL_n`, `INK_n` |
| P12 | Mini kernels | Stacked score bar, multisprite band, 48 pixel band (the author's framework) |
| P17 | More CPU time | Measure what a frame of blocks costs on the ARM |
| P18 | Export | Download dialog saying which devices take the ROM, Chameleon Cart `.elf` |
| P20 | Example projects | 17 Sprites, Playfield Indexing, 8 Way Scrolling, Hi Score, Starfield and others |

## Held back on purpose

| # | Item | Why |
|---|------|-----|
| P9 | Four paddles | You said to skip the paddle blocks |
| P21 | "PXE (beta)" in Options, project conversion | Not offered until every block works |
| P22 | Title screens, Text blocks, secondary score font | Need the author's mini kernel or the simple48 mode; the secondary score font needs a PXE score-font pointer from the author |

---

## Other open checks

- Scene editor with Players 10–16 (you test in the browser).
- DPC+ bug: a project whose pfres differs from its background rows puts the playfield box rows on the wrong lines.
- The Options screen, Background editor guides and the PXE toolbox category have not been looked at in the browser.
- A Scene editor preview that follows a scroll position.

## Not possible

- Keypad and AtariVox on PXE (the ROM can't write the controller ports).
- DPC+ chip audio on PXE.
