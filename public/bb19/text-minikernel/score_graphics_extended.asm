 ; feel free to modify the score graphics - just keep each digit 8 highj
 ; and keep the conditional compilation stuff intact

scorelength = (LENDEC+LENHEX+LENSPACE+LENDOLLAR+LENPOUND+LENMRHAPPY+LENMRSAD+LENCOPYRIGHT+LENFUJI+LENHEART+LENDIAMOND+LENSPADE+LENCLUB+LENCOLON+LENBLOCK+LENUNDERLINE+LENARISIDE+LENARIFACE) 

 ifconst ROM2k
   ORG $F7FC-scorelength
 else
   ifconst bankswitch
     if bankswitch == 8
       ORG $2FE4-scorelength-bscode_length
       RORG $FFE4-scorelength-bscode_length
     endif
     if bankswitch == 16
       ORG $4FE4-scorelength-bscode_length
       RORG $FFE4-scorelength-bscode_length
     endif
     if bankswitch == 32
       ORG $8FE4-scorelength-bscode_length
       RORG $FFE4-scorelength-bscode_length
     endif
   else
     ORG $FFEC-scorelength
   endif
 endif

NOFONT = 0
STOCK = 1 	;_FONTNAME
NEWCENTURY = 2	;_FONTNAME
WHIMSEY = 3	;_FONTNAME
ALARMCLOCK = 4	;_FONTNAME
HANDWRITTEN = 5 ;_FONTNAME
INTERRUPTED = 6 ;_FONTNAME
TINY = 7	;_FONTNAME
RETROPUTER = 8	;_FONTNAME
CURVES = 9	;_FONTNAME
HUSKY = 10	;_FONTNAME
SNAKE = 11	;_FONTNAME
PLOK = 13	;_FONTNAME
SQUISH = 14  ;_FONTNAME
TINYTINY = 15  ;_FONTNAME

SYMBOLS = 0 	;_FONTNAME 

; ### setup some defaults
 ifnconst fontstyle
fontstyle = STOCK
 endif

scoretable

 if fontstyle == STOCK

LENDEC = 80

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %01111110 ; STOCK
       .byte %00011000 ; STOCK
       .byte %00011000 ; STOCK
       .byte %00011000 ; STOCK
       .byte %00011000 ; STOCK
       .byte %00111000 ; STOCK
       .byte %00011000 ; STOCK
       .byte %00001000 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %01111110 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %00111100 ; STOCK
       .byte %00000110 ; STOCK
       .byte %00000110 ; STOCK
       .byte %01000110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01000110 ; STOCK
       .byte %00000110 ; STOCK
       .byte %00000110 ; STOCK
       .byte %00011100 ; STOCK
       .byte %00000110 ; STOCK
       .byte %01000110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00001100 ; STOCK
       .byte %00001100 ; STOCK
       .byte %01111110 ; STOCK
       .byte %01001100 ; STOCK
       .byte %01001100 ; STOCK
       .byte %00101100 ; STOCK
       .byte %00011100 ; STOCK
       .byte %00001100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01000110 ; STOCK
       .byte %00000110 ; STOCK
       .byte %00000110 ; STOCK
       .byte %00111100 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01111110 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01111100 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100010 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00110000 ; STOCK
       .byte %00110000 ; STOCK
       .byte %00110000 ; STOCK
       .byte %00011000 ; STOCK
       .byte %00001100 ; STOCK
       .byte %00000110 ; STOCK
       .byte %01000010 ; STOCK
       .byte %00111110 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %00111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01000110 ; STOCK
       .byte %00000110 ; STOCK
       .byte %00111110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

 ifconst fontcharsHEX 
LENHEX = 48

       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01111110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %01111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %00111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100110 ; STOCK
       .byte %00111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %01111100 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01100110 ; STOCK
       .byte %01111100 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %01111110 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01111100 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01111110 ; STOCK

       ;byte %00000000 ; STOCK

       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01111100 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01100000 ; STOCK
       .byte %01111110 ; STOCK

       ;byte %00000000 ; STOCK
       ;byte %00000000 ; STOCK
       ;byte %00000000 ; STOCK
       ;byte %00000000 ; STOCK

 else
