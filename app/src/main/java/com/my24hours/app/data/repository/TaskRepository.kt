package com.my24hours.app.data.repository

import com.my24hours.app.data.local.AppDatabase
import com.my24hours.app.data.local.toDomain
import com.my24hours.app.data.local.toEntity
import com.my24hours.app.data.remote.ApiService
import com.my24hours.app.domain.engine.tasksForDate
import com.my24hours.app.domain.model.Task
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Offline-first repository.
 * Room is the source of truth. Sync with the backend is optional and best-effort
 * until the domain is fully live.
 */
@Singleton
class TaskRepository @Inject constructor(
    private val db: AppDatabase,
    private val api: ApiService
) {
    private val dao = db.taskDao()

    fun observeAll(): Flow<List<Task>> =
        dao.observeAll().map { list -> list.map { it.toDomain() } }

    fun observeForDate(date: LocalDate): Flow<List<Task>> =
        observeAll().map { all -> tasksForDate(all, date) }

    suspend fun upsert(task: Task) {
        dao.upsert(task.copy(needsSync = true).toEntity())
        // Best-effort remote push (ignore failures while domain is still being set up)
        runCatching {
            if (task.remoteId == null) {
                api.createTask(task.toDto())
            } else {
                api.updateTask(task.remoteId, task.toDto())
            }
        }
    }

    suspend fun delete(id: String) {
        dao.delete(id)
        runCatching { api.deleteTask(id) }
    }

    suspend fun syncFromRemote() {
        runCatching {
            val remote = api.getTasks()
            // Map DTOs → domain → entity and upsert (implementation detail left for next iteration)
        }
    }
}

// Temporary extension – move to a proper mapper later
private fun Task.toDto() = com.my24hours.app.data.remote.TaskDto(
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
