import { describe, expect, it } from "vitest";
import {
  easeInOutCubic,
  easeOutQuart,
  extraTurnsFor,
  fullTurn,
  labelLayout,
  normaliseAngle,
  restingRotation,
  sliceAngle,
  sliceColourIndex,
  sliceUnderPointer,
  spinRotation,
  spinTarget,
  tweenPositions
} from "../../src/wheelMath.js";

describe("wheel maths", () => {
  it("lands every spin inside the winning slice, from any starting angle", () => {
    for (const sliceCount of [1, 2, 3, 7, 40, 250]) {
      for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex += Math.max(1, Math.floor(sliceCount / 9))) {
        for (const stopOffset of [0.1, 0.5, 0.9]) {
          for (const start of [0, 1.3, -4.2, 37.5]) {
            const target = spinTarget(start, sliceCount, sliceIndex, stopOffset, 5);
            expect(sliceUnderPointer(target, sliceCount)).toBe(sliceIndex);
            expect(target - start).toBeGreaterThanOrEqual(5 * fullTurn);
            expect(target - start).toBeLessThan(6 * fullTurn);
          }
        }
      }
    }
  });

  it("rests on the right slice without spinning", () => {
    expect(sliceUnderPointer(restingRotation(8, 3, 0.5), 8)).toBe(3);
    expect(sliceUnderPointer(0, 4)).toBe(0);
    expect(sliceUnderPointer(0, 0)).toBe(-1);
    expect(sliceAngle(0)).toBe(fullTurn);
    expect(normaliseAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });

  it("eases the spin out and finishes exactly on the target", () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375);
    expect(easeOutQuart(2)).toBe(1);
    expect(spinRotation(1, 11, 0, 1000)).toBe(1);
    expect(spinRotation(1, 11, 5000, 1000)).toBe(11);
    expect(spinRotation(1, 11, 10, 0)).toBe(11);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375);
    expect(extraTurnsFor(1000)).toBe(3);
    expect(extraTurnsFor(10_000)).toBe(12);
  });

  it("slides slices from their old places to their new ones when shuffled", () => {
    expect([...tweenPositions([1, 2, 3], [3, 1, 2], 0)]).toEqual([[3, 2], [1, 0], [2, 1]]);
    expect([...tweenPositions([1, 2, 3], [3, 1, 2], 1)]).toEqual([[3, 0], [1, 1], [2, 2]]);
    expect(tweenPositions([1, 2], [2, 9, 1], 0.5).get(9)).toBe(1);
  });

  it("never gives neighbouring slices the same colour, including where the wheel wraps", () => {
    for (const count of [1, 2, 3, 6, 7, 12, 13, 61]) {
      const colours = Array.from({ length: count }, (_, index) => sliceColourIndex(index, count, 6));
      if (count > 1) {
        colours.forEach((colour, index) => expect(colour).not.toBe(colours[(index + 1) % count]));
      }
    }
    expect(sliceColourIndex(6.4, 7, 6)).toBe(sliceColourIndex(6, 7, 6));
    expect(sliceColourIndex(-1, 7, 6)).toBe(sliceColourIndex(6, 7, 6));
    expect(sliceColourIndex(2, 0, 6)).toBe(0);
  });

  it("shows two-line labels on roomy slices, one line on thin ones and none when they won't fit", () => {
    const roomy = labelLayout(19, 336)!;
    expect(roomy.showPicker).toBe(true);
    expect(roomy.innerRadius).toBeGreaterThanOrEqual(336 * 0.24);
    expect(roomy.outerRadius - roomy.innerRadius).toBeGreaterThan(roomy.fontSize * 3);
    const thin = labelLayout(80, 336)!;
    expect(thin.showPicker).toBe(false);
    expect(thin.fontSize).toBeGreaterThanOrEqual(11);
    expect(labelLayout(150, 336)).toBeNull();
    expect(labelLayout(150, 476)).not.toBeNull();
    expect(labelLayout(400, 476)).toBeNull();
  });
});