LENHEX = 0
 endif ; fontcharsHEX 
 endif ; STOCK

 if fontstyle == NEWCENTURY
LENDEC = 80
       ;byte %00000000 ; NEWCENTURY

       .byte %00111100 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %00100100 ; NEWCENTURY
       .byte %00100100 ; NEWCENTURY
       .byte %00100100 ; NEWCENTURY
       .byte %00011000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01111110 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %00100000 ; NEWCENTURY
       .byte %00011100 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00011100 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01111100 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00111100 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00011100 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00111110 ; NEWCENTURY
       .byte %00100010 ; NEWCENTURY
       .byte %00100010 ; NEWCENTURY
       .byte %00010010 ; NEWCENTURY
       .byte %00010010 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01111100 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %01111100 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00111100 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01111100 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %00110000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00010000 ; NEWCENTURY
       .byte %00010000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00001000 ; NEWCENTURY
       .byte %00000100 ; NEWCENTURY
       .byte %00000100 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00011110 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00111100 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %00111100 ; NEWCENTURY
       .byte %00100100 ; NEWCENTURY
       .byte %00100100 ; NEWCENTURY
       .byte %00011000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00111100 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00000010 ; NEWCENTURY
       .byte %00001110 ; NEWCENTURY
       .byte %00010010 ; NEWCENTURY
       .byte %00010010 ; NEWCENTURY
       .byte %00001100 ; NEWCENTURY

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; NEWCENTURY

       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01111100 ; NEWCENTURY
       .byte %01000100 ; NEWCENTURY
       .byte %01000100 ; NEWCENTURY
       .byte %00111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01111100 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01111100 ; NEWCENTURY
       .byte %01000100 ; NEWCENTURY
       .byte %01000100 ; NEWCENTURY
       .byte %01111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %00111100 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %00111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01111100 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000010 ; NEWCENTURY
       .byte %01000100 ; NEWCENTURY
       .byte %01000100 ; NEWCENTURY
       .byte %01111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01111110 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01111100 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY

       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01111100 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01000000 ; NEWCENTURY
       .byte %01111000 ; NEWCENTURY

       ;byte %00000000 ; NEWCENTURY
       ;byte %00000000 ; NEWCENTURY
       ;byte %00000000 ; NEWCENTURY
       ;byte %00000000 ; NEWCENTURY

 else
LENHEX = 0
 endif ; fontcharsHEX 
 endif ; NEWCENTURY

 if fontstyle == WHIMSEY
LENDEC = 80
       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %00011000 ; WHIMSEY
       .byte %00011000 ; WHIMSEY
       .byte %00011000 ; WHIMSEY
       .byte %01111000 ; WHIMSEY
       .byte %00011000 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111000 ; WHIMSEY
       .byte %00111100 ; WHIMSEY
       .byte %00001110 ; WHIMSEY
       .byte %01100110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01101110 ; WHIMSEY
       .byte %00001110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY
       .byte %00011100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00011100 ; WHIMSEY
       .byte %00011100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01011100 ; WHIMSEY
       .byte %01011100 ; WHIMSEY
       .byte %00011100 ; WHIMSEY
       .byte %00011100 ; WHIMSEY
       .byte %00011100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01101110 ; WHIMSEY
       .byte %00001110 ; WHIMSEY
       .byte %01111100 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01111110 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01111100 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %00111110 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01111000 ; WHIMSEY
       .byte %01111000 ; WHIMSEY
       .byte %01111000 ; WHIMSEY
       .byte %00111100 ; WHIMSEY
       .byte %00011100 ; WHIMSEY
       .byte %00001110 ; WHIMSEY
       .byte %00001110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00000110 ; WHIMSEY
       .byte %00111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; WHIMSEY

       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01111100 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %00111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %00111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01111100 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01110110 ; WHIMSEY
       .byte %01111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01111110 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01111100 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY

       .byte %01110000 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01111100 ; WHIMSEY
       .byte %01110000 ; WHIMSEY
       .byte %01111100 ; WHIMSEY

       ;byte %00000000 ; WHIMSEY
       ;byte %00000000 ; WHIMSEY
       ;byte %00000000 ; WHIMSEY
       ;byte %00000000 ; WHIMSEY

 else
