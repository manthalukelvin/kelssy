package com.my24hours.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.my24hours.app.data.repository.HabitRepository
import com.my24hours.app.domain.model.Habit
import com.my24hours.app.domain.model.HabitCompletion
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class HabitsViewModel @Inject constructor(
    private val repo: HabitRepository
) : ViewModel() {

    val habits: StateFlow<List<Habit>> = repo.observeHabits()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val todayCompletions: StateFlow<List<HabitCompletion>> =
        repo.observeCompletions(LocalDate.now())
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun add(name: String) {
        viewModelScope.launch { repo.addHabit(name) }
    }

    fun toggle(habitId: String, currentlyDone: Boolean) {
        viewModelScope.launch {
            if (currentlyDone) repo.uncomplete(habitId, LocalDate.now())
            else repo.toggleToday(habitId, LocalDate.now())
        }
    }
}
