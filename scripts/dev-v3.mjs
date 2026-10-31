import { randomBytes } from "node:crypto";
import { createServer } from "vite";
import { startLocal } from "../server/src/local-server.mjs";
// The secret is process-local and injected by Vite, never delivered to the browser.
if (process.env.V3_FOSSGIS_POLICY_REVIEWED !== "true")
  throw new Error(
    "Lisez les conditions FOSSGIS (docs/V3.md), puis lancez V3_FOSSGIS_POLICY_REVIEWED=true npm run dev:v3. Usage personnel local uniquement.",
  );
const token = randomBytes(32).toString("hex");
const backend = await startLocal({
  directory: ".local-v3",
  token,
  policyReviewed: process.env.V3_FOSSGIS_POLICY_REVIEWED === "true",
  earlyNoTolls: process.env.V3_EARLY_NO_TOLLS === "true",
});
const frontend = await createServer({
  mode: "v3",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: backend.baseUrl,
        configure(proxy) {
          proxy.on("proxyReq", (request) =>
            request.setHeader("Authorization", "Bearer " + token),
          );
        },
      },
    },
  },
});
await frontend.listen();
console.log("V3 locale : port 5173. Ctrl+C pour arrêter. Aucun déploiement.");
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await frontend.close();
  await backend.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
