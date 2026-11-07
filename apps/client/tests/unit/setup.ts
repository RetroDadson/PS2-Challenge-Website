import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node >= 25 defines globalThis.localStorage (undefined without
// --localstorage-file), which stops vitest copying jsdom's Storage onto the
// test globals. Pull the real implementations from the jsdom instance instead.
const jsdomWindow = (globalThis as { jsdom?: { window?: Record<string, unknown> } }).jsdom?.window;
for (const storageKey of ["localStorage", "sessionStorage"] as const) {
  const storage = jsdomWindow?.[storageKey];
  if (globalThis[storageKey] === undefined && storage) {
    Object.defineProperty(globalThis, storageKey, { configurable: true, value: storage });
  }
}

Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 48 });

afterEach(() => cleanup());

export const canvasCalls: string[] = [];

const fakeContext = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === "measureText") return (text: string) => ({ width: text.length * 10 });
      return (...args: unknown[]) => {
        canvasCalls.push(`${String(property)}:${args.filter((arg) => typeof arg === "string").join(",")}`);
      };
    },
    set() {
      return true;
    }
  }
);

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => fakeContext });

if (globalThis.requestAnimationFrame === undefined) {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number) => globalThis.clearTimeout(handle);
}
