import test from "node:test";
import assert from "node:assert/strict";
import { harness, input, trace as oldTrace } from "./helpers.mjs";
import { Jobs } from "../src/jobs.mjs";
import { encode } from "./helpers.mjs";
import { hash } from "../src/util.mjs";
import { PROFILES } from "../src/strategy.mjs";
import {
  calculateTollMetrics,
  TEMPORAL_TRACE_VERSION,
} from "../src/toll-metrics.mjs";

// Synthetic completed pre-feature job, with retained v1 trace/geometry and a
// misleading current derived version. No actual routing provider is contacted.
async function legacy({ free = false } = {}) {
  const temporalRequests = [];
  const timed = {
    ...structuredClone(oldTrace),
    edges: [
      {
        ...oldTrace.edges[0],
        toll: !free,
        end_node: { elapsed_time: 100 },
      },
    ],
  };
  const h = harness({
    provider: {
      trace: async (r) => {
        temporalRequests.push(r);
        return structuredClone(timed);
      },
    },
  });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const job = await h.jobs.read(jobId);
  delete job.temporalAnalysis;
  const result = (await h.store.get(job.resultKey)).data;
  for (const route of result.routes) {
    route.producedBy = [
      { profile: 25, alternate: 0, shapeHash: route.shapeHash },
    ];
    route.tollDurationSeconds =
      route.tollDurationRatio =
      route.tollDurationSource =
      route.tollDurationTotalSeconds =
        null;
    route.tollDurationReason = "TIMING_UNAVAILABLE";
    delete route.temporalTraceVersion;
    delete route.temporalTraceGraph;
  }
  job.checkpoint.routes = structuredClone(result.routes);
  await h.store.put(job.resultKey, result);
  await h.store.put("jobs/" + jobId, job);
  for (const key of h.store.records.keys())
    if (key.startsWith("cache/analyses/")) h.store.records.delete(key);
  const v1 = structuredClone(timed);
  delete v1.edges[0].end_node;
  const route = result.routes[0];
  await h.jobs.cache.set(
    "analyses",
    {
      provider: job.provider,
      graph: job.graph,
      shapeHash: route.shapeHash,
      shapeMatch: "edge_walk",
      attributesVersion: 1,
      costing: "auto",
    },
    v1,
    h.jobs.ttlMs,
  );
  temporalRequests.length = 0;
  h.dispatched.length = 0;
  const routeCalls = h.calls.filter((c) => c.kind === "route").length;
  return { ...h, jobId, job, result, timed, temporalRequests, routeCalls };
}

test("v1 paid analysis is queued once and enriched in place, with exact costing and no routing campaign", async () => {
  const h = await legacy();
  const before = await h.jobs.view(h.jobId);
  assert.equal(before.status, "queued");
  assert.equal(before.result.routes[0].tollDurationSeconds, null);
  assert.equal(before.result.routes[0].temporalTraceVersion, null);
  assert.equal(
    h.temporalRequests.length,
    0,
    "HTTP reads only dispatch a background operation",
  );
  assert.equal((await h.jobs.run(h.jobId)).completed, true);
  const after = await h.jobs.view(h.jobId);
  const route = after.result.routes[0];
  assert.equal(after.status, "completed");
  assert.equal(route.id, h.result.routes[0].id);
  assert.equal(route.temporalTraceVersion, TEMPORAL_TRACE_VERSION);
  assert.equal(route.tollMetricsVersion, 2);
  assert.equal(route.tollDurationSeconds, 100);
  assert.equal(route.tollDurationRatio, 1);
  assert.equal(route.tollDurationTotalSeconds, 100);
  assert.equal(route.tollDurationSource, "valhalla_trace");
  assert.equal(
    after.progress.profilesExecuted,
    h.job.progress.profilesExecuted,
  );
  assert.equal(h.calls.filter((c) => c.kind === "route").length, h.routeCalls);
  assert.equal(h.temporalRequests.length, 1);
  assert.deepEqual(h.temporalRequests[0].costingOptions, PROFILES[25]);
  assert.equal(after.temporalAnalysis.status, "ready");
  const stored = (await h.store.get((await h.jobs.read(h.jobId)).resultKey))
    .data.routes[0];
  assert.equal(stored.temporalTraceVersion, 2);
  const trace = await h.jobs.cachedTrace(await h.jobs.read(h.jobId), stored);
  assert.equal(trace.edges[0].end_node.elapsed_time, 100);
});

