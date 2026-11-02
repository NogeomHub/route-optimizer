import test from "node:test";
import assert from "node:assert/strict";
import { EtaService } from "../src/eta-service.mjs";

class MemoryCache {
  constructor() { this.rows = new Map(); }
  key(ns, key) { return ns + JSON.stringify(key); }
  async get(ns, key) { return this.rows.get(this.key(ns, key)) ?? null; }
  async set(ns, key, value) { this.rows.set(this.key(ns, key), value); }
}

const priced = (id, minutes, cents) => ({
  id, shapeHash: id, geometryKey: "geo/" + id, durationSeconds: minutes * 60,
  pricing: { status: "complete_verified", totalCents: cents },
});

test("ETA service calls TomTom for every verified-price route and caches results", async () => {
  const cache = new MemoryCache();
  const store = { get: async (key) => ({ data: { shape: "shape-" + key } }) };
  let calls = 0;
  const provider = { id: "tomtom-test", reassess: async (route) => {
    calls++;
    return { provider: "tomtom-test", durationMinutes: route.id === "fast" ? 250 : 265 };
  }};
  const service = new EtaService({ cache, store, provider });
  const job = { parameters: { maxExtraMinutes: 30 } };
  const result = { routes: [priced("fast", 300, 4000), priced("mid", 320, 3000), priced("dominated", 330, 3500)], exposurePareto: ["fast", "mid"] };
  const first = await service.enrich(job, result);
  assert.equal(calls, 3);
  assert.deepEqual(first.eta.shortlist, ["fast", "mid", "dominated"]);
  assert.deepEqual(first.etaPareto, ["fast", "mid"]);
  assert.deepEqual(first.eligibleRouteIds, ["fast", "mid", "dominated"]);
  await service.enrich(job, result);
  assert.equal(calls, 3);
});

test("ETA failure is briefly cached and never masquerades as ETA Pareto", async () => {
  const cache = new MemoryCache();
  const store = { get: async () => ({ data: { shape: "shape" } }) };
  let calls = 0;
  const provider = { id: "tomtom-test", reassess: async () => {
    calls++;
    throw Object.assign(new Error("down"), { code: "TIMEOUT" });
  }};
  const service = new EtaService({ cache, store, provider, failureTtlMs: 60_000 });
  const result = { routes: [priced("fast", 300, 4000)], exposurePareto: ["fast"], eligibleRouteIds: ["fast"] };
  const job = { parameters: { maxExtraMinutes: 30 } };
  const first = await service.enrich(job, result);
  const second = await service.enrich(job, result);
  assert.equal(calls, 1);
  assert.equal(first.routes[0].eta.status, "fallback");
  assert.equal(first.eta.failures, 1);
  assert.equal(second.eta.failures, 1);
  assert.equal(first.eta.failureCacheTtlSeconds, 60);
  assert.deepEqual(first.etaPareto, []);
  assert.deepEqual(first.eligibleRouteIds, ["fast"]);
});
