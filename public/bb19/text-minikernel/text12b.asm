    ifconst bs_mask
        ifconst FASTFETCH ; using DPC+
KERNELBANK = 1
        else
KERNELBANK = (bs_mask + 1)
        endif
    endif


textkernel
	lda TextColor
	sta COLUP0
	sta COLUP1
    ifconst extendedtxt
        lda temp1
    else
        lda TextIndex
    endif
    jsr showtextrow

    ; "textkernel2ndrow" is unrelated to the real bB "extendedtxt" const
    ; (text12a.asm's own pointer-math option, unused by this app - see
    ; generators/bbasic.js) - named apart from it on purpose so the two are
    ; never confused with each other.
    ifconst textkernel2ndrow
        ; drawtextrow's own last scanline (called from inside showtextrow
        ; below) ends with GRP0/GRP1 still holding row 1's final glyph
        ; columns (VDELP0/1 stay armed the whole time, and nothing clears
        ; them until "textrowsdone" below) - between showtextrow's own rts
        ; and its next jsr's first "sta WSYNC", that leftover shape rides
        ; along into the next scanline and shows as a sliver of row 1
        ; smeared into the top of row 2. Blanked the same 3-write way
        ; "textrowsdone" already does (the double GRP0 write flushes
        ; VDELP's old-value latch too, not just the top write) before row 2
        ; starts drawing.
        lda #0
        sta GRP0
        sta GRP1
        sta GRP0
        ; Row 2 is ALWAYS drawn here, every frame, regardless of whether the
        ; message currently shown actually wraps - deliberately NOT skipped
        ; at runtime. An earlier attempt skipped this whole jsr whenever
        ; TextRow2Active was clear (cheaper on paper - no extra scanlines
        ; for a project's many non-wrapping messages), but that made the
        ; TOTAL number of scanlines in the frame depend on a runtime flag -
        ; confirmed as a real, visible bug (rendered frame rolling/tearing,
        ; Javatari's own TV-format auto-detection failing outright). The
        ; standard kernel's NTSC timing has no way to be 13 scanlines
        ; shorter on some frames than others - it needs the exact same
        ; total every time, so row 2's own cost has to be unconditional
        ; whenever this feature is compiled in at all, even for a message
        ; that doesn't use it.
        ;
        ; Whether THIS message wraps to a second line is only known at
        ; runtime (a project can freely mix wrapping and non-wrapping
        ; messages) - TextRow2Active is written by every "Show text" code
        ; path (see generators/bbasic/text-minikernel.js), 0 unless the
        ; message just pointed at by TextIndex is one with "Wrap to line 2"
        ; on. When it's clear, row 2 reads from offset 0 instead of
        ; TextIndex+12 - the reserved blank guard row (see
        ; namedMessagePosition's own comment in generators/bbasic/
        ; text-minikernel.js), always valid and always 12 blank glyphs -
        ; rather than skipping the read entirely: same fill+draw code, same
        ; cost, just showing blank instead of a completely unrelated
        ; message's own opening bytes (whatever happens to sit at
        ; TextIndex+12 when that Index doesn't actually own a second row).
        lda TextRow2Active
        bne userealrow2
        lda #0
        jmp gotrow2base
userealrow2
        ifconst extendedtxt
            lda temp1
        else
            lda TextIndex
        endif
        clc
        adc #12
gotrow2base
        jsr showtextrow
    endif
    jmp textrowsdone

; Fills scorepointers from (TextDataPtr),y for 12 bytes, starting at this
; row's own base offset within text_strings (A, on entry - TextIndex for
; row 1, TextIndex+12 for row 2, or 0 for an inactive row 2 - see
; "textkernel2ndrow" above) and reading downward from base+11 to base, then
; draws the row. A tail call (not a nested jsr) into drawtextrow below -
; its own rts returns straight to showtextrow's caller.
showtextrow
    clc
    adc #11
    tay
    ldx #11
TextPointersLoop
    lda (TextDataPtr),y
    sta scorepointers,x
    dey
    dex
    bpl TextPointersLoop
    jmp drawtextrow

; One row's own cycle-exact 5-line (10-scanline) draw, reading whatever
; the 12 bytes in "scorepointers" currently hold - unchanged from its
; original inline form, just wrapped in a jsr/rts (reached via
; showtextrow's own tail call above) so a second row (see
; "textkernel2ndrow" above) can reuse it instead of duplicating it.
drawtextrow
    ldx scorepointers+0
    lda left_text,x
    ldx scorepointers+1
    ora right_text,x
	ldy #0

firstbreak
    ; Text line 1 / 5
 
    ;line 1
    sta WSYNC               ; 3     (0)
    ldy #textbkcolor        ; 2     (2)
    sty COLUP0              ; 3     (5)
    sty COLUP1              ; 3     (8)
    sta GRP0                ; 3     (11)

    ldx scorepointers+2     ; 3     (14)
    lda left_text,x         ; 4     (18)
    ldx scorepointers+3     ; 3     (21)
    ora right_text,x        ; 4     (25*)
    sta GRP1                ; 3     (28)
    
    ldx scorepointers+4     ; 3     (31)
    lda left_text,x         ; 4     (35)
    ldx scorepointers+5     ; 3     (38)
    ora right_text,x        ; 4     (42)
    sta GRP0                ; 3     (45)
    
    ldx scorepointers+6     ; 3     (48) 3 in A
    lda left_text,x         ; 4     (52)
    ldx scorepointers+7     ; 3     (55)
    ora right_text,x        ; 4     (59)
    
    ldy TextColor           ; 3     (62)
    sty COLUP1              ; 3     (65)
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)
    tay                     ; 2     (5) 3 in Y

    ldx scorepointers+8     ; 3     (8) 4
    lda left_text,x         ; 4     (12)
    ldx scorepointers+9     ; 3     (15)
    ora right_text,x        ; 4     (19)
    sta B                   ; 3     (22)

    ldx scorepointers+10    ; 3     (25*) 5 in A
    lda left_text,x         ; 4     (29)
    ldx scorepointers+11    ; 3     (32)
    ora right_text,x        ; 4     (36)
    
    ldx B                   ; 3     (39) 4 in X
    ifnconst noscoretxt
        sleep 5             ; 7     (46)
    else
        sleep 2
    endif
    sty GRP1                ; 3     (49) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (52) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (55) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (58) 5 -> GRP1

    ldy #2                  ; 2     (60)
    ldx scorepointers+0     ; 3     (63)
    lda left_text+1,x       ; 4     (67)
    ldx scorepointers+1     ; 3     (70)
    ora right_text+1,x      ; 4     (74)
;    sleep 4
    
    ; Text line 2 / 5
endl1 
    ;line 1
    sta WSYNC               ; 3     (0)
    ldy #textbkcolor        ; 2     (2)
    sty COLUP0              ; 3     (5)
    sty COLUP1              ; 3     (8)
    sta GRP0                ; 3     (11)

    ldx scorepointers+2     ; 3     (9)
    lda left_text+1,x         ; 4     (13)
    ldx scorepointers+3     ; 3     (16)
    ora right_text+1,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx scorepointers+4     ; 3     (26)
    lda left_text+1,x         ; 4     (30)
    ldx scorepointers+5     ; 3     (33)
    ora right_text+1,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx scorepointers+6     ; 3     (43) 3 in A
    lda left_text+1,x         ; 4     (47)
    ldx scorepointers+7     ; 3     (50)
    ora right_text+1,x        ; 4     (54)
    
    ldy TextColor           ; 2     (56)
    sty COLUP1              ; 3     (59)
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)
    tay                     ; 2     (5) 3 in Y

    ldx scorepointers+8     ; 3     (8) 4
    lda left_text+1,x         ; 4     (12)
    ldx scorepointers+9     ; 3     (15)
    ora right_text+1,x        ; 4     (19)
    sta B                   ; 3     (22)

    ldx scorepointers+10    ; 3     (25*) 5 in A
    lda left_text+1,x         ; 4     (29)
    ldx scorepointers+11    ; 3     (32)
    ora right_text+1,x        ; 4     (36)
    
    ldx B                   ; 3     (39) 4 in X
    ifnconst noscoretxt
        sleep 5             ; 7     (46)
    else
        sleep 2
    endif
    sty GRP1                ; 3     (49) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (52) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (55) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (58) 5 -> GRP1

    ldy #2                  ; 2     (56)
    ldx scorepointers+0     ; 3     (59)
    lda left_text+2,x         ; 4     (63)
    ldx scorepointers+1     ; 3     (66)
    ora right_text+2,x        ; 4     (70)