test("cached search and concurrent readers dispatch one enrichment; concurrent runners issue one trace", async () => {
  const h = await legacy();
  const [reused] = await Promise.all([
    h.jobs.create(input),
    h.jobs.view(h.jobId),
    h.jobs.view(h.jobId),
  ]);
  assert.equal(reused.jobId, h.jobId);
  assert.equal(reused.reused, true);
  assert.equal(reused.status, "queued");
  assert.equal(h.dispatched.length, 1);
  await Promise.all([h.jobs.run(h.jobId), h.jobs.run(h.jobId)]);
  assert.equal(h.temporalRequests.length, 1);
  assert.equal((await h.jobs.read(h.jobId)).status, "completed");
});

test("an already temporal job or retained temporal trace causes no provider request", async () => {
  const h = await legacy();
  const route = h.result.routes[0];
  await h.jobs.cache.set(
    "analyses",
    {
      provider: h.job.provider,
      graph: h.job.graph,
      shapeHash: route.shapeHash,
      shapeMatch: "edge_walk",
      attributesVersion: 2,
      costing: "auto",
      costingOptions: PROFILES[25],
    },
    h.timed,
    h.jobs.ttlMs,
  );
  assert.equal(
    (await h.jobs.view(h.jobId)).result.routes[0].tollDurationSeconds,
    100,
  );
  assert.equal((await h.jobs.create(input)).status, "completed");
  assert.equal(h.dispatched.length, 0);
  assert.equal(h.temporalRequests.length, 0);
});

for (const mode of ["network failure", "provider omits timing"])
  test(`${mode}: unknown stays null, retry is bounded, and a later attempt can recover`, async () => {
    const h = await legacy();
    h.provider.trace = async () => {
      h.temporalRequests.push({});
      if (mode === "network failure")
        throw Object.assign(new Error("synthetic outage"), {
          code: "PROVIDER_HTTP",
        });
      const t = structuredClone(h.timed);
      delete t.edges[0].end_node;
      return t;
    };
    await h.jobs.view(h.jobId);
    await h.jobs.run(h.jobId);
    const failed = await h.jobs.view(h.jobId);
    assert.equal(failed.status, "completed");
    assert.equal(failed.result.routes[0].tollDurationSeconds, null);
    assert.equal(failed.result.routes[0].tollDurationSource, null);
    assert.equal(
      failed.result.routes[0].tollDurationReason,
      "TIMING_UNAVAILABLE",
    );
    assert.equal(failed.temporalAnalysis.status, "partial");
    await h.jobs.view(h.jobId);
    assert.equal(h.dispatched.length, 1);
    assert.equal(h.temporalRequests.length, 1);
    h.advance(60001);
    h.provider.trace = async () => {
      h.temporalRequests.push({});
      return structuredClone(h.timed);
    };
    assert.equal((await h.jobs.view(h.jobId)).status, "queued");
    await h.jobs.run(h.jobId);
    assert.equal(
      (await h.jobs.view(h.jobId)).result.routes[0].tollDurationSeconds,
      100,
    );
    assert.equal(
      h.calls.filter((c) => c.kind === "route").length,
      h.routeCalls,
    );
  });

test("verified free v1 coverage needs no timing fetch and is distinct from unknown", async () => {
  const h = await legacy({ free: true });
  const view = await h.jobs.view(h.jobId);
  assert.equal(view.status, "completed");
  assert.equal(view.result.routes[0].tollDurationSeconds, 0);
  assert.equal(view.result.routes[0].tollDurationRatio, 0);
  assert.equal(view.result.routes[0].tollDurationSource, "verified_no_toll");
  assert.equal(view.result.routes[0].temporalTraceVersion, null);
  assert.equal(h.dispatched.length, 0);
  assert.equal(h.temporalRequests.length, 0);
});

