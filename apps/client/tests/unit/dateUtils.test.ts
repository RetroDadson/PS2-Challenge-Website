import { describe, expect, it } from "vitest";
import { formatDateOnly, toDateInputValue } from "../../src/dateUtils.js";

describe("client date utilities", () => {
  it("formats ISO and date-only values for display and date inputs", () => {
    expect(toDateInputValue("2024-03-05T10:30:00Z")).toBe("2024-03-05");
    expect(formatDateOnly("2024-03-05")).toBe("05/03/2024");
  });

  it("uses empty and fallback values for null or invalid dates", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("not-a-date")).toBe("");
    expect(formatDateOnly(null)).toBe("-");
    expect(formatDateOnly(null, "Not set")).toBe("Not set");
    expect(formatDateOnly("not-a-date")).toBe("not-a-date");
  });
});
