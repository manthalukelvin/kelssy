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
import com.my24hours.app.R
import com.my24hours.app.domain.model.Task
import java.time.OffsetDateTime

object NotificationHelper {
    const val CHANNEL_ID = "my24hours_reminders"
    const val CHANNEL_NAME = "Task Reminders"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Reminders for upcoming and starting tasks"
                enableVibration(true)
            }
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    fun scheduleTaskReminders(context: Context, tasks: List<Task>) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()

        tasks.filter { !it.completed && it.reminderEnabled && it.scheduledStart != null }
            .forEach { task ->
                val startMillis = task.scheduledStart!!.toInstant().toEpochMilli()
                val reminderMillis = startMillis - task.reminderMinutesBefore * 60_000L

                // Pre-reminder
                if (reminderMillis > now) {
                    scheduleExact(context, alarmManager, task, reminderMillis, "pre")
                }
                // Start alert
                if (startMillis > now) {
                    scheduleExact(context, alarmManager, task, startMillis, "start")
                }
            }
    }

    private fun scheduleExact(
        context: Context,
        alarmManager: AlarmManager,
        task: Task,
        triggerAt: Long,
        type: String
    ) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("task_id", task.id)
            putExtra("task_title", task.title)
            putExtra("type", type)
            putExtra("minutes_before", task.reminderMinutesBefore)
        }
        val requestCode = (task.id + type).hashCode()
        val pending = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAt,
                    pending
                )
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            }
        } catch (e: SecurityException) {
            // Exact alarm permission not granted – fall back to inexact
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
        }
    }

    fun cancelAll(context: Context) {
        // In a full implementation we would track pending request codes.
        // For now the next scheduleTaskReminders call will overwrite.
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("task_title") ?: "Task"
        val type = intent.getStringExtra("type") ?: "pre"
        val minutes = intent.getIntExtra("minutes_before", 10)

        val (notifTitle, body) = when (type) {
            "start" -> "Starting now" to "$title is starting now."
            else -> "Coming up" to "$title starts in $minutes minutes."
        }

        val openIntent = Intent(context, MainActivity::class.java)
        val pending = PendingIntent.getActivity(
            context, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, NotificationHelper.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(notifTitle)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify((title + type).hashCode(), notification)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            // Re-schedule will be triggered by the app when it next starts
            // or via a WorkManager task that reloads from Room.
        }
    }
}
