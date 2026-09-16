package com.my24hours.app.data.remote

import com.squareup.moshi.JsonClass
import retrofit2.http.*

/**
 * Backend: https://24hrs.myjournalplus.com/api/
 *
 * These routes are conventional. Adjust paths/fields to match your real API
 * once the domain is live. The rest of the app talks only through repositories.
 */
interface ApiService {

    // ---------- Auth ----------
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @GET("auth/me")
    suspend fun me(): UserDto

    // ---------- Tasks ----------
    @GET("tasks")
    suspend fun getTasks(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null
    ): List<TaskDto>

    @POST("tasks")
    suspend fun createTask(@Body task: TaskDto): TaskDto

    @PUT("tasks/{id}")
    suspend fun updateTask(@Path("id") id: String, @Body task: TaskDto): TaskDto

    @DELETE("tasks/{id}")
    suspend fun deleteTask(@Path("id") id: String)

    // ---------- Habits ----------
    @GET("habits")
    suspend fun getHabits(): List<HabitDto>

    @POST("habits")
    suspend fun createHabit(@Body habit: HabitDto): HabitDto

    // ---------- AI (your trained backend) ----------
    @POST("ai/plan")
    suspend fun planDay(@Body request: PlanRequest): PlanResponse

    @POST("ai/chat")
    suspend fun chat(@Body request: ChatRequest): ChatResponse

    @POST("ai/review")
    suspend fun dailyReview(@Body request: ReviewRequest): ReviewResponse
}

// ---- DTOs ----

@JsonClass(generateAdapter = true)
data class LoginRequest(val email: String, val password: String)

@JsonClass(generateAdapter = true)
data class RegisterRequest(val name: String, val email: String, val password: String)

@JsonClass(generateAdapter = true)
data class AuthResponse(val token: String, val user: UserDto)

@JsonClass(generateAdapter = true)
data class UserDto(
    val id: String,
    val name: String,
    val email: String
)

@JsonClass(generateAdapter = true)
data class TaskDto(
    val id: String? = null,
    val title: String,
    val description: String = "",
    val category: String = "OTHER",
    val priority: String = "MEDIUM",
    val estimatedDurationMinutes: Int = 60,
    val scheduledStart: String? = null,
    val scheduledEnd: String? = null,
    val deadline: String? = null,
    val completed: Boolean = false,
    val reminderEnabled: Boolean = true,
    val reminderMinutesBefore: Int = 10,
    val recurring: Boolean = false,
    val recurrenceRule: String? = null,
    val notes: String = "",
    val allowOverlap: Boolean = false,
    val date: String,                    // YYYY-MM-DD
    val fixed: Boolean = false
)

@JsonClass(generateAdapter = true)
data class HabitDto(
    val id: String? = null,
    val name: String,
    val description: String = "",
    val icon: String = "⭐",
    val targetPerWeek: Int = 5
)

@JsonClass(generateAdapter = true)
data class PlanRequest(
    val date: String,
    val preferences: Map<String, Any>,
    val existingTasks: List<TaskDto>,
    val freeText: String? = null
)

@JsonClass(generateAdapter = true)
data class PlanResponse(
    val tasks: List<TaskDto> = emptyList(),
    val summary: String = "",
    val overload: Boolean = false,
    val conflicts: List<String> = emptyList()
)

@JsonClass(generateAdapter = true)
data class ChatRequest(
    val message: String,
    val date: String,
    val tasks: List<TaskDto>,
    val history: List<Map<String, String>> = emptyList()
)

@JsonClass(generateAdapter = true)
data class ChatResponse(
    val reply: String,
    val actions: List<Map<String, Any>> = emptyList(),
    val needsConfirmation: Boolean = true
)

@JsonClass(generateAdapter = true)
data class ReviewRequest(
    val date: String,
    val metrics: Map<String, Any>
)

@JsonClass(generateAdapter = true)
data class ReviewResponse(
    val headline: String,
    val observations: List<String> = emptyList(),
    val suggestions: List<String> = emptyList()
)
