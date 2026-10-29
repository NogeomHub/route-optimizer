import { isCompletePrice } from "../pricing/pricing";
import type {
  CompleteRoute,
  Preferences,
  RouteCandidate,
  RouteMetrics,
} from "./types";

/**
 * Frontière de Pareto à deux objectifs : durée et péages (à minimiser).
 * A domine B si A est au moins aussi bon sur les deux axes et strictement
 * meilleur sur un axe. Distance et énergie restent informatives.
 * Tri durée/coût puis balayage O(n log n) : on ne conserve qu'un nouveau
 * minimum de coût. Les doublons temps/coût sont départagés par distance/id.
 * L'entrée n'est jamais modifiée. Les candidats invalides sont rejetés.
 */
export function paretoFrontier(
  routes: readonly RouteCandidate[],
): CompleteRoute[] {
  const valid = routes
    .filter(isCompletePrice)
    .filter(
      (r) =>
        Number.isFinite(r.durationMinutes) &&
        r.durationMinutes > 0 &&
        Number.isFinite(r.distanceKm) &&
        r.distanceKm >= 0 &&
        Number.isSafeInteger(r.tollCents) &&
        r.tollCents >= 0,
    );
  const sorted = [...valid].sort(
    (a, b) =>
      a.durationMinutes - b.durationMinutes ||
      a.tollCents - b.tollCents ||
      a.distanceKm - b.distanceKm ||
      a.id.localeCompare(b.id),
  );
  let cheapest = Infinity;
  return sorted.filter((route) => {
    if (route.tollCents >= cheapest) return false;
    cheapest = route.tollCents;
    return true;
  });
}

export function routeMetrics(
  route: RouteCandidate,
  fastest: RouteCandidate,
): RouteMetrics {
  if (!isCompletePrice(route) || !isCompletePrice(fastest))
    throw new Error("Un tarif incomplet ne permet pas de calcul monétaire.");
  const extraMinutes = route.durationMinutes - fastest.durationMinutes;
  const savingCents = fastest.tollCents - route.tollCents;
  return {
    extraMinutes,
    savingCents,
    eurosPerMinute: extraMinutes > 0 ? savingCents / 100 / extraMinutes : null,
  };
}

/** Heuristique initiale, non optimale scientifiquement.
 * Score en euros équivalents : économie - 0,20 €/min de détour
 * + prime d'efficacité (2 × €/min), plafonnée à 2 €/min.
 * Les trois poids sont regroupés ici pour faciliter leur évolution.
 */
export const RECOMMENDATION_WEIGHTS = {
  extraMinutePenalty: 0.2,
  efficiencyBonus: 2,
  efficiencyCap: 2,
};
export function recommendationScore(metrics: RouteMetrics): number {
  const w = RECOMMENDATION_WEIGHTS;
  return (
    metrics.savingCents / 100 -
    w.extraMinutePenalty * metrics.extraMinutes +
    w.efficiencyBonus * Math.min(w.efficiencyCap, metrics.eurosPerMinute ?? 0)
  );
}
export function eligibleRoutes(
  frontier: readonly RouteCandidate[],
  fastest: RouteCandidate,
  preferences: Preferences,
): CompleteRoute[] {
  return frontier.filter(isCompletePrice).filter((route) => {
    const m = routeMetrics(route, fastest);
    return (
      m.extraMinutes <= preferences.maxExtraMinutes &&
      m.savingCents >= preferences.minSavingCents
    );
  });
}
export function recommendRoute(
  routes: readonly RouteCandidate[],
  fastest: RouteCandidate,
): CompleteRoute | undefined {
  return routes
    .filter(isCompletePrice)
    .sort(
      (a, b) =>
        recommendationScore(routeMetrics(b, fastest)) -
          recommendationScore(routeMetrics(a, fastest)) ||
        a.durationMinutes - b.durationMinutes ||
        a.id.localeCompare(b.id),
    )[0];
}
