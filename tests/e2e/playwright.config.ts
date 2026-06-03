import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const responsiveRouteSpecs = "routes.spec.ts";
const fullStackSpecs = "fullstack.spec.ts";
const systemChrome = { browserName: "chromium" as const, channel: "chrome" as const, defaultBrowserType: "chromium" as const };
const chromeDevice = (device: NonNullable<(typeof devices)[string]>) => ({ ...device, ...systemChrome });

export default defineConfig({
  testDir: ".",
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run build && tsx tests/e2e/fullstackServer.ts",
    cwd: repoRoot,
    url: "http://127.0.0.1:4173/health",
    reuseExistingServer: false,
    timeout: 180_000
  },
  projects: [
    { name: "chromium", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: chromeDevice(devices["Desktop Chrome"]) },
    { name: "mobile", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: chromeDevice(devices["Pixel 7"]) },
    { name: "edge", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: chromeDevice(devices["Desktop Edge"]) },
    { name: "foldable", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: chromeDevice(devices["Galaxy Fold"] ?? devices["Galaxy S24"]) },
    { name: "iphone", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: chromeDevice(devices["iPhone 15"]) },
    { name: "ipad", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: chromeDevice(devices["iPad Pro 11"]) },
    { name: "fullstack-chromium", testMatch: fullStackSpecs, testIgnore: responsiveRouteSpecs, use: chromeDevice(devices["Desktop Chrome"]) }
  ]
});
