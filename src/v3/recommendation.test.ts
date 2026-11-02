import { describe, it, expect } from "vitest";
import { recommendation } from "./recommendation";
import type { DynamicRoute } from "./provider";
const route = (
  id: string,
  seconds: number,
  cents: number,
  status = "complete_verified",
) =>
  ({
    id,
    durationSeconds: seconds,
    distanceKm: 100,
    geometryUrl: "",
    tollExposure: { tollKm: 20 },
    pricing: {
      status,
      totalCents: cents,
      knownSubtotalCents: cents,
      currency: "EUR",
      vehicleClass: 1,
      on: "2026-10-31",
      components: [],
      coverageComplete: status === "complete_verified",
    },
  }) as DynamicRoute;
describe("transparent recommendation", () => {
  it("selects the best eligible compromise with deterministic duration/id tie-break", () => {
    const rows = [
      route("fast", 100, 4000),
      route("B", 200, 3000),
      route("A", 200, 3000),
      route("tooSlow", 4000, 0),
    ];
    expect(recommendation(rows, 45, 0)?.route.id).toBe("A");
    expect(recommendation([...rows].reverse(), 45, 1000)?.route.id).toBe("A");
    expect(recommendation(rows, 0, 0)?.route.id).toBe("fast");
    expect(recommendation(rows, 0, 0)?.meets).toBe(true);
  });
  it("can prefer an efficient compromise over the maximum toll saving", () => {
    const rows = [
      route("fast", 60 * 60, 4000),
      route("efficient", 70 * 60, 3400),
      route("maxSaving", 100 * 60, 3000),
    ];
    expect(recommendation(rows, 45, 0)?.route.id).toBe("efficient");
  });
  it("uses successful TomTom ETA for the detour constraint and compromise score", () => {
    const fast = route("G004", 298 * 60, 4070);
    fast.eta = { status: "ok", provider: "tomtom", durationMinutes: 254 };
    const compromise = route("G021", 329 * 60, 3140);
    compromise.eta = {
      status: "ok",
      provider: "tomtom",
      durationMinutes: 270,
    };
    expect(recommendation([fast, compromise], 20, 0)?.route.id).toBe("G021");
    expect(recommendation([fast, compromise], 15, 0)?.route.id).toBe("G004");
  });
  it("never promotes partial/unavailable/stale subtotal as certain savings", () => {
    for (const status of ["partial", "unavailable", "stale"]) {
      expect(
        recommendation(
          [
            route("F", 100, 4000),
            route("unknown", 150, 0, status),
            route("B", 200, 3000),
          ],
          45,
          0,
        )?.route.id,
      ).toBe("B");
      const unknownReference = recommendation(
        [route("F", 100, 0, status), route("B", 200, 3000)],
        45,
        0,
      )!;
      expect(unknownReference.meets).toBe(false);
      expect(unknownReference.view.saving(unknownReference.route)).toBe(null);
    }
  });
  it("reports unmet criteria and offers cheapest inside detour without claiming eligibility", () => {
    const r = recommendation(
      [route("F", 100, 4000), route("B", 200, 3000), route("tooSlow", 4000, 0)],
      45,
      2000,
    )!;
    expect(r.route.id).toBe("B");
    expect(r.meets).toBe(false);
    expect(r.reason).toBe("SAVING_UNMET");
    expect(recommendation([], 45, 0)).toBe(null);
  });
});
