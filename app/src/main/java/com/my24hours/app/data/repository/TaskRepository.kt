package com.my24hours.app.data.repository

import android.content.Context
import com.my24hours.app.data.local.AppDatabase
import com.my24hours.app.data.local.notification.NotificationHelper
import com.my24hours.app.data.local.toDomain
import com.my24hours.app.data.local.toEntity
import com.my24hours.app.data.remote.ApiService
import com.my24hours.app.data.remote.TaskDto
import com.my24hours.app.domain.engine.tasksForDate
import com.my24hours.app.domain.model.FocusSession
import com.my24hours.app.domain.model.Task
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TaskRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val db: AppDatabase,
    private val api: ApiService
) {
    private val dao = db.taskDao()
    private val focusDao = db.focusSessionDao()

    fun observeAll(): Flow<List<Task>> =
        dao.observeAll().map { list -> list.map { it.toDomain() } }

    fun observeForDate(date: LocalDate): Flow<List<Task>> =
        observeAll().map { all -> tasksForDate(all, date) }

    fun observeFocusSessions(): Flow<List<FocusSession>> =
        focusDao.observeAll().map { list -> list.map { it.toDomain() } }

    suspend fun addTask(
        title: String,
        date: LocalDate,
        startHour: Int = 9,
        startMinute: Int = 0,
        durationMinutes: Int = 60,
        notes: String = "",
        recurring: Boolean = false,
        recurrenceRule: String? = null
    ): Task {
        val start = date.atTime(startHour, startMinute).atOffset(
            java.time.ZoneId.systemDefault().rules.getOffset(date.atStartOfDay())
        )
        val task = Task(
            id = "task_${UUID.randomUUID()}",
            title = title.trim(),
            notes = notes,
            estimatedDurationMinutes = durationMinutes,
            scheduledStart = start,
            scheduledEnd = start.plusMinutes(durationMinutes.toLong()),
            date = date,
            recurring = recurring,
            recurrenceRule = if (recurring) recurrenceRule else null,
            needsSync = true
        )
        dao.upsert(task.toEntity())
        rescheduleAlarms()
        runCatching { api.createTask(task.toDto()) }
        return task
    }

    suspend fun toggleComplete(id: String) {
        val existing = dao.getById(id)?.toDomain() ?: return
        val updated = existing.copy(
            completed = !existing.completed,
            completedAt = if (!existing.completed) OffsetDateTime.now() else null,
            updatedAt = OffsetDateTime.now(),
            needsSync = true
        )
        dao.upsert(updated.toEntity())
        rescheduleAlarms()
        runCatching { api.updateTask(updated.remoteId ?: updated.id, updated.toDto()) }
    }

    suspend fun delete(id: String) {
        dao.delete(id)
        rescheduleAlarms()
        runCatching { api.deleteTask(id) }
    }

    suspend fun saveFocus(session: FocusSession) {
        focusDao.upsert(session.toEntity())
    }

    private suspend fun rescheduleAlarms() {
        val all = dao.getAll().map { it.toDomain() }
        NotificationHelper.scheduleTaskReminders(context, tasksForDate(all, LocalDate.now()))
    }

    suspend fun refreshAlarms() = rescheduleAlarms()
}

fun Task.toDto() = TaskDto(
    id = remoteId ?: id,
    title = title,
    description = description,
    category = category.name,
    priority = priority.name,
    estimatedDurationMinutes = estimatedDurationMinutes,
    scheduledStart = scheduledStart?.toString(),
    scheduledEnd = scheduledEnd?.toString(),
    deadline = deadline?.toString(),
    completed = completed,
    reminderEnabled = reminderEnabled,
    reminderMinutesBefore = reminderMinutesBefore,
    recurring = recurring,
    recurrenceRule = recurrenceRule,
    notes = notes,
    allowOverlap = allowOverlap,
    date = date.toString(),
    fixed = fixed
)
