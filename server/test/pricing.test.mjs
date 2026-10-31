import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  AuditedTollPricingProvider,
  validateCatalog,
  dateInParis,
} from "../pricing/provider.mjs";
import { decode, analyze } from "../src/geometry.mjs";
import { MemoryStore } from "../src/store.mjs";
import { Jobs } from "../src/jobs.mjs";
const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/pricing-crans-real.json.gz", import.meta.url),
    ),
  ),
);
const provider = new AuditedTollPricingProvider();
const input = (r) => ({
  route: {
    ...r,
    geometry: { type: "LineString", coordinates: decode(r.shape) },
  },
  trace: r.trace,
  origin: fixture.origin,
  destination: fixture.destination,
  on: "2026-10-30",
  vehicleClass: 1,
});
const get = (id) => fixture.routes.find((r) => r.id === id);
test("real current corridor: 22 complete, six A79 partial; complete totals and provenance", async () => {
  const rows = await Promise.all(
    fixture.routes.map(async (r) => ({
      id: r.id,
      ...(await provider.priceRoute(input(r))),
    })),
  );
  assert.equal(rows.filter((r) => r.status === "complete_verified").length, 22);
  assert.deepEqual(
    rows.filter((r) => r.status === "partial").map((r) => r.id),
    ["G006", "G012", "G015", "G017", "G020", "G027"],
  );
  for (const r of rows) {
    if (r.status === "partial") {
      assert.equal(r.totalCents, null);
      assert.ok(
        r.components.some((c) => c.operator === "ALIAE" && c.cents === null),
      );
    } else if (r.totalCents > 0) {
      assert.ok(
        r.components.every(
          (c) =>
            c.source.sha256.length === 64 &&
            c.effectiveFrom === "2026-02-01" &&
            c.vehicleClass === 1,
        ),
      );
    }
  }
  assert.equal(rows.find((r) => r.id === "G004").totalCents, 4070);
  const multiple = rows.find((r) => r.id === "G009");
  assert.equal(multiple.totalCents, 3920);
  assert.deepEqual(
    multiple.components.map((c) => c.cents),
    [1640, 2280],
  );
  assert.equal(rows.find((r) => r.id === "G011").totalCents, 3790);
  assert.equal(
    rows.find((r) => r.id === "G011").components[0].entry,
    "VILLEFRANCHE-NORD",
  );
});
test("outside coverage, reversed corridor, unsupported class and missing strict trace never invent a price", async () => {
  for (const patch of [
    { origin: { lat: 48.85, lon: 2.35 } },
    { origin: fixture.destination, destination: fixture.origin },
    { vehicleClass: 2 },
    { trace: undefined },
  ]) {
    const r = await provider.priceRoute({ ...input(get("G004")), ...patch });
    assert.equal(r.status, "unavailable");
    assert.equal(r.totalCents, null);
  }
});
test("last source/matching verification is not an expiry, including data-verified free routes", async () => {
  for (const on of ["2026-10-30", "2026-10-31", "2027-01-01", "2027-01-31"]) {
    for (const id of ["G004", "G001"]) {
      const r = await provider.priceRoute({ ...input(get(id)), on });
      assert.equal(r.status, "complete_verified");
      assert.equal(r.totalCents, id === "G004" ? 4070 : 0);
      assert.equal(r.matchingVerifiedAt, "2026-10-30");
      assert.equal(r.verificationDue, on >= "2027-01-28");
    }
  }
  const expired = await provider.priceRoute({
    ...input(get("G004")),
    on: "2027-02-01",
  });
  assert.equal(expired.status, "stale");
  assert.equal(expired.totalCents, null);
  assert.equal(expired.knownSubtotalCents, 0);
  assert.ok(expired.reasons.includes("VALIDITY_REVIEW_REQUIRED"));
  assert.equal(dateInParis(Date.parse("2026-10-30T23:30:00Z")), "2026-10-31");
});
test("missing cells, reversed transaction and ambiguous mapping refused independently of official price", () => {
  const t = {
    operator: "APRR",
    system: "closed",
    entry: "AMBERIEU",
    exit: "LES EPRUNES",
    mappingConfidence: "reviewed",
    evidence: [],
  };
  assert.equal(provider.quote(t, { on: "2026-10-30" }).cents, 4070);
  for (const patch of [
    { entry: "LES EPRUNES", exit: "AMBERIEU" },
    { mappingConfidence: "ambiguous" },
    { operator: "UNKNOWN" },
  ])
    assert.equal(
      provider.quote({ ...t, ...patch }, { on: "2026-10-30" }).cents,
      null,
    );
  assert.equal(
    provider.quote(t, { on: "2026-10-30", vehicleClass: 2 }).cents,
    null,
  );
});
const auditedAprr = () =>
  JSON.parse(
    readFileSync(new URL("../pricing/data/aprr-2026.json", import.meta.url)),
  );
