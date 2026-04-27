const DAY_MS = 24 * 60 * 60 * 1000;

const TZ_STORAGE_KEY = "streakTz:v1";

/** Read the user's chosen timezone from localStorage, or fall back to the
 * browser/system local zone. Pass "UTC" explicitly if you want the old
 * behaviour. */
export function getStreakTimezone(): string {
  try {
    const v = localStorage.getItem(TZ_STORAGE_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function setStreakTimezone(tz: string) {
  try {
    localStorage.setItem(TZ_STORAGE_KEY, tz);
  } catch {
    /* ignore */
  }
}

/** Format a date as YYYY-MM-DD in the given IANA timezone. */
function dayKeyInTz(date: Date, tz: string): string {
  // en-CA gives ISO-style YYYY-MM-DD in the requested zone.
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dayKey(iso: string, tz: string): string {
  return dayKeyInTz(new Date(iso), tz);
}

/**
 * Consecutive-day streak ending today (in the given timezone), where each
 * qualifying day has >=1 bet.
 */
export function calculateDailyStreak(
  timestamps: string[],
  now: Date = new Date(),
  tz: string = getStreakTimezone(),
): number {
  if (timestamps.length === 0) return 0;

  const uniqueDays = new Set(timestamps.map((t) => dayKey(t, tz)));
  // Cursor walks day-by-day backwards. We anchor on midnight UTC of today
  // and step in 24h chunks; the formatter re-projects each cursor instant
  // into the target timezone, which is correct for any non-DST-edge case.
  let cursor = new Date(now.getTime());
  let streak = 0;

  while (uniqueDays.has(dayKeyInTz(cursor, tz))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return streak;
}
