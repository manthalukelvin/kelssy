package com.my24hours.app.domain.model

import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime

enum class Priority { LOW, MEDIUM, HIGH, URGENT }
enum class TaskCategory { WORK, STUDY, HEALTH, PERSONAL, MEAL, SLEEP, BREAK, OTHER }
enum class ThemePreference { SYSTEM, LIGHT, DARK }

data class Task(
    val id: String,
    val title: String,
    val description: String = "",
    val category: TaskCategory = TaskCategory.OTHER,
    val priority: Priority = Priority.MEDIUM,
    val estimatedDurationMinutes: Int = 60,
    val actualDurationMinutes: Int = 0,
    val scheduledStart: OffsetDateTime? = null,
    val scheduledEnd: OffsetDateTime? = null,
    val deadline: OffsetDateTime? = null,
    val completed: Boolean = false,
    val completedAt: OffsetDateTime? = null,
    val createdAt: OffsetDateTime = OffsetDateTime.now(),
    val updatedAt: OffsetDateTime = OffsetDateTime.now(),
    val reminderEnabled: Boolean = true,
    val reminderMinutesBefore: Int = 10,
    val recurring: Boolean = false,
    val recurrenceRule: String? = null, // "daily", "weekly", "monthly", "every:3:days"
    val notes: String = "",
    val allowOverlap: Boolean = false,
    val date: LocalDate,                 // the calendar day this instance belongs to
    val fixed: Boolean = false,
    val seriesId: String? = null,        // for recurring instances
    val remoteId: String? = null,        // id on the backend
    val needsSync: Boolean = false
)

data class Habit(
    val id: String,
    val name: String,
    val description: String = "",
    val icon: String = "⭐",
    val targetPerWeek: Int = 5,
    val createdAt: OffsetDateTime = OffsetDateTime.now(),
    val archived: Boolean = false,
    val remoteId: String? = null,
    val needsSync: Boolean = false
)

data class HabitCompletion(
    val id: String,
    val habitId: String,
    val date: LocalDate,
    val completedAt: OffsetDateTime = OffsetDateTime.now()
)

data class FocusSession(
    val id: String,
    val taskId: String? = null,
    val taskTitle: String,
    val startedAt: OffsetDateTime,
    val endedAt: OffsetDateTime? = null,
    val plannedMinutes: Int,
    val durationMinutes: Int = 0,
    val pauseCount: Int = 0,
    val pausedDurationMinutes: Int = 0,
    val completed: Boolean = false,
    val interruptions: Int = 0
)

data class UserPreferences(
    val name: String = "",
    val wakeUpTime: LocalTime = LocalTime.of(6, 30),
    val sleepTime: LocalTime = LocalTime.of(22, 30),
    val focusStart: LocalTime = LocalTime.of(9, 0),
    val focusEnd: LocalTime = LocalTime.of(17, 0),
    val defaultBreakMinutes: Int = 10,
    val dailyProductivityGoalMinutes: Int = 360,
    val notificationsEnabled: Boolean = true,
    val reminderMinutesBefore: Int = 10,
    val taskStartAlerts: Boolean = true,
    val missedTaskAlerts: Boolean = true,
    val voiceEnabled: Boolean = false,
    val theme: ThemePreference = ThemePreference.SYSTEM,
    val onboardingComplete: Boolean = false,
    val allowOverlaps: Boolean = false,
    val aiEnabled: Boolean = true,
    val authToken: String? = null,
    val userId: String? = null
)

data class ProductivityMetrics(
    val date: LocalDate,
    val plannedTasks: Int = 0,
    val completedTasks: Int = 0,
    val missedTasks: Int = 0,
    val remainingTasks: Int = 0,
    val completionRate: Float = 0f,
    val plannedMinutes: Int = 0,
    val actualMinutes: Int = 0,
    val focusMinutes: Int = 0,
    val habitCompletions: Int = 0,
    val habitTargets: Int = 0
)
