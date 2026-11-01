import test from "node:test";
import assert from "node:assert/strict";
import { TomTomEtaProvider } from "../src/tomtom.mjs";

const shape = "_gjaG_e~s@_ibE_ibE";
const summary = {
  lengthInMeters: 465378,
  travelTimeInSeconds: 16200,
  noTrafficTravelTimeInSeconds: 15900,
  historicTrafficTravelTimeInSeconds: 16300,
  liveTrafficIncidentsTravelTimeInSeconds: 16100,
  trafficDelayInSeconds: 300,
};

test("TomTom provider reconstructs supplied geometry with traffic and keeps key out of URL", async () => {
  let call;
  const http = { json: async (...args) => {
    call = args;
    return { routes: [{ summary }] };
  }};
  const provider = new TomTomEtaProvider(http, { apiKey: "test-key" });
  const eta = await provider.reassess({ shape, shapeHash: "abc" });
  const url = new URL(call[0]);
  assert.equal(url.searchParams.get("traffic"), "true");
  assert.equal(url.searchParams.get("reconstructionMode"), "strict");
  assert.equal(url.searchParams.get("computeTravelTimeFor"), "all");
  assert.equal(url.searchParams.has("key"), false);
  assert.equal(call[4]["TomTom-Api-Key"], "test-key");
  assert.equal(call[1].supportingPoints.length, 2);
  assert.equal(eta.durationMinutes, 270);
  assert.equal(eta.distanceKm, 465.4);
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
