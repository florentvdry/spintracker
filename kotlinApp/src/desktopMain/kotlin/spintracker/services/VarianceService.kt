package spintracker.services

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sqrt

object VarianceService {

    data class Downswing(
        val startIndex: Int,
        val troughIndex: Int,
        val peakValue: Double,
        val troughValue: Double,
        val depth: Double,
        val duration: Int
    )

    data class VarianceStats(
        val winRate: Double,
        val stdDev: Double,
        val riskOfRuin: Double,
        val biggestDownswing: Downswing?,
        val avgDownswingDepth: Double,
        val avgDownswingDuration: Int,
        val downswingsCount: Int,
        val confidenceInterval95: Pair<Double, Double>,
        val confidenceInterval99: Pair<Double, Double>,
        val sampleSize: Int
    )

    fun calculateRiskOfRuin(winRate: Double, stdDev: Double, bankroll: Double): Double {
        if (stdDev <= 0 || bankroll <= 0) return 0.0
        if (winRate <= 0) return 1.0
        
        val winRatePerHand = winRate
        val lossRatePerHand = 1.0 - winRatePerHand
        
        if (lossRatePerHand <= 0) return 0.0
        
        val z = winRatePerHand / stdDev
        if (z <= 0) return 1.0
        
        val riskOfRuin = exp(-2.0 * bankroll * z)
        return riskOfRuin.coerceIn(0.0, 1.0)
    }

    fun calculateDownswings(cumulativeProfit: List<Double>, confidence: Int = 95): List<Downswing> {
        if (cumulativeProfit.size < 2) return emptyList()

        val runningMax = cumulativeProfit.runningMax()
        val drawdowns = mutableListOf<Downswing>()

        var currentDownswingStart = 0
        var currentTroughIndex = 0
        var currentTroughValue = cumulativeProfit[0]
        var inDownswing = false

        for (i in 1 until cumulativeProfit.size) {
            val currentValue = cumulativeProfit[i]
            val peakValue = runningMax[i]

            if (currentValue < currentTroughValue) {
                if (!inDownswing) {
                    currentDownswingStart = i - 1
                    inDownswing = true
                }
                currentTroughIndex = i
                currentTroughValue = currentValue
            } else if (inDownswing && currentValue >= peakValue) {
                val peakAtStart = runningMax[currentDownswingStart]
                val depth = peakAtStart - currentTroughValue
                val duration = currentTroughIndex - currentDownswingStart

                if (depth > 0) {
                    drawdowns.add(Downswing(
                        startIndex = currentDownswingStart,
                        troughIndex = currentTroughIndex,
                        peakValue = peakAtStart,
                        troughValue = currentTroughValue,
                        depth = depth,
                        duration = duration
                    ))
                }

                inDownswing = false
                currentTroughValue = currentValue
            }
        }

        if (inDownswing) {
            val peakAtStart = runningMax[currentDownswingStart]
            val depth = peakAtStart - currentTroughValue
            val duration = currentTroughIndex - currentDownswingStart

            if (depth > 0) {
                drawdowns.add(Downswing(
                    startIndex = currentDownswingStart,
                    troughIndex = currentTroughIndex,
                    peakValue = peakAtStart,
                    troughValue = currentTroughValue,
                    depth = depth,
                    duration = duration
                ))
            }
        }

        return drawdowns.sortedByDescending { it.depth }
    }

    fun calculateDownswingsFromResults(results: List<Double>, confidence: Int = 95): List<Downswing> {
        if (results.isEmpty()) return emptyList()
        
        val cumulativeProfit = results.runningFold(0.0) { acc, value -> acc + value }
        return calculateDownswings(cumulativeProfit, confidence)
    }

