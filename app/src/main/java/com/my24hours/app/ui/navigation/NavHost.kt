package com.my24hours.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.my24hours.app.ui.screens.assistant.AssistantScreen
import com.my24hours.app.ui.screens.focus.FocusScreen
import com.my24hours.app.ui.screens.habits.HabitsScreen
import com.my24hours.app.ui.screens.home.HomeScreen
import com.my24hours.app.ui.screens.planner.PlannerScreen
import com.my24hours.app.ui.screens.settings.SettingsScreen
import com.my24hours.app.ui.screens.tasks.TasksScreen

sealed class Screen(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    data object Home : Screen("home", "Today", Icons.Outlined.Today, Icons.Filled.Today)
    data object Planner : Screen("planner", "Planner", Icons.Outlined.CalendarMonth, Icons.Filled.CalendarMonth)
    data object Tasks : Screen("tasks", "Tasks", Icons.Outlined.Checklist, Icons.Filled.Checklist)
    data object Focus : Screen("focus", "Focus", Icons.Outlined.Timer, Icons.Filled.Timer)
    data object Habits : Screen("habits", "Habits", Icons.Outlined.LocalFireDepartment, Icons.Filled.LocalFireDepartment)
    data object Assistant : Screen("assistant", "AI", Icons.Outlined.SmartToy, Icons.Filled.SmartToy)
    data object Settings : Screen("settings", "Settings", Icons.Outlined.Settings, Icons.Filled.Settings)
}

val bottomScreens = listOf(
    Screen.Home, Screen.Planner, Screen.Tasks, Screen.Focus, Screen.Assistant
)

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                bottomScreens.forEach { screen ->
                    val selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            Icon(
                                if (selected) screen.selectedIcon else screen.icon,
                                contentDescription = screen.label
                            )
                        },
                        label = { Text(screen.label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) { HomeScreen(navController) }
            composable(Screen.Planner.route) { PlannerScreen() }
            composable(Screen.Tasks.route) { TasksScreen() }
            composable(Screen.Focus.route) { FocusScreen() }
            composable(Screen.Habits.route) { HabitsScreen() }
            composable(Screen.Assistant.route) { AssistantScreen() }
            composable(Screen.Settings.route) { SettingsScreen() }
        }
    }
}
