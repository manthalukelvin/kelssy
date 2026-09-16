package com.my24hours.app.ui.screens.planner

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.my24hours.app.ui.viewmodel.TasksViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlannerScreen(vm: TasksViewModel = hiltViewModel()) {
    val date by vm.date.collectAsState()
    val tasks by vm.tasks.collectAsState()
    val week = (0..6).map { LocalDate.now().plusDays(it.toLong()) }

    Scaffold(topBar = { TopAppBar(title = { Text("Planner") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            ScrollableTabRow(selectedTabIndex = week.indexOf(date).coerceAtLeast(0)) {
                week.forEach { d ->
                    Tab(
                        selected = d == date,
                        onClick = { vm.setDate(d) },
                        text = { Text(d.format(DateTimeFormatter.ofPattern("EEE d"))) }
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            if (tasks.isEmpty()) {
                Text("Nothing planned. Add tasks on the Tasks tab.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(tasks, key = { it.id }) { task ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text(task.title, fontWeight = FontWeight.Medium)
                                Text(
                                    "${task.scheduledStart?.toLocalTime() ?: "unscheduled"} · ${task.estimatedDurationMinutes} min" +
                                        if (task.completed) " · done" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
