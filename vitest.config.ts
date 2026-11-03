import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@chartzap\/core\/(.*)/, replacement: `${root}packages/core/src/$1` },
      { find: "@chartzap/core", replacement: `${root}packages/core/src/index.ts` },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.browser.test.*", "tests/integration/**"],
        },
      },
      { extends: true, test: { name: "integration", include: ["tests/integration/**/*.test.ts"] } },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
