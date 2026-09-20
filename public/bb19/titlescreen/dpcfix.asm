 ; reassign variables that DPC+ doesn't have

 ifnconst aux2
aux2 = player2x
 endif
 ifnconst aux4
aux4 = player4x
 endif
 ifnconst aux5
aux5 = player5x
 endif
 ifnconst aux6
aux6 = player6x
 endif

 ifnconst player0pointer
player0pointer = player2y
 endif
 ifnconst player1pointer
player1pointer = player2height ; to player3height
 endif
 ifnconst player1color
player1color = player4height ; to player5height
 endif
 ifnconst scorepointers
scorepointers = player6height ; to NUSIZ8
 endif
