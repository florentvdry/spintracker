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
import kotlinx.coroutines.delay

fun main() = application {
    var isLoading by remember { mutableStateOf(true) }

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
                    
                    LaunchedEffect(Unit) {
                        delay(2500)
                        isLoading = false
                    }
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
                        SpinTrackerApp(window)
                    }
                }
            }
        }
    }
}