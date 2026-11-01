import test from "node:test";
import assert from "node:assert/strict";
import { handlers } from "../handlers.mjs";

const baseEnv = {
  V3_HOSTING_ENABLED: "true",
  V3_SITE_ORIGIN: "https://precious-custard-773d34.netlify.app",
  V3_ACCESS_TOKEN: "a".repeat(64),
  V3_SESSION_SECRET: "b".repeat(64),
  V3_WORKER_TOKEN: "c".repeat(64),
  V3_OPERATOR_CONTACT: "test@example.test",
  V3_FOSSGIS_POLICY_REVIEWED: "true",
};
const preview = "https://deploy-preview-11--precious-custard-773d34.netlify.app";

test("deploy preview can use the personal session endpoint only on Netlify's exact preview origin", async () => {
  const env = {
    ...baseEnv,
    CONTEXT: "deploy-preview",
    DEPLOY_PRIME_URL: preview,
  };
  const { api } = handlers({ env });
  const status = await api(new Request(preview + "/api/session"));
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { authenticated: false });

  const login = await api(
    new Request(preview + "/api/session", {
      method: "POST",
      headers: { Origin: preview, "Content-Type": "application/json" },
      body: JSON.stringify({ token: env.V3_ACCESS_TOKEN }),
    }),
  );
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);

  assert.equal(
    (await api(new Request("https://evil.netlify.app/api/session"))).status,
    403,
  );
});

test("preview hostname stays denied outside deploy-preview context", async () => {
  const { api } = handlers({ env: baseEnv });
  assert.equal((await api(new Request(preview + "/api/session"))).status, 403);
});
