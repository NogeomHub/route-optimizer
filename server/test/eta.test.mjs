import test from "node:test";
import assert from "node:assert/strict";
import { etaShortlist, etaPareto, etaEligible } from "../src/eta.mjs";

const route = (id, minutes, cents, eta = null) => ({
  id,
  durationSeconds: minutes * 60,
  pricing: cents == null ? { status: "partial", totalCents: null } : { status: "complete_verified", totalCents: cents },
  ...(eta == null ? {} : { eta: { status: "ok", durationMinutes: eta } }),
});

test("shortlist keeps fastest route plus monetary Pareto only", () => {
  const routes = [
    route("fast", 300, 4070),
    route("dominated", 310, 4200),
    route("mid", 320, 3430),
    route("cheap", 390, 2030),
    route("unknown", 295, null),
  ];
  assert.deepEqual(etaShortlist(routes), ["unknown", "fast", "mid", "cheap"]);
});

test("TomTom Pareto uses reassessed ETA and verified euro price", () => {
  const routes = [
    route("G004", 298, 4070, 254),
    route("G014", 319, 3430, 265),
    route("G021", 329, 3140, 270),
    route("bad", 305, 4000, 280),
  ];
  assert.deepEqual(etaPareto(routes), ["G004", "G014", "G021"]);
});

test("eligibility is based on TomTom extra time", () => {
  const routes = [
    route("fast", 300, 4000, 254),
    route("good", 330, 3000, 270),
    route("far", 350, 2000, 301),
  ];
  assert.deepEqual(etaEligible(routes, 30), ["fast", "good"]);
});
