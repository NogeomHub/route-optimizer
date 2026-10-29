import { describe, expect, it } from "vitest";
import {
  eligibleRoutes,
  paretoFrontier,
  recommendRoute,
  routeMetrics,
} from "./optimization";
import { demoCandidates } from "../routing/demoData";
const fast = demoCandidates[0];
describe("Frontière de Pareto", () => {
  it("élimine les trajets dominés sans modifier les candidats", () => {
    const input = [...demoCandidates].reverse();
    expect(paretoFrontier(input).map((r) => r.id)).toEqual([
      "fast",
      "light",
      "balanced",
      "economy",
      "free",
    ]);
    expect(input[0].id).toBe("dominated");
  });
  it("gère égalités, doublons et entrées invalides", () => {
    expect(
      paretoFrontier([
        { ...fast, id: "slow", durationMinutes: 280 },
        { ...fast, id: "expensive", tollCents: 4000 },
        fast,
        { ...fast, id: "duplicate", distanceKm: 500 },
        { ...fast, id: "invalid", tollCents: -1 },
      ]),
    ).toEqual([fast]);
    expect(paretoFrontier([])).toEqual([]);
  });
});
describe("Économies et efficacité", () => {
  it("calcule 13,20 € économisés pour 19 minutes et 0,69 €/min", () => {
    const m = routeMetrics(demoCandidates[2], fast);
    expect(m.savingCents).toBe(1320);
    expect(m.extraMinutes).toBe(19);
    expect(m.eurosPerMinute).toBeCloseTo(0.6947368);
  });
  it("ne divise pas par zéro pour le trajet rapide", () =>
    expect(routeMetrics(fast, fast)).toEqual({
      savingCents: 0,
      extraMinutes: 0,
      eurosPerMinute: null,
    }));
});
describe("Recommandation sous contraintes", () => {
  it("recommande le compromis de 19 minutes avec le budget par défaut", () => {
    const eligible = eligibleRoutes(paretoFrontier(demoCandidates), fast, {
      maxExtraMinutes: 45,
      minSavingCents: 0,
    });
    expect(recommendRoute(eligible, fast)?.id).toBe("balanced");
  });
  it("respecte les seuils inclusifs et gère l’absence de résultat", () => {
    expect(
      eligibleRoutes(demoCandidates, fast, {
        maxExtraMinutes: 19,
        minSavingCents: 1320,
      }).map((r) => r.id),
    ).toEqual(["balanced"]);
    expect(
      recommendRoute(
        eligibleRoutes(demoCandidates, fast, {
          maxExtraMinutes: 0,
          minSavingCents: 1,
        }),
        fast,
      ),
    ).toBeUndefined();
    expect(recommendRoute([fast], fast)?.id).toBe("fast");
  });
});