LENHEX = 0
 endif ; fontcharsHEX

 endif ; WHIMSEY

 if fontstyle == ALARMCLOCK
LENDEC = 80

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00000000 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00000000 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00000000 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK


 ifconst fontcharsHEX 
LENHEX = 48
       ;byte %00000000 ; ALARMCLOCK


       .byte %00000000 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %01000010 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000010 ; ALARMCLOCK
       .byte %00000000 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK

       .byte %00000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %01000000 ; ALARMCLOCK
       .byte %00111100 ; ALARMCLOCK

       ;byte %00000000 ; ALARMCLOCK
       ;byte %00000000 ; ALARMCLOCK
       ;byte %00000000 ; ALARMCLOCK
       ;byte %00000000 ; ALARMCLOCK

 else
LENHEX = 0
 endif ; fontcharsHEX
 endif ; ALARMCLOCK

 if fontstyle == HANDWRITTEN
LENDEC = 80

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00010000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %01110000 ; HANDWRITTEN
       .byte %01001100 ; HANDWRITTEN
       .byte %01000000 ; HANDWRITTEN
       .byte %00100000 ; HANDWRITTEN
       .byte %00011000 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00100010 ; HANDWRITTEN
       .byte %00011100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00011000 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00100010 ; HANDWRITTEN
       .byte %00011100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00010000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %01111000 ; HANDWRITTEN
       .byte %01000100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00000010 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00011000 ; HANDWRITTEN
       .byte %00100000 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00010000 ; HANDWRITTEN
       .byte %00101000 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00011000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00000110 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00010000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00000100 ; HANDWRITTEN
       .byte %00110010 ; HANDWRITTEN
       .byte %00001110 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01000100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00011100 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001010 ; HANDWRITTEN
       .byte %00000110 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00010000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN
       .byte %00011100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110110 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001110 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %11110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01000100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00111100 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01000000 ; HANDWRITTEN
       .byte %00100000 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00010100 ; HANDWRITTEN
       .byte %00001000 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %01111000 ; HANDWRITTEN
       .byte %01000100 ; HANDWRITTEN
       .byte %01000100 ; HANDWRITTEN
       .byte %00100100 ; HANDWRITTEN
       .byte %00100010 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %00110000 ; HANDWRITTEN
       .byte %01001000 ; HANDWRITTEN
       .byte %01000000 ; HANDWRITTEN
       .byte %00100000 ; HANDWRITTEN
       .byte %00011000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN

       .byte %01000000 ; HANDWRITTEN
       .byte %01000000 ; HANDWRITTEN
       .byte %01000000 ; HANDWRITTEN
       .byte %00100000 ; HANDWRITTEN
       .byte %00111000 ; HANDWRITTEN
       .byte %00010000 ; HANDWRITTEN
       .byte %00010010 ; HANDWRITTEN
       .byte %00001100 ; HANDWRITTEN

       ;byte %00000000 ; HANDWRITTEN
       ;byte %00000000 ; HANDWRITTEN
       ;byte %00000000 ; HANDWRITTEN
       ;byte %00000000 ; HANDWRITTEN

 else
LENHEX = 0
 endif ; fontcharsHEX
 endif ; HANDWRITTEN

 if fontstyle == INTERRUPTED
