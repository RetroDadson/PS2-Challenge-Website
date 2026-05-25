export function parseDateOnly(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("Unable to parse date");
    }
    return [
      value.getFullYear().toString().padStart(4, "0"),
      (value.getMonth() + 1).toString().padStart(2, "0"),
      value.getDate().toString().padStart(2, "0")
    ].join("-");
  }

  if (typeof value !== "string") {
    throw new TypeError("Date value must be a string or Date");
  }

  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Unable to parse date: ${value}`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseNullableDateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return parseDateOnly(value);
}

export function parseDurationToSeconds(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const dayMatch = /^(\d+)\.(\d{1,2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (dayMatch) {
    const days = Number.parseInt(dayMatch[1]!, 10);
    const hours = Number.parseInt(dayMatch[2]!, 10);
    const minutes = Number.parseInt(dayMatch[3]!, 10);
    const seconds = Number.parseInt(dayMatch[4]!, 10);
    return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  }

  const hourMatch = /^(\d+):(\d{2}):(\d{2})$/.exec(trimmed);
  if (hourMatch) {
    const hours = Number.parseInt(hourMatch[1]!, 10);
    const minutes = Number.parseInt(hourMatch[2]!, 10);
    const seconds = Number.parseInt(hourMatch[3]!, 10);
    return (hours * 60 + minutes) * 60 + seconds;
  }

  throw new TypeError(`Unable to parse TimeSpan: ${value}`);
}

export function formatSecondsAsDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) {
    return null;
  }

  const sign = seconds < 0 ? "-" : "";
  let remaining = Math.abs(Math.trunc(seconds));
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining - minutes * 60;

  return `${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}
