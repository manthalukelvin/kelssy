package com.my24hours.app.data.repository

import com.my24hours.app.data.local.AppDatabase
import com.my24hours.app.data.local.HabitCompletionEntity
import com.my24hours.app.data.local.toDomain
import com.my24hours.app.data.local.toEntity
import com.my24hours.app.data.remote.ApiService
import com.my24hours.app.domain.model.Habit
import com.my24hours.app.domain.model.HabitCompletion
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HabitRepository @Inject constructor(
    db: AppDatabase,
    private val api: ApiService
) {
    private val habitDao = db.habitDao()
    private val completionDao = db.habitCompletionDao()

    fun observeHabits(): Flow<List<Habit>> =
        habitDao.observeActive().map { list -> list.map { it.toDomain() } }

    fun observeCompletions(date: LocalDate): Flow<List<HabitCompletion>> =
        completionDao.observeByDate(date.toString()).map { list -> list.map { it.toDomain() } }

    suspend fun addHabit(name: String, targetPerWeek: Int = 5) {
        val habit = Habit(
            id = "habit_${UUID.randomUUID()}",
            name = name.trim(),
            targetPerWeek = targetPerWeek,
            needsSync = true
        )
        habitDao.upsert(habit.toEntity())
        runCatching { api.createHabit(com.my24hours.app.data.remote.HabitDto(
            id = habit.id, name = habit.name, targetPerWeek = habit.targetPerWeek
        )) }
    }

    suspend fun toggleToday(habitId: String, date: LocalDate) {
        // naive: try insert; if exists, delete
        val id = "hc_${habitId}_$date"
        completionDao.upsert(
            HabitCompletionEntity(
                id = id,
                habitId = habitId,
                date = date.toString(),
                completedAt = OffsetDateTime.now().toString()
            )
        )
    }

    suspend fun uncomplete(habitId: String, date: LocalDate) {
        completionDao.delete(habitId, date.toString())
    }
}