LENDEC = 80

       ;byte %00000000 ; INTERRUPTED

       .byte %00110100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %00110100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00111100 ; INTERRUPTED
       .byte %00000000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00111000 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01101110 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %00110000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00001100 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %01000110 ; INTERRUPTED
       .byte %00111100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01111100 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %01110110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %01110100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %01110110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01111100 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %01111100 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01101110 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00101100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01101100 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %00110000 ; INTERRUPTED
       .byte %00011100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00011000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00011000 ; INTERRUPTED
       .byte %00011100 ; INTERRUPTED
       .byte %00001110 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00000000 ; INTERRUPTED
       .byte %01111110 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00110100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %00110100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %00110100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00111000 ; INTERRUPTED
       .byte %00001100 ; INTERRUPTED
       .byte %00000110 ; INTERRUPTED
       .byte %00110110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %00110100 ; INTERRUPTED

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; INTERRUPTED

       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01110110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %00111100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01110100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01110100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01110100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %00101100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %00101100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01111100 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01100110 ; INTERRUPTED
       .byte %01101100 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01111110 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01101110 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01101110 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED

       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01101110 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01100000 ; INTERRUPTED
       .byte %01101110 ; INTERRUPTED

       ;byte %00000000 ; INTERRUPTED
       ;byte %00000000 ; INTERRUPTED
       ;byte %00000000 ; INTERRUPTED
       ;byte %00000000 ; INTERRUPTED

 else
LENHEX = 0
 endif ; fontcharsHEX
 endif ; INTERRUPTED


 if fontstyle == TINY
LENDEC = 80

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00101000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00010000 ; TINY
       .byte %00010000 ; TINY
       .byte %00010000 ; TINY
       .byte %00010000 ; TINY
       .byte %00010000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00001000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00101000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00001000 ; TINY
       .byte %00001000 ; TINY
       .byte %00001000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00001000 ; TINY
       .byte %00001000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00101000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00101000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00110000 ; TINY
       .byte %00101000 ; TINY
       .byte %00110000 ; TINY
       .byte %00101000 ; TINY
       .byte %00110000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00100000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00110000 ; TINY
       .byte %00101000 ; TINY
       .byte %00101000 ; TINY
       .byte %00101000 ; TINY
       .byte %00110000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY

       .byte %00000000 ; TINY
       .byte %00100000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00100000 ; TINY
       .byte %00111000 ; TINY
       .byte %00000000 ; TINY
       .byte %00000000 ; TINY

       ;byte %00000000 ; TINY
       ;byte %00000000 ; TINY
       ;byte %00000000 ; TINY
       ;byte %00000000 ; TINY

 else
LENHEX = 0

 endif ; fontcharsHEX
 endif ; TINY

 if fontstyle == RETROPUTER
LENDEC = 80

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %00111000 ; RETROPUTER
       .byte %00111000 ; RETROPUTER
       .byte %00111000 ; RETROPUTER
       .byte %00111000 ; RETROPUTER
       .byte %00011000 ; RETROPUTER
       .byte %00011000 ; RETROPUTER
       .byte %00011000 ; RETROPUTER
       .byte %00011000 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %00111110 ; RETROPUTER
       .byte %00000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %00000110 ; RETROPUTER
       .byte %00000110 ; RETROPUTER
       .byte %00111110 ; RETROPUTER
       .byte %00000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %00001100 ; RETROPUTER
       .byte %00001100 ; RETROPUTER
       .byte %00001100 ; RETROPUTER
       .byte %01111110 ; RETROPUTER
       .byte %01000100 ; RETROPUTER
       .byte %01000100 ; RETROPUTER
       .byte %01000100 ; RETROPUTER
       .byte %00000100 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %00000110 ; RETROPUTER
       .byte %00000110 ; RETROPUTER
       .byte %01111100 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01111100 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %00001100 ; RETROPUTER
       .byte %00001100 ; RETROPUTER
       .byte %00001100 ; RETROPUTER
       .byte %00001100 ; RETROPUTER
       .byte %00000100 ; RETROPUTER
       .byte %00000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01000110 ; RETROPUTER
       .byte %01111110 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %00000110 ; RETROPUTER
       .byte %00000110 ; RETROPUTER
       .byte %00000110 ; RETROPUTER
       .byte %00000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000  ; RETROPUTER

       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111100 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111100 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111100 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01111110 ; RETROPUTER
       .byte %01100010 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01111100 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER

       .byte %01100000 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %01100000 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01111100 ; RETROPUTER
       .byte %01000000 ; RETROPUTER
       .byte %01000010 ; RETROPUTER
       .byte %01111110 ; RETROPUTER

       ;byte %00000000 ; RETROPUTER
       ;byte %00000000 ; RETROPUTER
       ;byte %00000000 ; RETROPUTER
       ;byte %00000000 ; RETROPUTER

 else
