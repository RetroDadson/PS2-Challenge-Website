export const fullTurn = Math.PI * 2;

export const wheelPalette = ["#e91e63", "#6a1b9a", "#9146ff", "#ad1457", "#7b1fa2", "#e65100"];

export function sliceAngle(sliceCount: number): number {
  return sliceCount > 0 ? fullTurn / sliceCount : fullTurn;
}

export function normaliseAngle(angle: number): number {
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function sliceUnderPointer(rotation: number, sliceCount: number): number {
  if (sliceCount <= 0) return -1;
  return Math.min(sliceCount - 1, Math.floor(normaliseAngle(-rotation) / sliceAngle(sliceCount)));
}

export function restingRotation(sliceCount: number, sliceIndex: number, stopOffset: number): number {
  return normaliseAngle(-(sliceIndex + stopOffset) * sliceAngle(sliceCount));
}

export function spinTarget(startRotation: number, sliceCount: number, sliceIndex: number, stopOffset: number, extraTurns: number): number {
  const remainder = normaliseAngle(restingRotation(sliceCount, sliceIndex, stopOffset) - startRotation);
  return startRotation + extraTurns * fullTurn + remainder;
}

export function extraTurnsFor(durationMs: number): number {
  return Math.max(3, Math.round((durationMs / 1000) * 1.2));
}

export function easeOutQuart(progress: number): number {
  const clamped = clamp(progress, 0, 1);
  return 1 - (1 - clamped) ** 4;
}

export function easeInOutCubic(progress: number): number {
  const clamped = clamp(progress, 0, 1);
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

export function spinRotation(startRotation: number, targetRotation: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return targetRotation;
  return startRotation + (targetRotation - startRotation) * easeOutQuart(elapsedMs / durationMs);
}

export function tweenPositions(previousOrder: readonly number[], nextOrder: readonly number[], progress: number): Map<number, number> {
  const previous = new Map(previousOrder.map((entryId, index) => [entryId, index]));
  const eased = easeInOutCubic(progress);
  return new Map(
    nextOrder.map((entryId, index) => {
      const from = previous.get(entryId) ?? index;
      return [entryId, from + (index - from) * eased];
    })
  );
}

export function sliceColourIndex(position: number, sliceCount: number, paletteSize: number): number {
  if (sliceCount <= 0 || paletteSize <= 0) return 0;
  const index = ((Math.round(position) % sliceCount) + sliceCount) % sliceCount;
  const colour = index % paletteSize;
  const wrapsOntoFirst = sliceCount > 1 && index === sliceCount - 1 && colour === 0;
  return wrapsOntoFirst ? 1 % paletteSize : colour;
}

export type LabelLayout = { fontSize: number; innerRadius: number; outerRadius: number; showPicker: boolean };

export function labelLayout(sliceCount: number, radius: number): LabelLayout | null {
  const angle = sliceAngle(sliceCount);
  const outerRadius = radius - 16;
  const hubRadius = radius * 0.24;
  const largestFont = radius * 0.065;
  const twoLineFont = Math.min(largestFont, (angle * radius * 0.5) / 2.7);
  if (twoLineFont >= 13) {
    return { fontSize: twoLineFont, innerRadius: Math.max(hubRadius, (twoLineFont * 2.7) / angle), outerRadius, showPicker: true };
  }
  const fontSize = clamp((angle * radius * 0.45) / 1.3, 11, Math.max(11, largestFont));
  const innerRadius = Math.max(hubRadius, (fontSize * 1.3) / angle);
  if (outerRadius - innerRadius < fontSize * 4) return null;
  return { fontSize, innerRadius, outerRadius, showPicker: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
