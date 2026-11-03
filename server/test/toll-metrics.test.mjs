import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTollMetrics,
  unknownTollMetrics,
  TOLL_METRICS_VERSION,
  SHAPE_POINT_TOLERANCE_METERS,
} from "../src/toll-metrics.mjs";
import { analyze } from "../src/geometry.mjs";
import { encode, harness, input, trace as oldTrace } from "./helpers.mjs";
import { FossgisProvider } from "../src/providers.mjs";
import { EtaService } from "../src/eta-service.mjs";
import { PROFILES } from "../src/strategy.mjs";

function fixture(flags, times = flags.map(() => 10)) {
  const points = Array.from({ length: flags.length + 1 }, (_, i) => [
    2 + i * 0.001,
    48,
  ]);
  const shape = encode(points);
  let elapsed = 0;
  const edges = flags.map((toll, i) => ({
    toll,
    length: 1.4 / flags.length,
    names: [],
    begin_shape_index: i,
    end_shape_index: i + 1,
    end_node: { elapsed_time: (elapsed += times[i]) },
  }));
  const trace = { units: "kilometers", shape, edges };
  const route = {
    id: "route",
    shape,
    distanceKm: 1.4,
    durationSeconds: elapsed,
    geometry: { type: "LineString", coordinates: points },
  };
  return { trace, route };
}
for (const [name, flags, times, seconds] of [
  ["entirely free", [false, false], [20, 80], 0],
  ["partly tolled", [false, true, false], [20, 30, 50], 30],
  ["mostly tolled", [false, true], [10, 90], 90],
  ["entirely tolled", [true, true], [20, 80], 100],
  ["separate toll sections", [true, false, true], [20, 30, 50], 70],
  [
    "frequent alternation",
    Array.from({ length: 100 }, (_, i) => i % 2 === 0),
    Array(100).fill(1),
    50,
  ],
])
  test(`edge cumulative durations: ${name}`, () => {
    const { trace, route } = fixture(flags, times);
    const metrics = calculateTollMetrics(trace, route);
    assert.equal(metrics.tollDurationSeconds, seconds);
    assert.equal(metrics.tollDurationRatio, seconds / route.durationSeconds);
    assert.ok(metrics.tollDurationSeconds <= route.durationSeconds);
    assert.ok(metrics.tollDurationRatio >= 0 && metrics.tollDurationRatio <= 1);
    assert.equal(metrics.tollDistanceKm, analyze(trace, route).tollKm);
    assert.equal(metrics.tollDurationTotalSeconds, route.durationSeconds);
  });

