package spintracker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import spintracker.data.AppState
import spintracker.ui.components.Header
import spintracker.ui.components.NavScreen
import spintracker.ui.components.Sidebar
import spintracker.ui.screens.AnalysisScreen
import spintracker.ui.screens.ChartsScreen
import spintracker.ui.screens.DashboardScreen
import spintracker.ui.screens.HandHistoryScreen
import spintracker.ui.screens.PlayersScreen
import spintracker.ui.screens.RangeResearchScreen
import spintracker.ui.screens.SettingsScreen

val appState = AppState()

@Composable
fun SpinTrackerApp(window: androidx.compose.ui.awt.ComposeWindow) {
    var selectedScreen by remember { mutableStateOf(NavScreen.Dashboard) }
    var refreshKey by remember { mutableIntStateOf(0) }
    var heroName by remember { mutableStateOf(appState.heroName) }
    var dateRange by remember { mutableStateOf("all") }
    var buyIn by remember { mutableStateOf("all") }

    val players = remember { appState.getAllPlayers() }
    val availableHeroes = remember(players) { players.map { Triple(it.id.toString(), it.name, it.room) } }
    val availableBuyIns = listOf(1, 2, 3, 5, 10, 20, 50, 100)

    Row(modifier = Modifier.fillMaxSize().background(Dark500)) {
        Sidebar(selectedScreen) { selectedScreen = it }

        Column(modifier = Modifier.fillMaxSize()) {
            Header(
                screen = selectedScreen,
                heroName = heroName,
                dateRange = dateRange,
                buyIn = buyIn,
                availableHeroes = availableHeroes,
                availableBuyIns = availableBuyIns,
                onHeroChange = { name -> heroName = name; appState.heroName = name },
                onDateRangeChange = { range -> dateRange = range },
                onBuyInChange = { bi -> buyIn = bi },
                onImport = {
                    try {
                        val dialog = java.awt.FileDialog(window, "Import Hands", java.awt.FileDialog.LOAD)
                        dialog.setFilenameFilter { _, name -> name.endsWith(".txt") }
                        dialog.isVisible = true
                        
                        val file = dialog.file
                        val directory = dialog.directory
                        
                        if (file != null && directory != null) {
                            val fullPath = java.io.File(directory, file).absolutePath
                            val imported = appState.importFile(fullPath)
                            println("Imported $imported hands from $file")
                            refreshKey++
                        }
                    } catch (e: Exception) {
                        println("Error: ${e.message}")
                    }
                },
                onRefresh = { refreshKey++ }
            )

            Box(modifier = Modifier.fillMaxSize().background(Dark500).padding(24.dp)) {
                when (selectedScreen) {
                    NavScreen.Dashboard -> DashboardScreen(refreshKey, heroName, dateRange, buyIn)
                    NavScreen.HandHistory -> HandHistoryScreen(refreshKey, heroName, dateRange, buyIn)
                    NavScreen.RangeResearch -> RangeResearchScreen(heroName, dateRange, buyIn)
                    NavScreen.Analysis -> AnalysisScreen(heroName, dateRange, buyIn)
                    NavScreen.Charts -> ChartsScreen(heroName, dateRange, buyIn)
                    NavScreen.Players -> PlayersScreen(refreshKey, heroName, dateRange, buyIn)
                    NavScreen.Settings -> SettingsScreen(refreshKey, heroName, onHeroNameChange = { name -> heroName = name; appState.heroName = name })
                }
            }
        }
    }
}