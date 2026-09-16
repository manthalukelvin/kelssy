package com.my24hours.app.ui.screens.tasks

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import com.my24hours.app.data.repository.TaskInput
import com.my24hours.app.domain.model.Priority
import com.my24hours.app.domain.model.TaskCategory
import com.my24hours.app.ui.viewmodel.TasksViewModel
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(vm: TasksViewModel = hiltViewModel()) {
    val tasks by vm.tasks.collectAsState()
    val date by vm.date.collectAsState()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(title = {
                Text("Tasks · ${date.format(DateTimeFormatter.ofPattern("d MMM"))}")
            })
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add")
            }
        }
    ) { padding ->
        if (tasks.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text(
                    "No tasks for this day.\nTap + to add one.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(tasks, key = { it.id }) { task ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(
                            Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = task.completed,
                                onCheckedChange = { vm.toggle(task) }
                            )
                            Column(Modifier.weight(1f)) {
                                Text(task.title, fontWeight = FontWeight.Medium)
                                Text(
                                    buildString {
                                        task.scheduledStart?.toLocalTime()?.let {
                                            append(it.format(DateTimeFormatter.ofPattern("HH:mm")))
                                            append(" · ")
                                        }
                                        append("${task.estimatedDurationMinutes} min")
                                        append(" · ${task.priority.name}")
                                        append(" · ${task.category.name.lowercase()}")
                                        if (task.recurring || task.seriesId != null) append(" · repeats")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { vm.delete(task) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete")
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AdvancedAddTaskDialog(
            onDismiss = { showAdd = false },
            onSave = { input ->
                vm.addTask(input)
                showAdd = false
            },
            defaultDate = date
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AdvancedAddTaskDialog(
    onDismiss: () -> Unit,
    onSave: (TaskInput) -> Unit,
    defaultDate: java.time.LocalDate
) {
    var title by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var hour by remember { mutableStateOf("09") }
    var minute by remember { mutableStateOf("00") }
    var duration by remember { mutableStateOf("60") }
    var category by remember { mutableStateOf(TaskCategory.WORK) }
    var priority by remember { mutableStateOf(Priority.MEDIUM) }
    var reminderEnabled by remember { mutableStateOf(true) }
    var reminderMins by remember { mutableStateOf("10") }
    var recurring by remember { mutableStateOf(false) }
    var rule by remember { mutableStateOf("daily") }
    var allowOverlap by remember { mutableStateOf(false) }
    var fixed by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New task") },
        text = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    title, { title = it },
                    label = { Text("Title *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    notes, { notes = it },
                    label = { Text("Notes") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                Text("Time & duration", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        hour, { hour = it.filter { c -> c.isDigit() }.take(2) },
                        label = { Text("Hour") }, modifier = Modifier.weight(1f), singleLine = true
                    )
                    OutlinedTextField(
                        minute, { minute = it.filter { c -> c.isDigit() }.take(2) },
                        label = { Text("Min") }, modifier = Modifier.weight(1f), singleLine = true
                    )
                    OutlinedTextField(
                        duration, { duration = it.filter { c -> c.isDigit() }.take(3) },
                        label = { Text("Mins") }, modifier = Modifier.weight(1f), singleLine = true
                    )
                }
                Text("Category", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(
                        TaskCategory.WORK, TaskCategory.STUDY,
                        TaskCategory.HEALTH, TaskCategory.PERSONAL
                    ).forEach { c ->
                        FilterChip(
                            selected = category == c,
                            onClick = { category = c },
                            label = { Text(c.name.lowercase()) }
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(
                        TaskCategory.MEAL, TaskCategory.BREAK,
                        TaskCategory.SLEEP, TaskCategory.OTHER
                    ).forEach { c ->
                        FilterChip(
                            selected = category == c,
                            onClick = { category = c },
                            label = { Text(c.name.lowercase()) }
                        )
                    }
                }
                Text("Priority", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Priority.entries.forEach { p ->
                        FilterChip(
                            selected = priority == p,
                            onClick = { priority = p },
                            label = { Text(p.name.lowercase()) }
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(reminderEnabled, { reminderEnabled = it })
                    Text("Reminder")
                    if (reminderEnabled) {
                        Spacer(Modifier.width(8.dp))
                        OutlinedTextField(
                            reminderMins,
                            { reminderMins = it.filter { c -> c.isDigit() }.take(3) },
                            label = { Text("min before") },
                            modifier = Modifier.width(100.dp),
                            singleLine = true
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(recurring, { recurring = it })
                    Text("Repeat")
                }
                if (recurring) {
                    listOf(
                        "daily" to "Every day",
                        "weekly" to "Every week",
                        "monthly" to "Every month",
                        "every:2:days" to "Every 2 days",
                        "every:3:days" to "Every 3 days",
                        "every:2:weeks" to "Every 2 weeks"
                    ).forEach { (value, label) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = rule == value, onClick = { rule = value })
                            Text(label)
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(fixed, { fixed = it })
                    Text("Fixed time (don't auto-move)")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(allowOverlap, { allowOverlap = it })
                    Text("Allow overlap with other tasks")
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = title.isNotBlank(),
                onClick = {
                    onSave(
                        TaskInput(
                            title = title.trim(),
                            date = defaultDate,
                            startHour = (hour.toIntOrNull() ?: 9).coerceIn(0, 23),
                            startMinute = (minute.toIntOrNull() ?: 0).coerceIn(0, 59),
                            durationMinutes = (duration.toIntOrNull() ?: 60).coerceIn(5, 600),
                            notes = notes.trim(),
                            category = category,
                            priority = priority,
                            reminderEnabled = reminderEnabled,
                            reminderMinutesBefore = (reminderMins.toIntOrNull() ?: 10).coerceIn(0, 180),
                            recurring = recurring,
                            recurrenceRule = if (recurring) rule else null,
                            allowOverlap = allowOverlap,
                            fixed = fixed
                        )
                    )
                }
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
