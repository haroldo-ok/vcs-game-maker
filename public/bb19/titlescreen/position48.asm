
position48

        ;postion P0 and P1

        sta WSYNC

        lda #$90 ;2
        sta HMP0 ;3
        lda #$A0 ;2
        sta HMP1 ;3

        inc temp1
        dec temp1
        inc temp1
        dec temp1
        inc temp1
        sleep 2
        sta RESP0       ;  +3
        sta RESP1       ;  +3
        dec temp1       ;  +5
        inc temp1       ;  +5
        dec temp1       ;  +5
        inc temp1       ;  +5
        dec temp1       ;  +5
        sleep 3
        sta HMOVE       ; +76
 RTS

