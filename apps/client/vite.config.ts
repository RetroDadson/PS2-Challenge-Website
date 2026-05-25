import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:5001", xfwd: true },
      "/health": { target: "http://127.0.0.1:5001", xfwd: true },
      "/robots.txt": { target: "http://127.0.0.1:5001", xfwd: true },
      "/sitemap.xml": { target: "http://127.0.0.1:5001", xfwd: true },
      "/votesHub": {
        target: "ws://127.0.0.1:5001",
        ws: true
      },
      "/gamesHub": {
        target: "ws://127.0.0.1:5001",
        ws: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/**/*.d.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