;    sleep 4

    ; Text line 3 / 5
endl2 
    ;line 1
    sta WSYNC               ; 3     (0)
    ldy #textbkcolor        ; 2     (2)
    sty COLUP0              ; 3     (5)
    sty COLUP1              ; 3     (8)
    sta GRP0                ; 3     (11)

    ldx scorepointers+2     ; 3     (9)
    lda left_text+2,x         ; 4     (13)
    ldx scorepointers+3     ; 3     (16)
    ora right_text+2,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx scorepointers+4     ; 3     (26)
    lda left_text+2,x         ; 4     (30)
    ldx scorepointers+5     ; 3     (33)
    ora right_text+2,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx scorepointers+6     ; 3     (43) 3 in A
    lda left_text+2,x         ; 4     (47)
    ldx scorepointers+7     ; 3     (50)
    ora right_text+2,x        ; 4     (54)
    
    ldy TextColor           ; 2     (56)
    sty COLUP1              ; 3     (59)
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)
    tay                     ; 2     (5) 3 in Y

    ldx scorepointers+8     ; 3     (8) 4
    lda left_text+2,x         ; 4     (12)
    ldx scorepointers+9     ; 3     (15)
    ora right_text+2,x        ; 4     (19)
    sta B                   ; 3     (22)

    ldx scorepointers+10    ; 3     (25*) 5 in A
    lda left_text+2,x         ; 4     (29)
    ldx scorepointers+11    ; 3     (32)
    ora right_text+2,x        ; 4     (36)
    
    ldx B                   ; 3     (39) 4 in X
     ifnconst noscoretxt
        sleep 5             ; 7     (46)
    else
        sleep 2
    endif
    sty GRP1                ; 3     (45) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (48) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (51) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (54) 5 -> GRP1

    ldy #2                  ; 2     (56)
    ldx scorepointers+0     ; 3     (59)
    lda left_text+3,x         ; 4     (63)
    ldx scorepointers+1     ; 3     (66)
    ora right_text+3,x        ; 4     (70)
