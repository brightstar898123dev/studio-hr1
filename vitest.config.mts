import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // "server-only" throws outside Next.js server components; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    // Tests never touch real services.
    env: { MOCK_AI: "true", MOCK_EMAIL: "true", MOCK_DB: "true", APP_TIMEZONE: "Asia/Kolkata", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
  },
});
