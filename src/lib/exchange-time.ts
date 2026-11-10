export function localTimeToUtc(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid exchange date and time.");
  const parts = match.slice(1).map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const hour = parts[3]!;
  const minute = parts[4]!;
  const intendedUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let candidate = intendedUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value: part }) => [type, part]));
    const representedUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)
    );
    const delta = intendedUtc - representedUtc;
    if (delta === 0) return new Date(candidate);
    candidate += delta;
  }
  throw new Error("That local time does not exist in the selected time zone. Choose another time.");
}

export function utcToLocalInput(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const mapped = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${mapped.year}-${mapped.month}-${mapped.day}T${mapped.hour}:${mapped.minute}`;
}
