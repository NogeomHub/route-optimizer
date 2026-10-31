import test from "node:test";
import assert from "node:assert/strict";
import { handlers } from "../handlers.mjs";
import { sessionCookie, sessionValid } from "../auth.mjs";
const now = Date.parse("2026-10-31T12:00:00Z"),
  secret = "b".repeat(64);
const cookie = (s) => s.split(";")[0],
  request = (s) =>
    new Request("https://v3.example.test/api/session", {
      headers: { Cookie: cookie(s) },
    });
test("short and remembered sessions have consistent signed server expiry and cookie lifetime", () => {
  const short = sessionCookie(secret, now),
    long = sessionCookie(secret, now, true);
  assert.match(short, /Max-Age=28800/);
  assert.match(long, /Max-Age=7776000/);
  for (const c of [short, long]) {
    assert.match(c, /HttpOnly; Secure; SameSite=Strict/);
    assert.equal(sessionValid(request(c), secret, now), true);
    assert.equal(sessionValid(request(c), "rotated".repeat(10), now), false);
  }
  assert.equal(sessionValid(request(short), secret, now + 8 * 3600000), false);
  assert.equal(
    sessionValid(request(long), secret, now + 8 * 3600000 + 1),
    true,
  );
  assert.equal(
    sessionValid(request(long), secret, now + 90 * 86400000 - 1),
    true,
  );
  assert.equal(sessionValid(request(long), secret, now + 90 * 86400000), false);
  const changed = long.replace(
    /^([^=]+=)\d+/,
    `$1${Math.floor(now / 1000) + 91 * 86400}`,
  );
  assert.equal(sessionValid(request(changed), secret, now), false);
});
test("login opt-in is strictly boolean, defaults short, logout clears persistent cookie", async () => {
  const env = {
    V3_HOSTING_ENABLED: "true",
    V3_SITE_ORIGIN: "https://v3.example.test",
    V3_ACCESS_TOKEN: "a".repeat(64),
    V3_SESSION_SECRET: secret,
    V3_WORKER_TOKEN: "c".repeat(64),
    V3_OPERATOR_CONTACT: "test@example.test",
    V3_FOSSGIS_POLICY_REVIEWED: "true",
  };
  const { api } = handlers({
    env,
    now: () => now,
    makeRuntime: () => {
      throw Error("Session must not start routing");
    },
  });
  const login = (body) =>
    api(
      new Request(env.V3_SITE_ORIGIN + "/api/session", {
        method: "POST",
        headers: { Origin: env.V3_SITE_ORIGIN },
        body: JSON.stringify(body),
      }),
    );
  const short = await login({ token: env.V3_ACCESS_TOKEN });
  assert.match(short.headers.get("set-cookie"), /Max-Age=28800/);
  const long = await login({ token: env.V3_ACCESS_TOKEN, remember: true });
  assert.equal(long.status, 200);
  assert.match(long.headers.get("set-cookie"), /Max-Age=7776000/);
  assert.ok(!long.headers.get("set-cookie").includes(env.V3_ACCESS_TOKEN));
  assert.equal(
    (await login({ token: env.V3_ACCESS_TOKEN, remember: "true" })).status,
    400,
  );
  const out = await api(
    new Request(env.V3_SITE_ORIGIN + "/api/session", {
      method: "DELETE",
      headers: {
        Origin: env.V3_SITE_ORIGIN,
        Cookie: cookie(long.headers.get("set-cookie")),
      },
    }),
  );
  assert.equal(out.status, 200);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});