LENHEX = 0
 endif ; fontcharsHEX
 endif ; RETROPUTER

 if fontstyle == CURVES

LENDEC = 80

       ;byte %00000000 ; CURVES

       .byte %00111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00011000 ; CURVES
       .byte %00011000 ; CURVES
       .byte %00011000 ; CURVES
       .byte %00011000 ; CURVES
       .byte %00011000 ; CURVES
       .byte %00011000 ; CURVES
       .byte %01111000 ; CURVES
       .byte %01110000 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01111110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111100 ; CURVES
       .byte %00111110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00001110 ; CURVES
       .byte %00111100 ; CURVES
       .byte %00111100 ; CURVES
       .byte %00001110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00000110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %00111110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111110 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111110 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00000110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111100 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00000110 ; CURVES
       .byte %00111110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111100 ; CURVES

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; CURVES

       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00111110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111110 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01111100 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01100110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01111100 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %00111110 ; CURVES
       .byte %01111110 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111110 ; CURVES

       ;byte %00000000 ; CURVES

       .byte %01100000 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01111100 ; CURVES
       .byte %01100000 ; CURVES
       .byte %01111110 ; CURVES
       .byte %00111110 ; CURVES

       ;byte %00000000 ; CURVES
       ;byte %00000000 ; CURVES
       ;byte %00000000 ; CURVES
       ;byte %00000000 ; CURVES

 else
LENHEX = 0
 endif ; fontcharsHEX 
 endif ; CURVES


 if fontstyle == HUSKY

LENDEC = 80

       ;byte %00000000 ; HUSKY

       .byte %01111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111100 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %01111110 ; HUSKY
       .byte %00001110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %00001110 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %00001110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %00011100 ; HUSKY
       .byte %00011100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11011100 ; HUSKY
       .byte %11011100 ; HUSKY
       .byte %00011100 ; HUSKY
       .byte %00011100 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %00001110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %01111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111110 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00111000 ; HUSKY
       .byte %00011100 ; HUSKY
       .byte %00001110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %01111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111100 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111100 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %00001110 ; HUSKY
       .byte %01111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111100 ; HUSKY

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; HUSKY

       .byte %11101110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111100 ; HUSKY
       .byte %00111000 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %01111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11110000 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11110000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %01111110 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111000 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11101110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111100 ; HUSKY
       .byte %11111000 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY

       ;byte %00000000 ; HUSKY

       .byte %11100000 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11100000 ; HUSKY
       .byte %11111110 ; HUSKY
       .byte %11111110 ; HUSKY

       ;byte %00000000 ; HUSKY
       ;byte %00000000 ; HUSKY
       ;byte %00000000 ; HUSKY
       ;byte %00000000 ; HUSKY

 else
LENHEX = 0
 endif ; fontcharsHEX 
 endif ; HUSKY


 if fontstyle == SNAKE

LENDEC = 80

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %00111000 ; SNAKE
       .byte %00101000 ; SNAKE
       .byte %00001000 ; SNAKE
       .byte %00001000 ; SNAKE
       .byte %00001000 ; SNAKE
       .byte %00001000 ; SNAKE
       .byte %00001000 ; SNAKE
       .byte %00111000 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01100010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %00001110 ; SNAKE
       .byte %00001010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01100110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01100010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %00000110 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01100010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %00001110 ; SNAKE
       .byte %00001010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %00000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE


 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; SNAKE

       .byte %01100110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01111100 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111100 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01111100 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01111110 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01000110 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01111000 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE

       .byte %01000000 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01111000 ; SNAKE
       .byte %01000000 ; SNAKE
       .byte %01000010 ; SNAKE
       .byte %01111110 ; SNAKE

       ;byte %00000000 ; SNAKE
       ;byte %00000000 ; SNAKE
       ;byte %00000000 ; SNAKE
       ;byte %00000000 ; SNAKE

 else
