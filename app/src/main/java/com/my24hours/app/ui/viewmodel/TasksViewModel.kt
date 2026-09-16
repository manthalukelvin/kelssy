package com.my24hours.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.my24hours.app.data.repository.TaskRepository
import com.my24hours.app.domain.model.Task
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class TasksViewModel @Inject constructor(
    private val repo: TaskRepository
) : ViewModel() {

    private val selectedDate = MutableStateFlow(LocalDate.now())
    val date: StateFlow<LocalDate> = selectedDate

    val tasks: StateFlow<List<Task>> = selectedDate
        .flatMapLatest { repo.observeForDate(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val allTasks: StateFlow<List<Task>> = repo.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setDate(date: LocalDate) {
        selectedDate.value = date
    }

    fun addTask(
        title: String,
        startHour: Int = 9,
        startMinute: Int = 0,
        durationMinutes: Int = 60,
        recurring: Boolean = false,
        recurrenceRule: String? = null
    ) {
        viewModelScope.launch {
            repo.addTask(
                title = title,
                date = selectedDate.value,
                startHour = startHour,
                startMinute = startMinute,
                durationMinutes = durationMinutes,
                recurring = recurring,
                recurrenceRule = recurrenceRule
            )
        }
    }

    fun toggle(id: String) {
        viewModelScope.launch { repo.toggleComplete(id) }
    }

    fun delete(id: String) {
        viewModelScope.launch { repo.delete(id) }
    }
}
