package spintracker.tests

import spintracker.ui.components.HUDState

fun main() {
    println("=== HUD Component Test ===\n")

    println("Testing HUDState...")
    val hudState = HUDState(visible = true, opacity = 0.9f)

    if (hudState.visible != true) {
        throw AssertionError("Expected visible to be true, got ${hudState.visible}")
    }
    if (Math.abs(hudState.opacity - 0.9f) > 0.01f) {
        throw AssertionError("Expected opacity to be 0.9f, got ${hudState.opacity}")
    }

    println("  visible: ${hudState.visible}")
    println("  opacity: ${hudState.opacity}")
    println("  position: ${hudState.position}")

    println("\n  HUDState test PASSED")
    println("\n=== Test Complete ===")
}