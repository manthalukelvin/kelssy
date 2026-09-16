package com.my24hours.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.my24hours.app.domain.model.*

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val description: String,
    val category: String,
    val priority: String,
    val estimatedDurationMinutes: Int,
    val actualDurationMinutes: Int,
    val scheduledStart: String?,          // ISO-8601
    val scheduledEnd: String?,
    val deadline: String?,
    val completed: Boolean,
    val completedAt: String?,
    val createdAt: String,
    val updatedAt: String,
    val reminderEnabled: Boolean,
    val reminderMinutesBefore: Int,
    val recurring: Boolean,
    val recurrenceRule: String?,
    val notes: String,
    val allowOverlap: Boolean,
    val date: String,                     // YYYY-MM-DD
    val fixed: Boolean,
    val seriesId: String?,
    val remoteId: String?,
    val needsSync: Boolean
)

@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val targetPerWeek: Int,
    val createdAt: String,
    val archived: Boolean,
    val remoteId: String?,
    val needsSync: Boolean
)

@Entity(tableName = "habit_completions")
data class HabitCompletionEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    val date: String,
    val completedAt: String
)

@Entity(tableName = "focus_sessions")
data class FocusSessionEntity(
    @PrimaryKey val id: String,
    val taskId: String?,
    val taskTitle: String,
    val startedAt: String,
    val endedAt: String?,
    val plannedMinutes: Int,
    val durationMinutes: Int,
    val pauseCount: Int,
    val pausedDurationMinutes: Int,
    val completed: Boolean,
    val interruptions: Int
)

// Mappers
fun TaskEntity.toDomain(): Task = Task(
    id = id,
    title = title,
    description = description,
    category = runCatching { TaskCategory.valueOf(category) }.getOrDefault(TaskCategory.OTHER),
    priority = runCatching { Priority.valueOf(priority) }.getOrDefault(Priority.MEDIUM),
    estimatedDurationMinutes = estimatedDurationMinutes,
    actualDurationMinutes = actualDurationMinutes,
    scheduledStart = scheduledStart?.let { java.time.OffsetDateTime.parse(it) },
    scheduledEnd = scheduledEnd?.let { java.time.OffsetDateTime.parse(it) },
    deadline = deadline?.let { java.time.OffsetDateTime.parse(it) },
    completed = completed,
    completedAt = completedAt?.let { java.time.OffsetDateTime.parse(it) },
    createdAt = java.time.OffsetDateTime.parse(createdAt),
    updatedAt = java.time.OffsetDateTime.parse(updatedAt),
    reminderEnabled = reminderEnabled,
    reminderMinutesBefore = reminderMinutesBefore,
    recurring = recurring,
    recurrenceRule = recurrenceRule,
    notes = notes,
    allowOverlap = allowOverlap,
    date = java.time.LocalDate.parse(date),
    fixed = fixed,
    seriesId = seriesId,
    remoteId = remoteId,
    needsSync = needsSync
)

fun Task.toEntity(): TaskEntity = TaskEntity(
    id = id,
    title = title,
    description = description,
    category = category.name,
    priority = priority.name,
    estimatedDurationMinutes = estimatedDurationMinutes,
    actualDurationMinutes = actualDurationMinutes,
    scheduledStart = scheduledStart?.toString(),
    scheduledEnd = scheduledEnd?.toString(),
    deadline = deadline?.toString(),
    completed = completed,
    completedAt = completedAt?.toString(),
    createdAt = createdAt.toString(),
    updatedAt = updatedAt.toString(),
    reminderEnabled = reminderEnabled,
    reminderMinutesBefore = reminderMinutesBefore,
    recurring = recurring,
    recurrenceRule = recurrenceRule,
    notes = notes,
    allowOverlap = allowOverlap,
    date = date.toString(),
    fixed = fixed,
    seriesId = seriesId,
    remoteId = remoteId,
    needsSync = needsSync
)

fun HabitEntity.toDomain(): com.my24hours.app.domain.model.Habit =
    com.my24hours.app.domain.model.Habit(
        id = id,
        name = name,
        description = description,
        icon = icon,
        targetPerWeek = targetPerWeek,
        createdAt = java.time.OffsetDateTime.parse(createdAt),
        archived = archived,
        remoteId = remoteId,
        needsSync = needsSync
    )

fun com.my24hours.app.domain.model.Habit.toEntity(): HabitEntity = HabitEntity(
    id = id,
    name = name,
    description = description,
    icon = icon,
    targetPerWeek = targetPerWeek,
    createdAt = createdAt.toString(),
    archived = archived,
    remoteId = remoteId,
    needsSync = needsSync
)

fun HabitCompletionEntity.toDomain(): com.my24hours.app.domain.model.HabitCompletion =
    com.my24hours.app.domain.model.HabitCompletion(
        id = id,
        habitId = habitId,
        date = java.time.LocalDate.parse(date),
        completedAt = java.time.OffsetDateTime.parse(completedAt)
    )

fun FocusSessionEntity.toDomain(): com.my24hours.app.domain.model.FocusSession =
    com.my24hours.app.domain.model.FocusSession(
        id = id,
        taskId = taskId,
        taskTitle = taskTitle,
        startedAt = java.time.OffsetDateTime.parse(startedAt),
        endedAt = endedAt?.let { java.time.OffsetDateTime.parse(it) },
        plannedMinutes = plannedMinutes,
        durationMinutes = durationMinutes,
        pauseCount = pauseCount,
        pausedDurationMinutes = pausedDurationMinutes,
        completed = completed,
        interruptions = interruptions
    )

fun com.my24hours.app.domain.model.FocusSession.toEntity(): FocusSessionEntity = FocusSessionEntity(
    id = id,
    taskId = taskId,
    taskTitle = taskTitle,
    startedAt = startedAt.toString(),
    endedAt = endedAt?.toString(),
    plannedMinutes = plannedMinutes,
    durationMinutes = durationMinutes,
    pauseCount = pauseCount,
    pausedDurationMinutes = pausedDurationMinutes,
    completed = completed,
    interruptions = interruptions
)
