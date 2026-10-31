import { describe, it, expect } from "vitest";
import { pareto, friendly, type DynamicRoute } from "./provider";
const route = (id: string, seconds: number, exposure: number | null) =>
  ({
    id,
    durationSeconds: seconds,
    distanceKm: 100,
    geometryUrl: "",
    tollExposure: exposure === null ? null : { tollKm: exposure },
  }) satisfies DynamicRoute;
describe("V3 exposure decisions", () => {
  it("retains actual tradeoffs, excludes unknown exposure and dominated routes", () => {
    expect(
      pareto([
        route("fast", 100, 10),
        route("low", 200, 0),
        route("dominated", 210, 3),
        route("unknown", 50, null),
      ]).map((r) => r.id),
    ).toEqual(["fast", "low"]);
  });
  it("does not invent an intermediate compromise when one route dominates", () => {
    expect(
      pareto([route("best", 100, 0), route("other", 200, 10)]).map((r) => r.id),
    ).toEqual(["best"]);
  });
  it("hides technical errors and explains timeout and ambiguity", () => {
    expect(friendly("PROVIDER_HTTP")).not.toMatch(/HTTP|Valhalla|Node/);
    expect(friendly("TIME_BUDGET")).toContain("Délai dépassé");
    expect(friendly("NEEDS_SELECTION")).toContain("Plusieurs adresses");
  });
});
