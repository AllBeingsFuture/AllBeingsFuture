#!/usr/bin/env npx tsx
/**
 * DateTime Tool
 *
 * Usage:
 *   npx tsx get_time.ts [options]
 *
 * Options:
 *   --timezone <tz>     Timezone (default: local timezone)
 *   --format <fmt>      Date format (default: YYYY-MM-DD HH:mm:ss)
 *   --diff <d1> <d2>    Calculate difference between two dates
 *   --convert <dt>      Convert datetime
 *   --from-tz <tz>      Source timezone
 *   --to-tz <tz>        Target timezone
 */

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  timezone?: string;
  format?: string;
  diff?: [string, string];
  convert?: string;
  fromTz?: string;
  toTz?: string;
} {
  const args = argv.slice(2);
  const result: ReturnType<typeof parseArgs> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--timezone":
      case "-tz":
        result.timezone = args[++i];
        break;
      case "--format":
      case "-f":
        result.format = args[++i];
        break;
      case "--diff":
        result.diff = [args[++i], args[++i]];
        break;
      case "--convert":
        result.convert = args[++i];
        break;
      case "--from-tz":
        result.fromTz = args[++i];
        break;
      case "--to-tz":
        result.toTz = args[++i];
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatDate(d: Date, tz?: string): string {
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date, tz?: string): string {
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("hour")}:${get("minute")}:${get("second")}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDatetime(d: Date, fmt: string | undefined, tz?: string): string {
  if (!fmt || fmt === "%Y-%m-%d %H:%M:%S") {
    return `${formatDate(d, tz)} ${formatTime(d, tz)}`;
  }

  // Support common Python strftime tokens
  const dateStr = formatDate(d, tz);
  const timeStr = formatTime(d, tz);
  const [year, month, day] = dateStr.split("-");
  const [hour, minute, second] = timeStr.split(":");

  return fmt
    .replace(/%Y/g, year)
    .replace(/%m/g, month)
    .replace(/%d/g, day)
    .replace(/%H/g, hour)
    .replace(/%M/g, minute)
    .replace(/%S/g, second);
}

function getDateParts(d: Date, tz?: string) {
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      weekday: "long",
    }).formatToParts(d);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      year: parseInt(get("year"), 10),
      month: parseInt(get("month"), 10),
      day: parseInt(get("day"), 10),
      hour: parseInt(get("hour"), 10) % 24,
      minute: parseInt(get("minute"), 10),
      second: parseInt(get("second"), 10),
      weekday: get("weekday"),
    };
  }

  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    weekday: weekdayNames[d.getDay()],
  };
}

function weekdayNum(weekday: string): number {
  // Python: Monday=0 ... Sunday=6
  const map: Record<string, number> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  return map[weekday] ?? 0;
}

// ---------------------------------------------------------------------------
// Main functions
// ---------------------------------------------------------------------------

function getCurrentTime(
  timezone?: string,
  fmt?: string,
): Record<string, unknown> {
  const now = new Date();

  // Validate timezone
  if (timezone) {
    try {
      Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      return { error: `Invalid timezone: ${timezone}` };
    }
  }

  const tz = timezone || undefined;
  const tzLabel = timezone || "local";
  const p = getDateParts(now, tz);

  return {
    datetime: formatDatetime(now, fmt, tz),
    date: formatDate(now, tz),
    time: formatTime(now, tz),
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
    weekday: p.weekday,
    weekday_num: weekdayNum(p.weekday),
    timestamp: Math.floor(now.getTime() / 1000),
    iso_format: now.toISOString(),
    timezone: tzLabel,
  };
}

function calculateDiff(
  date1: string,
  date2: string,
): Record<string, unknown> {
  try {
    const d1 = new Date(date1.replace(/\//g, "-"));
    const d2 = new Date(date2.replace(/\//g, "-"));

    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
      return { error: `Invalid date format` };
    }

    const diffMs = Math.abs(d2.getTime() - d1.getTime());
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const seconds = totalSeconds % (60 * 60 * 24);

    return {
      date1,
      date2,
      days,
      seconds,
      total_seconds: totalSeconds,
      weeks: Math.floor(days / 7),
      months_approx: Math.floor(days / 30),
      years_approx: Math.floor(days / 365),
    };
  } catch (e) {
    return { error: `Invalid date format: ${(e as Error).message}` };
  }
}

function convertTimezone(
  dtStr: string,
  fromTz: string,
  toTz: string,
): Record<string, unknown> {
  // Validate timezones
  try {
    Intl.DateTimeFormat("en", { timeZone: fromTz });
  } catch {
    return { error: `Invalid timezone: ${fromTz}` };
  }
  try {
    Intl.DateTimeFormat("en", { timeZone: toTz });
  } catch {
    return { error: `Invalid timezone: ${toTz}` };
  }

  try {
    // Parse the input datetime string
    const dt = new Date(dtStr);
    if (isNaN(dt.getTime())) {
      return { error: `Invalid datetime format: ${dtStr}` };
    }

    // Format in target timezone
    const converted = formatDatetime(dt, undefined, toTz);
    const isoStr = dt.toLocaleString("sv-SE", { timeZone: toTz }).replace(" ", "T");

    return {
      original: dtStr,
      from_timezone: fromTz,
      to_timezone: toTz,
      converted,
      converted_iso: isoStr,
    };
  } catch (e) {
    return { error: `Invalid datetime format: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv);

  let result: Record<string, unknown>;

  if (args.diff) {
    result = calculateDiff(args.diff[0], args.diff[1]);
  } else if (args.convert) {
    if (!args.fromTz || !args.toTz) {
      result = { error: "Both --from-tz and --to-tz required for conversion" };
    } else {
      result = convertTimezone(args.convert, args.fromTz, args.toTz);
    }
  } else {
    result = getCurrentTime(args.timezone, args.format);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
