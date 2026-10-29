import { defineConfig } from "@playwright/test";
const preview = process.env.TEST_PREVIEW === "1";
const rootPreview = process.env.TEST_PREVIEW_ROOT === "1";
const baseURL = preview
  ? `http://127.0.0.1:4173/${rootPreview ? "" : "route-optimizer/"}`
  : "http://127.0.0.1:5173/";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: preview
      ? `npm run preview -- --port 4173 --strictPort${rootPreview ? " --base=/" : ""}`
      : "npm run dev -- --port 5173 --strictPort",
    url: baseURL,
    reuseExistingServer: !preview,
  },
});