;    sleep 2

    ; Text line 4 / 5
 
    ;line 1
    sta WSYNC               ; 3     (0)
    ldy #textbkcolor        ; 2     (2)
    sty COLUP0              ; 3     (5)
    sty COLUP1              ; 3     (8)
    sta GRP0                ; 3     (11)

    ldx scorepointers+2     ; 3     (9)
    lda left_text+3,x         ; 4     (13)
    ldx scorepointers+3     ; 3     (16)
    ora right_text+3,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx scorepointers+4     ; 3     (26)
    lda left_text+3,x         ; 4     (30)
    ldx scorepointers+5     ; 3     (33)
    ora right_text+3,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx scorepointers+6     ; 3     (43) 3 in A
    lda left_text+3,x         ; 4     (47)
    ldx scorepointers+7     ; 3     (50)
    ora right_text+3,x        ; 4     (54)
    
    ldy TextColor           ; 2     (56)
    sty COLUP1              ; 3     (59)
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)
    tay                     ; 2     (5) 3 in Y

    ldx scorepointers+8     ; 3     (8) 4
    lda left_text+3,x         ; 4     (12)
    ldx scorepointers+9     ; 3     (15)
    ora right_text+3,x        ; 4     (19)
    sta B                   ; 3     (22)

    ldx scorepointers+10    ; 3     (25*) 5 in A
    lda left_text+3,x         ; 4     (29)
    ldx scorepointers+11    ; 3     (32)
    ora right_text+3,x        ; 4     (36)
    
    ldx B                   ; 3     (39) 4 in X
    ifnconst noscoretxt
        sleep 5             ; 7     (46)
    else
        sleep 2
    endif
    sty GRP1                ; 3     (45) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (48) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (51) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (54) 5 -> GRP1

    ldy #2                  ; 2     (56)
    ldx scorepointers+0     ; 3     (59)
    lda left_text+4,x         ; 4     (63)
    ldx scorepointers+1     ; 3     (66)
    ora right_text+4,x        ; 4     (70)
