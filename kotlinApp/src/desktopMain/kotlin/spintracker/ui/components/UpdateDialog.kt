package spintracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import spintracker.models.UpdateInfo
import spintracker.services.UpdateDownloader
import spintracker.services.UpdateInstaller
import spintracker.services.DownloadProgress
import spintracker.services.InstallResult
import spintracker.ui.Dark400
import spintracker.ui.DarkSurface
import spintracker.ui.Primary400
import java.io.File

@Composable
fun UpdateDialog(
    updateInfo: UpdateInfo,
    currentVersion: String,
    onDismiss: () -> Unit,
    onInstallComplete: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var dialogState by remember { mutableStateOf<UpdateDialogState>(UpdateDialogState.Review) }
    var downloadProgress by remember { mutableFloatStateOf(0f) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    
    val downloader = remember { UpdateDownloader() }
    val installer = remember { UpdateInstaller() }
    
    fun startDownloadAndInstall() {
        scope.launch {
            dialogState = UpdateDialogState.Downloading
            
            val tempFile = File.createTempFile("spintracker_update_", ".tmp")
            tempFile.deleteOnExit()
            
            val downloadResult = downloader.download(
                url = updateInfo.downloadUrl,
                destination = tempFile
            ) { progress ->
                downloadProgress = progress.progress
            }
            
            if (downloadResult.isFailure) {
                dialogState = UpdateDialogState.Error(downloadResult.exceptionOrNull()?.message ?: "Download failed")
                return@launch
            }
            
            val downloadedFile = downloadResult.getOrNull() ?: return@launch
            dialogState = UpdateDialogState.Installing
            
            val installResult = withContext(Dispatchers.IO) {
                CompletableDeferred<InstallResult>().also { deferred ->
                    installer.install(downloadedFile) { result ->
                        deferred.complete(result)
                    }
                }.await()
            }
            
            when (installResult) {
                is InstallResult.Success -> {
                    statusMessage = "Update installed. Restarting..."
                    kotlinx.coroutines.delay(1000)
                    onInstallComplete()
                }
                is InstallResult.Failure -> {
                    dialogState = UpdateDialogState.Error(installResult.message)
                }
            }
        }
    }
    
    Dialog(onDismissRequest = { if (dialogState !is UpdateDialogState.Downloading && dialogState !is UpdateDialogState.Installing) onDismiss() }) {
        Surface(
            modifier = Modifier
                .width(500.dp)
                .heightIn(max = 600.dp),
            shape = RoundedCornerShape(16.dp),
            color = Dark400
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            "Update Available",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp
                        )
                        Text(
                            "Version ${updateInfo.version}",
                            color = Color.White.copy(alpha = 0.6f),
                            fontSize = 14.sp
                        )
                    }
                    if (dialogState !is UpdateDialogState.Downloading && dialogState !is UpdateDialogState.Installing) {
                        IconButton(onClick = { onDismiss() }) {
                            Icon(Icons.Default.Close, null, tint = Color.White.copy(alpha = 0.5f))
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(20.dp))
                
                when (val state = dialogState) {
                    is UpdateDialogState.Review -> {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            colors = CardDefaults.cardColors(containerColor = DarkSurface),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .verticalScroll(rememberScrollState())
                                    .padding(16.dp)
                            ) {
                                Text(
                                    "What's New:",
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.sp
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    updateInfo.changelog,
                                    color = Color.White.copy(alpha = 0.7f),
                                    fontSize = 13.sp,
                                    lineHeight = 20.sp
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(20.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            TextButton(onClick = { onDismiss() }) {
                                Text("Later", color = Color.White.copy(alpha = 0.7f))
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Button(
                                onClick = { startDownloadAndInstall() },
                                colors = ButtonDefaults.buttonColors(containerColor = Primary400),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(Icons.Default.Download, null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Download & Install")
                            }
                        }
                    }
                    
                    is UpdateDialogState.Downloading -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                CircularProgressIndicator(
                                    progress = downloadProgress,
                                    modifier = Modifier.size(64.dp),
                                    color = Primary400,
                                    strokeWidth = 4.dp
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    "Downloading... ${(downloadProgress * 100).toInt()}%",
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                    
                    is UpdateDialogState.Installing -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(64.dp),
                                    color = Primary400,
                                    strokeWidth = 4.dp
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    "Installing...",
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                    
                    is UpdateDialogState.Error -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.Error,
                                    null,
                                    tint = Color(0xFFef4444),
                                    modifier = Modifier.size(48.dp)
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    state.message,
                                    color = Color.White,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(20.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            Button(
                                onClick = { onDismiss() },
                                colors = ButtonDefaults.buttonColors(containerColor = DarkSurface),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Close")
                            }
                        }
                    }
                }
            }
        }
    }
}

sealed class UpdateDialogState {
    object Review : UpdateDialogState()
    object Downloading : UpdateDialogState()
    object Installing : UpdateDialogState()
    data class Error(val message: String) : UpdateDialogState()
}
