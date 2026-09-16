package com.my24hours.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.my24hours.app.data.repository.TaskInput
import com.my24hours.app.data.repository.TaskRepository
import com.my24hours.app.domain.model.Priority
import com.my24hours.app.domain.model.Task
import com.my24hours.app.domain.model.TaskCategory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
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

    fun addTask(input: TaskInput) {
        viewModelScope.launch { repo.addTask(input) }
    }

    fun toggle(task: Task) {
        viewModelScope.launch { repo.toggleComplete(task) }
    }

    fun delete(task: Task) {
        viewModelScope.launch { repo.delete(task) }
    }
}