    fun sampleSizeNeeded(winRate: Double, stdDev: Double, targetCIMargin: Double, confidence: Int = 95): Int {
        if (stdDev <= 0 || targetCIMargin <= 0) return Int.MAX_VALUE
        
        val z = when (confidence) {
            95 -> 1.96
            99 -> 2.576
            90 -> 1.645
            else -> 1.96
        }

        val variance = stdDev * stdDev
        val n = ((z * sqrt(variance)) / targetCIMargin).pow(2)
        return n.toInt().coerceAtLeast(1)
    }

    fun calculateVarianceStats(
        results: List<Double>,
        bigBlinds: List<Double>,
        bankroll: Double,
        confidence: Int = 95
    ): VarianceStats {
        if (results.isEmpty()) {
            return VarianceStats(
                winRate = 0.0,
                stdDev = 0.0,
                riskOfRuin = 0.0,
                biggestDownswing = null,
                avgDownswingDepth = 0.0,
                avgDownswingDuration = 0,
                downswingsCount = 0,
                confidenceInterval95 = Pair(0.0, 0.0),
                confidenceInterval99 = Pair(0.0, 0.0),
                sampleSize = 0
            )
        }

        val sampleSize = results.size
        val mean = results.average()
        
        val variance = if (sampleSize > 1) {
            results.map { (it - mean) * (it - mean) }.sum() / (sampleSize - 1)
        } else 0.0
        
        val stdDev = sqrt(variance)
        val winRate = mean

        val riskOfRuin = calculateRiskOfRuin(winRate, stdDev, bankroll)

        val downswings = calculateDownswingsFromResults(results, confidence)
        val biggestDownswing = downswings.firstOrNull()
        val avgDownswingDepth = if (downswings.isNotEmpty()) downswings.map { it.depth }.average() else 0.0
        val avgDownswingDuration = if (downswings.isNotEmpty()) downswings.map { it.duration }.average().toInt() else 0

        val se = stdDev / sqrt(sampleSize.toDouble())
        val ci95 = Pair(mean - 1.96 * se, mean + 1.96 * se)
        val ci99 = Pair(mean - 2.576 * se, mean + 2.576 * se)

        return VarianceStats(
            winRate = winRate,
            stdDev = stdDev,
            riskOfRuin = riskOfRuin,
            biggestDownswing = biggestDownswing,
            avgDownswingDepth = avgDownswingDepth,
            avgDownswingDuration = avgDownswingDuration,
            downswingsCount = downswings.size,
            confidenceInterval95 = ci95,
            confidenceInterval99 = ci99,
            sampleSize = sampleSize
        )
    }

    fun getSampleSizeWarning(sampleSize: Int, minRecommended: Int = 10000): String? {
        return when {
            sampleSize < minRecommended / 10 -> "Very small sample size ($sampleSize). Results are highly unreliable."
            sampleSize < minRecommended / 4 -> "Small sample size ($sampleSize). Results have high variance."
            sampleSize < minRecommended -> "Moderate sample size ($sampleSize). Results are somewhat reliable."
            else -> null
        }
    }

    fun calculateConfidenceInterval(
        results: List<Double>,
        confidence: Int = 95
    ): Pair<Double, Double>? {
        if (results.size < 2) return null

        val mean = results.average()
        val sampleSize = results.size
        val variance = results.map { (it - mean) * (it - mean) }.sum() / (sampleSize - 1)
        val stdDev = sqrt(variance)
        val se = stdDev / sqrt(sampleSize.toDouble())

        val z = when (confidence) {
            95 -> 1.96
            99 -> 2.576
            90 -> 1.645
            else -> 1.96
        }

        return Pair(mean - z * se, mean + z * se)
    }

    private fun List<Double>.runningMax(): List<Double> {
        var max = this.firstOrNull() ?: return emptyList()
        return this.map {
            if (it > max) max = it
            max
        }
    }

    private fun List<Double>.runningFold(initial: Double, operation: (acc: Double, Double) -> Double): List<Double> {
        var acc = initial
        return this.map { value ->
            acc = operation(acc, value)
            acc
        }
    }
}