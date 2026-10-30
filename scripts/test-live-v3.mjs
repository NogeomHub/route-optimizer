/** Explicit opt-in, one personal campaign at a time. No synthetic fallback. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { startLocal } from "../server/src/local-server.mjs";
import { addTrips } from "../server/src/geometry.mjs";
const args = process.argv.slice(2);
if (!args.includes("--policy-reviewed"))
  throw new Error(
    "Read FOSSGIS terms, then pass --policy-reviewed (personal local use only).",
  );
const rennes = args.includes("--rennes");
const name = rennes ? "rennes-saint-brieuc" : "crans-le-pin";
const origin = rennes
  ? { lon: -1.6884, lat: 48.1159 }
  : { lon: 5.1917, lat: 45.9667 };
const destination = rennes
  ? { lon: -2.7657, lat: 48.5108 }
  : { lon: 2.6286, lat: 48.9138 };
const directory = `.local-v3/live-${name}-${Date.now()}`;
await mkdir(directory, { recursive: true });
const token = randomBytes(32).toString("hex");
const local = await startLocal({
  directory,
  port: 0,
  token,
  policyReviewed: true,
  earlyNoTolls: rennes,
  quiet: true,
});
const summary = {
  name,
  origin,
  destination,
  earlyNoTolls: rennes,
  checkedAt: new Date().toISOString(),
  observations: [],
};
const api = async (path, body) => {
  const r = await fetch(local.baseUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(value));
  return value;
};
try {
  // Commune coordinates explicitly match the validated POC, not an arbitrary IGN candidate.
  const launched = await api("/api/search", { origin, destination });
  let view;
  do {
    view = await api("/api/search/" + launched.jobId);
    summary.observations.push({
      at: Date.now(),
      status: view.status,
      ...view.progress,
    });
    console.log(name, view.status, view.progress);
    if (!["queued", "running", "cancel_requested"].includes(view.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (true);
  assert.equal(view.status, "completed", JSON.stringify(view.error));
  summary.graph = view.graph;
  summary.profiles = view.progress.profilesExecuted;
  summary.uniqueGeometries = view.result.routes.length;
  summary.stopReason = view.result.stopReason;
  const before = await readdir(directory + "/network");
  const warm = await api("/api/search", { origin, destination });
  assert.equal(warm.jobId, launched.jobId);
  assert.equal(warm.reused, true);
  const after = await readdir(directory + "/network");
  const added = await Promise.all(
    after
      .filter((f) => !before.includes(f))
      .map(async (f) =>
        JSON.parse(await readFile(directory + "/network/" + f, "utf8")),
      ),
  );
  assert.equal(
    added.filter((e) => ["route", "trace_attributes"].includes(e.kind)).length,
    0,
  );
  summary.warmCacheWithoutRouteOrTrace = true;
  if (rennes) {
    assert.equal(view.progress.profilesExecuted, 9);
    assert.equal(view.result.stopReason, "experimental_no_toll_after_9");
  } else {
    const extracted = spawnSync(
      "python3",
      [
        "-c",
        `import tarfile,json
with tarfile.open('experiments/valhalla/evidence/2026-10-29/raw-responses.tar.gz') as t:
 print(json.dumps([json.load(t.extractfile(m)) for m in t.getmembers() if m.name.startswith('sweep-live/') and m.name.endswith('-route.response.json')]))`,
      ],
      { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
    );
    assert.equal(extracted.status, 0);
    const old = [];
    JSON.parse(extracted.stdout).forEach((r, i) => addTrips(old, r, i));
    const historical = new Set(old.flatMap((r) => r.memberHashes));
    const current = new Set(view.result.routes.flatMap((r) => r.memberHashes));
    summary.historicalRepresentatives = old.length;
    summary.missingHistoricalHashes = [...historical].filter(
      (h) => !current.has(h),
    );
    summary.newHashes = [...current].filter((h) => !historical.has(h));
    summary.note =
      "Hash differences require graph/geometry investigation; never assert that a changed graph explains them without evidence.";
  }
  summary.status = "passed";
} catch (e) {
  summary.status = "blocked-or-failed";
  summary.error = e.message;
  process.exitCode = 1;
} finally {
  await local.close();
  await writeFile(
    directory + "/summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
}
