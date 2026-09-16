package com.my24hours.app.domain.engine

import com.my24hours.app.domain.model.Task
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset

data class ParsedRecurrence(
    val frequency: String, // daily | weekly | monthly
    val interval: Int = 1,
    val until: LocalDate? = null
)

fun parseRecurrenceRule(rule: String?): ParsedRecurrence? {
    if (rule.isNullOrBlank()) return null
    val r = rule.trim().lowercase()
    return when {
        r == "daily" -> ParsedRecurrence("daily", 1)
        r == "weekly" -> ParsedRecurrence("weekly", 1)
        r == "monthly" -> ParsedRecurrence("monthly", 1)
        r.startsWith("every:") -> {
            val parts = r.split(":")
            if (parts.size >= 3) {
                val interval = parts[1].toIntOrNull()?.coerceAtLeast(1) ?: 1
                val unit = parts[2]
                when {
                    unit.startsWith("day") -> ParsedRecurrence("daily", interval)
                    unit.startsWith("week") -> ParsedRecurrence("weekly", interval)
                    unit.startsWith("month") -> ParsedRecurrence("monthly", interval)
                    else -> ParsedRecurrence("daily", interval)
                }
            } else null
        }
        else -> ParsedRecurrence("daily", 1)
    }
}

fun nextOccurrence(date: LocalDate, rule: ParsedRecurrence): LocalDate {
    return when (rule.frequency) {
        "daily" -> date.plusDays(rule.interval.toLong())
        "weekly" -> date.plusWeeks(rule.interval.toLong())
        "monthly" -> date.plusMonths(rule.interval.toLong())
        else -> date.plusDays(rule.interval.toLong())
    }
}

/**
 * Expand a recurring template into concrete instances for [from]..[to] inclusive.
 */
fun expandRecurring(
    template: Task,
    from: LocalDate,
    to: LocalDate,
    existingOverrides: List<Task> = emptyList()
): List<Task> {
    if (!template.recurring || template.recurrenceRule.isNullOrBlank()) return emptyList()
    val parsed = parseRecurrenceRule(template.recurrenceRule) ?: return emptyList()

    val overridesByDate = existingOverrides
        .filter { it.seriesId == template.id || it.id.startsWith("${template.id}_") }
        .associateBy { it.date }

    val results = mutableListOf<Task>()
    var cursor = template.date
    var guard = 0

    while (cursor <= to && guard < 800) {
        guard++
        if (parsed.until != null && cursor > parsed.until) break
        if (cursor >= from) {
            val override = overridesByDate[cursor]
            if (override != null) {
                results.add(override)
            } else {
                results.add(materializeInstance(template, cursor))
            }
        }
        val next = nextOccurrence(cursor, parsed)
        if (next == cursor) break
        cursor = next
    }
    return results
}

private fun materializeInstance(template: Task, date: LocalDate): Task {
    val duration = template.estimatedDurationMinutes
    var start: OffsetDateTime? = null
    var end: OffsetDateTime? = null

    template.scheduledStart?.let { orig ->
        start = date.atTime(orig.toLocalTime()).atOffset(ZoneOffset.systemDefault().rules.getOffset(date.atStartOfDay()))
        end = start?.plusMinutes(duration.toLong())
    }

    return template.copy(
        id = "${template.id}_$date",
        date = date,
        scheduledStart = start,
        scheduledEnd = end,
        completed = false,
        completedAt = null,
        recurring = false,
        recurrenceRule = null,
        seriesId = template.id
    )
}

/** Tasks that should appear on a given calendar day (one-offs + expanded series). */
fun tasksForDate(allTasks: List<Task>, date: LocalDate): List<Task> {
    val templates = allTasks.filter { it.recurring && !it.recurrenceRule.isNullOrBlank() }
    val nonRecurring = allTasks.filter {
        !it.recurring && it.date == date && !it.notes.contains("[cancelled]")
    }
    val overrides = allTasks.filter { !it.recurring && (it.seriesId != null || it.id.contains("_")) }

    val expanded = templates.flatMap { expandRecurring(it, date, date, overrides) }
        .filter { !it.notes.contains("[cancelled]") }

    val byId = LinkedHashMap<String, Task>()
    (nonRecurring + expanded).forEach { byId[it.id] = it }
    // If override is cancelled, remove it
    byId.entries.removeAll { it.value.notes.contains("[cancelled]") }
    return byId.values.sortedBy { it.scheduledStart?.toInstant()?.toEpochMilli() ?: Long.MAX_VALUE }
}

fun isRecurringTemplate(task: Task): Boolean =
    task.recurring && !task.recurrenceRule.isNullOrBlank()

fun isRecurringInstance(task: Task): Boolean {
    if (task.seriesId != null) return true
    // Instance ids look like: task_<uuid>_2026-09-17
    return Regex(".+_\\d{4}-\\d{2}-\\d{2}$").matches(task.id)
}
