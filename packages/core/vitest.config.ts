import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Property tests run 1,000+ generated cases each (FC_RUNS=10000 before submission).
    testTimeout: 300_000,
  },
});
