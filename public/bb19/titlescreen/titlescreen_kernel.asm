
; Adapted from Mike Saarna (RevEng)'s "bB Titlescreen Kernel" 1.8 for
; VCS Game Maker's own compile pipeline - every include below is a flat
; filename (no "titlescreen/" subdirectory) since the WASI bB/DASM
; toolchain mounts every sibling file (this bundle's own static files,
; plus generators/bbasic/titlescreen.js's own dynamically-generated
; titlescreen_layout.asm/titlescreen_data.asm) directly alongside the
; compiled source, the same flat-sibling layout the Text Minikernel's own
; text12a.asm/text12b.asm already use (see hooks/rom.js). The player/
; score/gameselect minikernels from the original kernel aren't wired in
; here - only the 48x1/48x2/96x2 bitmap kernels and "space" are currently
; supported.
 include "layoutmacros.asm"
 include "dpcfix.asm"
 include "titlescreen_layout.asm"

titledrawscreen
title_eat_overscan
 	;bB runs in overscan. Wait for the overscan to run out...
	clc
	lda INTIM
	bmi title_eat_overscan
	jmp title_do_vertical_sync

title_do_vertical_sync
	lda #2
	sta WSYNC ;one line with VSYNC
	sta VSYNC ;enable VSYNC
	sta WSYNC ;one line with VSYNC
	sta WSYNC ;one line with VSYNC
	lda #0
	sta WSYNC ;one line with VSYNC
	sta VSYNC ;turn off VSYNC

	ifnconst vblank_time
 	lda #42+128
 	else
 	lda #vblank_time+128
 	endif

	sta TIM64T

titleframe = missile0x
        inc titleframe ; increment the frame counter

	#ifconst .title_vblank
	jsr .title_vblank
	#endif

title_vblank_loop
	lda INTIM
	bmi title_vblank_loop
	lda #0
	sta WSYNC
	sta VBLANK
	sta ENAM0
	sta ENABL

title_playfield

; ======== BEGIN of the custom kernel!!!!! All of the work is done in the playfield.

        lda #230
        sta TIM64T

	lda #1
	sta CTRLPF
	clc

	lda #0
        sta REFP0
        sta REFP1
	sta WSYNC
	lda titlescreencolor
	sta COLUBK

	titlescreenlayout

	jmp PFWAIT ; kernel is done. Finish off the screen

 include "position48.asm"
 include "titlescreen_color.asm"

	#ifconst mk_48x1_1_on
	include "48x1_1_kernel.asm"
	#endif ;mk_48x1_1_on

	#ifconst mk_48x1_2_on
	include "48x1_2_kernel.asm"
	#endif ;mk_48x1_2_on

	#ifconst mk_48x1_3_on
	include "48x1_3_kernel.asm"
	#endif ;mk_48x1_3_on

	#ifconst mk_48x1_4_on
	include "48x1_4_kernel.asm"
	#endif ;mk_48x1_4_on

	#ifconst mk_48x1_5_on
	include "48x1_5_kernel.asm"
	#endif ;mk_48x1_5_on

	#ifconst mk_48x1_6_on
	include "48x1_6_kernel.asm"
	#endif ;mk_48x1_6_on

	#ifconst mk_48x1_7_on
	include "48x1_7_kernel.asm"
	#endif ;mk_48x1_7_on

	#ifconst mk_48x1_8_on
	include "48x1_8_kernel.asm"
	#endif ;mk_48x1_8_on

	#ifconst mk_48x2_1_on
	include "48x2_1_kernel.asm"
	#endif ;mk_48x2_1_on

	#ifconst mk_48x2_2_on
	include "48x2_2_kernel.asm"
	#endif ;mk_48x2_2_on

	#ifconst mk_48x2_3_on
	include "48x2_3_kernel.asm"
	#endif ;mk_48x2_3_on

	#ifconst mk_48x2_4_on
	include "48x2_4_kernel.asm"
	#endif ;mk_48x2_4_on

	#ifconst mk_48x2_5_on
	include "48x2_5_kernel.asm"
	#endif ;mk_48x2_5_on

	#ifconst mk_48x2_6_on
	include "48x2_6_kernel.asm"
	#endif ;mk_48x2_6_on

	#ifconst mk_48x2_7_on
	include "48x2_7_kernel.asm"
	#endif ;mk_48x2_7_on

	#ifconst mk_48x2_8_on
	include "48x2_8_kernel.asm"
	#endif ;mk_48x2_8_on

	#ifconst mk_48x1_X_on
	include "48x1_X_kernel.asm"
	#endif ;mk_48x1_X_on

	#ifconst mk_48x2_X_on
	include "48x2_X_kernel.asm"
	#endif ;mk_48x2_X_on

	#ifconst mk_96x2_1_on
	include "96x2_1_kernel.asm"
	#endif ;mk_96x2_1_on

	#ifconst mk_96x2_2_on
	include "96x2_2_kernel.asm"
	#endif ;mk_96x2_2_on

	#ifconst mk_96x2_3_on
	include "96x2_3_kernel.asm"
	#endif ;mk_96x2_3_on

	#ifconst mk_96x2_4_on
	include "96x2_4_kernel.asm"
	#endif ;mk_96x2_4_on

	#ifconst mk_96x2_5_on
	include "96x2_5_kernel.asm"
	#endif ;mk_96x2_5_on

	#ifconst mk_96x2_6_on
	include "96x2_6_kernel.asm"
	#endif ;mk_96x2_6_on

	#ifconst mk_96x2_7_on
	include "96x2_7_kernel.asm"
	#endif ;mk_96x2_7_on

	#ifconst mk_96x2_8_on
	include "96x2_8_kernel.asm"
	#endif ;mk_96x2_8_on

PFWAIT
        lda INTIM
        bne PFWAIT
        sta WSYNC

OVERSCAN
 	ifnconst overscan_time
 	lda #34+128
 	else
 	lda #overscan_time+128-5
 	endif
	sta TIM64T

	;fix height variables we borrowed, so DPC doesn't crash on drawscreen...
 ifconst player9height
	ldy #8
	lda #0
        sta player0height
.playerheightfixloop
	sta player1height,y
 ifconst _NUSIZ1
	sta _NUSIZ1,y
 endif
	dey
	bpl .playerheightfixloop
 endif

	lda #%11000010
	sta WSYNC
	sta VBLANK
	RETURN

 include "titlescreen_data.asm"
