import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-netlify",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5176",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command:
      "npx vite --mode netlify --host 127.0.0.1 --port 5176 --strictPort",
    url: "http://127.0.0.1:5176",
  },
});
