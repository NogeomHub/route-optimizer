import type { CompleteRoute, RouteCandidate } from "../domain/types";
/** Null means unknown. An audited subtotal is never used as the total. */
export function isCompletePrice(route: RouteCandidate): route is CompleteRoute {
  return (
    route.pricing?.status !== "partial" &&
    typeof route.tollCents === "number" &&
    Number.isSafeInteger(route.tollCents) &&
    route.tollCents >= 0
  );
}
export const money = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const decimal = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
export function duration(minutes: number) {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, "0")}`;
}