const aprrTransaction = {
  operator: "APRR",
  system: "closed",
  entry: "AMBERIEU",
  exit: "LES EPRUNES",
  mappingConfidence: "reviewed",
};
test("injected dates distinguish tariff effect, verification age and annual applicability review", async (t) => {
  const cases = [
    ["2026-01-31", "unavailable", null],
    ["2026-02-01", "verified", 4070],
    ["2026-02-02", "verified", 4070],
    ["2026-06-01", "verified", 4070],
    ["2026-10-30", "verified", 4070],
    ["2026-10-31", "verified", 4070],
    ["2027-01-01", "verified", 4070],
    ["2027-01-31", "verified", 4070], // No known successor yet: not a civil-year expiry.
    ["2027-02-01", "stale", null], // Documented annual review horizon, not source age.
  ];
  for (const [on, status, cents] of cases)
    await t.test(on, () => {
      const clock = () => Date.parse(on + "T12:00:00Z");
      const q = provider.quote(aprrTransaction, { on: dateInParis(clock()) });
      assert.equal(q.status, status);
      assert.equal(q.cents, cents);
      if (status === "verified") {
        assert.equal(q.sourceVerifiedAt, "2026-10-30");
        assert.equal(q.effectiveFrom, "2026-02-01");
        assert.equal(q.effectiveUntil, null);
        assert.equal(q.verificationDue, on >= "2027-01-28");
      }
    });
});
test("an explicit official end is inclusive; an advisory freshness deadline is not an expiry", () => {
  const c = auditedAprr();
  c.effective_until = "2026-11-01";
  c.validity_review_from = null;
  c.verification_due_from = "2026-10-31";
  const p = new AuditedTollPricingProvider({ catalogs: [c] });
  const q = p.quote(aprrTransaction, { on: "2026-10-31" });
  assert.equal(q.status, "verified");
  assert.equal(q.verificationDue, true);
  assert.equal(q.sourceVerifiedAt, "2026-10-30");
  assert.equal(p.quote(aprrTransaction, { on: "2026-11-01" }).cents, 4070);
  const expired = p.quote(aprrTransaction, { on: "2026-11-02" });
  assert.equal(expired.status, "stale");
  assert.equal(expired.reason, "OFFICIAL_VALIDITY_ENDED");
  assert.equal(expired.cents, null);
});
test("a known successor takes over at its own effective date, including before 1 February", () => {
  for (const effective of ["2027-01-15", "2027-02-01"]) {
    const old = auditedAprr(),
      next = auditedAprr();
    Object.assign(next, {
      id: "APRR-2027-test",
      edition: "2027",
      effective_from: effective,
      source_verified_at: "2027-01-10",
      verification_due_from: null,
      validity_review_from: "2028-02-01",
    });
    next.rules = next.rules.filter(
      (r) => r.exit === "LES EPRUNES" && r.entry === "AMBERIEU",
    );
    next.rules[0].cents = 4100; // Synthetic future edition, never activated in product data.
    const p = new AuditedTollPricingProvider({ catalogs: [old, next] });
    assert.equal(p.quote(aprrTransaction, { on: "2027-01-14" }).cents, 4070);
    const q = p.quote(aprrTransaction, { on: effective });
    assert.equal(q.status, "verified");
    assert.equal(q.cents, 4100);
    assert.equal(q.catalogId, next.id);
    for (const patch of [{ rules: [] }, { source_verified_at: null }]) {
      const unreviewed = new AuditedTollPricingProvider({
        catalogs: [old, { ...next, ...patch }],
      });
      const refused = unreviewed.quote(aprrTransaction, { on: effective });
      assert.equal(refused.status, "stale");
      assert.equal(refused.cents, null); // Never fall back to the obsolete edition's cell.
    }
    const otherSeries = new AuditedTollPricingProvider({
      catalogs: [old, { ...next, tariff_series: "another-profile", rules: [] }],
    });
    assert.equal(
      otherSeries.quote(aprrTransaction, { on: "2027-01-15" }).cents,
      4070,
    );
  }
});
test("known official replacement is stale even without importing the successor", () => {
  const c = { ...auditedAprr(), replaced_from: "2026-11-15" };
  const p = new AuditedTollPricingProvider({ catalogs: [c] });
  assert.equal(p.quote(aprrTransaction, { on: "2026-11-14" }).cents, 4070);
  const replaced = p.quote(aprrTransaction, { on: "2026-11-15" });
  assert.equal(replaced.status, "stale");
  assert.equal(replaced.reason, "SOURCE_OFFICIALLY_REPLACED");
  assert.equal(replaced.cents, null);
  const unverified = new AuditedTollPricingProvider({
    catalogs: [
      {
        ...auditedAprr(),
        source_verified_at: null,
        verification_due_from: null,
      },
    ],
  });
  assert.equal(
    unverified.quote(aprrTransaction, { on: "2026-10-31" }).status,
    "stale",
  );
});
test("invalid money, source or duplicate catalogue cannot be activated", () => {
  const original = JSON.parse(
    readFileSync(new URL("../pricing/data/aprr-2026.json", import.meta.url)),
  );
  for (const value of [-1, 1.5, NaN]) {
    const c = structuredClone(original);
    c.rules[0].cents = value;
    assert.throws(() => validateCatalog(c));
  }
  const duplicate = structuredClone(original);
  duplicate.rules.push(duplicate.rules[0]);
  assert.throws(() => validateCatalog(duplicate));
  const missing = structuredClone(original);
  delete missing.rules[0].source;
  assert.throws(() => validateCatalog(missing));
  for (const patch of [
    { effective_from: "2026-02-30" },
    { effective_until: "2026-01-31" },
    { source_verified_at: "not-a-date" },
    { validity_review_from: null }, // No indefinite applicability without an end or review horizon.
    { validity_review_basis: "" },
  ])
    assert.throws(() => validateCatalog({ ...original, ...patch }));
});
// The quote engine remains generic, but ordered free-flow/temporal fixtures below
// are synthetic contracts, never tariffs activated for A79 or another real network.
test("free-flow sequence is not a per-gantry fee; temporal conditions must be satisfied", () => {
  const catalog = {
    id: "synthetic",
    operator: "TEST",
    tariff_series: "TEST-standard",
    effective_from: "2026-01-01",
    effective_until: "2026-12-31",
    source_verified_at: "2026-01-01",
    rules: [
      {
        id: "s",
        system: "free_flow",
        entry: "a",
        exit: "b",
        passages: ["p1", "p2"],
        cents: 123,
        vehicle_class: 1,
        profile: "standard",
        confidence: "confirmed",
        conditions: { period: "peak" },
        source: {
          url: "https://example.test",
          sha256: "a".repeat(64),
          locator: "synthetic",
        },
      },
    ],
  };
  const p = new AuditedTollPricingProvider({ models: [], catalogs: [catalog] });
  const t = {
    operator: "TEST",
    system: "free_flow",
    entry: "a",
    exit: "b",
    passages: ["p1", "p2"],
    mappingConfidence: "reviewed",
  };
  assert.equal(p.quote(t, { on: "2026-10-30" }).cents, null);
  assert.equal(
    p.quote(t, { on: "2026-10-30", context: { period: "peak" } }).cents,
    123,
  );
  assert.equal(
    p.quote(
      { ...t, passages: ["p2", "p1"] },
      { on: "2026-10-30", context: { period: "peak" } },
    ).cents,
    null,
  );
});
async function cachedJob() {
  const store = new MemoryStore();
  let time = Date.parse("2026-10-30T10:00:00Z");
  let network = 0;
  const jobs = new Jobs({
    store,
    provider: {
      id: "no-upstream",
      status() {
        network++;
        throw Error("Unexpected upstream request");
      },
    },
    now: () => time,
    pricingProvider: provider,
  });
  const id = "11111111-1111-4111-8111-111111111111",
    resultKey = "results/" + id;
  const job = {
    id,
    status: "completed",
    origin: fixture.origin,
    destination: fixture.destination,
    provider: "no-upstream",
    graph: fixture.graph,
    parameters: { vehicleClass: 1 },
    expiresAt: time + 48 * 3600000,
    resultKey,
    progress: { stage: "terminé" },
    checkpoint: { routes: [] },
  };
  const routes = [];
  for (const r of fixture.routes) {
    const v = input(r);
    const geometryKey = "geometries/" + r.id;
    await store.put(geometryKey, {
      geometry: v.route.geometry,
      expiresAt: job.expiresAt,
    });
    await jobs.cache.set(
      "analyses",
      {
        provider: job.provider,
        graph: job.graph,
        shapeHash: r.shapeHash,
        shapeMatch: "edge_walk",
        attributesVersion: 1,
        costing: "auto",
      },
      r.trace,
      48 * 3600000,
    );
    routes.push({
      ...r,
      trace: undefined,
      shape: undefined,
      geometryKey,
      tollExposure: analyze(r.trace, v.route),
    });
  }
  await store.put(resultKey, { routes, graph: fixture.graph });
  await store.put("jobs/" + id, job);
  return {
    jobs,
    store,
    id,
    network: () => network,
    advance: (ms) => {
      time += ms;
    },
  };
}
test("old completed routing cache enriched without route/trace calls, with separate persistent quote cache", async () => {
  const h = await cachedJob();
  const first = await h.jobs.view(h.id);
  assert.equal(first.result.pricing.counts.complete_verified, 22);
  assert.equal(first.result.pricing.counts.partial, 6);
  const raw = (await h.store.get("results/" + h.id)).data;
  assert.equal(raw.routes[0].pricing, undefined); // Routing data stays independent.
  const second = await h.jobs.view(h.id);
  assert.deepEqual(first, second);
  assert.equal(h.network(), 0);
  const resumed = new Jobs({ ...h.jobs });
  assert.deepEqual((await resumed.view(h.id)).result, first.result);
  h.advance(14 * 3600000);
  const next = await h.jobs.view(h.id);
  assert.equal(next.result.pricing.counts.complete_verified, 22);
  assert.equal(next.result.pricing.counts.partial, 6);
  assert.equal(next.result.pricing.counts.stale, 0);
  assert.equal(next.result.pricing.on, "2026-10-31");
  assert.equal(h.network(), 0);
});
test("catalogue revision invalidates only monetary cache; routing never relaunched", async () => {
  const h = await cachedJob();
  await h.jobs.view(h.id);
  let called = 0;
  h.jobs.pricingProvider = {
    revision: "replacement-test-provider",
    async priceRoute() {
      called++;
      throw Error("synthetic failure");
    },
  };
  const next = await h.jobs.view(h.id);
  assert.equal(called, 28);
  assert.equal(next.status, "completed");
  assert.equal(next.result.pricing.counts.unavailable, 28);
  assert.equal(h.network(), 0);
});
test("new routing jobs execute tariff stage after strict analysis without coupling upstream to pricing", async () => {
  const { harness, input } = await import("./helpers.mjs");
  const h = harness({ pricingProvider: provider });
  const stages = [];
  const put = h.store.put.bind(h.store);
  h.store.put = async (key, data, condition) => {
    if (key.startsWith("jobs/") && data.progress)
      stages.push(data.progress.stage);
    return put(key, data, condition);
  };
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const before = h.calls.length;
  const view = await h.jobs.view(jobId);
  assert.equal(view.status, "completed");
  assert.ok(stages.indexOf("tarification") > stages.indexOf("analyse"));
  assert.equal(view.result.pricing.counts.unavailable, 1);
  assert.equal(h.calls.length, before);
});
test("pricing boundary rejects incompatible context, unproved money and fabricated free totals", async () => {
  const h = await cachedJob();
  const resultKey = "results/" + h.id;
  const raw = (await h.store.get(resultKey)).data;
  await h.store.put(resultKey, {
    ...raw,
    routes: raw.routes.filter((r) => r.id === "G004"),
  });
  const valid = (on, vehicleClass) => ({
    status: "complete_verified",
    totalCents: 4070,
    knownSubtotalCents: 4070,
    currency: "EUR",
    on,
    vehicleClass,
    coverageComplete: true,
    components: [
      {
        status: "verified",
        cents: 4070,
        source: {
          url: "https://example.test/official",
          sha256: "a".repeat(64),
        },
      },
    ],
  });
  const invalid = [
    (p) => ({ ...p, currency: "USD" }),
    (p) => ({ ...p, on: "2025-01-01" }),
    (p) => ({ ...p, vehicleClass: 2 }),
    (p) => ({ ...p, knownSubtotalCents: 9999 }),
    (p) => ({ ...p, totalCents: 9999 }),
    (p) => ({ ...p, components: [{ status: "verified", cents: 4070 }] }),
    (p) => ({ ...p, totalCents: 0, knownSubtotalCents: 0, components: [] }),
  ];
  for (const [i, corrupt] of invalid.entries()) {
    h.jobs.pricingProvider = {
      revision: "invalid-contract-" + i,
      async priceRoute({ on, vehicleClass }) {
        return corrupt(valid(on, vehicleClass));
      },
    };
    const view = await h.jobs.view(h.id);
    const p = view.result.routes[0].pricing;
    assert.equal(p.status, "unavailable");
    assert.equal(p.totalCents, null);
    assert.equal(p.knownSubtotalCents, 0);
    assert.equal(view.status, "completed");
  }
  h.jobs.pricingProvider = {
    revision: "partial-contract",
    async priceRoute({ on, vehicleClass }) {
      return {
        ...valid(on, vehicleClass),
        status: "partial",
        coverageComplete: false,
        totalCents: 9999,
      };
    },
  };
  const partial = (await h.jobs.view(h.id)).result.routes[0].pricing;
  assert.equal(partial.status, "partial");
  assert.equal(partial.totalCents, null);
  assert.equal(partial.knownSubtotalCents, 4070);
  assert.equal(h.network(), 0);
});
