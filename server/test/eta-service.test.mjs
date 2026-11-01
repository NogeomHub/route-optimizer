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

test("ETA service calls TomTom only for shortlist and caches results", async () => {
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
  assert.equal(calls, 2);
  assert.deepEqual(first.eta.shortlist, ["fast", "mid"]);
  assert.deepEqual(first.etaPareto, ["fast", "mid"]);
  assert.deepEqual(first.eligibleRouteIds, ["fast", "mid"]);
  await service.enrich(job, result);
  assert.equal(calls, 2);
});

test("ETA failure falls back without making failed ETA authoritative", async () => {
  const cache = new MemoryCache();
  const store = { get: async () => ({ data: { shape: "shape" } }) };
  const provider = { id: "tomtom-test", reassess: async () => { throw Object.assign(new Error("down"), { code: "TIMEOUT" }); } };
  const service = new EtaService({ cache, store, provider });
  const result = { routes: [priced("fast", 300, 4000)], exposurePareto: ["fast"], eligibleRouteIds: ["fast"] };
  const enriched = await service.enrich({ parameters: { maxExtraMinutes: 30 } }, result);
  assert.equal(enriched.routes[0].eta.status, "fallback");
  assert.equal(enriched.eta.failures, 1);
  assert.deepEqual(enriched.etaPareto, ["fast"]);
});
