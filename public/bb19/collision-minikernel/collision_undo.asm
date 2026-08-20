asm
vblank_collision_undo
; ==============================================================================
; 1. HARDWARE COLLISION UNDO, BOTH PLAYERS (evaluates last frame's move)
; ==============================================================================
.check_p0
    lda CXP0FB
    bmi .p0_hit

    lda player0x
    sta old0_x
    lda player0y
    sta old0_y

.check_p1
    lda CXP1FB
    bmi .p1_hit

    lda player1x
    sta old1_x
    lda player1y
    sta old1_y

.done
    sta CXCLR
    jmp .toggle_axis

.p0_hit
    lda old0_x
    sta player0x
    lda old0_y
    sta player0y
    jmp .check_p1

.p1_hit
    lda old1_x
    sta player1x
    lda old1_y
    sta player1y
    sta CXCLR
    ; falls through into .toggle_axis below

; ==============================================================================
; 2. INTERLEAVED AXIS MOVEMENT, BOTH PLAYERS (alternates X and Y every frame -
; needed for wall sliding, since CXP0FB/CXP1FB can't tell which axis caused a
; collision if both moved on the same frame; see collision.js's own comment)
; ==============================================================================
.toggle_axis
    lda frame_toggle
    eor #$01
    sta frame_toggle
    lsr
    bcs .process_y

; --- X-AXIS, PLAYER 0 (SWCHA bits 7/6) ---
.process_x
    lda SWCHA
    bmi .p0_chk_right
    dec player0x
    jmp .p1_process_x
.p0_chk_right
    asl
    bmi .p1_process_x
    inc player0x

; --- X-AXIS, PLAYER 1 (SWCHA bits 3/2) ---
.p1_process_x
    lda SWCHA
    and #%00001000
    bne .p1_chk_left
    dec player1x
    rts
.p1_chk_left
    lda SWCHA
    and #%00000100
    bne .exit_x
    inc player1x
.exit_x
    rts

; --- Y-AXIS, PLAYER 0 (SWCHA bits 5/4) ---
.process_y
    lda SWCHA
    and #$30
    cmp #$30
    beq .p1_process_y
    lsr
    bcs .p0_chk_down
    dec player0y
    jmp .p1_process_y
.p0_chk_down
    lsr
    bcs .p1_process_y
    inc player0y

; --- Y-AXIS, PLAYER 1 (SWCHA bits 1/0) ---
.p1_process_y
    lda SWCHA
    and #%00000011
    cmp #%00000011
    beq .exit_y
    lda SWCHA
    and #%00000001
    bne .p1_chk_down
    dec player1y
    rts
.p1_chk_down
    lda SWCHA
    and #%00000010
    bne .exit_y
    inc player1y
.exit_y
    rts
end