LENHEX = 0
 endif ; fontcharsHEX 
 endif ; SNAKE

 if fontstyle == PLOK
LENDEC = 80

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111000 ; PLOK
       .byte %01100100 ; PLOK
       .byte %01100010 ; PLOK
       .byte %01100010 ; PLOK
       .byte %00110110 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00010000 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00011000 ; PLOK
       .byte %00111000 ; PLOK
       .byte %00011000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00001110 ; PLOK
       .byte %01111110 ; PLOK
       .byte %00011000 ; PLOK
       .byte %00001100 ; PLOK
       .byte %00000110 ; PLOK
       .byte %00111100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %01101110 ; PLOK
       .byte %00001110 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00000110 ; PLOK
       .byte %01111100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00011000 ; PLOK
       .byte %01111110 ; PLOK
       .byte %01101100 ; PLOK
       .byte %00100100 ; PLOK
       .byte %00110000 ; PLOK
       .byte %00110000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %01001110 ; PLOK
       .byte %00011100 ; PLOK
       .byte %01100000 ; PLOK
       .byte %01111100 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %01000110 ; PLOK
       .byte %01101100 ; PLOK
       .byte %01110000 ; PLOK
       .byte %00111000 ; PLOK
       .byte %00010000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00001100 ; PLOK
       .byte %00000110 ; PLOK
       .byte %01111110 ; PLOK
       .byte %00110000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %01001110 ; PLOK
       .byte %01101110 ; PLOK
       .byte %00111100 ; PLOK
       .byte %01100100 ; PLOK
       .byte %00111000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00011000 ; PLOK
       .byte %00001100 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00100110 ; PLOK
       .byte %01001110 ; PLOK
       .byte %00111100 ; PLOK
       .byte %00000000 ; PLOK

 ifconst fontcharsHEX 
LENHEX = 48

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %01100010 ; PLOK
       .byte %01100110 ; PLOK
       .byte %01111110 ; PLOK
       .byte %00101100 ; PLOK
       .byte %00101000 ; PLOK
       .byte %00110000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %01111100 ; PLOK
       .byte %00110010 ; PLOK
       .byte %00110110 ; PLOK
       .byte %00111100 ; PLOK
       .byte %00110110 ; PLOK
       .byte %01111100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %01100110 ; PLOK
       .byte %01100000 ; PLOK
       .byte %01100100 ; PLOK
       .byte %00101110 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %01111100 ; PLOK
       .byte %00110010 ; PLOK
       .byte %00110010 ; PLOK
       .byte %00110110 ; PLOK
       .byte %01111100 ; PLOK
       .byte %01111000 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %01111110 ; PLOK
       .byte %00110000 ; PLOK
       .byte %00111000 ; PLOK
       .byte %00111100 ; PLOK
       .byte %00110000 ; PLOK
       .byte %01111110 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK

       .byte %00000000 ; PLOK
       .byte %01100000 ; PLOK
       .byte %01100000 ; PLOK
       .byte %00111000 ; PLOK
       .byte %00100000 ; PLOK
       .byte %01111110 ; PLOK
       .byte %00011100 ; PLOK
       .byte %00000000 ; PLOK

       ;byte %00000000 ; PLOK
       ;byte %00000000 ; PLOK
       ;byte %00000000 ; PLOK
       ;byte %00000000 ; PLOK


 else
LENHEX = 0
 endif ; fontcharsHEX
 endif ; PLOK



 if fontstyle == SQUISH

