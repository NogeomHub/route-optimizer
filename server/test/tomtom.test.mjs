import test from "node:test";
import assert from "node:assert/strict";
import { TomTomEtaProvider } from "../src/tomtom.mjs";
import { HttpClient } from "../src/providers.mjs";

const shape = "_gjaG_e~s@_ibE_ibE";
const summary = {
  lengthInMeters: 465378,
  travelTimeInSeconds: 16200,
  noTrafficTravelTimeInSeconds: 15900,
  historicTrafficTravelTimeInSeconds: 16300,
  liveTrafficIncidentsTravelTimeInSeconds: 16100,
  trafficDelayInSeconds: 300,
};

test("TomTom provider reconstructs supplied geometry and supplies a credential-free record URL", async () => {
  let call;
  const http = { json: async (...args) => {
    call = args;
    return { routes: [{ summary }] };
  }};
  const provider = new TomTomEtaProvider(http, { apiKey: "test-key" });
  const eta = await provider.reassess({ shape, shapeHash: "abc", distanceKm: 465.4 });
  const requestUrl = new URL(call[0]);
  const recordUrl = new URL(call[5]);
  assert.equal(requestUrl.searchParams.get("traffic"), "true");
  assert.equal(requestUrl.searchParams.get("reconstructionMode"), "strict");
  assert.equal(requestUrl.searchParams.get("computeTravelTimeFor"), "all");
  assert.equal(requestUrl.searchParams.get("key"), "test-key");
  assert.equal(recordUrl.searchParams.has("key"), false);
  assert.equal(call[1].supportingPoints.length, 2);
  assert.equal(eta.durationMinutes, 270);
  assert.equal(eta.distanceKm, 465.4);
});

test("TomTom ETA is rejected when strict reconstruction distance drifts from source route", async () => {
  const http = { json: async () => ({ routes: [{ summary }] }) };
  const provider = new TomTomEtaProvider(http, { apiKey: "test-key" });
  await assert.rejects(
    () => provider.reassess({ shape, distanceKm: 430 }),
    (error) => {
      assert.equal(error.code, "ETA_GEOMETRY_MISMATCH");
      assert.equal(error.details.sourceDistanceKm, 430);
      assert.equal(error.details.tomtomDistanceKm, 465.4);
      return true;
    },
  );
});

test("TomTom ETA accepts small reconstruction distance drift", async () => {
  const http = { json: async () => ({ routes: [{ summary }] }) };
  const provider = new TomTomEtaProvider(http, { apiKey: "test-key" });
  const eta = await provider.reassess({ shape, distanceKm: 460 });
  assert.equal(eta.distanceKm, 465.4);
});

test("HttpClient persists only the sanitized TomTom URL", async () => {
  let recorded;
  const fetchImpl = async () => new Response(JSON.stringify({ routes: [{ summary }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const http = new HttpClient({ fetchImpl, record: async (entry) => { recorded = entry; } });
  const provider = new TomTomEtaProvider(http, { apiKey: "test-key" });
  await provider.reassess({ shape });
  assert.equal(recorded.kind, "tomtom_eta");
  assert.equal(new URL(recorded.url).searchParams.has("key"), false);
  assert.equal(JSON.stringify(recorded).includes("test-key"), false);
});

test("TomTom provider retries 429", async () => {
  let calls = 0, waits = 0;
  const http = { json: async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("rate"), { code: "PROVIDER_RATE_LIMIT" });
    return { routes: [{ summary }] };
  }};
  const provider = new TomTomEtaProvider(http, { apiKey: "test-key", wait: async () => { waits++; } });
  await provider.reassess({ shape });
  assert.equal(calls, 2);
  assert.equal(waits, 1);
});
