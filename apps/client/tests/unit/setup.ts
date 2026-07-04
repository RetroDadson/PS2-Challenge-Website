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

afterEach(() => cleanup());