test("missing, negative, non-finite or decreasing timing stays unknown, never zero", () => {
  for (const value of [undefined, null, -1, NaN, Infinity, 5]) {
    const { trace, route } = fixture([false, true], [10, 90]);
    trace.edges[1].end_node.elapsed_time = value;
    const m = calculateTollMetrics(trace, route);
    assert.equal(m.tollDurationSeconds, null);
    assert.equal(m.tollDurationRatio, null);
    assert.equal(m.tollDistanceKm, 0.7);
  }
});
test("missing times can prove free only with complete, continuous toll=false coverage", () => {
  const { trace, route } = fixture([false, false]);
  for (const e of trace.edges) delete e.end_node;
  assert.equal(calculateTollMetrics(trace, route).tollDurationSeconds, 0);
  trace.edges[0].end_shape_index = 0;
  assert.equal(calculateTollMetrics(trace, route).tollDurationSeconds, null);
  assert.equal(
    unknownTollMetrics({ ...route, tollExposure: { tollKm: 0 } })
      .tollDurationSeconds,
    null,
  );
});
test("gaps, overlaps, uncovered endpoints and changed shapes never yield timing", () => {
  for (const mutate of [
    (t) => (t.edges[0].begin_shape_index = 1),
    (t) => (t.edges[1].begin_shape_index = 0),
    (t) => (t.edges[1].end_shape_index = 1),
    (t) =>
      (t.shape = encode([
        [2, 48],
        [2.001, 48.00001],
        [2.002, 48],
      ])),
  ]) {
    const { trace, route } = fixture([true, false]);
    mutate(trace);
    assert.equal(calculateTollMetrics(trace, route).tollDurationSeconds, null);
  }
});
test("the real Crans 11 cm projection difference preserves toll duration and ratio", () => {
  const { trace, route } = fixture([true, false], [30, 70]);
  const points = [
    [5.19389, 45.963565],
    [5.194196, 45.963543],
    [5.195, 45.9636],
  ];
  route.shape = encode(points);
  route.geometry.coordinates = points;
  trace.shape = encode([[5.19389, 45.963566], ...points.slice(1)]);
  assert.notEqual(trace.shape, route.shape);
  assert.equal(SHAPE_POINT_TOLERANCE_METERS, 0.2);
  const metrics = calculateTollMetrics(trace, route);
  assert.equal(metrics.tollDurationSeconds, 30);
  assert.equal(metrics.tollDurationRatio, 0.3);
  assert.equal(metrics.tollDurationTotalSeconds, 100);
  assert.equal(metrics.tollDurationSource, "valhalla_trace");
  assert.equal(metrics.tollDurationReason, null);
  assert.equal(metrics.tollMetricsVersion, TOLL_METRICS_VERSION);
});
test("pointwise matching rejects over 20 cm, interior deviations and changed vertex mapping", () => {
  for (const points of [
    [
      [2, 48.000002],
      [2.001, 48],
      [2.002, 48],
    ], // ~22 cm, already outside the limit
    [
      [2, 48],
      [2.001, 48.00001],
      [2.002, 48],
    ], // ~1.1 m inside the route
    [
      [2, 48],
      [2.002, 48],
    ], // missing vertex
    [
      [2, 48],
      [2.001, 48],
      [2.002, 48],
      [2.0021, 48],
    ], // extra vertex
    [
      [2, 48],
      [2.002, 48],
      [2.001, 48],
    ], // reordered vertices
  ]) {
    const { trace, route } = fixture([true, false], [30, 70]);
    trace.shape = encode(points);
    // Keep indices valid so rejection is specifically about shape correspondence.
    trace.edges.at(-1).end_shape_index = points.length - 1;
    const metrics = calculateTollMetrics(trace, route);
    assert.equal(metrics.tollDurationReason, "TRACE_SHAPE_MISMATCH");
    assert.equal(metrics.tollDurationSeconds, null);
    assert.equal(metrics.tollDurationRatio, null);
  }
});
test("microdifferences still require continuous edge coverage and consistent cumulative times", () => {
  for (const mutate of [
    (t) => (t.edges[1].begin_shape_index = 0),
    (t) => (t.edges[1].end_shape_index = 1),
    (t) => (t.edges[1].end_node.elapsed_time = 5),
    (t) => (t.edges[1].end_node.elapsed_time = 120),
  ]) {
    const { trace, route } = fixture([true, false], [30, 70]);
    trace.shape = encode([
      [2, 48.000001],
      [2.001, 48],
      [2.002, 48],
    ]);
    mutate(trace);
    const metrics = calculateTollMetrics(trace, route);
    assert.equal(metrics.tollDurationSeconds, null);
    assert.equal(metrics.tollDurationRatio, null);
    assert.notEqual(metrics.tollDurationReason, "TRACE_SHAPE_MISMATCH");
  }
});
test("a fully verified free route stays zero with a microdifference and no elapsed times", () => {
  const { trace, route } = fixture([false, false], [30, 70]);
  trace.shape = encode([
    [2, 48.000001],
    [2.001, 48],
    [2.002, 48],
  ]);
  trace.edges.forEach((e) => delete e.end_node);
  const metrics = calculateTollMetrics(trace, route);
  assert.equal(metrics.tollDistanceKm, 0);
  assert.equal(metrics.tollDurationSeconds, 0);
  assert.equal(metrics.tollDurationRatio, 0);
  assert.equal(metrics.tollDurationSource, "verified_no_toll");
});
test("a different trace total is rejected instead of scaling by the whole-route ETA", () => {
  const { trace, route } = fixture([false, true], [10, 90]);
  route.durationSeconds = 120;
  const m = calculateTollMetrics(trace, route);
  assert.equal(m.tollDurationReason, "TOTAL_MISMATCH");
  assert.equal(m.tollDurationSeconds, null);
  assert.equal(m.tollDistanceKm, 0.7);
});
test("maneuvers, price and rounded edge speed are never duration sources", () => {
  const { trace, route } = fixture([false, true]);
  trace.edges.forEach((e) => {
    delete e.end_node;
    e.speed = 100;
  });
  route.maneuvers = [{ toll: true, time: 20 }];
  route.pricing = { totalCents: 9999 };
  assert.equal(calculateTollMetrics(trace, route).tollDurationSeconds, null);
  route.pricing.totalCents = 0;
  assert.equal(calculateTollMetrics(trace, route).tollDurationSeconds, null);
});
test("trace request asks for engine elapsed time and retains original costing options", () => {
  let payload;
  const p = new FossgisProvider(
    { json: (_url, body) => (payload = body) },
    { policyReviewed: true },
  );
  p.trace({ shape: "shape", costingOptions: PROFILES[25] });
  assert.equal(payload.shape_match, "edge_walk");
  assert.ok(payload.filters.attributes.includes("node.elapsed_time"));
  assert.deepEqual(payload.costing_options.auto, PROFILES[25]);
});
test("new jobs retain metrics, reuse trace cache and enrich old stored results without network", async () => {
  const timed = {
    ...oldTrace,
    edges: [
      { ...oldTrace.edges[0], toll: true, end_node: { elapsed_time: 100 } },
    ],
  };
  let traceCalls = 0;
  const h = harness({
    provider: {
      trace: async () => {
        traceCalls++;
        return structuredClone(timed);
      },
    },
  });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const first = await h.jobs.view(jobId);
  const route = first.result.routes[0];
  assert.equal(route.tollDurationSeconds, 100);
  assert.equal(traceCalls, 1);
  const second = await h.jobs.create({
    ...input,
    parameters: { maxExtraMinutes: 46 },
  });
  await h.jobs.run(second.jobId);
  assert.notEqual(second.jobId, jobId);
  assert.equal(
    traceCalls,
    1,
    "a distinct job with the same geometry/costing reuses the temporal trace",
  );
  const row = await h.jobs.read(jobId);
  const raw = (await h.store.get(row.resultKey)).data;
  for (const r of raw.routes)
    for (const k of Object.keys(r))
      if (
        k.startsWith("tollDuration") ||
        k === "tollDistanceKm" ||
        k === "tollMetricsVersion"
      )
        delete r[k];
  await h.store.put(row.resultKey, raw);
  const calls = h.calls.length;
  assert.equal(
    (await h.jobs.view(jobId)).result.routes[0].tollDurationSeconds,
    100,
  );
  assert.equal(h.calls.length, calls);
  const geometry = (await h.store.get(route.geometryKey)).data;
  const assessed = await new EtaService({
    cache: h.jobs.cache,
    store: h.store,
    provider: {
      id: "simulated-tomtom",
      reassess: async () => ({ durationMinutes: 1 }),
    },
  }).enrich(row, first.result);
  assert.ok(geometry.shape);
  assert.equal(assessed.routes[0].tollDurationSeconds, 100);
  assert.equal(assessed.routes[0].tollDurationTotalSeconds, 100);
  assert.equal(assessed.routes[0].tollDurationRatio, 1);
  assert.equal(assessed.routes[0].eta.durationMinutes, 1);
});

