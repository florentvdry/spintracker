package spintracker

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import spintracker.ui.SpinTrackerApp

fun main() = application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "SpinTracker"
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            SpinTrackerApp(window)
        }
    }
}