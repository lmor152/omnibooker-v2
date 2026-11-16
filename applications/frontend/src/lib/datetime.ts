/** The API may return naive UTC strings without a zone; treat them as UTC. */
export function withZone(value: string): string {
  return /[Z+]|-\d\d:\d\d$/.test(value) ? value : `${value}Z`;
}

/** Milliseconds since the epoch for an API timestamp. */
export const toTime = (value: string) => Date.parse(withZone(value));

/** e.g. "Mon 17 Jun, 20:00" in the given timezone. */
export function formatMoment(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(withZone(value)));
}

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "20:00" in the device's timezone. */
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(withZone(value)));
}

/** Local calendar day key, "2026-11-17", for grouping. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const dayKeyOf = (value: string) => dayKey(new Date(withZone(value)));

/** Parse a day key back into local midnight. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** "Today", "Tomorrow", "Yesterday" or e.g. "Sat 22 Nov" (with the year if it isn't this year). */
export function formatDayHeading(key: string, now = new Date()): string {
  const date = fromDayKey(key);
  const today = startOfDay(now);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

/** "in 5h 12m", "in 3 days", "2h ago". */
export function formatRelative(value: string, now = Date.now()): string {
  const diff = toTime(value) - now;
  const future = diff >= 0;
  const minutes = Math.round(Math.abs(diff) / 60_000);
  let text: string;
  if (minutes < 1) text = "less than a minute";
  else if (minutes < 60) text = `${minutes}m`;
  else if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    text = m && h < 10 ? `${h}h ${m}m` : `${h}h`;
  } else text = `${Math.round(minutes / 1440)} days`;
  return future ? `in ${text}` : `${text} ago`;
}

/** "£14.10", using the booking's currency (GBP if unknown). */
export function formatMoney(amount: number, currency?: string | null): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}
