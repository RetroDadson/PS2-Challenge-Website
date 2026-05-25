import { parseNullableDateOnly } from "@ps2-challenge/shared";

export function toDateInputValue(value?: string | null): string {
  try {
    return parseNullableDateOnly(value) ?? "";
  } catch {
    return "";
  }
}

export function formatDateOnly(value?: string | null, emptyValue = "-"): string {
  const date = normalizeDateOnly(value);
  if (!date) {
    return emptyValue;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeDateOnly(value?: string | null): string | null {
  try {
    return parseNullableDateOnly(value);
  } catch {
    return value ?? null;
  }
}
