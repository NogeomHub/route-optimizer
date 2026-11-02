import { recommendationScore } from "../domain/optimization";
import type { DynamicRoute } from "./provider";
import { effectiveDurationSeconds } from "./provider";
import { complete, monetaryView } from "./pricing";

/**
 * La V3 réutilise volontairement l'heuristique documentée de la V2 afin que
 * les deux interfaces ne puissent pas dériver silencieusement. Les contraintes
 * utilisateur (détour maximal et économie minimale) restent des filtres durs ;
 * le score ne départage que les trajets qui les respectent.
 */
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
    return recommendationScore({
      savingCents,
      extraMinutes,
      eurosPerMinute:
        extraMinutes > 0 ? savingCents / 100 / extraMinutes : null,
    });
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
