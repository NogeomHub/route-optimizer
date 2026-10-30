import test from "node:test";
import assert from "node:assert/strict";
import { nextProfile, SEEDS, PROFILES } from "../src/strategy.mjs";
import {
  addTrips,
  trips,
  decode,
  analyze,
  optimize,
} from "../src/geometry.mjs";
import { response, trip, trace, encode, points } from "./helpers.mjs";
import { readFile } from "node:fs/promises";

function run(observe, limit = 40) {
  const history = [];
  let next;
  while ((next = nextProfile(history, { maxProfiles: limit })))
    history.push({
      profile: next.index,
      routes: observe(next.index, history.length),
    });
  return history;
}
test("deterministic seeds, all four penalties, strict 40 ceiling and retained exclude probe", () => {
  const a = run((i) => ["unique-" + i]),
    b = run((i) => ["unique-" + i]);
  assert.deepEqual(a, b);
  assert.equal(a.length, 40);
  assert.deepEqual(
    a.slice(0, 9).map((h) => h.profile),
    SEEDS,
  );
  assert.equal(new Set(a.map((h) => h.profile)).size, 40);
  assert.deepEqual(
    [...new Set(SEEDS.map((i) => PROFILES[i].toll_booth_penalty))],
    [0, 300, 900, 1800],
  );
  assert.equal(PROFILES[SEEDS[0]].exclude_tolls, true);
  assert.throws(() => nextProfile([], { maxProfiles: 41 }));
});
test("stagnation stops no earlier than 12; opaque geometry relabeling leaves decisions unchanged", () => {
  assert.equal(run(() => ["same"]).length, 12);
  assert.deepEqual(
    run((i) => ["a" + (i % 3)]).map((h) => h.profile),
    run((i) => ["opaque" + (i % 3)]).map((h) => h.profile),
  );
});
test("frozen REAL archive fixtures produce exact Python reference order and all 28 opaque routes", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("./fixtures/frozen-strategy.json", import.meta.url),
      "utf8",
    ),
  );
  const history = run((i) => fixture.profiles[i].routes);
  assert.deepEqual(
    history.map((h) => "P" + String(h.profile + 1).padStart(3, "0")),
    fixture.expectedOrder,
  );
  assert.equal(new Set(history.flatMap((h) => h.routes)).size, 28);
});
test("no future response access: function receives only the actually queried profile", () => {
  const queried = [];
  const a = run((i) => {
    queried.push(i);
    return ["route-" + (i % 5)];
  });
  const visited = new Set(queried);
  const b = run((i) =>
    visited.has(i) ? ["route-" + (i % 5)] : ["hidden-superb-route"],
  );
  assert.deepEqual(a, b);
  assert.equal(queried.length, a.length);
});
test("all alternates retained, exact/near geometry deduplicated before trace", () => {
  const groups = [];
  const other = encode([
    [2, 48],
    [2.1, 48.1],
  ]);
  const result = {
    trip: trip(),
    alternates: [{ trip: trip() }, { trip: trip(other) }],
  };
  assert.equal(trips(result).length, 3);
  assert.deepEqual(addTrips(groups, result, 104), ["G001", "G001", "G002"]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].producedBy.length, 2);
  assert.equal(groups[1].producedBy[0].alternate, 2);
  addTrips(groups, response, 0);
  assert.equal(groups.length, 2);
});
test("decode and trace validation reject corrupt/missing toll data", () => {
  assert.deepEqual(decode(encode(points)), points);
  assert.throws(() => decode("?"));
  const route = trips(response)[0];
  assert.equal(analyze(trace, route).tollKm, 0);
  assert.throws(() =>
    analyze(
      { ...trace, edges: [{ ...trace.edges[0], toll: undefined }] },
      route,
    ),
  );
  assert.throws(() => trips({ trip: { ...trip(), units: "miles" } }));
});
test("Pareto is exposure only; unknown exposure and all monetary pricing remain unavailable", () => {
  const r = (id, t, k) => ({
    id,
    durationSeconds: t,
    tollExposure: k === null ? null : { tollKm: k },
  });
  assert.deepEqual(
    optimize([
      r("a", 100, 20),
      r("b", 110, 10),
      r("c", 120, 15),
      r("d", 130, null),
    ]),
    ["a", "b"],
  );
});