;    sleep 2

    ; Text line 5 / 5
 
    ;line 1
    sta WSYNC               ; 3     (0)
    ldy #textbkcolor        ; 2     (2)
    sty COLUP0              ; 3     (5)
    sty COLUP1              ; 3     (8)
    sta GRP0                ; 3     (11)

    ldx scorepointers+2     ; 3     (9)
    lda left_text+4,x         ; 4     (13)
    ldx scorepointers+3     ; 3     (16)
    ora right_text+4,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx scorepointers+4     ; 3     (26)
    lda left_text+4,x         ; 4     (30)
    ldx scorepointers+5     ; 3     (33)
    ora right_text+4,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx scorepointers+6     ; 3     (43) 3 in A
    lda left_text+4,x         ; 4     (47)
    ldx scorepointers+7     ; 3     (50)
    ora right_text+4,x        ; 4     (54)
    
    ldy TextColor           ; 2     (56)
    sty COLUP1              ; 3     (59)
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)
    tay                     ; 2     (5) 3 in Y

    ldx scorepointers+8     ; 3     (8) 4
    lda left_text+4,x         ; 4     (12)
    ldx scorepointers+9     ; 3     (15)
    ora right_text+4,x        ; 4     (19)
    sta B                   ; 3     (22)

    ldx scorepointers+10    ; 3     (25*) 5 in A
    lda left_text+4,x         ; 4     (29)
    ldx scorepointers+11    ; 3     (32)
    ora right_text+4,x        ; 4     (36)
    
    ldx B                   ; 3     (39) 4 in X
    ifnconst noscoretxt
        sleep 5             ; 7     (46)
    else
        sleep 2
    endif
    sty GRP1                ; 3     (45) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (48) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (51) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (54) 5 -> GRP1
    ; drawtextrow is reached via showtextrow's own tail jmp (see its
    ; comment above), so THIS rts is what actually returns to whichever
    ; "jsr showtextrow" call site is currently active (row 1's or row 2's) -
    ; without it, execution fell straight through into textrowsdone's own
    ; cleanup code below and out of the subroutine entirely, leaving row 1's
    ; own still-pending return address sitting unconsumed on the stack. That
    ; stale address later got popped by an unrelated "rts" elsewhere
    ; (posttextkernel's own, back in text12a.asm) and used to jump back into
    ; the middle of textkernel's row-2 logic at a completely wrong point in
    ; the frame - confirmed as the real cause of a reported bug ("characters
    ; are missing on line 2" / wrong glyphs / screen rolling, depending on
    ; exactly where in the frame that stray jump landed).
    rts

textrowsdone
    lda #0
    sta GRP0
    sta GRP1
    sta GRP0
    sta NUSIZ0
    sta NUSIZ1
    sta VDELP0
    sta VDELP1

    ifconst textbank
        sta temp7
        lda #>(posttextkernel-1)
        pha
        lda #<(posttextkernel-1)
        pha
        lda temp7
        pha ; *** save A
        txa
        pha ; *** save X
        ldx #KERNELBANK
        jmp BS_jsr
    else
        jmp posttextkernel
    endif

   if >. != >[.+text_data_height]
	align 256
   endif

text_data

left_text

__A = * - text_data ; baseline (0)
    .byte %00100000 
    .byte %01010000
    .byte %01110000
    .byte %01010000
    .byte %01010000
    
__B = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01100000
    .byte %01010000
    .byte %01100000    
    
__C = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %00110000    
    
__D = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01100000
    
__E = * - text_data
    .byte %01110000
    .byte %01000000
    .byte %01100000
    .byte %01000000
    .byte %01110000
    
__F = * - text_data
    .byte %01110000
    .byte %01000000
    .byte %01100000
    .byte %01000000
    .byte %01000000

__G = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %01010000
    .byte %01010000
    .byte %00100000

__H = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01110000
    .byte %01010000
    .byte %01010000
    
__I = * - text_data
    .byte %01110000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    .byte %01110000
    
__J = * - text_data
    .byte %00010000
    .byte %00010000
    .byte %00010000
    .byte %01010000
    .byte %00100000

__K = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01100000
    .byte %01010000
    .byte %01010000

__L = * - text_data
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %01110000
    
__M = * - text_data
    .byte %01010000
    .byte %01110000
    .byte %01110000
    .byte %01010000
    .byte %01010000
    
__N = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01010000

__O = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %00100000

__P = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01100000
    .byte %01000000
    .byte %01000000
    
__Q = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %00110000
    
__R = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01100000
    .byte %01010000
    .byte %01010000
    
__S = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %00100000
    .byte %00010000
    .byte %01100000
    
__T = * - text_data
    .byte %01110000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    
__U = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01110000
    
__V = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %00100000

__W = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01110000
    .byte %01110000
    .byte %01010000

__X = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %00100000
    .byte %01010000
    .byte %01010000
    
__Y = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    
__Z = * - text_data
    .byte %01110000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01110000

__0 = * - text_data
    .byte %01110000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01110000
    
__1 = * - text_data
    .byte %00100000
    .byte %01100000
    .byte %00100000
    .byte %00100000
    .byte %01110000
    
__2 = * - text_data
    .byte %01100000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01110000
    
__3 = * - text_data
    .byte %01100000
    .byte %00010000
    .byte %00100000
    .byte %00010000
    .byte %01100000
    
__4 = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01110000
    .byte %00010000
    .byte %00010000
    
__5 = * - text_data
    .byte %01110000
    .byte %01000000
    .byte %01100000
    .byte %00010000
    .byte %01100000
    
__6 = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %01100000
    .byte %01010000
    .byte %00100000

__7 = * - text_data
    .byte %01110000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01000000

__8 = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %00100000
    .byte %01010000
    .byte %00100000
    
__9 = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %00110000
    .byte %00010000
    .byte %01100000
    
_sp = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

_pd = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00100000

_qu = * - text_data
    .byte %01100000
    .byte %00010000
    .byte %00100000
    .byte %00000000
    .byte %00100000
 
_ex = * - text_data
    .byte %00100000
    .byte %00100000
    .byte %00100000
    .byte %00000000
    .byte %00100000

_cm = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00100000
    .byte %01000000

_hy = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %01110000
    .byte %00000000
    .byte %00000000

_pl = * - text_data
    .byte %00100000
    .byte %00100000
    .byte %01110000
    .byte %00100000
    .byte %00100000

_ap = * - text_data
    .byte %00100000
    .byte %01000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

_lp = * - text_data
    .byte %00100000
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %00100000

_rp = * - text_data
    .byte %00100000
    .byte %00010000
    .byte %00010000
    .byte %00010000
    .byte %00100000

_co = * - text_data
    .byte %00000000
    .byte %01000000
    .byte %00000000
    .byte %01000000
    .byte %00000000

_sl = * - text_data
    .byte %00010000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01000000

_eq = * - text_data
    .byte %00000000
    .byte %01110000
    .byte %00000000
    .byte %01110000
    .byte %00000000

_qt = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %00000000
    .byte %00000000
    .byte %00000000

_po = * - text_data
_ht
    .byte %01010000
    .byte %11110000
    .byte %01010000
    .byte %11110000
    .byte %01010000


text_data_height = * - text_data

   if >. != >[.+text_data_height]
	align 256
   endif

right_text

; A
    .byte %00000010 
    .byte %00000101
    .byte %00000111
    .byte %00000101
    .byte %00000101

    
; B
    .byte %00000110
    .byte %00000101
    .byte %00000110
    .byte %00000101
    .byte %00000110    
    
; C
    .byte %00000011
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000011    
    
; D
    .byte %00000110
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000110
    
; E
    .byte %00000111
    .byte %00000100
    .byte %00000110
    .byte %00000100
    .byte %00000111
    
; F
    .byte %00000111
    .byte %00000100
    .byte %00000110
    .byte %00000100
    .byte %00000100

; G
    .byte %00000011
    .byte %00000100
    .byte %00000101
    .byte %00000101
    .byte %00000010

; H
    .byte %00000101
    .byte %00000101
    .byte %00000111
    .byte %00000101
    .byte %00000101
    
; I
    .byte %00000111
    .byte %00000010
    .byte %00000010
    .byte %00000010
    .byte %00000111
    
; J
    .byte %00000001
    .byte %00000001
    .byte %00000001
    .byte %00000101
    .byte %00000010

; K
    .byte %00000101
    .byte %00000101
    .byte %00000110
    .byte %00000101
    .byte %00000101

; L
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000111
    
; M
    .byte %00000101
    .byte %00000111
    .byte %00000111
    .byte %00000101
    .byte %00000101
    
; N
    .byte %00000110
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000101

; O
    .byte %00000010
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000010

; P
    .byte %00000110
    .byte %00000101
    .byte %00000110
    .byte %00000100
    .byte %00000100
    
; Q
    .byte %00000010
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000011
    
; R
    .byte %00000110
    .byte %00000101
    .byte %00000110
    .byte %00000101
    .byte %00000101
    
; S
    .byte %00000011
    .byte %00000100
    .byte %00000010
    .byte %00000001
    .byte %00000110
    
; T
    .byte %00000111
    .byte %00000010
    .byte %00000010
    .byte %00000010
    .byte %00000010
    
; U
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000111
    
; V
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000010

; W
    .byte %00000101
    .byte %00000101
    .byte %00000111
    .byte %00000111
    .byte %00000101

; X
    .byte %00000101
    .byte %00000101
    .byte %00000010
    .byte %00000101
    .byte %00000101
    
; Y
    .byte %00000101
    .byte %00000101
    .byte %00000010
    .byte %00000010
    .byte %00000010
    
; Z
    .byte %00000111
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000111

; 0
    .byte %00000111
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000111
    
; 1
    .byte %00000010
    .byte %00000110
    .byte %00000010
    .byte %00000010
    .byte %00000111
    
; 2
    .byte %00000110
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000111
    
; 3
    .byte %00000110
    .byte %00000001
    .byte %00000010
    .byte %00000001
    .byte %00000110
    
; 4
    .byte %00000101
    .byte %00000101
    .byte %00000111
    .byte %00000001
    .byte %00000001
    
; 5
    .byte %00000111
    .byte %00000100
    .byte %00000110
    .byte %00000001
    .byte %00000110
    
; 6
    .byte %00000011
    .byte %00000100
    .byte %00000110
    .byte %00000101
    .byte %00000010

; 7
    .byte %00000111
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000100

; 8
    .byte %00000010
    .byte %00000101
    .byte %00000010
    .byte %00000101
    .byte %00000010
    
; 9
    .byte %00000010
    .byte %00000101
    .byte %00000011
    .byte %00000001
    .byte %00000110

; space
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

; period
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000010

; question mark
    .byte %00000110
    .byte %00000001
    .byte %00000010
    .byte %00000000
    .byte %00000010

; exclamation point
    .byte %00000010
    .byte %00000010
    .byte %00000010
    .byte %00000000
    .byte %00000010

; comma
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000010
    .byte %00000100

; hyphen
    .byte %00000000
    .byte %00000000
    .byte %00000111
    .byte %00000000
    .byte %00000000

; plus
    .byte %00000010
    .byte %00000010
    .byte %00000111
    .byte %00000010
    .byte %00000010

; apostrophe
    .byte %00000010
    .byte %00000100
    .byte %00000000
    .byte %00000000
    .byte %00000000

; left parenthesis 
    .byte %00000010
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000010

; right parenthesis 
    .byte %00000010
    .byte %00000001
    .byte %00000001
    .byte %00000001
    .byte %00000010

; colon
    .byte %00000000
    .byte %00000100
    .byte %00000000
    .byte %00000100
    .byte %00000000

;slash
    .byte %00000001
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000100

; equal
    .byte %00000000
    .byte %00000111
    .byte %00000000
    .byte %00000111
    .byte %00000000

; quote
    .byte %00000101
    .byte %00000101
    .byte %00000000
    .byte %00000000
    .byte %00000000

; pound sign
    .byte %00000101
    .byte %00001111
    .byte %00000101
    .byte %00001111
    .byte %00000101
