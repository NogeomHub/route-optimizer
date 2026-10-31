import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../src/store.mjs";
import { harness, input, response } from "./helpers.mjs";
import { startLocal } from "../src/local-server.mjs";
test("FileStore persists jobs and rejects concurrent stale CAS after recreation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v3-store-"));
  try {
    const store = new FileStore(dir);
    await store.put("cas", { n: 1 });
    const row = await store.get("cas");
    const writes = await Promise.all(
      [2, 3].map((n) => store.put("cas", { n }, { etag: row.etag })),
    );
    assert.equal(writes.filter(Boolean).length, 1);
    const h = harness({ store });
    const { jobId } = await h.jobs.create(input);
    await h.jobs.run(jobId);
    const reloaded = harness({ store: new FileStore(dir) });
    assert.deepEqual(await reloaded.jobs.view(jobId), await h.jobs.view(jobId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("partial geometry is accessible before all profiles and analyses finish", async () => {
  const h = harness();
  const { jobId } = await h.jobs.create(input);
  let entered, release;
  const waiting = new Promise((r) => {
    entered = r;
  });
  let count = 0;
  h.provider.route = async () => {
    if (++count === 2) {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    return structuredClone(response);
  };
  const task = h.jobs.run(jobId);
  await waiting;
  const view = await h.jobs.view(jobId);
  assert.equal(view.result.partial, true);
  assert.equal(view.result.routes.length, 1);
  assert.equal((await h.jobs.geometry(jobId, "G001")).type, "LineString");
  assert.equal(view.result.routes[0].tollExposure, null);
  await h.jobs.cancel(jobId);
  release();
  await task;
  assert.equal((await h.jobs.view(jobId)).status, "cancelled");
});
test("actual loopback API enforces auth and origin without any upstream request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v3-http-"));
  const local = await startLocal({
    directory: dir,
    port: 0,
    token: "synthetic-test-token-12345678901234567890",
    policyReviewed: true,
    quiet: true,
  });
  try {
    assert.equal((await fetch(local.baseUrl + "/api/about")).status, 200);
    assert.equal(
      (await fetch(local.baseUrl + "/api/geocode?q=Paris")).status,
      401,
    );
    assert.equal(
      (
        await fetch(local.baseUrl + "/api/about", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
  } finally {
    await local.close();
    await rm(dir, { recursive: true, force: true });
  }
});
