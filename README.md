# My 24Hours – Native Android (Kotlin)

Real native Android app for the My 24Hours daily planner.

## Features (architecture ready)

- **Offline-first** with Room database
- **Reliable notifications** using AlarmManager + exact alarms + BootReceiver
- Recurring tasks engine (daily / weekly / monthly / every-N)
- Jetpack Compose + Material 3 UI
- Navigation (Today, Planner, Tasks, Focus, Habits, AI Assistant, Settings)
- Retrofit client pointed at your backend:
  ```
  https://24hrs.myjournalplus.com/api/
  ```
- Hilt dependency injection
- Clean architecture (data / domain / ui)

## Backend

The API interface is defined in:

`app/src/main/java/com/my24hours/app/data/remote/ApiService.kt`

It currently uses conventional REST paths (`/auth/login`, `/tasks`, `/ai/plan`, `/ai/chat`, etc.).  
Once your domain is live, either:

1. Match those routes on the backend, or  
2. Adjust the paths/DTOs in `ApiService.kt` to match what you actually expose.

Base URL is set in `app/build.gradle.kts` via `BuildConfig.API_BASE_URL`.

## How to open & run

1. Open the folder in **Android Studio** (Hedgehog / Ladybug or newer recommended).
2. Let Gradle sync.
3. Create an emulator (API 26+) or connect a device.
4. Run the `app` configuration.

Required permissions are already declared:
- `POST_NOTIFICATIONS`
- `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`
- `RECEIVE_BOOT_COMPLETED`

## Project structure

```
app/src/main/java/com/my24hours/app/
├── data/
│   ├── local/          # Room entities, DAOs, Database, notifications
│   ├── remote/         # Retrofit ApiService + DTOs
│   └── repository/     # (next step – wire Room + API)
├── domain/
│   ├── model/          # Task, Habit, FocusSession, Preferences…
│   └── engine/         # Recurrence expansion
├── di/                 # Hilt modules
└── ui/
    ├── theme/
    ├── navigation/
    └── screens/        # Home, Planner, Tasks, Focus, Habits, Assistant, Settings
```

## Next steps (recommended order)

1. Implement `TaskRepository` that reads/writes Room and optionally syncs with the API.
2. Wire HomeScreen / TasksScreen to the repository with ViewModels.
3. Call `NotificationHelper.scheduleTaskReminders()` whenever the task list changes.
4. Connect the AI Assistant screen to `/ai/chat` and `/ai/plan`.
5. Add onboarding + preferences (DataStore).

## Notes

- Exact alarms require the user to grant the special “Alarms & reminders” permission on Android 12+ (the app requests notification permission on launch).
- The domain is still in creation – the client is already configured to use it.
- This is a real native codebase, not a web wrapper.

Built for reliability: local database + system-level alarms.
