package com.my24hours.app.ui.screens.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.my24hours.app.BuildConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val context = LocalContext.current

    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Server", style = MaterialTheme.typography.titleMedium)
            Text(
                BuildConfig.API_BASE_URL,
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                "Tasks and habits save on this phone first. When the server is online they sync in the background.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider()

            Text("Support", style = MaterialTheme.typography.titleMedium)
            Button(
                onClick = {
                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                        data = Uri.parse("mailto:admin@myjournalplus.com")
                        putExtra(Intent.EXTRA_SUBJECT, "My 24Hours support")
                        putExtra(
                            Intent.EXTRA_TEXT,
                            "Hi,\n\nI need help with My 24Hours:\n\n"
                        )
                    }
                    context.startActivity(Intent.createChooser(intent, "Contact us"))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Email, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Contact us — admin@myjournalplus.com")
            }

            Text(
                "Focus mode can silence other apps when you grant Do Not Disturb access (open Focus tab for the button).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
