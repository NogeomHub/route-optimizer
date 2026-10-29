import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  archivedCandidates,
  ArchivedRoutingProvider,
  ARCHIVED_JOURNEY,
} from "../routing/ArchivedRoutingProvider";
import { isCompletePrice } from "../pricing/pricing";
import {
  eligibleRoutes,
  paretoFrontier,
  recommendRoute,
  routeMetrics,
} from "./optimization";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const frontier = paretoFrontier(archivedCandidates);
const fastest = frontier[0];
describe("Snapshot réel et tarification", () => {
  it("intègre seulement le nouveau total audité et préserve les six A79 incomplets", () => {
    const historical = read(
      "../../experiments/tolls/results/pricing.json",
    ).routes;
    for (const route of archivedCandidates.filter((r) => r.id !== "R26")) {
      const previous = historical.find(
        (p: { id: string }) => p.id === route.id,
      );
      expect(route.tollCents).toBe(previous.total_cents);
      expect(route.pricing?.knownSubtotalCents).toBe(previous.known_aprr_cents);
      expect(route.pricing?.status).toBe(previous.status);
    }
    expect(
      archivedCandidates.filter((r) => !isCompletePrice(r)).map((r) => r.id),
    ).toEqual(["R7", "R8", "R13", "R19", "R20", "R24"]);
    const route = archivedCandidates.find((r) => r.id === "R26")!;
    expect(isCompletePrice(route)).toBe(true);
    expect(route.tollCents).toBe(3920);
    expect(
      route.pricing?.sections.map((s) => [s.entry, s.exit, s.cents, s.pdfPage]),
    ).toEqual([
      ["PONT D AIN", "DIJON-CRIMOLOIS", 1640, 202],
      ["POUILLY-EN-AUXOIS", "LES EPRUNES", 2280, 205],
    ]);
    expect(
      route.pricing?.sections.every(
        (s) =>
          s.matchConfidence === "suffisamment fiable" &&
          s.tariffConfidence === "confirmé",
      ),
    ).toBe(true);
    expect(frontier.some((r) => r.id === route.id)).toBe(false);
    const dominator = archivedCandidates.find((r) => r.id === "R14")!;
    expect(dominator.durationMinutes).toBeLessThan(route.durationMinutes);
    expect(dominator.tollCents!).toBeLessThan(route.tollCents!);
  });
  it("conserve exactement les 28 durées, distances et prix du POC audité", () => {
    const prices = read("../../data/audited-pricing.json");
    const routes = read(
      "../../experiments/valhalla/evidence/2026-10-29/comparison.json",
    );
    expect(archivedCandidates).toHaveLength(28);
    expect(archivedCandidates.filter(isCompletePrice)).toHaveLength(22);
    for (const route of archivedCandidates) {
      const p = prices.find((x: { id: string }) => x.id === route.id);
      const r = routes.find((x: { id: string }) => x.id === route.id);
      expect(route.durationMinutes).toBe(r.minutes);
      expect(route.distanceKm).toBe(r.km);
      expect(route.tollCents).toBe(p.tollCents);
      expect(route.pricing?.knownSubtotalCents).toBe(
        p.pricing.knownSubtotalCents,
      );
      expect(route.pricing?.status).toBe(p.pricing.status);
    }
  });
  it("conserve chaque coordonnée réelle sans simplification ou tracé inventé", () => {
    const geo = read(
      "../../experiments/valhalla/evidence/2026-10-29/routes.geojson",
    );
    for (const r of geo.features) {
      const exported = read(
        `../../public/data/routes/${r.properties.id}.geojson`,
      );
      expect(exported).toEqual(r);
    }
  });
  it("écarte les 6 incomplets, même si un sous-total était proposé comme zéro", () => {
    const partial = archivedCandidates.find((r) => r.id === "R13")!;
    expect(partial.tollCents).toBeNull();
    expect(partial.pricing?.knownSubtotalCents).toBe(500);
    expect(isCompletePrice({ ...partial, tollCents: 0 })).toBe(false);
    expect(() => routeMetrics(partial, fastest)).toThrow("incomplet");
    expect(recommendRoute([partial], fastest)).toBeUndefined();
  });
  it("reproduit la frontière monétaire de 8 variantes, sans les coûts partiels", () => {
    expect(frontier.map((r) => r.id)).toEqual([
      "R18",
      "R23",
      "R14",
      "R27",
      "R15",
      "R12",
      "R4",
      "R1",
    ]);
  });
  it("le fournisseur refuse les autres villes et retourne une copie indépendante", async () => {
    const p = new ArchivedRoutingProvider();
    await expect(
      p.getCandidates({ origin: "Paris", destination: "Lyon" }),
    ).rejects.toThrow("Seul");
    const data = await p.getCandidates(ARCHIVED_JOURNEY);
    data[0].durationMinutes = 1;
    expect(
      (await p.getCandidates(ARCHIVED_JOURNEY))[0].durationMinutes,
    ).not.toBe(1);
  });
});
describe("Filtres et heuristique V2", () => {
  const eligible = (maxExtraMinutes: number, minSavingCents = 0) =>
    eligibleRoutes(frontier, fastest, { maxExtraMinutes, minSavingCents });
  it("respecte les durées non arrondies et le seuil monétaire", () => {
    expect(eligible(30).map((r) => r.id)).toEqual(["R18", "R23", "R14", "R27"]);
    expect(eligible(19).map((r) => r.id)).toEqual(["R18", "R23"]);
    expect(eligible(30, 700).map((r) => r.id)).toEqual(["R27"]);
    expect(eligible(30, 1000)).toEqual([]);
  });
  it("recommande R27 à +45 min, R14 à +20 min et le rapide à zéro", () => {
    expect(recommendRoute(eligible(45), fastest)?.id).toBe("R27");
    expect(recommendRoute(eligible(20), fastest)?.id).toBe("R14");
    expect(recommendRoute(eligible(0), fastest)?.id).toBe("R18");
    expect(recommendRoute(eligible(0, 1), fastest)).toBeUndefined();
  });
  it("calcule les économies réelles et le ratio sans arrondir avant division", () => {
    const m = routeMetrics(
      frontier.find((r) => r.id === "R27")!,
      fastest,
    );
    expect(m.savingCents).toBe(930);
    expect(m.extraMinutes).toBeCloseTo(29.6356833);
    expect(m.eurosPerMinute).toBeCloseTo(0.31381088);
  });
  it("le trajet sans péage détecté n’apparaît que dans un plafond suffisant", () => {
    expect(eligible(162).some((r) => r.id === "R1")).toBe(false);
    expect(eligible(163).some((r) => r.id === "R1")).toBe(true);
  });
});
