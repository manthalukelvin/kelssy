package com.my24hours.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.my24hours.app.data.repository.TaskRepository
import com.my24hours.app.domain.model.FocusSession
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class FocusViewModel @Inject constructor(
    private val repo: TaskRepository
) : ViewModel() {

    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running

    private val _elapsedSec = MutableStateFlow(0)
    val elapsedSec: StateFlow<Int> = _elapsedSec

    private val _plannedMin = MutableStateFlow(25)
    val plannedMin: StateFlow<Int> = _plannedMin

    private var job: Job? = null
    private var startedAt: OffsetDateTime? = null

    fun setPlanned(minutes: Int) {
        if (!_running.value) _plannedMin.value = minutes.coerceIn(5, 180)
    }

    fun start() {
        if (_running.value) return
        startedAt = OffsetDateTime.now()
        _running.value = true
        job = viewModelScope.launch {
            while (_running.value) {
                delay(1000)
                _elapsedSec.value += 1
            }
        }
    }

    fun stop(save: Boolean) {
        job?.cancel()
        _running.value = false
        if (save && startedAt != null) {
            val minutes = (_elapsedSec.value / 60).coerceAtLeast(1)
            viewModelScope.launch {
                repo.saveFocus(
                    FocusSession(
                        id = "focus_${UUID.randomUUID()}",
                        taskTitle = "Focus session",
                        startedAt = startedAt!!,
                        endedAt = OffsetDateTime.now(),
                        plannedMinutes = _plannedMin.value,
                        durationMinutes = minutes,
                        completed = true
                    )
                )
            }
        }
        _elapsedSec.value = 0
        startedAt = null
    }
}
