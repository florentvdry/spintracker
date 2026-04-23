package spintracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import spintracker.data.AppState
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
    onDataDeleted: () -> Unit = {}
) {
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var serverStatus by remember { mutableStateOf<String>("checking") }
    var appVersion by remember { mutableStateOf("1.0.0") }
    var databases by remember { mutableStateOf<List<DatabaseInfo>>(emptyList()) }
    var loadingDatabases by remember { mutableStateOf(true) }
    var creatingDb by remember { mutableStateOf(false) }
    var newDbName by remember { mutableStateOf("") }
    var editingDbId by remember { mutableStateOf<String?>(null) }
    var editingDbName by remember { mutableStateOf("") }
    var exportLoading by remember { mutableStateOf(false) }
    var language by remember { mutableStateOf("en") }
    
    val scope = rememberCoroutineScope()
    val editFocusRequester = remember { FocusRequester() }

    suspend fun loadVersion() {
        appVersion = appState.getAppVersion()
    }

    suspend fun checkStatus() {
        serverStatus = if (appState.checkServerStatus()) "active" else "inactive"
    }

    suspend fun loadDatabases() {
        loadingDatabases = true
        databases = appState.getDatabases()
        loadingDatabases = false
    }
    
    LaunchedEffect(Unit) {
        loadVersion()
        loadDatabases()
        checkStatus()
    }
    
    LaunchedEffect(refreshKey) {
        loadDatabases()
        checkStatus()
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
            onLanguageChange = { language = it }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        MultipleDatabasesSection(
            databases = databases,
            loadingDatabases = loadingDatabases,
            creatingDb = creatingDb,
            newDbName = newDbName,
            editingDbId = editingDbId,
            editingDbName = editingDbName,
            onCreateDatabase = {
                scope.launch {
                    if (newDbName.trim().isEmpty()) return@launch
                    creatingDb = true
                    val result = appState.createDatabase(newDbName.trim())
                    if (result.isSuccess) {
                        newDbName = ""
                        loadDatabases()
                    }
                    creatingDb = false
                }
            },
            onNewDbNameChange = { newDbName = it },
            onSetActive = { dbId ->
                scope.launch {
                    val result = appState.setActiveDatabase(dbId)
                    if (result.isSuccess) {
                        loadDatabases()
                    }
                }
            },
            onDelete = { db ->
                scope.launch {
                    if (databases.size <= 1) return@launch
                    if (db.isActive) return@launch
                    val result = appState.deleteDatabase(db.id)
                    if (result.isSuccess) {
                        loadDatabases()
                    }
                }
            },
            onStartEditing = { db ->
                editingDbId = db.id
                editingDbName = db.name
            },
            onRename = { db ->
                scope.launch {
                    if (editingDbName.trim().isEmpty()) return@launch
                    val result = appState.renameDatabase(db.id, editingDbName.trim())
                    if (result.isSuccess) {
                        editingDbId = null
                        editingDbName = ""
                        loadDatabases()
                    }
                }
            },
            onCancelEditing = {
                editingDbId = null
                editingDbName = ""
            },
            onEditNameChange = { editingDbName = it },
            editFocusRequester = editFocusRequester
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        DatabaseSection(
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
        
        ServerSection(serverStatus = serverStatus)
        
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
fun GeneralSection(language: String, onLanguageChange: (String) -> Unit) {
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
        }
    }
}

@Composable
fun MultipleDatabasesSection(
    databases: List<DatabaseInfo>,
    loadingDatabases: Boolean,
    creatingDb: Boolean,
    newDbName: String,
    editingDbId: String?,
    editingDbName: String,
    onCreateDatabase: () -> Unit,
    onNewDbNameChange: (String) -> Unit,
    onSetActive: (String) -> Unit,
    onDelete: (DatabaseInfo) -> Unit,
    onStartEditing: (DatabaseInfo) -> Unit,
    onRename: (DatabaseInfo) -> Unit,
    onCancelEditing: () -> Unit,
    onEditNameChange: (String) -> Unit,
    editFocusRequester: FocusRequester
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "Multiple Databases",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Create and manage multiple databases",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = newDbName,
                    onValueChange = onNewDbNameChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Database name", fontSize = 13.sp, color = Color.White.copy(alpha = 0.4f)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onCreateDatabase() }),
                    textStyle = MaterialTheme.typography.bodySmall.copy(color = Color.White),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary400,
                        unfocusedBorderColor = Dark100,
                        focusedContainerColor = Dark200,
                        unfocusedContainerColor = Dark200
                    ),
                    shape = RoundedCornerShape(8.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Button(
                    onClick = onCreateDatabase,
                    enabled = newDbName.trim().isEmpty() || creatingDb,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary400,
                        disabledContainerColor = Primary400.copy(alpha = 0.5f)
                    ),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    if (creatingDb) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Create", fontWeight = FontWeight.Bold)
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            if (loadingDatabases) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = Primary400,
                        modifier = Modifier.size(24.dp)
                    )
                }
            } else {
                databases.forEach { db ->
                    DatabaseRow(
                        db = db,
                        isEditing = editingDbId == db.id,
                        editingName = editingDbName,
                        onSetActive = { onSetActive(db.id) },
                        onDelete = { onDelete(db) },
                        onStartEditing = { onStartEditing(db) },
                        onRename = { onRename(db) },
                        onCancelEditing = onCancelEditing,
                        onEditNameChange = onEditNameChange,
                        editFocusRequester = editFocusRequester
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
fun DatabaseRow(
    db: DatabaseInfo,
    isEditing: Boolean,
    editingName: String,
    onSetActive: () -> Unit,
    onDelete: () -> Unit,
    onStartEditing: () -> Unit,
    onRename: () -> Unit,
    onCancelEditing: () -> Unit,
    onEditNameChange: (String) -> Unit,
    editFocusRequester: FocusRequester
) {
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
                tint = if (db.isActive) SuccessGreen else Color.White.copy(alpha = 0.4f),
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        
        Column(modifier = Modifier.weight(1f)) {
            if (isEditing) {
                OutlinedTextField(
                    value = editingName,
                    onValueChange = onEditNameChange,
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(editFocusRequester),
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodySmall.copy(color = Color.White),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary400,
                        unfocusedBorderColor = Dark100,
                        focusedContainerColor = Dark200,
                        unfocusedContainerColor = Dark200
                    ),
                    shape = RoundedCornerShape(8.dp)
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        db.name,
                        color = Color.White,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.weight(1f)
                    )
                    if (db.isActive) {
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
                }
                Text(
                    "Created ${formatDate(db.createdAt)}",
                    color = Color.White.copy(alpha = 0.5f),
                    fontSize = 12.sp
                )
            }
        }
        
        Spacer(modifier = Modifier.width(12.dp))
        
        if (!db.isActive) {
            if (isEditing) {
                IconButton(onClick = onRename, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Check, null, tint = SuccessGreen, modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = onCancelEditing, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(18.dp))
                }
            } else {
                IconButton(onClick = onStartEditing, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Edit, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(18.dp))
                }
            }
            
            if (!isEditing) {
                Button(
                    onClick = onSetActive,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Primary400),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.height(32.dp)
                ) {
                    Text("Set Active", color = Primary400, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
                Spacer(modifier = Modifier.width(8.dp))
            }
            
            IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Default.Delete, null, tint = ErrorRed, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
fun DatabaseSection(onExport: () -> Unit, onDeleteAll: () -> Unit, exportLoading: Boolean) {
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
            
            SettingRow(
                icon = Icons.Default.Download,
                title = "Export Data",
                description = "Download all hands as JSON"
            ) {
                Button(
                    onClick = onExport,
                    enabled = exportLoading,
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
            }
            
            SettingRow(
                icon = Icons.Default.DeleteForever,
                title = "Delete All Data",
                description = "Permanently delete all hands and statistics"
            ) {
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

@Composable
fun ServerSection(serverStatus: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "Server",
                color = Color.White.copy(alpha = 0.4f),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            SettingRow(
                icon = Icons.Default.Dns,
                title = "Server Status",
                description = "Backend server connection status"
            ) {
                Surface(
                    color = if (serverStatus == "active") SuccessGreen.copy(alpha = 0.2f) else ErrorRed.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        if (serverStatus == "active") "Active" else "Inactive",
                        color = if (serverStatus == "active") SuccessGreen else ErrorRed,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
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

fun formatDate(dateStr: String): String {
    return try {
        val date = java.time.LocalDateTime.parse(dateStr)
        date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    } catch (e: Exception) {
        "?"
    }
}
