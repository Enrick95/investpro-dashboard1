import { tradeDay } from "../performance";

export type ReportPeriod = "7d" | "month" | "3m" | "year" | "all";
export type ReportPeriodRange = { start: string | null; end: string };

function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || date < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return date <= days[month - 1];
}

// UTC is only used for calendar arithmetic after finding today's Paris calendar day.
function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function formatCalendarDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function reportPeriodRange(period: ReportPeriod, now = new Date()): ReportPeriodRange {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid report date");
  const end = tradeDay(now.toISOString());
  if (!validDay(end)) throw new RangeError("Invalid report calendar day");
  const [year, month, day] = end.split("-").map(Number);
  if (period === "all") return { start: null, end };
  const start = period === "7d" ? calendarDate(year, month, day - 6)
    : period === "month" ? calendarDate(year, month, 1)
    : period === "3m" ? calendarDate(year, month - 2, 1)
    : calendarDate(year, 1, 1);
  return { start: formatCalendarDate(start), end };
}

export function containsReportDay(value: string, range: ReportPeriodRange): boolean {
  if (!validDay(range.end) || range.start !== null && (!validDay(range.start) || range.start > range.end)) return false;
  // Date.parse normalizes e.g. February 30 in timestamps. Reject that before conversion.
  const suppliedDay = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (!suppliedDay || !validDay(suppliedDay)) return false;
  if (value !== suppliedDay) {
    // Only timestamp values with an explicit offset have a stable Paris day.
    const timestamp = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!timestamp || Number(timestamp[1]) > 23 || Number(timestamp[2]) > 59 || Number(timestamp[3] ?? 0) > 59) return false;
  }
  const day = tradeDay(value);
  return validDay(day) && day <= range.end && (range.start === null || day >= range.start);
}
