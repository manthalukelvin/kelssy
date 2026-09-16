package com.my24hours.app.data.local.notification

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.my24hours.app.MainActivity
import com.my24hours.app.data.local.AppDatabase
import com.my24hours.app.data.local.toDomain
import com.my24hours.app.domain.engine.tasksForDate
import com.my24hours.app.domain.model.Task
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

object NotificationHelper {
    const val CHANNEL_TASKS = "my24hours_reminders"
    const val CHANNEL_FOCUS = "my24hours_focus"

    private val timeFmt = DateTimeFormatter.ofPattern("HH:mm")

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_TASKS, "Task Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Reminders for upcoming and starting tasks"
                enableVibration(true)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_FOCUS, "Focus Mode", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Active focus session"
                setShowBadge(false)
            }
        )
    }

    /**
     * Schedule reminders for the next 7 days of tasks so they survive overnight.
     * Uses stable request codes so re-scheduling replaces previous alarms.
     */
    fun scheduleTaskReminders(context: Context, allTasks: List<Task>) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()
        val today = LocalDate.now()

        for (dayOffset in 0..6) {
            val day = today.plusDays(dayOffset.toLong())
            val dayTasks = tasksForDate(allTasks, day)
            dayTasks.filter {
                !it.completed && it.reminderEnabled && it.scheduledStart != null
            }.forEach { task ->
                val startMillis = task.scheduledStart!!.toInstant().toEpochMilli()
                val reminderMillis =
                    startMillis - task.reminderMinutesBefore.coerceAtLeast(0) * 60_000L
                val timeLabel = task.scheduledStart!!.toLocalTime().format(timeFmt)

                if (reminderMillis > now) {
                    scheduleExact(
                        context, alarmManager, task, reminderMillis, "pre", timeLabel
                    )
                }
                if (startMillis > now) {
                    scheduleExact(
                        context, alarmManager, task, startMillis, "start", timeLabel
                    )
                }
                // Missed alert 1 min after end
                task.scheduledEnd?.let { end ->
                    val missedAt = end.toInstant().toEpochMilli() + 60_000L
                    if (missedAt > now) {
                        scheduleExact(
                            context, alarmManager, task, missedAt, "missed", timeLabel
                        )
                    }
                }
            }
        }
    }

    fun cancelTaskAlarms(context: Context, taskId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        listOf("pre", "start", "missed").forEach { type ->
            val intent = Intent(context, AlarmReceiver::class.java)
            val requestCode = (taskId + type).hashCode()
            val pending = PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            if (pending != null) {
                alarmManager.cancel(pending)
                pending.cancel()
            }
        }
    }

    private fun scheduleExact(
        context: Context,
        alarmManager: AlarmManager,
        task: Task,
        triggerAt: Long,
        type: String,
        timeLabel: String
    ) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("task_id", task.id)
            putExtra("task_title", task.title)
            putExtra("type", type)
            putExtra("minutes_before", task.reminderMinutesBefore)
            putExtra("time_label", timeLabel)
        }
        val requestCode = (task.id + type).hashCode()
        val pending = PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        try {
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerAt, pending
                    )
                }
                else -> {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                }
            }
        } catch (_: SecurityException) {
            // Exact alarm permission not granted — best-effort inexact
            try {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            } catch (_: Exception) {
            }
        }
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("task_title") ?: "Task"
        val type = intent.getStringExtra("type") ?: "pre"
        val minutes = intent.getIntExtra("minutes_before", 10)
        val timeLabel = intent.getStringExtra("time_label") ?: ""

        val (notifTitle, body) = when (type) {
            "start" -> "Starting now" to
                "$title is starting${if (timeLabel.isNotEmpty()) " at $timeLabel" else ""}."
            "missed" -> "Missed task" to
                "You missed $title${if (timeLabel.isNotEmpty()) " (was $timeLabel)" else ""}. Open the app to reschedule."
            else -> "Coming up" to
                "$title starts in $minutes min${if (timeLabel.isNotEmpty()) " at $timeLabel" else ""}."
        }

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            context, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, NotificationHelper.CHANNEL_TASKS)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(notifTitle)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify((title + type).hashCode() and 0x7FFFFFFF, notification)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = androidx.room.Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "my24hours.db"
                ).build()
                val all = db.taskDao().getAll().map { it.toDomain() }
                NotificationHelper.scheduleTaskReminders(context, all)
                db.close()
            } catch (_: Exception) {
            } finally {
                pendingResult.finish()
            }
        }
    }
}
