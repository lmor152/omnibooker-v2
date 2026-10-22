/** The API may return naive UTC strings without a zone; treat them as UTC. */
export function withZone(value: string): string {
  return /[Z+]|-\d\d:\d\d$/.test(value) ? value : `${value}Z`;
}

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
