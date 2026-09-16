package com.my24hours.app.ui.screens.focus

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.my24hours.app.ui.viewmodel.FocusViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FocusScreen(vm: FocusViewModel = hiltViewModel()) {
    val running by vm.running.collectAsState()
    val elapsed by vm.elapsedSec.collectAsState()
    val planned by vm.plannedMin.collectAsState()
    val remaining = (planned * 60 - elapsed).coerceAtLeast(0)
    val mm = remaining / 60
    val ss = remaining % 60

    Scaffold(topBar = { TopAppBar(title = { Text("Focus") }) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "%02d:%02d".format(mm, ss),
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold
            )
            Text("of $planned minutes", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))
            if (!running) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(15, 25, 45, 60).forEach { m ->
                        FilterChip(selected = planned == m, onClick = { vm.setPlanned(m) }, label = { Text("${m}m") })
                    }
                }
                Spacer(Modifier.height(24.dp))
                Button(onClick = { vm.start() }) { Text("Start") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { vm.stop(save = false) }) { Text("Discard") }
                    Button(onClick = { vm.stop(save = true) }) { Text("Finish & save") }
                }
            }
        }
    }
}
