package spintracker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.data.AppState
import spintracker.models.UpdateInfo
import spintracker.services.ImportService
import spintracker.ui.components.Header
import spintracker.ui.components.NavScreen
import spintracker.ui.components.Sidebar
import spintracker.ui.components.UpdateDialog
import spintracker.ui.screens.ChartsScreen
import spintracker.ui.screens.DashboardScreen
import spintracker.ui.screens.TournamentsScreen
import spintracker.ui.screens.PlayersScreen
import spintracker.ui.screens.RangeResearchScreen
import spintracker.ui.screens.SettingsScreen
import spintracker.ui.screens.AnalyticsScreen
import spintracker.ui.screens.BankrollScreen
import spintracker.ui.screens.ReplayerWindow

val appState = AppState()

@Composable
fun SpinTrackerApp(
    window: androidx.compose.ui.awt.ComposeWindow,
    pendingUpdate: UpdateInfo? = null
) {
    var selectedScreen by remember { mutableStateOf(NavScreen.Dashboard) }
    var refreshKey by remember { mutableIntStateOf(0) }
    var heroName by remember { mutableStateOf(appState.heroName) }
    var dateRange by remember { mutableStateOf("all") }
    var buyIn by remember { mutableStateOf("all") }
    
    var replayerHandId by remember { mutableStateOf<String?>(null) }
    var showReplayer by remember { mutableStateOf(false) }

    val players = remember(refreshKey) { appState.getAllPlayers() }
    val availableHeroes = remember(players) { players.map { Triple(it.id.toString(), it.name, it.room) } }
    val availableBuyIns = listOf(1, 2, 3, 5, 10, 20, 50, 100)
    var importProgress by remember { mutableStateOf<ImportService.ImportProgress?>(null) }
    var isImporting by remember { mutableStateOf(false) }
    var deleteSuccess by remember { mutableStateOf<String?>(null) }
    
    var showUpdateDialog by remember { mutableStateOf(pendingUpdate != null) }
    var updateToInstall by remember { mutableStateOf(pendingUpdate) }
    var appVersion by remember { mutableStateOf("1.0.0") }
    
    LaunchedEffect(Unit) {
        appVersion = appState.getAppVersion()
    }
    
    if (showReplayer && replayerHandId != null) {
        ReplayerWindow(
            handId = replayerHandId!!,
            heroName = heroName,
            onClose = { showReplayer = false; replayerHandId = null }
        )
    }
    
    if (showUpdateDialog && updateToInstall != null) {
        UpdateDialog(
            updateInfo = updateToInstall!!,
            currentVersion = appVersion,
            onDismiss = { showUpdateDialog = false },
            onInstallComplete = {
                window.dispose()
            }
        )
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
                isImporting = isImporting,
                onHeroChange = { name -> heroName = name; appState.heroName = name },
                onDateRangeChange = { range -> dateRange = range },
                onBuyInChange = { bi -> buyIn = bi },
                onImport = {
                    if (isImporting) return@Header
                    
                    try {
                        val dialog = java.awt.FileDialog(window, "Import Hands", java.awt.FileDialog.LOAD)
                        dialog.setFilenameFilter { _, name -> name.endsWith(".txt") }
                        dialog.isMultipleMode = true
                        dialog.isVisible = true
                        
                        val files = dialog.files
                        val directory = dialog.directory
                        
                        if (files != null && files.isNotEmpty() && directory != null) {
                            val filePaths = files.map { java.io.File(directory, it.name).absolutePath }
                            importProgress = ImportService.ImportProgress.Counting(0, 0)
                            isImporting = true
                            
                            Thread {
                                appState.importFiles(filePaths) { progress ->
                                    importProgress = progress
                                }
                                isImporting = false
                                importProgress = null
                                refreshKey++
                            }.start()
                        }
                    } catch (e: Exception) {
                        println("Error: ${e.message}")
                        isImporting = false
                    }
                },
                onRefresh = { refreshKey++ }
            )

            Box(modifier = Modifier.fillMaxSize().background(Dark500).padding(24.dp)) {
                when (selectedScreen) {
                    NavScreen.Dashboard -> DashboardScreen(refreshKey, heroName, dateRange, buyIn)
                    NavScreen.Tournaments -> TournamentsScreen(refreshKey, heroName, dateRange, buyIn) { handId ->
                        replayerHandId = handId
                        showReplayer = true
                    }
                    NavScreen.Analytics -> AnalyticsScreen(heroName, dateRange, buyIn)
                    NavScreen.RangeResearch -> RangeResearchScreen(heroName, dateRange, buyIn) { handId ->
                        replayerHandId = handId
                        showReplayer = true
                    }
                    NavScreen.Charts -> ChartsScreen(heroName, dateRange, buyIn, appState.database)
                    NavScreen.Bankroll -> BankrollScreen(heroName, dateRange, buyIn)
                    NavScreen.Players -> PlayersScreen(refreshKey, heroName, dateRange, buyIn)
                    NavScreen.Settings -> SettingsScreen(
                        appState = appState,
                        refreshKey = refreshKey,
                        heroName = heroName,
                        onHeroNameChange = { name -> heroName = name; appState.heroName = name },
                        onDataDeleted = { deleteSuccess = "All data deleted successfully"; refreshKey++ },
                        onRefresh = { refreshKey++ }
                    )
                }
                
                // Import Progress Overlay
                importProgress?.let { progress ->
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.BottomEnd
                    ) {
                        Card(
                            modifier = Modifier.padding(24.dp),
                            colors = CardDefaults.cardColors(containerColor = Dark400),
                            shape = RoundedCornerShape(16.dp),
                            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(20.dp).width(280.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                when (progress) {
                                    is ImportService.ImportProgress.Counting -> {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(20.dp),
                                                color = Primary400,
                                                strokeWidth = 2.dp
                                            )
                                            Spacer(modifier = Modifier.width(12.dp))
                                            Text("Counting hands...", color = Color.White, fontWeight = FontWeight.Medium)
                                        }
                                    }
                                    is ImportService.ImportProgress.Importing -> {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("Import", color = Color.White, fontWeight = FontWeight.Bold)
                                            Text(
                                                "${progress.current}/${progress.total}",
                                                color = Primary400,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(8.dp))
                                        LinearProgressIndicator(
                                            progress = progress.current.toFloat() / progress.total.toFloat(),
                                            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                                            color = Primary400,
                                            trackColor = DarkSurface
                                        )
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                "+${progress.handsImported}",
                                                color = Color(0xFF22c55e),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Medium
                                            )
                                            if (progress.handsSkipped > 0) {
                                                Text(
                                                    "${progress.handsSkipped} skipped",
                                                    color = Color.White.copy(alpha = 0.5f),
                                                    fontSize = 12.sp
                                                )
                                            }
                                        }
                                    }
                                    is ImportService.ImportProgress.Complete -> {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(
                                                Icons.Default.CheckCircle,
                                                null,
                                                tint = Color(0xFF22c55e),
                                                modifier = Modifier.size(24.dp)
                                            )
                                            Spacer(modifier = Modifier.width(12.dp))
                                            Column {
                                                Text("Import Complete", color = Color.White, fontWeight = FontWeight.Bold)
                                                Text(
                                                    "${progress.handsImported} hands imported",
                                                    color = Color.White.copy(alpha = 0.7f),
                                                    fontSize = 12.sp
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Delete Success Notification
                deleteSuccess?.let { message ->
                    LaunchedEffect(message) {
                        kotlinx.coroutines.delay(3000)
                        deleteSuccess = null
                    }
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.BottomEnd
                    ) {
                        Card(
                            modifier = Modifier.padding(24.dp),
                            colors = CardDefaults.cardColors(containerColor = Dark400),
                            shape = RoundedCornerShape(16.dp),
                            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp).width(260.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    null,
                                    tint = Color(0xFF22c55e),
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(message, color = Color.White, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}