test("dead enrichment runner resumes its persisted temporal checkpoint without routing or retracing", async () => {
  const h = await legacy();
  await h.jobs.view(h.jobId);
  const queued = await h.jobs.read(h.jobId);
  const route = queued.checkpoint.routes[0];
  const geometry = (await h.store.get(route.geometryKey)).data;
  Object.assign(
    route,
    calculateTollMetrics(h.timed, { ...route, ...geometry }),
  );
  route.temporalTraceConfirmed = false;
  route.temporalTraceGraph = h.job.graph;
  await h.jobs.cache.set(
    "temporal-pending",
    {
      jobId: h.jobId,
      provider: h.job.provider,
      graph: h.job.graph,
      shapeHash: route.shapeHash,
      shapeMatch: "edge_walk",
      attributesVersion: 2,
      costing: "auto",
      costingOptions: PROFILES[25],
    },
    h.timed,
    h.jobs.ttlMs,
  );
  queued.status = "running";
  queued.owner = "dead-worker";
  queued.attempts++;
  await h.store.put("jobs/" + h.jobId, queued);
  await h.store.put("locks/job/" + h.jobId, {
    owner: "dead-worker",
    fence: 1,
    until: h.now() - 1,
  });
  const reopened = new Jobs({ ...h.jobs });
  await reopened.run(h.jobId);
  assert.equal(
    (await reopened.view(h.jobId)).result.routes[0].tollDurationSeconds,
    100,
  );
  assert.equal(h.temporalRequests.length, 0);
  const finished = await reopened.read(h.jobId);
  const stored = (await h.store.get(finished.resultKey)).data.routes[0];
  assert.equal(stored.temporalTraceConfirmed, true);
  assert.equal(
    (await reopened.cachedTrace(finished, stored)).edges[0].end_node
      .elapsed_time,
    100,
  );
  assert.equal(h.calls.filter((c) => c.kind === "route").length, h.routeCalls);
});

test("provider contention preserves the queued enrichment and valid historical result", async () => {
  const h = await legacy();
  await h.jobs.view(h.jobId);
  await h.store.put("locks/provider/" + h.provider.id, {
    owner: "other-job",
    until: h.now() + 100,
  });
  assert.equal((await h.jobs.run(h.jobId)).reason, "provider_busy");
  assert.equal((await h.jobs.read(h.jobId)).status, "queued");
  h.advance(101);
  await h.jobs.run(h.jobId);
  assert.equal(
    (await h.jobs.view(h.jobId)).result.routes[0].tollDurationSeconds,
    100,
  );
});

test("cancelling an in-flight enrichment fences the returned trace and stops the worker", async () => {
  const h = await legacy();
  await h.jobs.view(h.jobId);
  let entered, release;
  const started = new Promise((resolve) => (entered = resolve));
  h.provider.trace = async () => {
    entered();
    await new Promise((resolve) => (release = resolve));
    return h.timed;
  };
  const running = h.jobs.run(h.jobId);
  await started;
  await h.jobs.cancel(h.jobId);
  release();
  await running;
  assert.equal((await h.jobs.read(h.jobId)).status, "cancelled");
  assert.equal(h.calls.filter((c) => c.kind === "route").length, h.routeCalls);
});

test("a newer stable graph is recorded separately and still requires original geometry and total", async () => {
  const h = await legacy();
  h.provider.status = async () => ({
    version: "new-provider",
    tileset_last_modified: 2,
  });
  await h.jobs.view(h.jobId);
  await h.jobs.run(h.jobId);
  const view = await h.jobs.view(h.jobId);
  assert.deepEqual(view.graph, h.job.graph);
  assert.deepEqual(view.result.routes[0].temporalTraceGraph, {
    version: "new-provider",
    tileset: 2,
  });
  assert.equal(view.result.routes[0].tollDurationSeconds, 100);
  assert.ok(
    await h.jobs.cachedTrace(await h.jobs.read(h.jobId), view.result.routes[0]),
  );
});

test("a graph change during enrichment never publishes the tentative temporal result", async () => {
  const h = await legacy();
  let statuses = 0;
  h.provider.status = async () => ({
    version: "test",
    tileset_last_modified: ++statuses,
  });
  await h.jobs.view(h.jobId);
  await h.jobs.run(h.jobId);
  const view = await h.jobs.view(h.jobId);
  assert.equal(view.status, "completed");
  assert.equal(view.temporalAnalysis.reason, "GRAPH_CHANGED");
  assert.equal(view.result.routes[0].tollDurationSeconds, null);
});

test("unknown profile cannot trigger default-costing enrichment", async () => {
  const h = await legacy();
  h.result.routes[0].producedBy = [];
  await h.store.put(h.job.resultKey, h.result);
  await h.jobs.view(h.jobId);
  await h.jobs.run(h.jobId);
  assert.equal(h.temporalRequests.length, 0);
  assert.equal(
    (await h.jobs.view(h.jobId)).result.routes[0].tollDurationSeconds,
    null,
  );
});

