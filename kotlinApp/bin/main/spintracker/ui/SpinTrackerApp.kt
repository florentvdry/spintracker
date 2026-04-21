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
import androidx.compose.ui.unit.dp
import spintracker.data.AppState
import spintracker.ui.components.Header
import spintracker.ui.components.NavScreen
import spintracker.ui.components.Sidebar
import spintracker.ui.screens.*

val Dark500 = Color(0xFF1a1f2e)
val Dark400 = Color(0xFF1e2433)
val Primary400 = Color(0xFF14b8a6)

val appState = AppState()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpinTrackerApp() {
    SpinTrackerTheme {
        var selectedScreen by remember { mutableStateOf(NavScreen.Dashboard) }
        var refreshKey by remember { mutableIntStateOf(0) }
        var heroName by remember { mutableStateOf(appState.heroName) }
        var dateRange by remember { mutableStateOf("all") }
        var buyIn by remember { mutableStateOf("all") }

        val players = remember { appState.getAllPlayers() }
        val availableHeroes = remember(players) {
            players.map { it.id to it.name }
        }
        val availableBuyIns = remember {
            listOf(1, 2, 3, 5, 10, 20, 50, 100)
        }

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
                    onHeroChange = { name ->
                        heroName = name
                        appState.heroName = name
                    },
                    onDateRangeChange = { range -> dateRange = range },
                    onBuyInChange = { bi -> buyIn = bi },
                    onImport = {
                        // Handle import
                    },
                    onRefresh = {
                        refreshKey++
                    }
                )

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Dark500)
                        .padding(24.dp)
                ) {
                    when (selectedScreen) {
                        NavScreen.Dashboard -> DashboardScreen(
                            refreshKey = refreshKey,
                            heroName = heroName,
                            dateRange = dateRange,
                            buyIn = buyIn,
                            onRefresh = { refreshKey++ }
                        )
                        NavScreen.HandHistory -> HandHistoryScreen(
                            refreshKey = refreshKey,
                            heroName = heroName,
                            dateRange = dateRange,
                            buyIn = buyIn
                        )
                        NavScreen.RangeResearch -> RangeResearchScreen(
                            heroName = heroName,
                            dateRange = dateRange,
                            buyIn = buyIn
                        )
                        NavScreen.Analysis -> AnalysisScreen(
                            heroName = heroName,
                            dateRange = dateRange,
                            buyIn = buyIn
                        )
                        NavScreen.Charts -> ChartsScreen(
                            heroName = heroName,
                            dateRange = dateRange,
                            buyIn = buyIn
                        )
                        NavScreen.Players -> PlayersScreen(
                            refreshKey = refreshKey,
                            heroName = heroName,
                            dateRange = dateRange,
                            buyIn = buyIn
                        )
                        NavScreen.Settings -> SettingsScreen(
                            refreshKey = refreshKey,
                            heroName = heroName,
                            onHeroNameChange = { name ->
                                heroName = name
                                appState.heroName = name
                            }
                        )
                    }
                }
            }
        }
    }
}