LENDEC = 80

       ;byte %00000000 ; SQUISH

       .byte %00111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111110 ; SQUISH
       .byte %00011000 ; SQUISH
       .byte %00011000 ; SQUISH
       .byte %00111000 ; SQUISH
       .byte %00011000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111110 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000110 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111100 ; SQUISH
       .byte %00000110 ; SQUISH
       .byte %00011100 ; SQUISH
       .byte %00000110 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %00001100 ; SQUISH
       .byte %01111110 ; SQUISH
       .byte %01001100 ; SQUISH
       .byte %00101100 ; SQUISH
       .byte %00011100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111100 ; SQUISH
       .byte %00000110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %01111110 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %00111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %00110000 ; SQUISH
       .byte %00011000 ; SQUISH
       .byte %00001100 ; SQUISH
       .byte %00000110 ; SQUISH
       .byte %01111110 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %00111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %00111100 ; SQUISH
       .byte %00000110 ; SQUISH
       .byte %00111110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

 ifconst fontcharsHEX 
LENHEX = 48

       .byte %01100110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01111110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %00111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %00111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111100 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01100110 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01111110 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %01111110 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH

       .byte %01100000 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %01111100 ; SQUISH
       .byte %01100000 ; SQUISH
       .byte %01111110 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH
       .byte %00000000 ; SQUISH

       ;byte %00000000 ; SQUISH
       ;byte %00000000 ; SQUISH
       ;byte %00000000 ; SQUISH
       ;byte %00000000 ; SQUISH

 else
LENHEX = 0
 endif ; fontcharsHEX 
 endif ; SQUISH






 if fontstyle == NOFONT
LENDEC = 0
LENHEX = 0
 endif ; NOFONT


; ### any characters that aren't font specific follow... 

 ifconst fontcharSPACE
LENSPACE = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS
 else
LENSPACE = 0
 endif ; fontcharSPACE

 ifconst fontcharDOLLAR
LENDOLLAR = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00000000 ; SYMBOLS
       .byte %00010000 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %00010010 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %10010000 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %00010000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENDOLLAR = 0
 endif ; fontcharDOLLAR

 ifconst fontcharPOUND
LENPOUND = 8
       ;byte %00000000 ; SYMBOLS

       .byte %01111110 ; SYMBOLS
       .byte %01000000 ; SYMBOLS
       .byte %00100000 ; SYMBOLS
       .byte %00100000 ; SYMBOLS
       .byte %01111000 ; SYMBOLS
       .byte %00100000 ; SYMBOLS
       .byte %00100010 ; SYMBOLS
       .byte %00011100 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENPOUND = 0
 endif ; fontcharPOUND


 ifconst fontcharMRHAPPY
LENMRHAPPY = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00111100 ; SYMBOLS
       .byte %01100110 ; SYMBOLS
       .byte %01011010 ; SYMBOLS
       .byte %01111110 ; SYMBOLS
       .byte %01111110 ; SYMBOLS
       .byte %01011010 ; SYMBOLS
       .byte %01111110 ; SYMBOLS
       .byte %00111100 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENMRHAPPY = 0
 endif ; fontcharMRHAPPY

 ifconst fontcharMRSAD
LENMRSAD = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00111100 ; SYMBOLS
       .byte %01011010 ; SYMBOLS
       .byte %01100110 ; SYMBOLS
       .byte %01111110 ; SYMBOLS
       .byte %01111110 ; SYMBOLS
       .byte %01011010 ; SYMBOLS
       .byte %01111110 ; SYMBOLS
       .byte %00111100 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENMRSAD = 0
 endif ; fontcharMRSAD


 ifconst fontcharCOPYRIGHT
LENCOPYRIGHT = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00000000 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %01000100 ; SYMBOLS
       .byte %10111010 ; SYMBOLS
       .byte %10100010 ; SYMBOLS
       .byte %10111010 ; SYMBOLS
       .byte %01000100 ; SYMBOLS
       .byte %00111000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENCOPYRIGHT = 0
 endif ; fontcharCOPYRIGHT


 ifconst fontcharFUJI
