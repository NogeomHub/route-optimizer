const duration = (route) => route.eta?.durationMinutes ?? route.durationSeconds / 60;
const price = (route) => route.pricing?.status === "complete_verified" ? route.pricing.totalCents : null;

export function etaShortlist(routes) {
  if (!Array.isArray(routes) || !routes.length) return [];
  const fastest = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
  const fullyPriced = routes
    .filter((route) => price(route) !== null)
    .sort((a, b) => a.durationSeconds - b.durationSeconds);

  // Valhalla is useful for generating candidate geometries, but its ETA can be
  // materially different from a traffic-aware ETA. Do not let a Valhalla
  // time/price Pareto pre-filter discard a route before TomTom reassesses it.
  // Keep the absolute Valhalla-fastest route as a time baseline even when its
  // toll price is incomplete, then reassess every route with a verified price.
  return [...new Set([fastest.id, ...fullyPriced.map((route) => route.id)])];
}

export function etaPareto(routes) {
  const assessed = routes.filter((r) => r.eta?.status === "ok" && price(r) !== null);
  return assessed.filter((a) => !assessed.some((b) =>
    duration(b) <= duration(a) && price(b) <= price(a) &&
    (duration(b) < duration(a) || price(b) < price(a))
  )).sort((a, b) => duration(a) - duration(b)).map((r) => r.id);
}

export function etaEligible(routes, maxExtraMinutes) {
  const assessed = routes.filter((r) => r.eta?.status === "ok");
  if (!assessed.length) return null;
  const fastest = Math.min(...assessed.map(duration));
  return assessed.filter((r) => duration(r) - fastest <= maxExtraMinutes).map((r) => r.id);
}
