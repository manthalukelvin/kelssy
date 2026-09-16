package com.my24hours.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.my24hours.app.data.remote.ApiService
import com.my24hours.app.data.remote.ChatRequest
import com.my24hours.app.data.remote.PlanRequest
import com.my24hours.app.data.repository.TaskRepository
import com.my24hours.app.data.repository.toDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

data class ChatLine(val fromUser: Boolean, val text: String)

@HiltViewModel
class AssistantViewModel @Inject constructor(
    private val api: ApiService,
    private val repo: TaskRepository
) : ViewModel() {

    private val _messages = MutableStateFlow(
        listOf(ChatLine(false, "Hi. Tell me what you want to do today and I will propose a plan. Nothing is saved until you confirm."))
    )
    val messages: StateFlow<List<ChatLine>> = _messages

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || _busy.value) return
        _messages.value = _messages.value + ChatLine(true, trimmed)
        _busy.value = true
        viewModelScope.launch {
            val date = LocalDate.now().toString()
            val tasks = repo.observeForDate(LocalDate.now()).first().map { it.toDto() }
            val reply = runCatching {
                api.chat(ChatRequest(message = trimmed, date = date, tasks = tasks)).reply
            }.getOrElse { err ->
                "Can't reach the server yet (${err.message}). Your tasks still save on this phone."
            }
            _messages.value = _messages.value + ChatLine(false, reply)
            _busy.value = false
        }
    }

    fun planToday(freeText: String = "Plan a balanced work day") {
        _busy.value = true
        viewModelScope.launch {
            val date = LocalDate.now()
            val result = runCatching {
                api.planDay(
                    PlanRequest(
                        date = date.toString(),
                        preferences = emptyMap(),
                        existingTasks = repo.observeForDate(date).first().map { it.toDto() },
                        freeText = freeText
                    )
                )
            }.getOrNull()
            if (result == null) {
                _messages.value = _messages.value + ChatLine(
                    false,
                    "Planner is offline until https://24hrs.myjournalplus.com/api is live. You can still add tasks on the Tasks tab."
                )
            } else {
                result.tasks.take(8).forEach { dto ->
                    val start = dto.scheduledStart?.substringAfter("T")?.take(5) ?: "09:00"
                    val h = start.substringBefore(":").toIntOrNull() ?: 9
                    val m = start.substringAfter(":").toIntOrNull() ?: 0
                    repo.addTask(
                        title = dto.title,
                        date = date,
                        startHour = h,
                        startMinute = m,
                        durationMinutes = dto.estimatedDurationMinutes
                    )
                }
                _messages.value = _messages.value + ChatLine(
                    false,
                    result.summary.ifBlank { "Added ${result.tasks.size} planned tasks for today." }
                )
            }
            _busy.value = false
        }
    }
}
