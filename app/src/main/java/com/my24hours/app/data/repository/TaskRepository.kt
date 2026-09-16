package com.my24hours.app.data.repository

import android.content.Context
import com.my24hours.app.data.local.AppDatabase
import com.my24hours.app.data.local.notification.NotificationHelper
import com.my24hours.app.data.local.toDomain
import com.my24hours.app.data.local.toEntity
import com.my24hours.app.data.remote.ApiService
import com.my24hours.app.data.remote.TaskDto
import com.my24hours.app.domain.engine.isRecurringInstance
import com.my24hours.app.domain.engine.tasksForDate
import com.my24hours.app.domain.model.FocusSession
import com.my24hours.app.domain.model.Priority
import com.my24hours.app.domain.model.Task
import com.my24hours.app.domain.model.TaskCategory
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class TaskInput(
    val title: String,
    val date: LocalDate,
    val startHour: Int = 9,
    val startMinute: Int = 0,
    val durationMinutes: Int = 60,
    val notes: String = "",
    val category: TaskCategory = TaskCategory.OTHER,
    val priority: Priority = Priority.MEDIUM,
    val reminderEnabled: Boolean = true,
    val reminderMinutesBefore: Int = 10,
    val recurring: Boolean = false,
    val recurrenceRule: String? = null,
    val allowOverlap: Boolean = false,
    val fixed: Boolean = false
)

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

    suspend fun addTask(input: TaskInput): Task {
        val start = input.date.atTime(input.startHour, input.startMinute).atOffset(
            java.time.ZoneId.systemDefault().rules.getOffset(input.date.atStartOfDay())
        )
        val task = Task(
            id = "task_${UUID.randomUUID()}",
            title = input.title.trim(),
            notes = input.notes,
            category = input.category,
            priority = input.priority,
            estimatedDurationMinutes = input.durationMinutes,
            scheduledStart = start,
            scheduledEnd = start.plusMinutes(input.durationMinutes.toLong()),
            date = input.date,
            reminderEnabled = input.reminderEnabled,
            reminderMinutesBefore = input.reminderMinutesBefore,
            recurring = input.recurring,
            recurrenceRule = if (input.recurring) input.recurrenceRule else null,
            allowOverlap = input.allowOverlap,
            fixed = input.fixed,
            needsSync = true
        )
        dao.upsert(task.toEntity())
        rescheduleAlarms()
        runCatching { api.createTask(task.toDto()) }
        return task
    }

    /** Toggle complete — works for normal tasks and expanded recurring instances. */
    suspend fun toggleComplete(task: Task) {
        if (isRecurringInstance(task) || task.seriesId != null) {
            // Persist an override row for this date
            val override = task.copy(
                id = if (dao.getById(task.id) != null) task.id else task.id,
                completed = !task.completed,
                completedAt = if (!task.completed) OffsetDateTime.now() else null,
                updatedAt = OffsetDateTime.now(),
                recurring = false,
                recurrenceRule = null,
                seriesId = task.seriesId ?: task.id.substringBeforeLast("_"),
                needsSync = true
            )
            dao.upsert(override.toEntity())
        } else {
            val existing = dao.getById(task.id)?.toDomain() ?: return
            val updated = existing.copy(
                completed = !existing.completed,
                completedAt = if (!existing.completed) OffsetDateTime.now() else null,
                updatedAt = OffsetDateTime.now(),
                needsSync = true
            )
            dao.upsert(updated.toEntity())
            runCatching { api.updateTask(updated.remoteId ?: updated.id, updated.toDto()) }
        }
        rescheduleAlarms()
    }

    /**
     * Delete a task.
     * - Normal task: remove from DB
     * - Recurring template: remove whole series
     * - Recurring instance: store a cancelled override so it no longer appears that day
     */
    suspend fun delete(task: Task) {
        NotificationHelper.cancelTaskAlarms(context, task.id)

        when {
            task.recurring && task.recurrenceRule != null -> {
                // Delete entire series template
                dao.delete(task.id)
                runCatching { api.deleteTask(task.remoteId ?: task.id) }
            }
            isRecurringInstance(task) || task.seriesId != null -> {
                // Cancel just this occurrence by writing a completed+hidden override
                val seriesId = task.seriesId ?: task.id.substringBeforeLast("_")
                val cancelled = task.copy(
                    id = task.id, // stable instance id
                    title = task.title,
                    completed = true,
                    completedAt = OffsetDateTime.now(),
                    notes = (task.notes + " [cancelled]").trim(),
                    recurring = false,
                    recurrenceRule = null,
                    seriesId = seriesId,
                    reminderEnabled = false,
                    needsSync = true,
                    // mark with a special flag via notes; recurrence expander prefers overrides
                )
                dao.upsert(cancelled.toEntity())
            }
            else -> {
                dao.delete(task.id)
                runCatching { api.deleteTask(task.remoteId ?: task.id) }
            }
        }
        rescheduleAlarms()
    }

    suspend fun saveFocus(session: FocusSession) {
        focusDao.upsert(session.toEntity())
    }

    private suspend fun rescheduleAlarms() {
        val all = dao.getAll().map { it.toDomain() }
        // Pass full list — helper expands next 7 days and schedules with clock times
        NotificationHelper.scheduleTaskReminders(context, all)
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
