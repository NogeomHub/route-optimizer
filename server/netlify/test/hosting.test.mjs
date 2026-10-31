import test from "node:test";
import assert from "node:assert/strict";
import { getStore } from "@netlify/blobs";
import { BlobsStore } from "../store.mjs";
import { configuration } from "../config.mjs";
import { handlers } from "../handlers.mjs";
import { sessionCookie, sessionValid } from "../auth.mjs";
import { dispatchBackground } from "../runtime.mjs";
import { Jobs } from "../../src/jobs.mjs";
import { AuditedTollPricingProvider } from "../../pricing/provider.mjs";
import { harness, input, response, trace } from "../../test/helpers.mjs";
const env = {
  V3_HOSTING_ENABLED: "true",
  V3_SITE_ORIGIN: "https://v3.example.test",
  V3_ACCESS_TOKEN: "a".repeat(64),
  V3_SESSION_SECRET: "b".repeat(64),
  V3_WORKER_TOKEN: "c".repeat(64),
  V3_OPERATOR_CONTACT: "test@example.test",
  V3_FOSSGIS_POLICY_REVIEWED: "true",
};
const config = configuration(env);
const now = () => Date.parse("2026-10-31T10:00:00Z");
function sharedStore() {
  const rows = new Map();
  let generation = 0;
  return new BlobsStore({
    async getWithMetadata(key, options) {
      assert.equal(options.consistency, "strong");
      return structuredClone(rows.get(key) ?? null);
    },
    async setJSON(key, data, options) {
      const old = rows.get(key);
      if (
        (options.onlyIfNew && old) ||
        (options.onlyIfMatch && old?.etag !== options.onlyIfMatch)
      )
        return { modified: false };
      rows.set(key, {
        data: structuredClone(data),
        etag: String(++generation),
      });
      return { modified: true };
    },
  });
}
const req = (path, { method = "GET", body, cookie, headers = {} } = {}) =>
  new Request(env.V3_SITE_ORIGIN + path, {
    method,
    headers: {
      ...(method === "GET" ? {} : { Origin: env.V3_SITE_ORIGIN }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const worker = (id) =>
  req("/.netlify/functions/search-background", {
    method: "POST",
    body: { jobId: id },
    headers: { Authorization: "Bearer " + config.workerToken },
  });
async function login(api) {
  const r = await api(
    req("/api/session", {
      method: "POST",
      body: { token: config.accessToken },
    }),
  );
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
test("real SDK over synthetic HTTP: atomic ETag compare-and-swap, conflicts, persistence", async () => {
  const rows = new Map();
  let n = 0;
  const fetch = async (url, options = {}) => {
    const key = new URL(url).pathname,
      h = new Headers(options.headers),
      old = rows.get(key);
    if ((options.method ?? "GET").toUpperCase() === "GET")
      return old
        ? new Response(JSON.stringify(old.data), {
            headers: { etag: old.etag },
          })
        : new Response(null, { status: 404 });
    if (
      (h.get("if-none-match") === "*" && old) ||
      (h.has("if-match") && h.get("if-match") !== old?.etag)
    )
      return new Response(null, { status: 412 });
    const value = { data: JSON.parse(options.body), etag: String(++n) };
    rows.set(key, value);
    return new Response(null, { headers: { etag: value.etag } });
  };
  const open = () =>
    new BlobsStore(
      getStore({
        name: "synthetic-test",
        siteID: "test",
        token: "synthetic",
        edgeURL: "https://blobs.example.test",
        uncachedEdgeURL: "https://blobs.example.test",
        consistency: "strong",
        fetch,
      }),
    );
  const a = open(),
    b = open();
  assert.equal(await a.get("job"), null);
  assert.equal(await a.put("job", { n: 0 }, { new: true }), true);
  assert.equal(await b.put("job", { n: 8 }, { new: true }), false);
  const original = await a.get("job");
  const results = await Promise.all([
    a.put("job", { n: 1 }, { etag: original.etag }),
    b.put("job", { n: 2 }, { etag: original.etag }),
  ]);
  assert.deepEqual(results, [true, false]);
  assert.equal((await open().get("job")).data.n, 1);
});
test("missing ETag or conditional-write outcome fails closed", async () => {
  const store = new BlobsStore({
    getWithMetadata: async () => ({ data: {} }),
    setJSON: async () => ({}),
  });
  await assert.rejects(store.get("x"), (e) => e.code === "BLOBS_ETAG_MISSING");
  await assert.rejects(store.put("x", {}, { etag: "old" }));
  await assert.rejects(store.put("x", {}, { etag: "" }));
});
test("configuration rejects disabled hosting, weak/duplicate secrets, non-HTTPS origin, missing contact/policy", () => {
  for (const patch of [
    { V3_HOSTING_ENABLED: "false" },
    { V3_ACCESS_TOKEN: "short" },
    { V3_ACCESS_TOKEN: env.V3_WORKER_TOKEN },
    { V3_SITE_ORIGIN: "http://v3.example.test" },
    { V3_SITE_ORIGIN: "https://v3.example.test/" },
    { V3_OPERATOR_CONTACT: "" },
    { V3_FOSSGIS_POLICY_REVIEWED: "false" },
  ])
    assert.throws(() => configuration({ ...env, ...patch }));
});
test("session cookie authentication: no secret exposed, expiry/tamper/CSRF/logout/rotation", async () => {
  let made = 0;
  const { api, background } = handlers({
    env,
    now,
    makeRuntime: () => {
      made++;
      throw Error("must not run");
    },
  });
  assert.equal(
    (await api(req("/api/search", { method: "POST", body: input }))).status,
    401,
  );
  assert.equal(
    (
      await api(
        req("/api/session", { method: "POST", body: { token: "wrong" } }),
      )
    ).status,
    401,
  );
  const r = await api(
    req("/api/session", {
      method: "POST",
      body: { token: config.accessToken },
    }),
  );
  const set = r.headers.get("set-cookie");
  assert.match(set, /HttpOnly/);
  assert.match(set, /Secure/);
  assert.match(set, /SameSite=Strict/);
  assert.ok(!set.includes(config.accessToken));
  const cookie = set.split(";")[0];
  assert.equal(
    (await (await api(req("/api/session", { cookie }))).json()).authenticated,
    true,
  );
  assert.equal(
    sessionValid(
      req("/api/session", { cookie }),
      config.sessionSecret,
      now() + 8 * 3600000,
    ),
    false,
  );
  assert.equal(
    sessionValid(
      req("/api/session", { cookie: cookie + "x" }),
      config.sessionSecret,
      now(),
    ),
    false,
  );
  assert.equal(
    sessionValid(req("/api/session", { cookie }), "rotated".repeat(12), now()),
    false,
  );
  assert.equal(
    (
      await api(
        req("/api/session", {
          method: "DELETE",
          cookie,
          headers: { Origin: "https://evil.test" },
        }),
      )
    ).status,
    403,
  );
  const out = await api(req("/api/session", { method: "DELETE", cookie }));
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  await background(
    req("/.netlify/functions/search-background", {
      method: "POST",
      body: { jobId: "a".repeat(36) },
    }),
  );
  assert.equal(
    (await api(new Request("https://preview.example.test/api/session"))).status,
    403,
  );
  await background(
    new Request(
      "https://preview.example.test/.netlify/functions/search-background",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + config.workerToken },
        body: JSON.stringify({ jobId: "a".repeat(36) }),
      },
    ),
  );
  assert.equal(made, 0);
});
test("dispatcher uses canonical site and separate secret; only HTTP 202 accepted", async () => {
  let seen;
  await dispatchBackground("id", config, async (url, options) => {
    seen = { url, options };
    return new Response(null, { status: 202 });
  });
  assert.equal(
    seen.url,
    env.V3_SITE_ORIGIN + "/.netlify/functions/search-background",
  );
  assert.equal(
    seen.options.headers.Authorization,
    "Bearer " + config.workerToken,
  );
  assert.equal(seen.options.redirect, "error");
  await assert.rejects(
    dispatchBackground(
      "id",
      config,
      async () => new Response(null, { status: 200 }),
    ),
  );
});
function hosted(providerPatch = {}) {
  const store = sharedStore();
  const base = harness({ store, provider: providerPatch });
  const dispatched = [];
  let runtimes = 0;
  const makeRuntime = () => {
    runtimes++;
    return {
      jobs: new Jobs({
        ...base.jobs,
        store,
        pricingProvider: new AuditedTollPricingProvider(),
        dispatch: async (id) => {
          await dispatchBackground(id, config, async (url, options) => {
            dispatched.push(JSON.parse(options.body).jobId);
            return new Response(null, { status: 202 });
          });
        },
      }),
      http: { close: async () => {} },
    };
  };
  return {
    ...handlers({ env, now, makeRuntime }),
    ...base,
    dispatched,
    runtimes: () => runtimes,
  };
}
test("fresh invocations share product jobs: create, background, progress, results, geometry, cache and pricing", async () => {
  const h = hosted(),
    cookie = await login(h.api);
  const launch = await h.api(
    req("/api/search", { method: "POST", body: input, cookie }),
  );
  assert.equal(launch.status, 202);
  const { jobId } = await launch.json();
  assert.deepEqual(h.dispatched, [jobId]);
  assert.equal(
    (await (await h.api(req("/api/search/" + jobId, { cookie }))).json())
      .status,
    "queued",
  );
  const snapshots = [];
  const put = h.store.put.bind(h.store);
  h.store.put = async (key, data, c) => {
    if (key === "jobs/" + jobId) snapshots.push(structuredClone(data));
    return put(key, data, c);
  };
  await h.background(worker(jobId));
  const view = await (
    await h.api(req("/api/search/" + jobId, { cookie }))
  ).json();
  assert.equal(view.status, "completed");
  assert.ok(view.progress.profilesExecuted <= 40);
  assert.ok(
    snapshots.some(
      (s) => s.progress.profilesExecuted > 0 && s.status === "running",
    ),
  );
  assert.ok(snapshots.some((s) => s.progress.stage === "tarification"));
  assert.equal(view.result.routes[0].pricing.status, "unavailable");
  assert.equal(view.result.routes[0].pricing.totalCents, null);
  const geometry = await h.api(
    req(view.result.routes[0].geometryUrl, { cookie }),
  );
  assert.equal(geometry.status, 200);
  assert.equal((await geometry.json()).coordinates.length, 2);
  const before = h.calls.filter((c) =>
    ["route", "trace"].includes(c.kind),
  ).length;
  const warm = await (
    await h.api(req("/api/search", { method: "POST", body: input, cookie }))
  ).json();
  assert.equal(warm.jobId, jobId);
  assert.equal(warm.reused, true);
  await h.background(worker(jobId));
  assert.equal(
    h.calls.filter((c) => ["route", "trace"].includes(c.kind)).length,
    before,
  );
  assert.ok(h.runtimes() > 5);
  const calls = h.calls;
  for (let i = 1; i < calls.length; i++)
    assert.ok(calls[i].at - calls[i - 1].at >= 2000);
});
test("separate invocations: resume dispatch, duplicate runner blocked, provisional result and cooperative cancel", async () => {
  let release, entered;
  const atSecond = new Promise((r) => (entered = r));
  const held = new Promise((r) => (release = r));
  let routes = 0;
  const h = hosted({
      async route() {
        routes++;
        if (routes === 2) {
          entered();
          await held;
        }
        return structuredClone(response);
      },
    }),
    cookie = await login(h.api);
  const { jobId } = await (
    await h.api(req("/api/search", { method: "POST", body: input, cookie }))
  ).json();
  const running = h.background(worker(jobId));
  await atSecond;
  const progress = await (
    await h.api(req("/api/search/" + jobId, { cookie }))
  ).json();
  assert.equal(progress.status, "running");
  assert.equal(progress.result.partial, true);
  assert.ok(progress.progress.profilesExecuted > 0);
  assert.equal(
    (
      await h.api(
        req("/api/search/" + jobId + "/resume", {
          method: "POST",
          body: {},
          cookie,
        }),
      )
    ).status,
    202,
  );
  assert.equal(h.dispatched.length, 2);
  await assert.rejects(h.background(worker(jobId)), /lease busy/);
  assert.equal(routes, 2);
  assert.equal(
    (
      await h.api(
        req("/api/search/" + jobId + "/cancel", {
          method: "POST",
          body: {},
          cookie,
        }),
      )
    ).status,
    200,
  );
  release();
  await running;
  assert.equal(
    (await (await h.api(req("/api/search/" + jobId, { cookie }))).json())
      .status,
    "cancelled",
  );
  assert.equal(routes, 2);
});
test("queued cancellation never contacts routing provider from background", async () => {
  const h = hosted(),
    cookie = await login(h.api);
  const { jobId } = await (
    await h.api(req("/api/search", { method: "POST", body: input, cookie }))
  ).json();
  await h.api(
    req("/api/search/" + jobId + "/cancel", {
      method: "POST",
      body: {},
      cookie,
    }),
  );
  await h.background(worker(jobId));
  assert.equal(h.calls.filter((c) => c.kind === "route").length, 0);
});

test("expired runner is resumed by a fresh invocation from its persisted checkpoint", async () => {
  let entered;
  const paused = new Promise((resolve) => (entered = resolve));
  const never = new Promise(() => {});
  const parameters = [];
  const h = hosted({
    async route(locations, p) {
      parameters.push(structuredClone(p));
      if (parameters.length === 2) {
        entered();
        await never;
      } // Simulated dead invocation, no active timer/network.
      return structuredClone(response);
    },
  });
  const cookie = await login(h.api);
  const { jobId } = await (
    await h.api(req("/api/search", { method: "POST", body: input, cookie }))
  ).json();
  void h.background(worker(jobId));
  await paused;
  const before = await h.jobs.read(jobId);
  assert.equal(before.checkpoint.history.length, 1);
  h.advance(180001);
  await h.api(
    req("/api/search/" + jobId + "/resume", {
      method: "POST",
      body: {},
      cookie,
    }),
  );
  await h.background(worker(jobId));
  const after = await (
    await h.api(req("/api/search/" + jobId, { cookie }))
  ).json();
  assert.equal(after.status, "completed");
  assert.equal(after.attempts, 2);
  assert.equal(
    parameters.filter(
      (p) => JSON.stringify(p) === JSON.stringify(parameters[0]),
    ).length,
    1,
  );
});
