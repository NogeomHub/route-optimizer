import { describe, it, expect } from "vitest";
import {
  complete,
  monetaryView,
  moneyPareto,
  priceLabel,
  type TollPricing,
} from "./pricing";
import type { DynamicRoute } from "./provider";
const route = (
  id: string,
  seconds: number,
  status: TollPricing["status"],
  cents: number | null,
): DynamicRoute => ({
  id,
  durationSeconds: seconds,
  distanceKm: 100,
  geometryUrl: "",
  tollExposure: { tollKm: 10 },
  pricing: {
    status,
    totalCents: cents,
    knownSubtotalCents: 500,
    currency: "EUR",
    vehicleClass: 1,
    on: "2026-10-30",
    components: [],
    coverageComplete: status === "complete_verified",
  },
});
describe("V3 monetary decisions", () => {
  it("never reads partial subtotal or stale/unavailable amounts as a total", () => {
    for (const status of ["partial", "unavailable", "stale"] as const) {
      const r = route("u", 100, status, 500);
      expect(complete(r)).toBe(false);
      expect(moneyPareto([r])).toEqual([]);
      expect(priceLabel(r)).not.toContain("5,00");
    }
  });
  it("computes savings and €/minute only with a complete fastest reference", () => {
    const a = route("a", 600, "complete_verified", 4070),
      b = route("b", 1800, "complete_verified", 3430);
    const v = monetaryView([a, b], 45, 0);
    expect(v.saving(b)).toBe(640);
    expect(v.efficiency(b)).toBe(0.32);
    expect(v.efficiency(a)).toBe(null);
    a.pricing!.status = "partial";
    const missing = monetaryView([a, b], 45, 99999);
    expect(missing.reference).toBe(null);
    expect(missing.saving(b)).toBe(null);
    expect(missing.priced).toEqual([b]);
    expect(missing.unpriced).toEqual([a]);
  });
  it("minimum savings filters comparable totals and retains unpriced routes separately", () => {
    const a = route("a", 100, "complete_verified", 4070),
      b = route("b", 200, "complete_verified", 3430),
      u = route("u", 150, "partial", null);
    const v = monetaryView([a, b, u], 45, 600);
    expect(v.priced).toEqual([b]);
    expect(v.unpriced).toEqual([u]);
    expect(v.cheapest).toBe(b);
    expect(monetaryView([a, b, u], 0, 600).displayed).toEqual([]);
  });
  it("monetary Pareto excludes partials and dominated routes without monetary heuristic", () => {
    const rows = [
      route("a", 100, "complete_verified", 4000),
      route("b", 200, "complete_verified", 3000),
      route("c", 250, "complete_verified", 3100),
      route("u", 50, "partial", null),
    ];
    expect(moneyPareto(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("cheapest tie is resolved by duration; no recommendation without verified savings", () => {
    const a = route("a", 100, "complete_verified", 4000),
      b = route("b", 200, "complete_verified", 3000),
      c = route("c", 250, "complete_verified", 3000);
    expect(monetaryView([a, c, b], 45, 0).cheapest).toBe(b);
    a.pricing!.status = "unavailable";
    expect(monetaryView([a, b, c], 45, 0).cheapest).toBeUndefined();
  });
});