test("legacy cached null-source mismatches are recalculated without new route or trace requests", async () => {
  const timed = {
    ...oldTrace,
    shape: encode([
      [2, 48.000001],
      [2.01, 48.01],
    ]),
    edges: [
      { ...oldTrace.edges[0], toll: true, end_node: { elapsed_time: 100 } },
    ],
  };
  let traceCalls = 0;
  const h = harness({
    provider: {
      trace: async () => {
        traceCalls++;
        return structuredClone(timed);
      },
    },
  });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const job = await h.jobs.read(jobId);
  const raw = (await h.store.get(job.resultKey)).data;
  for (const version of [undefined, 1]) {
    for (const route of raw.routes) {
      Object.assign(route, {
        tollDurationSeconds: null,
        tollDurationRatio: null,
        tollDurationTotalSeconds: null,
        tollDurationSource: null,
        tollDurationReason: "TRACE_SHAPE_MISMATCH",
      });
      if (version === undefined) delete route.tollMetricsVersion;
      else route.tollMetricsVersion = version;
    }
    await h.store.put(job.resultKey, raw);
    const before = h.calls.length;
    const view = await h.jobs.view(jobId);
    const route = view.result.routes[0];
    assert.equal(route.tollMetricsVersion, TOLL_METRICS_VERSION);
    assert.equal(route.tollDurationSeconds, 100);
    assert.equal(route.tollDurationRatio, 1);
    assert.equal(route.tollDurationSource, "valhalla_trace");
    assert.equal(route.tollDurationReason, null);
    assert.equal(h.calls.length, before);
    assert.equal(traceCalls, 1);
  }
  const reused = await h.jobs.create(input);
  assert.equal(reused.jobId, jobId);
  assert.equal(reused.reused, true);
  // Losing the evidence cannot turn a cached failure into an invented zero.
  for (const key of h.store.records.keys())
    if (key.startsWith("cache/analyses/")) h.store.records.delete(key);
  const unavailable = (await h.jobs.view(jobId)).result.routes[0];
  assert.equal(unavailable.tollDurationSeconds, null);
  assert.equal(unavailable.tollDurationRatio, null);
  assert.equal(unavailable.tollDurationSource, null);
});

test("resumed legacy checkpoints recompute already analyzed metrics from retained traces", async () => {
  const timed = {
    ...oldTrace,
    edges: [
      { ...oldTrace.edges[0], toll: true, end_node: { elapsed_time: 100 } },
    ],
  };
  let traceCalls = 0;
  const h = harness({
    provider: {
      trace: async () => {
        traceCalls++;
        return structuredClone(timed);
      },
    },
  });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const job = await h.jobs.read(jobId);
  job.status = "queued";
  job.resultKey = null;
  for (const route of job.checkpoint.routes) {
    delete route.tollMetricsVersion;
    route.tollDurationSeconds = null;
    route.tollDurationSource = null;
    route.tollDurationReason = "TRACE_SHAPE_MISMATCH";
  }
  await h.store.put("jobs/" + jobId, job);
  await h.jobs.run(jobId);
  const finished = await h.jobs.read(jobId);
  assert.equal(finished.status, "completed");
  const route = (await h.store.get(finished.resultKey)).data.routes[0];
  assert.equal(route.tollMetricsVersion, TOLL_METRICS_VERSION);
  assert.equal(route.tollDurationSeconds, 100);
  assert.equal(route.tollDurationSource, "valhalla_trace");
  assert.equal(traceCalls, 1);
});
