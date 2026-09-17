 ifconst SpriteGfxIndex
TextDataPtr = SpriteGfxIndex
 else
  ifnconst pfscore
TextDataPtr = pfscore1
  endif
 endif
TextColor = statusbarlength
noscore = 1
 ifconst fontstyle
  ifconst SQUISH
   if fontstyle == SQUISH
scorecount = 4
   endif
  endif
 endif

 ifnconst scorecount
scorecount = 7
 endif

 ifnconst textbkcolor
textbkcolor=0
 endif

 ; vcs-game-maker: 0/1/2 - the Score tab's own "Add score padding" dropdown
 ; (generators/bbasic.js's own scorePaddingConfigurationCode). Always
 ; defined so "if scorepaddinglines >= N" (a plain compile-time expression,
 ; not an ifconst) is always valid, even for a project that's never visited
 ; that dropdown.
 ifnconst scorepaddinglines
scorepaddinglines = 0
 endif


 
minikernel

    sta WSYNC               ; 3     (0)
 	ifconst scorebkcolor
 	    ifnconst noscoretxt
	        ; vcs-game-maker: was "lda #scorebkcolor" (immediate) upstream -
	        ; changed to absolute so scorebkcolor can be a real RAM variable
	        ; (e.g. aliased onto playfieldrealcolor) instead of only a
	        ; compile-time constant. +1 cycle (zero-page load vs immediate);
	        ; this block runs right after WSYNC, at the very start of the
	        ; scanline, where that's well within the existing slack.
	        lda scorebkcolor
	        sta COLUBK
	    endif
	endif
    ldx #0                  ; 2     (2)
    stx GRP0                ; 3     (5)         
    stx GRP1                ; 3     (8)
    ldy #$D0                ; 2     (10)
    sty HMP0                ; 3     (13)
    lda scorepointers+1
    sta temp1
    lda scorepointers+3
    sta temp3
    lda scorepointers+5
    sta temp5
    tsx
    stx temp7
	ldy #1
	sty VDELP0
	sty VDELP1
    lda scorecolor          

    sta WSYNC               ; 3     (0)
    ifnconst noscoretxt
        sleep 3             ; 3     (3)
    endif
    sta COLUP0              ; 3     (6)
    sta COLUP1              ; 3     (9)
    ifconst scorefade
        STA TextDataPtr+1          ; 3     (12)
        sleep 3             ; 3     (15)
    else
        ifconst pfscore
            lda pfscorecolor; 3     (12)
            sta COLUPF      ; 3     (15)
        else
            sleep 6
        endif
    endif
	lda #3                  ; 2     (17)
	sta NUSIZ0              ; 3     (20)
	sta NUSIZ1              ; 3     (23*)

    lda #>scoretable        ; 2     (25)
    sta scorepointers+1     ; 3     (28)
    sta scorepointers+3     ; 3     (31)
    sta scorepointers+5     ; 3     (34)
    sta temp2               ; 3     (37)
    sta temp4               ; 3     (40)
    sta RESP0               ; 3     (43)
    sta RESP1               ; 3     (46)
    sta temp6               ; 3     (49)
	ldy #$E0                ; 2     (51)
	sty HMP1                ; 3     (54)
    ldy #scorecount         ; 2     (56)
    lda (scorepointers),y   ; 5     (61)
    sta GRP0                ; 3     (64)
    ifconst pfscore
        lda pfscore1        ; 3     (67)
        sta PF1             ; 3     (70)
    else
        sleep 6             ; 6     (70)
    endif
	sta HMOVE               ; 3     (73)
posthmove	
	ifnconst noscoretxt
	 jmp begintextscore      ; 3    (76/0)


   if >. != >[.+score_loop_height]
	align 256
   endif

textscoreloop
         lda (scorepointers),y      ; 5     (66)
         sta GRP0                   ; 3     (69)
         ifconst pfscore
             lda.w pfscore1         ; 4     (73)
             sta PF1                ; 3     (76/0)
         else
             ifconst scorefade
                 sleep 2            ; 2     (71)
                 dec TextDataPtr+1         ; 5     (76/0)
             else
                 sleep 7            ; 7     (76/0)
             endif
         endif
         ; cycle 0
begintextscore
         lda (scorepointers+$8),y   ; 5     (5)
         sta GRP1                   ; 3     (8)
         lda (scorepointers+$6),y   ; 5     (13)
         sta GRP0                   ; 3     (16)
         lax (scorepointers+$2),y   ; 5     (21)
         txs                        ; 2     (23*)
         lax (scorepointers+$4),y   ; 5     (28)
         ifconst scorefade
             lda TextDataPtr+1             ; 3     (31)
         else
             sleep 3                ; 3     (31)
         endif

         ifconst pfscore
             lda pfscore2           ; 3     (34)
             sta PF1                ; 3     (37)
         else
             ifconst scorefade
                 sta COLUP0         ; 3     (34)
                 sta COLUP1         ; 3     (37)
             else
                 sleep 6            ; 6     (37)
             endif
         endif

         lda (scorepointers+$A),y   ; 5     (42)
         stx GRP1                   ; 3     (45)
         tsx                        ; 2     (47)
         stx GRP0                   ; 3     (50)
         sta GRP1                   ; 3     (53)
         sty GRP0                   ; 3     (56)
         dey                        ; 2     (58)
         bpl textscoreloop          ; 3     (61)
         ; vcs-game-maker: scorepaddinglines (0, 1, or 2 - the Score tab's
         ; own "Add score padding" dropdown, generators/bbasic.js's own
         ; scorePaddingConfigurationCode) extra scanlines of the score's own
         ; background color, between the digits finishing and whatever draws
         ; next (the text minikernel) - inside this same "ifnconst
         ; noscoretxt" block, so they only exist for a project that actually
         ; shows the numeric score. Always defined (defaulting to 0), so
         ; "if scorepaddinglines >= N" below is always a valid compile-time
         ; check, not an ifconst.
         if scorepaddinglines >= 1
             ; GRP0/GRP1 still hold the last digit row's own pixels here
             ; (nothing clears them when the loop exits) - blanked the same
             ; 3-write way "textrowsdone"/"textkernel2ndrow" already do
             ; elsewhere in this kernel (the double GRP0 write flushes
             ; VDELP's own old-value latch too, not just the top write) -
             ; without this, the new scanline below started out by visibly
             ; repeating the last digit row instead of showing a plain
             ; background fill (confirmed directly against a real build).
             lda #0
             sta GRP0
             sta GRP1
             sta GRP0
             ; The loop above ends mid-scanline (no WSYNC of its own after
             ; the last iteration, see the cycle annotations) - this WSYNC
             ; closes out whatever's left of that scanline (now blanked, not
             ; a stale digit row) and starts a fresh one for the background
             ; fill below.
             sta WSYNC
             ifconst scorebkcolor
                 lda scorebkcolor
                 sta COLUBK
             endif
         endif
         if scorepaddinglines >= 2
             ; A second line of the same fill - same reasoning as the first.
             sta WSYNC
             ifconst scorebkcolor
                 lda scorebkcolor
                 sta COLUBK
             endif
         endif
         if scorepaddinglines >= 1
             ; Without this, the cleanup code right after this block
             ; (eventually setting COLUBK to textbkcolor) runs on this SAME
             ; scanline with no WSYNC of its own in between - splitting this
             ; line into two colors partway across instead of the solid,
             ; full-width fill intended (confirmed directly against a real
             ; build).
             sta WSYNC
             ; textbkcolor doesn't otherwise get set until partway into the
             ; cleanup code below (~24 cycles into this scanline) - without
             ; setting it immediately here too, scorebkcolor's own fill
             ; bleeds into the start of this next scanline until that later
             ; write catches up (confirmed directly against a real build).
             ; The cleanup code's own later "lda #textbkcolor / sta COLUBK"
             ; becomes redundant once this runs, but harmless - same value
             ; either way.
             lda #textbkcolor
             sta COLUBK
         endif
    endif

score_loop_height = * - textscoreloop

    ldx temp7               ; 63
    txs                     ; 65
	ldy #0                  ; 2     (67)
	sty PF1                 ; 3     (70)
	sty GRP0                ; 3     (73)
	sty GRP1                ; 3     (76/0)
	sty GRP0                ; 3     (3)
	; vcs-game-maker: when noscoretxt is unset (score digits shown) AND
	; scorepaddinglines is at least 1, the "ifnconst noscoretxt" block above
	; (right after the score loop) already set COLUBK to textbkcolor
	; immediately after its own extra scanline(s) - this one would just be a
	; harmless but redundant repeat in that case, so it's skipped. Otherwise
	; (pure text mode, or score padding off) this remains the only place
	; that sets it.
	ifconst noscoretxt
	    lda #textbkcolor
	    sta COLUBK              ; 3     (6)
	else
	    if scorepaddinglines < 1
	        lda #textbkcolor
	        sta COLUBK              ; 3     (6)
	    endif
	endif

    ifconst extendedtxt
    sty TextDataPtr+1              ; 3     (9)
    sty temp7               ; 3     (12)
    lax TextIndex           ; 3     (15)
    asl                     ; 2     (17)
    rol TextDataPtr+1              ; 5     (22)
    asl                     ; 2     (24*)
    rol TextDataPtr+1              ; 5     (29)
    asl                     ; 2     (31)
    rol TextDataPtr+1              ; 5     (36)
    sta TextDataPtr              ; 3     (39)
    txa                     ; 2     (41)
    asl                     ; 2     (43)
    rol temp7               ; 5     (48)
    asl                     ; 2     (50)
    rol temp7               ; 5     (55)
    clc                     ; 2     (57)
    adc TextDataPtr              ; 3     (60)
    sta temp1               ; 3     (63)
    lda TextDataPtr+1              ; 3     (66)
    adc temp7               ; 3     (69) ; use existing carry from last operation
    endif
    
    ifconst extendedtxt
        adc #>text_strings  ; carry already clear
    else
        lda #>text_strings
    endif
    sta TextDataPtr+1
    lda #<text_strings
    sta TextDataPtr

    ifconst textbank
        sta temp7
        lda #>(textkernel-1)
        pha
        lda #<(textkernel-1)
        pha
        lda temp7
        pha ; *** save A
        txa
        pha ; *** save X
        ldx #textbank
        jmp BS_jsr
    else
        jmp textkernel
    endif

posttextkernel

    rts
