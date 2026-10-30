import type { DynamicRoute } from "./provider";
export type PricingStatus =
  "complete_verified" | "partial" | "unavailable" | "stale";
export interface TollComponent {
  operator: string;
  system: string;
  entry: string;
  exit: string;
  cents: number | null;
  status: string;
  reason?: string;
  effectiveFrom?: string;
  verifiedThrough?: string;
  vehicleClass?: number;
  source?: { url: string; sha256: string; locator: string };
}
export interface TollPricing {
  status: PricingStatus;
  totalCents: number | null;
  knownSubtotalCents: number;
  currency: "EUR";
  vehicleClass: number;
  on: string;
  components: TollComponent[];
  coverageComplete: boolean;
  evidenceBasis?: string;
  reasons?: string[];
}
export const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function complete(r: DynamicRoute): boolean {
  return (
    r.pricing?.status === "complete_verified" &&
    r.pricing.coverageComplete &&
    Number.isSafeInteger(r.pricing.totalCents) &&
    r.pricing.totalCents! >= 0
  );
}
export const priceLabel = (r: DynamicRoute) =>
  complete(r)
    ? euros(r.pricing!.totalCents!)
    : r.pricing?.status === "partial"
      ? "Tarif incomplet"
      : r.pricing?.status === "stale"
        ? "Tarif à vérifier"
        : "Tarif non disponible";
export function moneyPareto(routes: DynamicRoute[]): DynamicRoute[] {
  const priced = routes.filter(complete);
  return priced
    .filter(
      (a) =>
        !priced.some(
          (b) =>
            b.durationSeconds <= a.durationSeconds &&
            b.pricing!.totalCents! <= a.pricing!.totalCents! &&
            (b.durationSeconds < a.durationSeconds ||
              b.pricing!.totalCents! < a.pricing!.totalCents!),
        ),
    )
    .sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds || a.id.localeCompare(b.id),
    );
}
export function monetaryView(
  routes: DynamicRoute[],
  extraMinutes: number,
  minimumSavingCents: number,
) {
  const fastest = [...routes].sort(
    (a, b) => a.durationSeconds - b.durationSeconds || a.id.localeCompare(b.id),
  )[0];
  const reference = fastest && complete(fastest) ? fastest : null;
  const saving = (r: DynamicRoute): number | null =>
    reference && complete(r)
      ? reference.pricing!.totalCents! - r.pricing!.totalCents!
      : null;
  const efficiency = (r: DynamicRoute): number | null => {
    const amount = saving(r);
    const extra = fastest
      ? (r.durationSeconds - fastest.durationSeconds) / 60
      : 0;
    return amount !== null && extra > 0 ? amount / 100 / extra : null;
  };
  const withinTime = routes.filter(
    (r) =>
      fastest &&
      r.durationSeconds - fastest.durationSeconds <= extraMinutes * 60,
  );
  const priced = withinTime
    .filter(complete)
    .filter((r) => saving(r) === null || saving(r)! >= minimumSavingCents);
  const unpriced = withinTime.filter((r) => !complete(r));
  const cheapest = reference
    ? [...priced]
        .filter((r) => saving(r)! > 0)
        .sort(
          (a, b) =>
            a.pricing!.totalCents! - b.pricing!.totalCents! ||
            a.durationSeconds - b.durationSeconds ||
            a.id.localeCompare(b.id),
        )[0]
    : undefined;
  return {
    fastest,
    reference,
    saving,
    efficiency,
    withinTime,
    priced,
    unpriced,
    cheapest,
    displayed: [...priced, ...unpriced],
    costPareto: moneyPareto(priced),
    priceViewAvailable: routes.filter(complete).length >= 2,
  };
}