LENFUJI = 16

       ;byte %00000000 ; ** these commented-out blanks are for the preview generation program

       .byte %01110000 ; SYMBOLS
       .byte %01111001 ; SYMBOLS
       .byte %00011101 ; SYMBOLS
       .byte %00001101 ; SYMBOLS
       .byte %00001101 ; SYMBOLS
       .byte %00001101 ; SYMBOLS
       .byte %00001101 ; SYMBOLS
       .byte %00000000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

       .byte %00001110 ; SYMBOLS
       .byte %10011110 ; SYMBOLS
       .byte %10111000 ; SYMBOLS
       .byte %10110000 ; SYMBOLS
       .byte %10110000 ; SYMBOLS
       .byte %10110000 ; SYMBOLS
       .byte %10110000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENFUJI = 0
 endif ; fontcharFUJI


 ifconst fontcharHEART
LENHEART = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00010000 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %11101110 ; SYMBOLS
       .byte %01000100 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENHEART = 0
 endif ; fontcharHEART

 ifconst fontcharDIAMOND
LENDIAMOND = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00010000 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %00010000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENDIAMOND = 0
 endif ; fontcharDIAMOND

 ifconst fontcharSPADE
LENSPADE = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00111000 ; SYMBOLS
       .byte %00010000 ; SYMBOLS
       .byte %01010100 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %01111100 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %00010000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENSPADE = 0
 endif ; fontcharSPADE

 ifconst fontcharCLUB
LENCLUB = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00111000 ; SYMBOLS
       .byte %00010000 ; SYMBOLS
       .byte %11010110 ; SYMBOLS
       .byte %11111110 ; SYMBOLS
       .byte %11010110 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %00111000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENCLUB = 0
 endif ; fontcharCLUB


 ifconst fontcharCOLON
LENCOLON = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00000000 ; SYMBOLS
       .byte %00011000 ; SYMBOLS
       .byte %00011000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00011000 ; SYMBOLS
       .byte %00011000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENCOLON = 0
 endif ; fontcharCOLON


 ifconst fontcharBLOCK
LENBLOCK = 8

       ;byte %00000000 ; SYMBOLS

       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS
       .byte %11111111 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENBLOCK = 0
 endif ; fontcharBLOCK

 ifconst fontcharUNDERLINE
LENUNDERLINE = 8

       ;byte %00000000 ; SYMBOLS

       .byte %11111111 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS
       .byte %00000000 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENUNDERLINE = 0
 endif ; fontcharUNDERLINE

 ifconst fontcharARISIDE
LENARISIDE = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00000000 ; SYMBOLS
       .byte %00101010 ; SYMBOLS
       .byte %00101010 ; SYMBOLS
       .byte %00101100 ; SYMBOLS
       .byte %01111111 ; SYMBOLS
       .byte %00110111 ; SYMBOLS
       .byte %00000010 ; SYMBOLS
       .byte %00000001 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS

 else
LENARISIDE = 0
 endif ; fontcharARISIDE

 ifconst fontcharARIFACE
LENARIFACE = 8
       ;byte %00000000 ; SYMBOLS

       .byte %00001000 ; SYMBOLS
       .byte %00011100 ; SYMBOLS
       .byte %00111110 ; SYMBOLS
       .byte %00101010 ; SYMBOLS
       .byte %00011100 ; SYMBOLS
       .byte %01010100 ; SYMBOLS
       .byte %00100100 ; SYMBOLS
       .byte %00000010 ; SYMBOLS

       ;byte %00000000 ; SYMBOLS


 else
LENARIFACE = 0
 endif ; fontcharARIRACE

       ;byte %00000000 ; SYMBOLS
       ;byte %00000000 ; SYMBOLS
       ;byte %00000000 ; SYMBOLS
       ;byte %00000000 ; SYMBOLS

scoretableend

 ifconst ROM2k
   ORG $F7FC
 else
   ifconst bankswitch
     if bankswitch == 8
       ORG $2FF4-bscode_length
       RORG $FFF4-bscode_length
     endif
     if bankswitch == 16
       ORG $4FF4-bscode_length
       RORG $FFF4-bscode_length
     endif
     if bankswitch == 32
       ORG $8FF4-bscode_length
       RORG $FFF4-bscode_length
     endif
   else
     ORG $FFFC
   endif
 endif
