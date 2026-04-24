package spintracker

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.*
import spintracker.ui.SpinTrackerApp
import spintracker.ui.SplashScreen
import spintracker.ui.theme.SpinTrackerTheme
import spintracker.services.UpdateService
import spintracker.services.UpdateChecker
import spintracker.services.CheckResult
import spintracker.models.UpdateInfo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

fun main() = application {
    var isLoading by remember { mutableStateOf(true) }
    var updateCheckResult by remember { mutableStateOf<CheckResult?>(null) }
    var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
    val scope = rememberCoroutineScope()
    
    val currentVersion = "1.0.0"
    val updateService = remember { UpdateService.create() }
    val updateChecker = remember { UpdateChecker(updateService, currentVersion) }
    
    LaunchedEffect(Unit) {
        scope.launch {
            val result = updateChecker.checkForUpdates()
            updateCheckResult = result
            
            if (result is CheckResult.Available) {
                updateInfo = result.updateInfo
            }
        }
        
        delay(2500)
        isLoading = false
    }
    
    if (isLoading) {
        key("splash_window") {
            Window(
                onCloseRequest = ::exitApplication,
                state = rememberWindowState(
                    position = WindowPosition(Alignment.Center),
                    size = DpSize(400.dp, 400.dp)
                ),
                undecorated = true,
                transparent = true,
                resizable = false,
                alwaysOnTop = true
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color.Transparent
                ) {
                    SplashScreen()
                }
            }
        }
    } else {
        key("main_window") {
            Window(
                onCloseRequest = ::exitApplication,
                title = "SpinTracker",
                state = rememberWindowState(placement = WindowPlacement.Maximized)
            ) {
                SpinTrackerTheme {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        SpinTrackerApp(
                            window = window,
                            pendingUpdate = updateInfo
                        )
                    }
                }
            }
        }
    }
}