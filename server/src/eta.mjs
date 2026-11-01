const duration = (route) => route.eta?.durationMinutes ?? route.durationSeconds / 60;
const price = (route) => route.pricing?.status === "complete_verified" ? route.pricing.totalCents : null;

export function etaShortlist(routes) {
  if (!Array.isArray(routes) || !routes.length) return [];
  const fastest = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
  const priced = routes.filter((r) => price(r) !== null);
  const pareto = priced.filter((a) => !priced.some((b) =>
    b.durationSeconds <= a.durationSeconds && price(b) <= price(a) &&
    (b.durationSeconds < a.durationSeconds || price(b) < price(a))
  ));
  return [...new Set([fastest.id, ...pareto.sort((a, b) => a.durationSeconds - b.durationSeconds).map((r) => r.id)])];
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
