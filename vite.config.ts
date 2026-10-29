import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  // Keep local development at /; production assets target the project Pages URL.
  base: mode === "production" ? "/route-optimizer/" : "/",
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"] },
}));
