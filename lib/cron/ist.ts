/**
 * GitHub Actions cron runs in UTC. India Standard Time is UTC+5:30 (no daylight saving).
 * These helpers turn an IST time into the UTC cron fields, so schedules are easy to check.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export type UtcTime = { minute: number; hour: number; dayShift: -1 | 0 };

export function istToUtc(hour: number, minute = 0): UtcTime {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("Invalid IST time");
  let total = hour * 60 + minute - IST_OFFSET_MINUTES;
  let dayShift: -1 | 0 = 0;
  if (total < 0) {
    total += 24 * 60;
    dayShift = -1;
  }
  return { minute: total % 60, hour: Math.floor(total / 60), dayShift };
}

/** Cron for one IST time, optionally on certain weekdays (e.g. "1-5" = Monday to Friday). */
export function istCron(hour: number, minute = 0, daysOfWeek = "*"): string {
  const t = istToUtc(hour, minute);
  if (t.dayShift !== 0 && daysOfWeek !== "*") throw new Error("This IST time falls on the previous UTC day; adjust the weekdays by hand.");
  return `${t.minute} ${t.hour} * * ${daysOfWeek}`;
}

/** Cron for "every hour from startHour to endHour IST" (same UTC day). */
export function istHourlyRangeCron(startHour: number, endHour: number, minute = 0): string {
  const a = istToUtc(startHour, minute);
  const b = istToUtc(endHour, minute);
  if (a.dayShift !== b.dayShift || a.minute !== b.minute) throw new Error("Range crosses midnight UTC; split it into two schedules.");
  return `${a.minute} ${a.hour}-${b.hour} * * *`;
}

/** The schedules used in .github/workflows (checked by a test). */
export const SCHEDULES = {
  outreach: { ist: "10:00 IST, Monday to Friday", cron: istCron(10, 0, "1-5") },
  stageEmails: { ist: "every hour 09:00-18:00 IST", cron: istHourlyRangeCron(9, 18) },
  sendApproved: { ist: "every 30 minutes (any time)", cron: "*/30 * * * *" },
  dailyDigest: { ist: "19:00 IST every day", cron: istCron(19, 0) },
} as const;
