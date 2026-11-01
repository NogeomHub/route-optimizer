import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { GpsGuidance, corridorCandidates } from "../src/gps.mjs";
import { decode } from "../src/geometry.mjs";
import { MemoryStore, Cache } from "../src/store.mjs";
import { PROFILES } from "../src/strategy.mjs";
import { IgnGeocoder } from "../src/providers.mjs";
import { createApi } from "../src/api.mjs";
const routes = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/pricing-crans-real.json.gz", import.meta.url),
    ),
  ),
);
const facts = JSON.parse(
  readFileSync(new URL("./fixtures/gps-crans-evidence.json", import.meta.url)),
);
const selected = routes.routes.find((r) => r.id === "G021"),
  reference = routes.routes.find((r) => r.id === "G004");
// The older pricing fixture retained names only where needed for pricing. Restore the
// ordinary-road names from the independently archived real GPS evidence.
for (const e of facts.traceNames) selected.trace.edges[e.index].names = e.names;
const geometry = (r) => ({ type: "LineString", coordinates: decode(r.shape) });
async function setup() {
  let time = Date.parse("2026-10-31T10:00:00Z"),
    calls = 0;
  const now = () => time,
    store = new MemoryStore(),
    cache = new Cache(store, now),
    id = "11111111-1111-4111-8111-111111111111";
  const r = {
      ...selected,
      geometryKey: "geo/selected",
      producedBy: [
        { profile: facts.profile, shapeHash: selected.shapeHash, alternate: 0 },
      ],
    },
    f = { ...reference, geometryKey: "geo/fast" };
  const job = {
    id,
    status: "completed",
    resultKey: "result",
    provider: "no-network",
    graph: facts.graph,
    origin: routes.origin,
    destination: routes.destination,
    expiresAt: time + 86400000,
  };
  await store.put("result", { routes: [r, f] });
  for (const row of [r, f])
    await store.put(row.geometryKey, {
      geometry: geometry(row),
      expiresAt: job.expiresAt,
    });
  const traceKey = {
    provider: job.provider,
    graph: job.graph,
    shapeHash: r.shapeHash,
    shapeMatch: "edge_walk",
    attributesVersion: 1,
    costing: "auto",
  };
  await cache.set("analyses", traceKey, selected.trace, 86400000);
  const rawKey = {
    locations: [job.origin, job.destination],
    parameters: PROFILES[facts.profile],
    provider: job.provider,
    graph: job.graph,
    costing: "auto",
    alternates: 2,
    units: "kilometers",
    language: "fr-FR",
    shape_format: "polyline6",
  };
  await cache.set(
    "valhalla",
    rawKey,
    {
      trip: { legs: [{ shape: selected.shape, maneuvers: facts.maneuvers }] },
      alternates: [],
    },
    86400000,
  );
  const reverseGeocoder = {
    async reverse(p) {
      calls++;
      const entry = facts.reverse.find((r) => {
        const u = new URL(r.url);
        return (
          Number(u.searchParams.get("lon")) === p[0] &&
          Number(u.searchParams.get("lat")) === p[1]
        );
      });
      return entry?.places ?? [];
    },
  };
  const jobs = {
    async read() {
      if (time >= job.expiresAt) throw Error("expired");
      return job;
    },
  };
  const gps = new GpsGuidance({ store, reverseGeocoder, now });
  return {
    store,
    cache,
    id,
    job,
    jobs,
    gps,
    traceKey,
    rawKey,
    reverseGeocoder,
    calls: () => calls,
    advance: (ms) => (time += ms),
  };
}
test("real archived corridor: three ordered full-corridor anchors, evidence, no new routing and persistent guidance cache", async () => {
  const h = await setup(),
    g = await h.gps.get(h.jobs, h.id, "G021");
  assert.equal(g.status, "suggested");
  assert.equal(g.steps.length, 3);
  for (const s of g.steps) {
    assert.ok(Number.isFinite(s.lat));
    assert.ok(Number.isFinite(s.lon));
    assert.ok(s.separationKm >= 2);
    assert.ok(s.offsetMeters <= 80);
    assert.ok(["IGN Géoplateforme", "Valhalla + trace"].includes(s.source));
    assert.ok(s.roads.every((n) => !/^A\s?\d/.test(n)));
  }
  assert.ok(g.steps[0].routeKm < g.steps[1].routeKm);
  assert.ok(g.steps[1].routeKm < g.steps[2].routeKm);
  assert.ok(g.steps[0].routeKm < 35);
  assert.ok(g.steps[2].routeKm > 55);
  assert.match(g.warning, /coordonnées/);
  const calls = h.calls();
  const reopened = new GpsGuidance({
    store: h.store,
    reverseGeocoder: { reverse() { throw Error("should be cached"); } },
    now: h.gps.now,
  });
  assert.deepEqual(await reopened.get(h.jobs, h.id, "G021"), g);
  assert.equal(h.calls(), calls);
  const reference = await h.gps.get(h.jobs, h.id, "G004");
  assert.equal(reference.status, "reference");
  assert.deepEqual(reference.steps, []);
});
test("missing maneuvers or traces never triggers a new routing campaign to invent steps", async () => {
  for (const ns of ["valhalla", "analyses"]) {
    const h = await setup();
    await h.cache.set(ns, ns === "valhalla" ? h.rawKey : h.traceKey, null, 0);
    const g = await h.gps.get(h.jobs, h.id, "G021");
    assert.equal(g.status, "unavailable");
    assert.deepEqual(g.steps, []);
    assert.equal(h.calls(), 0);
  }
});
test("reverse geocoding is optional: route-proven coordinates remain usable", async () => {
  for (const answer of [[], [{ label: "Somewhere", type: "municipality", city: "X", postcode: "12345", lat: 46.11874, lon: 5.194797 }], [{ label: "Far", type: "housenumber", city: "X", postcode: "12345", lat: 48, lon: 2 }]]) {
    const h = await setup();
    h.reverseGeocoder.reverse = async () => answer;
    const g = await h.gps.get(h.jobs, h.id, "G021");
    assert.equal(g.status, "suggested");
    assert.equal(g.steps.length, 3);
    assert.ok(g.steps.some((s) => s.coordinateOnly));
  }
  const h = await setup();
  h.reverseGeocoder.reverse = async () => { throw Error("IGN down"); };
  const g = await h.gps.get(h.jobs, h.id, "G021");
  assert.equal(g.status, "suggested");
  assert.equal(g.steps.length, 3);
  assert.ok(g.steps.every((s) => s.coordinateOnly));
});
test("ordinary-road proof is mandatory; toll/motorway and too complex geometry cannot be proposed", () => {
  const r = geometry(selected),
    f = geometry(reference);
  assert.equal(
    corridorCandidates(
      r,
      f,
      facts.maneuvers.map((m) => ({ ...m, street_names: ["A 6"], toll: true })),
      selected.trace,
    ).reason,
    "NO_ACCESSIBLE_ANCHOR",
  );
  assert.equal(
    corridorCandidates(r, f, facts.maneuvers, {
      ...selected.trace,
      edges: selected.trace.edges.map((e) => ({ ...e, toll: true })),
    }).reason,
    "NO_ACCESSIBLE_ANCHOR",
  );
  assert.equal(
    corridorCandidates(
      {
        coordinates: [
          [2, 48],
          [20, 50],
        ],
      },
      f,
      facts.maneuvers,
      selected.trace,
    ).reason,
    "UNSUPPORTED_GEOMETRY",
  );
});
test("business API exposes guidance behind existing authentication and handles provisional jobs", async () => {
  const h = await setup(),
    token = "x".repeat(64),
    api = createApi({ jobs: h.jobs, guidance: h.gps, token });
  const url = "https://test.example/api/search/" + h.id + "/routes/G021/gps";
  assert.equal((await api(new Request(url))).status, 401);
  const response = await api(
    new Request(url, { headers: { Authorization: "Bearer " + token } }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "suggested");
  h.job.status = "running";
  assert.equal(
    (await h.gps.get(h.jobs, h.id, "G021")).reason,
    "JOB_NOT_COMPLETED",
  );
});
test("IGN reverse uses its own cache and short timeout, no routing service", async () => {
  let calls = 0;
  const cache = new Cache(new MemoryStore()),
    geo = new IgnGeocoder(
      {
        async json(url, payload, kind, timeout) {
          calls++;
          assert.ok(url.startsWith("https://data.geopf.fr/geocodage/reverse?"));
          assert.equal(kind, "reverse_geocoding");
          assert.equal(timeout, 4000);
          return {
            features: [
              {
                properties: {
                  label: "Rue 12345 Commune",
                  city: "Commune",
                  postcode: "12345",
                  type: "street",
                },
                geometry: { coordinates: [5, 46] },
              },
            ],
          };
        },
      },
      cache,
    );
  const a = await geo.reverse([5, 46]);
  assert.deepEqual(await geo.reverse([5, 46]), a);
  assert.equal(calls, 1);
});
