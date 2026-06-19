import { defineConfig } from "vitest/config";

// Unit tests target pure logic (timeline helpers + reducer), so the default
// Node environment is enough — no DOM or jsdom needed.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
