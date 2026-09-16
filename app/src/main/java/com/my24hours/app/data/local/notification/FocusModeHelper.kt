package com.my24hours.app.data.local.notification

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/**
 * Device-wide focus impact via Do Not Disturb (Interruption Filter).
 * Requires user to grant ACCESS_NOTIFICATION_POLICY once.
 */
object FocusModeHelper {

    fun hasDndAccess(context: Context): Boolean {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            nm.isNotificationPolicyAccessGranted
        } else true
    }

    fun openDndSettings(context: Context) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
    }

    /** Enable priority-only / alarms-only mode for focus. */
    fun enableFocusDnd(context: Context): Boolean {
        if (!hasDndAccess(context)) return false
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // PRIORITY = allow alarms/important only — blocks most distractions
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
            }
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun disableFocusDnd(context: Context) {
        if (!hasDndAccess(context)) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
            }
        } catch (_: SecurityException) {
        }
    }
}
