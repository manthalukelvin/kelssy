package com.my24hours.app.data.local.notification

import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.my24hours.app.MainActivity

/**
 * Keeps focus session alive and shows a persistent notification.
 * Combined with DND for device-wide impact.
 */
class FocusForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            FocusModeHelper.disableFocusDnd(this)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val planned = intent?.getIntExtra(EXTRA_PLANNED, 25) ?: 25
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, FocusForegroundService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, NotificationHelper.CHANNEL_FOCUS)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Focus mode active")
            .setContentText("$planned min session — distractions muted")
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(0, "End focus", stop)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(FOCUS_NOTIF_ID, notification)
        FocusModeHelper.enableFocusDnd(this)
        return START_STICKY
    }

    override fun onDestroy() {
        FocusModeHelper.disableFocusDnd(this)
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.my24hours.app.STOP_FOCUS"
        const val EXTRA_PLANNED = "planned"
        const val FOCUS_NOTIF_ID = 4242
    }
}
