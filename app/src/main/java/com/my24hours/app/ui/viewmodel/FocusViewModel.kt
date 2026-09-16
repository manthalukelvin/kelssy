package com.my24hours.app.ui.viewmodel

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.my24hours.app.data.local.notification.FocusForegroundService
import com.my24hours.app.data.local.notification.FocusModeHelper
import com.my24hours.app.data.repository.TaskRepository
import com.my24hours.app.domain.model.FocusSession
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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
    @ApplicationContext private val context: Context,
    private val repo: TaskRepository
) : ViewModel() {

    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running

    private val _elapsedSec = MutableStateFlow(0)
    val elapsedSec: StateFlow<Int> = _elapsedSec

    private val _plannedMin = MutableStateFlow(25)
    val plannedMin: StateFlow<Int> = _plannedMin

    private val _dndGranted = MutableStateFlow(FocusModeHelper.hasDndAccess(context))
    val dndGranted: StateFlow<Boolean> = _dndGranted

    private var job: Job? = null
    private var startedAt: OffsetDateTime? = null

    fun refreshDndStatus() {
        _dndGranted.value = FocusModeHelper.hasDndAccess(context)
    }

    fun openDndSettings() {
        FocusModeHelper.openDndSettings(context)
    }

    fun setPlanned(minutes: Int) {
        if (!_running.value) _plannedMin.value = minutes.coerceIn(5, 180)
    }

    fun start() {
        if (_running.value) return
        startedAt = OffsetDateTime.now()
        _running.value = true
        _elapsedSec.value = 0

        // Device-wide impact: foreground service + DND
        val svc = Intent(context, FocusForegroundService::class.java).apply {
            putExtra(FocusForegroundService.EXTRA_PLANNED, _plannedMin.value)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc)
        } else {
            context.startService(svc)
        }
        FocusModeHelper.enableFocusDnd(context)

        job = viewModelScope.launch {
            val total = _plannedMin.value * 60
            while (_running.value && _elapsedSec.value < total) {
                delay(1000)
                _elapsedSec.value += 1
            }
            if (_running.value && _elapsedSec.value >= total) {
                stop(save = true)
            }
        }
    }

    fun stop(save: Boolean) {
        job?.cancel()
        _running.value = false

        // Stop device-wide focus
        context.startService(
            Intent(context, FocusForegroundService::class.java).setAction(FocusForegroundService.ACTION_STOP)
        )
        FocusModeHelper.disableFocusDnd(context)

        if (save && startedAt != null) {
            val minutes = (_elapsedSec.value / 60).coerceAtLeast(0).coerceAtLeast(
                if (_elapsedSec.value > 0) 1 else 0
            )
            if (minutes > 0) {
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
        }
        _elapsedSec.value = 0
        startedAt = null
    }

    override fun onCleared() {
        if (_running.value) stop(save = false)
        super.onCleared()
    }
}
