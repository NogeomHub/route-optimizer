import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-v3",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5175",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --mode v3 --host 127.0.0.1 --port 5175 --strictPort",
    url: "http://127.0.0.1:5175",
  },
});
