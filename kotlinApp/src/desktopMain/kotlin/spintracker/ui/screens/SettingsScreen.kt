package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Update
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import spintracker.data.AppState
import spintracker.data.Database
import spintracker.services.DatabaseInfo
import spintracker.ui.*
import spintracker.ui.components.SettingRow
import java.time.format.DateTimeFormatter

@Composable
fun SettingsScreen(
    appState: AppState,
    refreshKey: Int,
    heroName: String,
    onHeroNameChange: (String) -> Unit,
    onDataDeleted: () -> Unit = {},
    onRefresh: () -> Unit = {}
) {
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var appVersion by remember { mutableStateOf("1.0.0") }
    var databaseInfo by remember { mutableStateOf<DatabaseInfo?>(null) }
    var loadingDatabase by remember { mutableStateOf(true) }
    var exportLoading by remember { mutableStateOf(false) }
    var language by remember { mutableStateOf("en") }
    var autoUpdateEnabled by remember { mutableStateOf(appState.isAutoUpdateEnabled()) }
    
    val scope = rememberCoroutineScope()

    suspend fun loadVersion() {
        appVersion = appState.getAppVersion()
    }

    suspend fun loadDatabase() {
        loadingDatabase = true
        databaseInfo = appState.getDatabaseInfo()
        loadingDatabase = false
    }
    
    LaunchedEffect(Unit) {
        loadVersion()
        loadDatabase()
    }
    
    LaunchedEffect(refreshKey) {
        loadDatabase()
    }
    
    fun formatDate(dateStr: String): String {
        return try {
            val date = java.time.LocalDateTime.parse(dateStr)
            date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        } catch (e: Exception) {
            "?"
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp)
    ) {
        Text(
            "Settings",
            style = MaterialTheme.typography.headlineMedium,
            color = Color.White
        )
        Text(
            "Manage your preferences and database",
            color = Color.White.copy(alpha = 0.5f),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp)
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        GeneralSection(
            language = language,
            onLanguageChange = { language = it },
            autoUpdateEnabled = autoUpdateEnabled,
            onAutoUpdateChange = { enabled ->
                autoUpdateEnabled = enabled
                appState.setAutoUpdateEnabled(enabled)
            }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        DatabaseInfoSection(
            databaseInfo = databaseInfo,
            loadingDatabase = loadingDatabase,
            onExport = {
                scope.launch {
                    exportLoading = true
                    val result = appState.exportData()
                    exportLoading = false
                }
            },
            onDeleteAll = {
                showDeleteConfirm = true
            },
            exportLoading = exportLoading
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        MaintenanceSection(
            onOpenLogs = {
                scope.launch {
                    appState.openLogsFolder()
                }
            }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        AboutSection(appVersion = appVersion)
    }
    
    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Are you absolutely sure?", color = Color.White) },
            text = { 
                Text(
                    "This action cannot be undone. All your hands, tournaments and calculated statistics will be lost forever.",
                    color = Color.White.copy(alpha = 0.7f)
                ) 
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            val result = appState.deleteAllHands()
                            if (result.isSuccess) {
                                showDeleteConfirm = false
                                onDataDeleted()
                            }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = ErrorRed)
                ) {
                    Text("Yes, Delete Everything", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("Cancel", color = Color.White)
                }
            },
            containerColor = Dark400,
            titleContentColor = Color.White,
            textContentColor = Color.White.copy(alpha = 0.7f)
        )
    }
}

@Composable
fun GeneralSection(
    language: String,
    onLanguageChange: (String) -> Unit,
    autoUpdateEnabled: Boolean = true,
    onAutoUpdateChange: (Boolean) -> Unit = {}
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "General",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            SettingRow(
                icon = Icons.Default.Language,
                title = "Language",
                description = "Choose your preferred language"
            ) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Dark200)
                        .border(1.dp, Dark100, RoundedCornerShape(8.dp))
                ) {
                    Button(
                        onClick = { onLanguageChange("en") },
                        enabled = language != "en",
                        colors = if (language == "en") {
                            ButtonDefaults.buttonColors(containerColor = InfoBlue)
                        } else {
                            ButtonDefaults.buttonColors(containerColor = Color.Transparent)
                        },
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        modifier = Modifier.height(36.dp)
                    ) {
                        Text("English", fontSize = 13.sp)
                    }
                    Spacer(modifier = Modifier.width(1.dp))
                    Button(
                        onClick = { onLanguageChange("fr") },
                        enabled = language != "fr",
                        colors = if (language == "fr") {
                            ButtonDefaults.buttonColors(containerColor = InfoBlue)
                        } else {
                            ButtonDefaults.buttonColors(containerColor = Color.Transparent)
                        },
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        modifier = Modifier.height(36.dp)
                    ) {
                        Text("Français", fontSize = 13.sp)
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Auto-Update",
                        color = Color.White,
                        fontWeight = FontWeight.Medium,
                        fontSize = 14.sp
                    )
                    Text(
                        "Automatically check for updates",
                        color = Color.White.copy(alpha = 0.5f),
                        fontSize = 12.sp
                    )
                }
                Switch(
                    checked = autoUpdateEnabled,
                    onCheckedChange = { onAutoUpdateChange(it) },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Primary400,
                        checkedTrackColor = Primary400.copy(alpha = 0.5f),
                        uncheckedThumbColor = Color.White,
                        uncheckedTrackColor = Dark200
                    )
                )
            }
        }
    }
}

@Composable
fun DatabaseInfoSection(
    databaseInfo: DatabaseInfo?,
    loadingDatabase: Boolean,
    onExport: () -> Unit,
    onDeleteAll: () -> Unit,
    exportLoading: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "Database",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            if (loadingDatabase) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = Primary400,
                        modifier = Modifier.size(24.dp)
                    )
                }
            } else {
                databaseInfo?.let { db ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(Dark200, RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Storage,
                                contentDescription = null,
                                tint = SuccessGreen,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    db.name,
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Surface(
                                    color = SuccessGreen.copy(alpha = 0.2f),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text(
                                        "Active",
                                        color = SuccessGreen,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                    )
                                }
                            }
                            Text(
                                "${db.handsCount} hands",
                                color = Color.White.copy(alpha = 0.5f),
                                fontSize = 12.sp
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    Divider(color = Color.White.copy(alpha = 0.1f))
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Button(
                            onClick = onExport,
                            enabled = !exportLoading,
                            colors = ButtonDefaults.buttonColors(containerColor = Dark200),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            if (exportLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(Icons.Default.Download, null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Export", fontWeight = FontWeight.Medium)
                            }
                        }
                        
                        Button(
                            onClick = onDeleteAll,
                            colors = ButtonDefaults.buttonColors(containerColor = ErrorRed.copy(alpha = 0.2f)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, ErrorRed.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            Icon(Icons.Default.DeleteForever, null, tint = ErrorRed, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Delete All", color = ErrorRed, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MaintenanceSection(onOpenLogs: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "Maintenance & Support",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            SettingRow(
                icon = Icons.Default.FolderOpen,
                title = "Open Logs Folder",
                description = "Open folder containing log files"
            ) {
                Button(
                    onClick = onOpenLogs,
                    colors = ButtonDefaults.buttonColors(containerColor = Dark200),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Icon(Icons.Default.FolderOpen, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Open Logs", fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
fun AboutSection(appVersion: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "About",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                "SpinTracker",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            Text(
                "v$appVersion",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
            Text(
                "A modern poker tracking application for Spin & Go analysis",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 12.dp)
            )
        }
    }
}