test("a dispatch failure preserves completed results and throttles re-dispatch", async () => {
  const h = await legacy();
  h.jobs.dispatch = async () => {
    throw new Error("synthetic dispatch failure");
  };
  const view = await h.jobs.view(h.jobId);
  assert.equal(view.status, "completed");
  assert.equal(view.temporalAnalysis.reason, "DISPATCH_FAILED");
  assert.equal(view.result.routes[0].tollDurationReason, "TIMING_UNAVAILABLE");
  assert.equal(h.temporalRequests.length, 0);
});

test("each missing geometry uses its representative profile; ready traces are reused on later reads", async () => {
  const h = await legacy();
  const geometry = {
    type: "LineString",
    coordinates: [
      [2, 48],
      [2.02, 48.01],
    ],
  };
  const shape = encode(geometry.coordinates),
    shapeHash = hash(shape);
  const other = {
    ...structuredClone(h.result.routes[0]),
    id: "G002",
    shapeHash,
    geometryKey: "synthetic-second-geometry",
    producedBy: [{ profile: 51, alternate: 0, shapeHash }],
  };
  await h.store.put(other.geometryKey, {
    geometry,
    shape,
    expiresAt: h.job.expiresAt,
  });
  h.result.routes.push(other);
  await h.store.put(h.job.resultKey, h.result);
  h.provider.trace = async (r) => {
    h.temporalRequests.push(r);
    return { ...structuredClone(h.timed), shape: r.shape };
  };
  await h.jobs.view(h.jobId);
  await h.jobs.run(h.jobId);
  const ready = await h.jobs.view(h.jobId);
  assert.equal(ready.result.routes.length, 2);
  assert.equal(
    ready.result.routes.every((r) => r.tollDurationSeconds === 100),
    true,
  );
  assert.deepEqual(
    h.temporalRequests.map((r) => r.costingOptions),
    [PROFILES[25], PROFILES[51]],
  );
  assert.equal(h.calls.filter((c) => c.kind === "route").length, h.routeCalls);
  await h.jobs.view(h.jobId);
  await h.jobs.create(input);
  assert.equal(h.temporalRequests.length, 2);
});

test("a lost queued background acknowledgement can be redispatched with a bounded interval", async () => {
  const h = await legacy();
  await h.jobs.view(h.jobId);
  await h.jobs.create(input);
  assert.equal(h.dispatched.length, 1);
  h.advance(30001);
  await Promise.all([h.jobs.create(input), h.jobs.create(input)]);
  assert.equal(h.dispatched.length, 2);
  await h.jobs.run(h.jobId);
  assert.equal(h.temporalRequests.length, 1);
});

test("temporal capability does not bypass a trace/route duration mismatch", async () => {
  const h = await legacy();
  h.provider.trace = async () => ({
    ...h.timed,
    edges: [{ ...h.timed.edges[0], end_node: { elapsed_time: 120 } }],
  });
  await h.jobs.view(h.jobId);
  await h.jobs.run(h.jobId);
  const route = (await h.jobs.view(h.jobId)).result.routes[0];
  assert.equal(route.temporalTraceVersion, 2);
  assert.equal(route.tollDurationSeconds, null);
  assert.equal(route.tollDurationReason, "TOTAL_MISMATCH");
});

test("a stale enrichment result write cannot replace a successor's committed result", async () => {
  const h = await legacy();
  await h.jobs.view(h.jobId);
  const put = h.store.put.bind(h.store);
  let intervened = false;
  h.store.put = async (key, data, condition) => {
    if (!intervened && key.startsWith("results/" + h.jobId + "/temporal/")) {
      intervened = true;
      const current = (await h.store.get("jobs/" + h.jobId)).data;
      await put("synthetic-successor-result", { ...data, winner: "successor" });
      await put("jobs/" + h.jobId, {
        ...current,
        owner: "successor",
        status: "completed",
        resultKey: "synthetic-successor-result",
        temporalAnalysis: { version: 2, status: "ready" },
      });
    }
    return put(key, data, condition);
  };
  await h.jobs.run(h.jobId);
  assert.equal(intervened, true);
  const finished = await h.jobs.read(h.jobId);
  assert.equal(finished.resultKey, "synthetic-successor-result");
  assert.equal(
    (await h.store.get(finished.resultKey)).data.winner,
    "successor",
  );
});
