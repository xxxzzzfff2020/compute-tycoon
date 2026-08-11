import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/e2e/**/*.e2e.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
  },
});
