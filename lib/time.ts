/** "YYYY-MM-DD" for the given instant in a time zone (e.g. Asia/Kolkata). */
export function dateInTz(tz: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return (to.getTime() - new Date(fromIso).getTime()) / 86_400_000;
}
