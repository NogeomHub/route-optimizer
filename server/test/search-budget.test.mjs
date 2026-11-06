import test from "node:test";
import assert from "node:assert/strict";
import { harness, input } from "./helpers.mjs";
import { Jobs } from "../src/jobs.mjs";
import { searchLimits } from "../src/search-budget.mjs";
import { HttpClient } from "../src/providers.mjs";

test("economic defaults and operator limits reject unbounded configuration", () => {
  assert.deepEqual(searchLimits({}), { maxProviderCalls: 32, maxProfiles: 12 });
  for (const value of ["", "0", "193", "NaN", "3.2", "Infinity"])
    assert.throws(() => searchLimits({ V3_MAX_PROVIDER_CALLS: value }));
  assert.throws(() => searchLimits({ V3_MAX_PROFILES: "41" }));
  assert.deepEqual(
    searchLimits({ V3_MAX_PROVIDER_CALLS: "64", V3_MAX_PROFILES: "24" }),
    { maxProviderCalls: 64, maxProfiles: 24 },
  );
});

test("hard ceiling includes statuses and preserves partial geometries on exhaustion", async () => {
  const h = harness({ maxProviderCalls: 4, maxProfiles: 12 });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const view = await h.jobs.view(jobId);
  assert.equal(view.error.code, "CALL_BUDGET");
  assert.equal(view.callBudget.used, 4);
  assert.equal(h.calls.length, 4);
  assert.equal(view.status, "failed");
  assert.equal(view.result.partial, true);
  assert.ok(view.result.routes.length);
  assert.ok(await h.jobs.geometry(jobId, view.result.routes[0].id));
  const before = h.calls.length;
  await h.jobs.run(jobId);
  assert.equal(h.calls.length, before);
});

test("a worker restart never resets already reserved calls", async () => {
  const h = harness({ maxProviderCalls: 4 });
  const { jobId } = await h.jobs.create(input);
  // Simulate a lost response/process after two earlier reservations.
  await h.jobs.update(jobId, (j) => ({
    ...j,
    callBudget: { ...j.callBudget, used: 3 },
  }));
  const restarted = new Jobs({ ...h.jobs });
  await restarted.run(jobId);
  assert.equal((await restarted.read(jobId)).callBudget.used, 4);
  assert.equal((await restarted.view(jobId)).error.code, "CALL_BUDGET");
  assert.equal(h.calls.length, 2); // initial preflight, then one worker status
});

test("failed upstream attempts consume reservations, with no automatic retry", async () => {
  const h = harness({ maxProviderCalls: 8 });
  const { jobId } = await h.jobs.create(input);
  h.provider.route = async () => {
    throw new Error("simulated disconnect");
  };
  await h.jobs.run(jobId);
  const job = await h.jobs.read(jobId);
  assert.equal(job.callBudget.used, 3);
  assert.equal(job.callBudget.counts.route, 1);
  await h.jobs.run(jobId);
  assert.equal((await h.jobs.read(jobId)).callBudget.used, 3);
});

test("bounded completed search is reused without route/trace calls", async () => {
  const h = harness({ ...searchLimits({}) });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  const first = await h.jobs.view(jobId);
  assert.equal(first.status, "completed");
  assert.equal(first.progress.profileCeiling, 12);
  assert.ok(first.callBudget.used <= 32);
  const calculations = () => h.calls.filter((c) => c.kind !== "status").length;
  const before = calculations();
  assert.equal((await h.jobs.create(input)).jobId, jobId);
  await h.jobs.view(jobId);
  assert.equal(calculations(), before);
});

test("budget/profile settings participate in search identity", async () => {
  const h = harness({ maxProviderCalls: 32, maxProfiles: 12 });
  const first = await h.jobs.create(input);
  const other = new Jobs({ ...h.jobs, maxProviderCalls: 48 });
  assert.notEqual((await other.create(input)).jobId, first.jobId);
});

test("untracked historical checkpoint fails closed instead of starting a fresh allowance", async () => {
  const h = harness();
  const { jobId } = await h.jobs.create(input);
  await h.jobs.update(jobId, (j) => {
    delete j.callBudget;
    return j;
  });
  const before = h.calls.length;
  await h.jobs.run(jobId);
  assert.equal((await h.jobs.view(jobId)).error.code, "CALL_BUDGET_UNTRACKED");
  assert.equal(h.calls.length, before);
});

test("FOSSGIS retains the stricter two-second cadence", async () => {
  const h = harness({
    provider: { id: "fossgis-valhalla-personal-poc" },
    maxProfiles: 3,
  });
  const { jobId } = await h.jobs.create(input);
  await h.jobs.run(jobId);
  for (let i = 1; i < h.calls.length; i++)
    assert.ok(h.calls[i].at - h.calls[i - 1].at >= 2000);
  assert.throws(() => new Jobs({ ...h.jobs, delayMs: 999 }));
});

test("HTTP quota and provider outage stay distinguishable", async () => {
  for (const [status, code] of [
    [429, "PROVIDER_RATE_LIMIT"],
    [503, "PROVIDER_UNAVAILABLE"],
  ]) {
    const http = new HttpClient({
      fetchImpl: async () => new Response("down", { status }),
    });
    await assert.rejects(
      http.json("https://example.invalid", {}, "route"),
      (e) => e.code === code,
    );
  }
  const http = new HttpClient({
    fetchImpl: async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
  });
  await assert.rejects(
    http.json("https://example.invalid", {}, "route"),
    (e) => e.code === "TIMEOUT",
  );
});
