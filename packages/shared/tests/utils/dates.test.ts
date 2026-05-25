import { describe, expect, it } from "vitest";
import { formatSecondsAsDuration, parseDateOnly, parseDurationToSeconds, parseNullableDateOnly } from "../../src/utils/dates.js";

describe("date and duration helpers", () => {
  it("parses date-only and date-time values to yyyy-mm-dd", () => {
    expect(parseDateOnly("2024-01-15")).toBe("2024-01-15");
    expect(parseDateOnly("2024-03-05T10:30:00Z")).toBe("2024-03-05");
  });

  it("rejects invalid date inputs", () => {
    expect(() => parseDateOnly(new Date(Number.NaN))).toThrow("Unable to parse date");
    expect(() => parseDateOnly(123)).toThrow("Date value must be a string or Date");
    expect(() => parseDateOnly("not-a-date")).toThrow("Unable to parse date: not-a-date");
  });

  it("preserves local date values from database Date objects", () => {
    expect(parseDateOnly(new Date(2002, 5, 20))).toBe("2002-06-20");
  });

  it("allows nullish nullable dates", () => {
    expect(parseNullableDateOnly(null)).toBeNull();
    expect(parseNullableDateOnly("")).toBeNull();
  });

  it("parses timespan strings including durations over 24 hours", () => {
    expect(parseDurationToSeconds("10:30:45")).toBe(37_845);
    expect(parseDurationToSeconds("4.04:00:00")).toBe(360_000);
  });

  it("formats seconds as hhh:mm:ss compatible strings", () => {
    expect(formatSecondsAsDuration(null)).toBeNull();
    expect(formatSecondsAsDuration(undefined)).toBeNull();
    expect(formatSecondsAsDuration(37_845)).toBe("10:30:45");
    expect(formatSecondsAsDuration(360_000)).toBe("100:00:00");
    expect(formatSecondsAsDuration(-65.9)).toBe("-00:01:05");
  });
});
