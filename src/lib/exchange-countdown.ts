function zonedDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function calendarDaysUntil(target: Date, now: Date, timeZone: string) {
  const targetParts = zonedDateKey(target, timeZone).split("-").map(Number);
  const nowParts = zonedDateKey(now, timeZone).split("-").map(Number);
  const targetUtc = Date.UTC(targetParts[0]!, targetParts[1]! - 1, targetParts[2]!);
  const nowUtc = Date.UTC(nowParts[0]!, nowParts[1]! - 1, nowParts[2]!);
  return Math.round((targetUtc - nowUtc) / 86_400_000);
}
