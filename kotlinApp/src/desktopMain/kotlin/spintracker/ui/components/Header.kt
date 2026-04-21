package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.unit.dp
import spintracker.ui.*

@Composable
fun Header(
    screen: NavScreen,
    heroName: String,
    dateRange: String,
    buyIn: String,
    availableHeroes: List<Pair<String, String>>,
    availableBuyIns: List<Int>,
    onHeroChange: (String) -> Unit,
    onDateRangeChange: (String) -> Unit,
    onBuyInChange: (String) -> Unit,
    onImport: () -> Unit,
    onRefresh: () -> Unit
) {
    var showHeroPicker by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showBuyInPicker by remember { mutableStateOf(false) }

    Row(modifier = Modifier.fillMaxWidth().background(spintracker.ui.Dark300).padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
        Box {
            Row(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(DarkSurface).border(1.dp, spintracker.ui.Dark100, RoundedCornerShape(8.dp)).clickable { showBuyInPicker = !showBuyInPicker }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Filter, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(if (buyIn == "all") "All Buy-ins" else "$buyIn€", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                Icon(Icons.Default.ArrowDropDown, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
            DropdownMenu(expanded = showBuyInPicker, onDismissRequest = { showBuyInPicker = false }) {
                DropdownMenuItem(text = { Text("All Buy-ins", color = Color.White) }, onClick = { onBuyInChange("all"); showBuyInPicker = false })
                availableBuyIns.forEach { bi -> DropdownMenuItem(text = { Text("$bi€", color = Color.White) }, onClick = { onBuyInChange(bi.toString()); showBuyInPicker = false }) }
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Box {
            val dateFilters = listOf("today" to "Today", "week" to "This Week", "month" to "This Month", "all" to "All Time")
            Row(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(DarkSurface).border(1.dp, spintracker.ui.Dark100, RoundedCornerShape(8.dp)).clickable { showDatePicker = !showDatePicker }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.DateRange, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(dateFilters.find { it.first == dateRange }?.second ?: "All Time", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                Icon(Icons.Default.ArrowDropDown, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
            DropdownMenu(expanded = showDatePicker, onDismissRequest = { showDatePicker = false }) {
                dateFilters.forEach { (key, label) -> DropdownMenuItem(text = { Text(label, color = Color.White) }, onClick = { onDateRangeChange(key); showDatePicker = false }) }
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Box {
            Row(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(DarkSurface).border(1.dp, spintracker.ui.Dark100, RoundedCornerShape(8.dp)).clickable { showHeroPicker = !showHeroPicker }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Hero:", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall)
                Spacer(modifier = Modifier.width(4.dp))
                Text(heroName.ifEmpty { "Select..." }, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                Icon(Icons.Default.ArrowDropDown, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
            DropdownMenu(expanded = showHeroPicker, onDismissRequest = { showHeroPicker = false }) {
                availableHeroes.forEach { (id, name) -> DropdownMenuItem(text = { Text(name, color = Color.White) }, onClick = { onHeroChange(name); showHeroPicker = false }) }
            }
        }

        Spacer(modifier = Modifier.width(16.dp))

        Button(onClick = onImport, colors = ButtonDefaults.buttonColors(containerColor = Primary400)) {
            Icon(Icons.Default.Upload, null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Import")
        }

        Spacer(modifier = Modifier.width(4.dp))
        IconButton(onClick = onRefresh) { Icon(Icons.Default.Refresh, "Refresh", tint = Color.White) }
    }
}