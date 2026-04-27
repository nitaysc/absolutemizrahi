const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Consecutive-day streak ending today, where each qualifying day has >=1 bet.
 */
export function calculateDailyStreak(timestamps: string[], now = new Date()): number {
  if (timestamps.length === 0) return 0;

  const uniqueDays = new Set(timestamps.map(dayKey));
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let streak = 0;

  while (uniqueDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }

  return streak;
}
