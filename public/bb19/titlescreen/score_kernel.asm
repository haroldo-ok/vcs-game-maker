; The batari Basic score kernel
; This minikernel is not under the same license as the rest of the
; titlescreen code. Refer to the bB license before you use this in
; a non-bB program.
;
; Unmodified from the Titlescreen Kernel 1.8's own examples/ex5-player_and_
; playfield/titlescreen/asm/score_kernel.asm - reads the real "score"
; (3-byte BCD) and "scorecolor" bB system variables directly, the same ones
; the standard kernel's own score bar and VCS Game Maker's existing Score
; category blocks ("Score set color to", etc.) already read/write, so no
; separate title-screen-only score/color fields are needed. Temporarily
; takes over GRP0/GRP1/RESP0/RESP1/NUSIZ0/NUSIZ1/VDELP0/VDELP1 (the same
; registers a "Player sprites" card - draw_player_display - uses) only for
; its own few scanlines, restoring them to 0 before returning, so the two
; can be stacked in the same layout without conflict (the kernel's own
; examples do exactly this).

draw_score_display

 lax score+0
 jsr miniscorepointerset
 sty scorepointers+8
 stx scorepointers+0
 lax score+1
 jsr miniscorepointerset
 sty scorepointers+4
 stx scorepointers+6
 lax score+2
 jsr miniscorepointerset
 sty scorepointers+10
 stx scorepointers+2

 sta HMCLR
 tsx
 stx stack1
 ldx #$60
 stx HMP0

 ldx #0
 sta WSYNC ;   0
 STx GRP0  ; 3 3
 STx GRP1  ; 3 6 seems to be needed because of vdel

 sleep 7   ; 7 13

 lda #>miniscoretable   ; 2 15
 sta scorepointers+1,x  ; 4 19
 sta scorepointers+3,x  ; 4 23
 sta scorepointers+5,x  ; 4 27
 sta scorepointers+7,x  ; 4 31
 sta scorepointers+9,x  ; 4 35
 sta scorepointers+11,x ; 4 39

       LDY #7		; 2 41
       STA RESP0	; 3 44
       STA RESP1	; 3 47

       LDA #$03	; 2 49
       STA NUSIZ0 	; 3 52
       STA NUSIZ1,x	; 4 56
       STA VDELP0	; 3 59
       STA VDELP1	; 3 62
       LDA #$70		; 2 64
       STA HMP1		; 3 67
       LDA scorecolor	; 3 70
       STA HMOVE 	; cycle 73 ?
 ifconst score_kernel_fade
	and score_kernel_fade
 endif

                STA COLUP0
                STA COLUP1
 ifconst scorefade
		STA stack2 ; scorefade
 endif
 lda  (scorepointers),y
 sta  GRP0
 lda  (scorepointers+8),y
 sta WSYNC
 sleep 2
 jmp beginscoreloop

 if ((<*)>$28)
 align 256 ; kludge that potentially wastes space!  should be fixed!
 endif

scoreloop2
 ifconst scorefade
   lda stack2
   sta COLUP0
   sta COLUP1
 else
   sleep 9
 endif
 lda  (scorepointers),y     ;+5  68  204
 sta  GRP0            ;+3  71  213      D1     --      --     --
 lda  (scorepointers+$8),y  ;+5   5   15
 ; cycle 0
beginscoreloop
 sta  GRP1            ;+3   8   24      D1     D1      D2     --
 lda  (scorepointers+$6),y  ;+5  13   39
 sta  GRP0            ;+3  16   48      D3     D1      D2     D2
 lax  (scorepointers+$2),y  ;+5  29   87
 txs
 lax  (scorepointers+$4),y  ;+5  36  108

 ifconst scorefade
 dec stack2
 else
 sleep 5
 endif
 sleep 2

 lda  (scorepointers+$A),y  ;+5  21   63 DIGIT 6
 stx  GRP1            ;+3  44  132      D3     D3      D4     D2!
 tsx
 stx  GRP0            ;+3  47  141      D5     D3!     D4     D4
 sta  GRP1            ;+3  50  150      D5     D5      D6     D4!

 sty  GRP0            ;+3  53  159      D4*    D5!     D6     D6
 dey
 bpl  scoreloop2           ;+2  60  180
scoreloop2end

 ldx stack1
 txs

        LDA #0
        sta PF1
        STA GRP0
        STA GRP1
        STA VDELP0
        STA VDELP1
        STA NUSIZ0
        STA NUSIZ1

 ; clear out the score pointers in case they're stolen DPC variables...
 ldx #11
clearscoreploop
 sta scorepointers,x
 dex
 bpl clearscoreploop

 rts

miniscorepointerset
 and #$0F
 asl
 asl
 asl
 adc #<miniscoretable
 tay
 txa
 and #$F0
 lsr
 adc #<miniscoretable
 tax
 rts
