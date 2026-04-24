package spintracker.tests

import spintracker.ui.components.PlayerPopupState

fun main() {
    println("=== PlayerPopup Component Test ===\n")

    println("Testing PlayerPopupState...")
    val state = PlayerPopupState(
        playerId = 1L,
        playerName = "TestPlayer",
        visible = true,
        vpip = 25.0,
        pfr = 15.0,
        totalHands = 500,
        notes = " TAG"
    )

    if (!state.visible) {
        throw AssertionError("Expected popup to be visible")
    }
    if (state.playerId != 1L) {
        throw AssertionError("Expected playerId to be 1, got ${state.playerId}")
    }
    if (state.playerName != "TestPlayer") {
        throw AssertionError("Expected playerName to be TestPlayer, got ${state.playerName}")
    }

    println("  visible: ${state.visible}")
    println("  playerId: ${state.playerId}")
    println("  playerName: ${state.playerName}")
    println("  vpip: ${state.vpip}")
    println("  pfr: ${state.pfr}")
    println("  totalHands: ${state.totalHands}")
    println("  notes: ${state.notes}")

    println("\nTesting hidden state...")
    val hiddenState = PlayerPopupState(
        playerId = null,
        playerName = "",
        visible = false
    )
    if (hiddenState.visible) {
        throw AssertionError("Expected popup to be hidden")
    }

    println("\n  PlayerPopupState test PASSED")
    println("\n=== Test Complete ===")
}