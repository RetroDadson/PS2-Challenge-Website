export function compareNullable(left?: string | null, right?: string | null): number {
  return (left ?? "").localeCompare(right ?? "", "en-GB");
}
