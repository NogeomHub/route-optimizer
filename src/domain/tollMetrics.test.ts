import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tollMetricsLabel, type TollMetricFields } from "./tollMetrics";
import { RouteTollInfo } from "../components/RouteTollInfo";
import { archivedCandidates } from "../routing/ArchivedRoutingProvider";

const metrics: TollMetricFields = {
  tollDistanceKm: 286,
  tollDurationSeconds: 10020,
  tollDurationTotalSeconds: 17578.94736842105,
  tollDurationRatio: 0.57,
  tollDurationSource: "valhalla_trace",
};
describe("paid road duration display", () => {
  it("shows a compact duration, distance and ratio", () => {
    expect(tollMetricsLabel(metrics)).toBe(
      "Route payante : 2 h 47 · 286 km (57 % du temps)",
    );
  });
  it("keeps missing time unknown even with known kilometers or a legacy zero", () => {
    expect(
      tollMetricsLabel({ tollDistanceKm: 286, tollDurationSeconds: null }),
    ).toBe("Route payante : 286 km · durée non déterminée");
    expect(tollMetricsLabel({ tollExposure: { tollKm: 0 } })).toBe(
      "Route payante : 0 km · durée non déterminée",
    );
    expect(tollMetricsLabel({ tollDistanceKm: null })).toBe(
      "Route payante : non déterminé",
    );
  });
  it("only displays a known zero with temporal evidence or verified absence of toll edges", () => {
    expect(
      tollMetricsLabel({
        ...metrics,
        tollDistanceKm: 0,
        tollDurationSeconds: 0,
        tollDurationRatio: 0,
        tollDurationSource: "verified_no_toll",
      }),
    ).toBe("Route payante : 0 min · 0 km");
    expect(
      tollMetricsLabel({ ...metrics, tollDurationSeconds: null }),
    ).toContain("durée non déterminée");
  });
  it("rejects invalid, out-of-range or incoherent ratios", () => {
    for (const ratio of [-1, 2, NaN, Infinity, 0.2]) {
      expect(
        tollMetricsLabel({ ...metrics, tollDurationRatio: ratio }),
      ).toContain("durée non déterminée");
    }
  });
  it("never rounds a positive sub-minute toll duration down to zero", () => {
    expect(
      tollMetricsLabel({
        ...metrics,
        tollDurationSeconds: 1,
        tollDurationTotalSeconds: 2,
        tollDurationRatio: 0.5,
      }),
    ).toContain("moins de 1 min");
  });
  it("renders the Valhalla basis explicitly when total ETA is provided by TomTom", () => {
    const html = renderToStaticMarkup(
      createElement(RouteTollInfo, {
        route: { ...metrics, eta: { status: "ok" } },
      }),
    );
    expect(html).toContain("57 % du temps Valhalla");
    expect(html).toContain("l’ETA totale TomTom est distincte");
    expect(html).toContain("2 h 47");
  });
  it("a fallback ETA uses the Valhalla label without inventing a TomTom breakdown", () => {
    const html = renderToStaticMarkup(
      createElement(RouteTollInfo, {
        route: { ...metrics, eta: { status: "fallback" } },
      }),
    );
    expect(html).toContain("57 % du temps)");
    expect(html).not.toContain("ETA totale TomTom");
  });
  it("normalizes historical distances without fabricating duration for any paid route", () => {
    expect(archivedCandidates).toHaveLength(28);
    expect(
      archivedCandidates.filter((r) => r.tollDurationSeconds === 0),
    ).toHaveLength(3);
    for (const route of archivedCandidates) {
      expect(route.tollDistanceKm).toBeGreaterThanOrEqual(0);
      if (route.tollDistanceKm! > 0) {
        expect(route.tollDurationSeconds).toBeNull();
        expect(route.tollDurationRatio).toBeNull();
      }
    }
  });
});
