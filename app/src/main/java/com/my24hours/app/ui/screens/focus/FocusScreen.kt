package com.my24hours.app.ui.screens.focus

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.my24hours.app.ui.viewmodel.FocusViewModel
import kotlinx.coroutines.flow.collect

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FocusScreen(vm: FocusViewModel = hiltViewModel()) {
    val running by vm.running.collectAsState()
    val elapsed by vm.elapsedSec.collectAsState()
    val planned by vm.plannedMin.collectAsState()
    val dndGranted by vm.dndGranted.collectAsState()
    val remaining = (planned * 60 - elapsed).coerceAtLeast(0)
    val mm = remaining / 60
    val ss = remaining % 60

    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            vm.refreshDndStatus()
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Focus") }) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "%02d:%02d".format(mm, ss),
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                if (running) "Focus active — notifications muted" else "of $planned minutes",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(16.dp))

            if (!dndGranted && !running) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            "For full device impact, allow Do Not Disturb access. This silences other apps while you focus.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { vm.openDndSettings() }) {
                            Text("Grant DND access")
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            if (!running) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(15, 25, 45, 60, 90).forEach { m ->
                        FilterChip(
                            selected = planned == m,
                            onClick = { vm.setPlanned(m) },
                            label = { Text("${m}m") }
                        )
                    }
                }
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = { vm.start() },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Start focus")
                }
                Text(
                    "Starts a persistent session, mutes distractions (if DND granted), and keeps the timer running.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp)
                )
            } else {
                LinearProgressIndicator(
                    progress = { elapsed.toFloat() / (planned * 60).coerceAtLeast(1) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp)
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedButton(
                        onClick = { vm.stop(save = false) },
                        modifier = Modifier.weight(1f)
                    ) { Text("Discard") }
                    Button(
                        onClick = { vm.stop(save = true) },
                        modifier = Modifier.weight(1f)
                    ) { Text("Finish & save") }
                }
            }
        }
    }
}
