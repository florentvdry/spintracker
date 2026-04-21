package spintracker.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import spintracker.ui.*

@Composable
fun RoomIcon(room: String, size: Int = 16) {
    val iconName = room.split(".")[0].lowercase()
    val resourcePath = "spintracker/ui/icons/$iconName.png"
    
    // Use an internal component to wrap the painterResource call safely
    // In Compose for Desktop, if painterResource fails, it often throws during composition
    // We use a simple check for known rooms to decide whether to try loading
    
    val isKnownRoom = room.contains("Betclic", ignoreCase = true) || room.contains("Winamax", ignoreCase = true)
    
    if (isKnownRoom) {
        // We still can't try-catch here, but we can assume it exists if we added it
        // Or we use a more robust image loading library like Coil (not present here)
        // For now, we'll try to just load it and let it fail if missing
        Image(
            painter = painterResource(resourcePath),
            contentDescription = room,
            modifier = Modifier
                .size(size.dp)
                .clip(RoundedCornerShape(2.dp))
        )
    } else {
        // Fallback to text or generic icon
        Box(
            modifier = Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(if (room.contains("Betclic", ignoreCase = true)) Color(0xFFD2161E) else Color.Gray),
            contentAlignment = Alignment.Center
        ) {
            Text(
                room.take(1).uppercase(), 
                color = Color.White, 
                fontSize = (size * 0.6).sp, 
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Header(
    screen: NavScreen,
    heroName: String,
    dateRange: String,
    buyIn: String,
    availableHeroes: List<Triple<String, String, String>>,
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
    var heroSearchQuery by remember { mutableStateOf("") }

    val selectedHero = remember(availableHeroes, heroName) {
        availableHeroes.find { it.second == heroName }
    }

    val filteredHeroes = remember(availableHeroes, heroSearchQuery) {
        if (heroSearchQuery.isEmpty()) availableHeroes
        else availableHeroes.filter { it.second.contains(heroSearchQuery, ignoreCase = true) }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(spintracker.ui.Dark400)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Buy-in Picker
        Box {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(DarkSurface)
                    .border(1.dp, spintracker.ui.Dark100, RoundedCornerShape(8.dp))
                    .clickable { showBuyInPicker = !showBuyInPicker }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.FilterAlt, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    if (buyIn == "all") "All Buy-ins" else "$buyIn€",
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium
                )
                Icon(Icons.Default.ArrowDropDown, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
            DropdownMenu(
                expanded = showBuyInPicker,
                onDismissRequest = { showBuyInPicker = false },
                modifier = Modifier.background(Dark400).border(1.dp, Dark100)
            ) {
                DropdownMenuItem(
                    text = { Text("All Buy-ins", color = Color.White) },
                    onClick = { onBuyInChange("all"); showBuyInPicker = false }
                )
                availableBuyIns.forEach { bi ->
                    DropdownMenuItem(
                        text = { Text("$bi€", color = Color.White) },
                        onClick = { onBuyInChange(bi.toString()); showBuyInPicker = false }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Date Picker
        Box {
            val dateFilters = listOf("today" to "Today", "week" to "This Week", "month" to "This Month", "all" to "All Time")
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(DarkSurface)
                    .border(1.dp, spintracker.ui.Dark100, RoundedCornerShape(8.dp))
                    .clickable { showDatePicker = !showDatePicker }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.DateRange, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    dateFilters.find { it.first == dateRange }?.second ?: "All Time",
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium
                )
                Icon(Icons.Default.ArrowDropDown, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
            DropdownMenu(
                expanded = showDatePicker,
                onDismissRequest = { showDatePicker = false },
                modifier = Modifier.background(Dark400).border(1.dp, Dark100)
            ) {
                dateFilters.forEach { (key, label) ->
                    DropdownMenuItem(
                        text = { Text(label, color = Color.White) },
                        onClick = { onDateRangeChange(key); showDatePicker = false }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Hero Picker with Search
        Box {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(DarkSurface)
                    .border(1.dp, spintracker.ui.Dark100, RoundedCornerShape(8.dp))
                    .clickable { 
                        showHeroPicker = !showHeroPicker 
                        if (showHeroPicker) heroSearchQuery = ""
                    }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (selectedHero != null) {
                    RoomIcon(selectedHero.third, 14)
                    Spacer(modifier = Modifier.width(6.dp))
                }
                Text("Hero:", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall)
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    heroName.ifEmpty { "Select..." },
                    color = Primary400,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold
                )
                Icon(Icons.Default.ArrowDropDown, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
            
            DropdownMenu(
                expanded = showHeroPicker,
                onDismissRequest = { showHeroPicker = false },
                modifier = Modifier
                    .width(220.dp)
                    .heightIn(max = 400.dp)
                    .background(Dark400)
                    .border(1.dp, Dark100)
            ) {
                // Search field inside dropdown
                OutlinedTextField(
                    value = heroSearchQuery,
                    onValueChange = { heroSearchQuery = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    placeholder = { Text("Search...", fontSize = 12.sp, color = Color.White.copy(alpha = 0.4f)) },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodySmall.copy(color = Color.White),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary400,
                        unfocusedBorderColor = Dark100,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    )
                )
                
                if (filteredHeroes.isEmpty()) {
                    DropdownMenuItem(
                        text = { Text("No results", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp) },
                        onClick = { },
                        enabled = false
                    )
                } else {
                    filteredHeroes.take(20).forEach { (id, name, room) ->
                        DropdownMenuItem(
                            text = { 
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    RoomIcon(room, 12)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        name, 
                                        color = if (name == heroName) Primary400 else Color.White,
                                        fontWeight = if (name == heroName) FontWeight.Bold else FontWeight.Normal
                                    ) 
                                }
                            },
                            onClick = { 
                                onHeroChange(name)
                                showHeroPicker = false 
                            }
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.width(16.dp))

        // Import Button
        Button(
            onClick = onImport,
            colors = ButtonDefaults.buttonColors(containerColor = Primary400),
            shape = RoundedCornerShape(8.dp),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Icon(Icons.Default.FileUpload, null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Import", fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.width(8.dp))
        
        // Refresh Button
        IconButton(
            onClick = onRefresh,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(DarkSurface)
                .size(36.dp)
        ) { 
            Icon(Icons.Default.Refresh, "Refresh", tint = Color.White, modifier = Modifier.size(20.dp)) 
        }
    }
}