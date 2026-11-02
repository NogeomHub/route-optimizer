import type { DynamicRoute } from "./provider";
import { effectiveDurationSeconds } from "./provider";
import { complete, monetaryView } from "./pricing";

/**
 * Même logique de compromis que la V2 : l'économie reste prioritaire, mais
 * chaque minute de détour a un coût et les économies rapides sont favorisées.
 * Le score est exprimé en euros équivalents et reste une heuristique lisible,
 * pas une prétention à l'optimum économique universel.
 */
export const RECOMMENDATION_WEIGHTS = {
  extraMinutePenalty: 0.2,
  efficiencyBonus: 2,
  efficiencyCap: 2,
};

export function recommendation(
  routes: DynamicRoute[],
  extra: number,
  minimum: number,
) {
  const view = monetaryView(routes, extra, minimum);
  if (!view.fastest) return null;

  const score = (r: DynamicRoute) => {
    const savingCents = view.saving(r) ?? 0;
    const extraMinutes = Math.max(
      0,
      (effectiveDurationSeconds(r) - effectiveDurationSeconds(view.fastest!)) /
        60,
    );
    const efficiency = extraMinutes > 0 ? savingCents / 100 / extraMinutes : 0;
    const w = RECOMMENDATION_WEIGHTS;
    return (
      savingCents / 100 -
      w.extraMinutePenalty * extraMinutes +
      w.efficiencyBonus * Math.min(w.efficiencyCap, efficiency)
    );
  };

  const compromiseOrder = (a: DynamicRoute, b: DynamicRoute) =>
    score(b) - score(a) ||
    effectiveDurationSeconds(a) - effectiveDurationSeconds(b) ||
    a.id.localeCompare(b.id);
  const cheapestOrder = (a: DynamicRoute, b: DynamicRoute) =>
    a.pricing!.totalCents! - b.pricing!.totalCents! ||
    effectiveDurationSeconds(a) - effectiveDurationSeconds(b) ||
    a.id.localeCompare(b.id);

  const eligible = view.reference
    ? [...view.priced].sort(compromiseOrder)
    : [];
  if (eligible.length)
    return {
      route: eligible[0],
      meets: true,
      reason: "BEST_COMPROMISE" as const,
      score: score(eligible[0]),
      view,
    };

  const fallback = view.reference
    ? [...view.withinTime].filter(complete).sort(cheapestOrder)[0]
    : view.fastest;
  return {
    route: fallback ?? view.fastest,
    meets: false,
    reason: view.reference
      ? ("SAVING_UNMET" as const)
      : ("UNKNOWN_SAVING" as const),
    score: null,
    view,
  };
}
