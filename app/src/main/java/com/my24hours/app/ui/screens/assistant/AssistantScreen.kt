package com.my24hours.app.ui.screens.assistant

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.my24hours.app.ui.viewmodel.AssistantViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssistantScreen(vm: AssistantViewModel = hiltViewModel()) {
    val messages by vm.messages.collectAsState()
    val busy by vm.busy.collectAsState()
    var input by remember { mutableStateOf("") }

    Scaffold(topBar = { TopAppBar(title = { Text("Assistant") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                Modifier.weight(1f).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages) { line ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = if (line.fromUser)
                                MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Text(line.text, Modifier.padding(12.dp))
                    }
                }
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Ask or describe your day") },
                    enabled = !busy
                )
            }
            Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { vm.planToday(input.ifBlank { "Plan a balanced work day" }) }, enabled = !busy) {
                    Text("Plan today")
                }
                Button(
                    onClick = {
                        vm.send(input)
                        input = ""
                    },
                    enabled = !busy && input.isNotBlank()
                ) { Text("Send") }
            }
        }
    }
}
