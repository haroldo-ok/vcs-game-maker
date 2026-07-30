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


 
minikernel

    sta WSYNC               ; 3     (0)
 	ifconst scorebkcolor
 	    ifnconst noscoretxt
	        lda #scorebkcolor
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
    endif

score_loop_height = * - textscoreloop

    ldx temp7               ; 63
    txs                     ; 65
	ldy #0                  ; 2     (67)
	sty PF1                 ; 3     (70)
	sty GRP0                ; 3     (73)
	sty GRP1                ; 3     (76/0)
	sty GRP0                ; 3     (3)
	lda #textbkcolor
	sta COLUBK              ; 3     (6)

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
