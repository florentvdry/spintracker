package spintracker.tests

import spintracker.services.EquityService
import kotlin.system.measureTimeMillis

fun main() {
    val equityService = EquityService()
    
    // 1. River test (should be exact)
    println("--- River Test ---")
    val riverStart = System.currentTimeMillis()
    val riverResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "AdKd2h3h4h")
    println("Result: ${riverResult.win * 100}% win, ${riverResult.tie * 100}% tie")
    println("Time: ${System.currentTimeMillis() - riverStart}ms")
    
    // 2. Turn test (~44 combinations)
    println("\n--- Turn Test ---")
    val turnStart = System.currentTimeMillis()
    val turnResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "AdKd2h3h")
    println("Result: ${turnResult.win * 100}% win, ${turnResult.tie * 100}% tie")
    println("Time: ${System.currentTimeMillis() - turnStart}ms")
    
    // 3. Flop test (990 combinations)
    println("\n--- Flop Test ---")
    val flopStart = System.currentTimeMillis()
    val flopResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "AdKd2h")
    println("Result: ${flopResult.win * 100}% win, ${flopResult.tie * 100}% tie")
    println("Time: ${System.currentTimeMillis() - flopStart}ms")
    
    // 4. Preflop test (~1.7M combinations)
    println("\n--- Preflop Test (Parallel) ---")
    val preflopTime = measureTimeMillis {
        val preflopResult = equityService.calculateMultiwayEquity("AhAs", listOf("KhKs"), "")
        println("Result: ${preflopResult.win * 100}% win, ${preflopResult.tie * 100}% tie")
    }
    println("Time: ${preflopTime}ms")
}
