import type { DynamicRoute } from "./provider";
import { complete, monetaryView } from "./pricing";
export function recommendation(
  routes: DynamicRoute[],
  extra: number,
  minimum: number,
) {
  const view = monetaryView(routes, extra, minimum);
  if (!view.fastest) return null;
  const order = (a: DynamicRoute, b: DynamicRoute) =>
    a.pricing!.totalCents! - b.pricing!.totalCents! ||
    a.durationSeconds - b.durationSeconds ||
    a.id.localeCompare(b.id);
  const eligible = view.reference ? [...view.priced].sort(order) : [];
  if (eligible.length)
    return {
      route: eligible[0],
      meets: true,
      reason: "MAX_SAVING" as const,
      view,
    };
  const fallback = view.reference
    ? [...view.withinTime].filter(complete).sort(order)[0]
    : view.fastest;
  return {
    route: fallback ?? view.fastest,
    meets: false,
    reason: view.reference
      ? ("SAVING_UNMET" as const)
      : ("UNKNOWN_SAVING" as const),
    view,
  };
}
