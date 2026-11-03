/** The ratio uses tollDurationTotalSeconds from Valhalla, never a TomTom ETA. */
export interface TollMetricFields {
  temporalTraceVersion?: 2 | null;
  temporalTraceGraph?: { version: string; tileset: number };
  tollDistanceKm?: number | null;
  tollDurationSeconds?: number | null;
  tollDurationRatio?: number | null;
  tollDurationTotalSeconds?: number | null;
  tollDurationSource?: "valhalla_trace" | "verified_no_toll" | null;
  tollDurationReason?: string | null;
  tollExposure?: { tollKm: number } | null;
}
const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export function tollTime(seconds: number) {
  if (seconds > 0 && seconds < 60) return "moins de 1 min";
  const m = Math.round(seconds / 60);
  return m < 60
    ? `${m} min`
    : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
export function tollMetricsLabel(route: TollMetricFields, tomtom = false) {
  const km =
    route.tollDistanceKm === undefined
      ? route.tollExposure?.tollKm
      : route.tollDistanceKm;
  const distance = valid(km)
    ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(km)} km`
    : null;
  const seconds = route.tollDurationSeconds;
  const total = route.tollDurationTotalSeconds;
  const ratio = route.tollDurationRatio;
  if (
    route.tollDurationSource === "verified_no_toll" &&
    seconds === 0 &&
    km === 0
  )
    return "Route payante : 0 min · 0 km";
  const known =
    route.tollDurationSource != null &&
    valid(seconds) &&
    valid(total) &&
    total > 0 &&
    seconds <= total &&
    valid(ratio) &&
    ratio <= 1 &&
    Math.abs(ratio - seconds / total) < 1e-9;
  if (!known)
    return `Route payante : ${distance ? `${distance} · durée non déterminée` : "non déterminé"}`;
  if (seconds === 0 && km === 0) return "Route payante : 0 min · 0 km";
  return `Route payante : ${tollTime(seconds)}${distance ? ` · ${distance}` : ""} (${Math.round(ratio * 100)} % du temps${tomtom ? " Valhalla" : ""})`;
}
