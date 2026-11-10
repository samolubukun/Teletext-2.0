// Header date formatting from a caller-supplied ISO time. Core never reads the clock.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Returns { date: "Tue 10 Nov", time: "14:32" }. Throws on an invalid ISO string (programmer error). */
export function formatHeaderDate(iso: string, utcOffsetMinutes = 0): { date: string; time: string } {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`render: ctx.now must be an ISO date string, got "${iso}"`);
  const d = new Date(ms + utcOffsetMinutes * 60_000);
  const day = DAYS[d.getUTCDay()] ?? "";
  const month = MONTHS[d.getUTCMonth()] ?? "";
  const date = `${day} ${String(d.getUTCDate()).padStart(2, "0")} ${month}`;
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { date, time };
}
