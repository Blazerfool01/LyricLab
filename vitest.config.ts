import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/domain/**/*.test.ts"] } });
