import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const responsiveRouteSpecs = "routes.spec.ts";
const fullStackSpecs = "fullstack.spec.ts";

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
    { name: "chromium", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["Pixel 7"] } },
    { name: "edge", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["Desktop Edge"] } },
    { name: "firefox", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["Desktop Firefox"] } },
    { name: "foldable", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["Galaxy Fold"] } },
    { name: "iphone", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["iPhone 15"] } },
    { name: "ipad", testMatch: responsiveRouteSpecs, testIgnore: fullStackSpecs, use: { ...devices["iPad Pro 11"] } },
    { name: "fullstack-chromium", testMatch: fullStackSpecs, testIgnore: responsiveRouteSpecs, use: { ...devices["Desktop Chrome"] } }
  ]
});
