package spintracker.tests

import spintracker.models.PlayerStats
import spintracker.services.PlayerTypingService
import spintracker.services.PlayerType

fun main() {
    println("--- Player Typing Tests ---")
    
    // REG: < 50 hands
    val regNoData = PlayerStats(vpip = 0.20, pfr = 0.10, handsPlayed = 30)
    println("Test REG (<50 hands): ${PlayerTypingService.classify(regNoData)}")
    assert(PlayerTypingService.classify(regNoData) == PlayerType.REG) { "FAIL: REG" }
    
    // NIT: vpip < 15%
    val nit = PlayerStats(vpip = 0.10, pfr = 0.08, handsPlayed = 100)
    println("Test NIT (vpip < 0.15): ${PlayerTypingService.classify(nit)}")
    assert(PlayerTypingService.classify(nit) == PlayerType.NIT) { "FAIL: NIT" }
    
    // MANIAC: vpip > 50%
    val maniac = PlayerStats(vpip = 0.60, pfr = 0.20, handsPlayed = 100)
    println("Test MANIAC (vpip > 0.50): ${PlayerTypingService.classify(maniac)}")
    assert(PlayerTypingService.classify(maniac) == PlayerType.MANIAC) { "FAIL: MANIAC" }
    
    // LAG: vpip > 35%
    val lag = PlayerStats(vpip = 0.40, pfr = 0.12, handsPlayed = 100)
    println("Test LAG (vpip > 0.35): ${PlayerTypingService.classify(lag)}")
    assert(PlayerTypingService.classify(lag) == PlayerType.LAG) { "FAIL: LAG" }
    
    // TAG: pfr > 15%
    val tag = PlayerStats(vpip = 0.25, pfr = 0.20, handsPlayed = 100)
    println("Test TAG (pfr > 0.15): ${PlayerTypingService.classify(tag)}")
    assert(PlayerTypingService.classify(tag) == PlayerType.TAG) { "FAIL: TAG" }
    
    // REG: vpip < 25%
    val reg = PlayerStats(vpip = 0.20, pfr = 0.10, handsPlayed = 100)
    println("Test REG (vpip < 0.25): ${PlayerTypingService.classify(reg)}")
    assert(PlayerTypingService.classify(reg) == PlayerType.REG) { "FAIL: REG" }
    
    // FISH: default (vpip 25-35%, pfr < 15%)
    val fish = PlayerStats(vpip = 0.30, pfr = 0.10, handsPlayed = 100)
    println("Test FISH (vpip 0.25-0.35, pfr < 0.15): ${PlayerTypingService.classify(fish)}")
    assert(PlayerTypingService.classify(fish) == PlayerType.FISH) { "FAIL: FISH" }
    
    println("\nAll tests passed!")
}