export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dateKey: string; // YYYY-MM-DD
  minuteOfDay: number; // 0 - 1439
}

export const BUSINESS_START_MINUTE = 9 * 60; // 09:00 -> 540
export const BUSINESS_END_MINUTE = 18 * 60; // 18:00 -> 1080
export const DAILY_BUSINESS_MINUTES = BUSINESS_END_MINUTE - BUSINESS_START_MINUTE; // 540 minutes (9 hours)

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function getZonedParts(date: Date, timezone: string): ZonedDateParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    weekday: "short"
  });

  const parts = dtf.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let weekday = "Sun";

  for (const part of parts) {
    if (part.type === "year") year = parseInt(part.value, 10);
    else if (part.type === "month") month = parseInt(part.value, 10);
    else if (part.type === "day") day = parseInt(part.value, 10);
    else if (part.type === "hour") hour = parseInt(part.value, 10) % 24;
    else if (part.type === "minute") minute = parseInt(part.value, 10);
    else if (part.type === "second") second = parseInt(part.value, 10);
    else if (part.type === "weekday") weekday = part.value;
  }

  const dayOfWeek = WEEKDAY_MAP[weekday] ?? 0;
  const dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  const minuteOfDay = hour * 60 + minute;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek,
    dateKey,
    minuteOfDay
  };
}

export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): Date {
  const approximateUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const parts = getZonedParts(approximateUtc, timezone);
  const formattedAsZoned = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const diff = approximateUtc.getTime() - formattedAsZoned;
  return new Date(approximateUtc.getTime() + diff);
}

export function addDaysToZoned(
  year: number,
  month: number,
  day: number,
  days: number
): { year: number; month: number; day: number; dayOfWeek: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay()
  };
}

export function normalizeHolidays(
  holidays: Set<string> | string[] | Date[] | { date: Date }[],
  timezone: string
): Set<string> {
  const normalized = new Set<string>();

  for (const h of holidays) {
    if (h instanceof Date) {
      if (h.getUTCHours() === 0 && h.getUTCMinutes() === 0 && h.getUTCSeconds() === 0) {
        normalized.add(h.toISOString().slice(0, 10));
      } else {
        const parts = getZonedParts(h, timezone);
        normalized.add(parts.dateKey);
      }
    } else if (typeof h === "string") {
      if (h.length === 10 && h.includes("-")) {
        normalized.add(h);
      } else if (h.includes("T")) {
        normalized.add(h.slice(0, 10));
      } else {
        const d = new Date(h);
        if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
          normalized.add(d.toISOString().slice(0, 10));
        } else {
          const parts = getZonedParts(d, timezone);
          normalized.add(parts.dateKey);
        }
      }
    } else if (typeof h === "object" && h !== null && "date" in h && h.date instanceof Date) {
      if (h.date.getUTCHours() === 0 && h.date.getUTCMinutes() === 0 && h.date.getUTCSeconds() === 0) {
        normalized.add(h.date.toISOString().slice(0, 10));
      } else {
        const parts = getZonedParts(h.date, timezone);
        normalized.add(parts.dateKey);
      }
    }
  }

  return normalized;
}

export function isBusinessWorkingDay(
  dayOfWeek: number,
  dateKey: string,
  holidaySet: Set<string>
): boolean {
  // Monday(1) through Friday(5) are working days, unless listed in holidays
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateKey);
}

export function calculateBusinessDeadline(
  startTimestamp: Date,
  businessMinutes: number,
  holidays: Set<string> | string[] | Date[] | { date: Date }[],
  timezone: string
): Date {
  if (businessMinutes <= 0) {
    return new Date(startTimestamp);
  }

  const holidaySet = normalizeHolidays(holidays, timezone);
  let { year, month, day, dayOfWeek, dateKey, minuteOfDay } = getZonedParts(
    startTimestamp,
    timezone
  );

  let currentMinute = minuteOfDay;

  // If outside working hours, weekend, or holiday, advance to the next working day at 09:00
  while (
    !isBusinessWorkingDay(dayOfWeek, dateKey, holidaySet) ||
    currentMinute >= BUSINESS_END_MINUTE
  ) {
    const next = addDaysToZoned(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
    dayOfWeek = next.dayOfWeek;
    dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    currentMinute = BUSINESS_START_MINUTE;
  }

  // If on a working day before business hours (e.g. Mon 07:00), start counting at 09:00
  if (currentMinute < BUSINESS_START_MINUTE) {
    currentMinute = BUSINESS_START_MINUTE;
  }

  let remaining = businessMinutes;

  while (remaining > 0) {
    const availableToday = BUSINESS_END_MINUTE - currentMinute;

    if (remaining <= availableToday) {
      const finalMinute = currentMinute + remaining;
      const hour = Math.floor(finalMinute / 60);
      const minute = finalMinute % 60;
      return zonedToUtc(year, month, day, hour, minute, 0, timezone);
    }

    remaining -= availableToday;

    // Advance to next working day
    do {
      const next = addDaysToZoned(year, month, day, 1);
      year = next.year;
      month = next.month;
      day = next.day;
      dayOfWeek = next.dayOfWeek;
      dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    } while (!isBusinessWorkingDay(dayOfWeek, dateKey, holidaySet));

    currentMinute = BUSINESS_START_MINUTE;
  }

  const hour = Math.floor(currentMinute / 60);
  const minute = currentMinute % 60;
  return zonedToUtc(year, month, day, hour, minute, 0, timezone);
}

export function calculateBusinessMinutesBetween(
  startDate: Date,
  endDate: Date,
  holidays: Set<string> | string[] | Date[] | { date: Date }[],
  timezone: string
): number {
  if (endDate.getTime() <= startDate.getTime()) {
    return 0;
  }

  const holidaySet = normalizeHolidays(holidays, timezone);
  const startParts = getZonedParts(startDate, timezone);
  const endParts = getZonedParts(endDate, timezone);

  let totalMinutes = 0;

  let current = {
    year: startParts.year,
    month: startParts.month,
    day: startParts.day,
    dayOfWeek: startParts.dayOfWeek
  };

  while (true) {
    const dateKey = `${current.year.toString().padStart(4, "0")}-${current.month.toString().padStart(2, "0")}-${current.day.toString().padStart(2, "0")}`;
    const isStartDay =
      current.year === startParts.year &&
      current.month === startParts.month &&
      current.day === startParts.day;
    const isEndDay =
      current.year === endParts.year &&
      current.month === endParts.month &&
      current.day === endParts.day;

    if (isBusinessWorkingDay(current.dayOfWeek, dateKey, holidaySet)) {
      const dayStartMinute = isStartDay
        ? Math.max(BUSINESS_START_MINUTE, Math.min(BUSINESS_END_MINUTE, startParts.minuteOfDay))
        : BUSINESS_START_MINUTE;

      const dayEndMinute = isEndDay
        ? Math.max(BUSINESS_START_MINUTE, Math.min(BUSINESS_END_MINUTE, endParts.minuteOfDay))
        : BUSINESS_END_MINUTE;

      if (dayEndMinute > dayStartMinute) {
        totalMinutes += dayEndMinute - dayStartMinute;
      }
    }

    if (isEndDay) {
      break;
    }

    current = addDaysToZoned(current.year, current.month, current.day, 1);
  }

  return totalMinutes;
}
