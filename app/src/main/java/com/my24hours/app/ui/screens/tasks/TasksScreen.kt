package com.my24hours.app.ui.screens.tasks

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.my24hours.app.ui.viewmodel.TasksViewModel
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(vm: TasksViewModel = hiltViewModel()) {
    val tasks by vm.tasks.collectAsState()
    val date by vm.date.collectAsState()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Tasks · ${date.format(DateTimeFormatter.ofPattern("d MMM"))}") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add")
            }
        }
    ) { padding ->
        if (tasks.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("No tasks for this day.\nTap + to add one.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(tasks, key = { it.id }) { task ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = task.completed, onCheckedChange = { vm.toggle(task.id) })
                            Column(Modifier.weight(1f)) {
                                Text(task.title, fontWeight = FontWeight.Medium)
                                Text(
                                    buildString {
                                        task.scheduledStart?.toLocalTime()?.let {
                                            append(it.format(DateTimeFormatter.ofPattern("HH:mm")))
                                            append(" · ")
                                        }
                                        append("${task.estimatedDurationMinutes} min")
                                        if (task.recurring || task.seriesId != null) append(" · repeats")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { vm.delete(task.id) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete")
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddTaskDialog(
            onDismiss = { showAdd = false },
            onSave = { title, hour, minute, duration, recurring, rule ->
                vm.addTask(title, hour, minute, duration, recurring, rule)
                showAdd = false
            }
        )
    }
}

@Composable
private fun AddTaskDialog(
    onDismiss: () -> Unit,
    onSave: (String, Int, Int, Int, Boolean, String?) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var hour by remember { mutableStateOf("09") }
    var minute by remember { mutableStateOf("00") }
    var duration by remember { mutableStateOf("60") }
    var recurring by remember { mutableStateOf(false) }
    var rule by remember { mutableStateOf("daily") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New task") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(hour, { hour = it }, label = { Text("Hour") }, modifier = Modifier.weight(1f), singleLine = true)
                    OutlinedTextField(minute, { minute = it }, label = { Text("Min") }, modifier = Modifier.weight(1f), singleLine = true)
                    OutlinedTextField(duration, { duration = it }, label = { Text("Mins") }, modifier = Modifier.weight(1f), singleLine = true)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(recurring, { recurring = it })
                    Text("Repeat")
                }
                if (recurring) {
                    val options = listOf("daily", "weekly", "monthly", "every:2:days")
                    options.forEach { opt ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = rule == opt, onClick = { rule = opt })
                            Text(opt)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = title.isNotBlank(),
                onClick = {
                    onSave(
                        title.trim(),
                        hour.toIntOrNull() ?: 9,
                        minute.toIntOrNull() ?: 0,
                        duration.toIntOrNull() ?: 60,
                        recurring,
                        if (recurring) rule else null
                    )
                }
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
