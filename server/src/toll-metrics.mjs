import { analyze, decode } from "./geometry.mjs";

const nonnegative = (x) => Number.isFinite(x) && x >= 0;

/** Unknown is explicit. Money and whole-route average speeds are never inputs. */
export function unknownTollMetrics(route, reason = "TIMING_UNAVAILABLE") {
  const exposure = route.tollExposure;
  const distance = nonnegative(exposure?.tollKm) ? exposure.tollKm : null;
  return {
    tollDistanceKm: distance,
    tollDurationSeconds: null,
    tollDurationRatio: null,
    tollDurationTotalSeconds: null,
    tollDurationSource: null,
    tollDurationReason: reason,
  };
}

/**
 * Valhalla node.elapsed_time is cumulative SECONDS at each edge's end_node.
 * Differences include the engine's transition time at entry to that edge.
 * Use the same trace total as denominator, never the independent TomTom ETA.
 */
export function calculateTollMetrics(trace, route) {
  let exposure;
  try {
    exposure = analyze(trace, route);
  } catch {
    return unknownTollMetrics(route, "INVALID_TRACE");
  }
  const unknown = (reason) =>
    unknownTollMetrics({ ...route, tollExposure: exposure }, reason);
  if (trace.shape !== route.shape) return unknown("TRACE_SHAPE_MISMATCH");
  const lastIndex = decode(trace.shape).length - 1;
  let index = 0;
  for (const edge of trace.edges) {
    if (edge.begin_shape_index !== index) return unknown("TRACE_DISCONTINUITY");
    index = edge.end_shape_index;
  }
  if (index !== lastIndex) return unknown("TRACE_DISCONTINUITY");
  if (trace.edges.every((edge) => edge.toll === false))
    return {
      tollDistanceKm: 0,
      tollDurationSeconds: 0,
      tollDurationRatio: route.durationSeconds > 0 ? 0 : null,
      tollDurationTotalSeconds: route.durationSeconds,
      tollDurationSource: "verified_no_toll",
      tollDurationReason: null,
    };
  let previous = 0,
    tollSeconds = 0;
  for (const edge of trace.edges) {
    const elapsed = edge.end_node?.elapsed_time;
    if (!nonnegative(elapsed) || elapsed < previous)
      return unknown("TIMING_UNAVAILABLE");
    if (edge.toll) tollSeconds += elapsed - previous;
    previous = elapsed;
  }
  // Matching geometry alone does not prove identical costing/ETA. Reject a
  // mismatch rather than rescale durations. One second allows serialization rounding.
  if (
    !nonnegative(route.durationSeconds) ||
    previous <= 0 ||
    Math.abs(previous - route.durationSeconds) > 1 ||
    tollSeconds > route.durationSeconds ||
    tollSeconds > previous
  )
    return unknown("TOTAL_MISMATCH");
  return {
    tollDistanceKm: exposure.tollKm,
    tollDurationSeconds: tollSeconds,
    tollDurationRatio: tollSeconds / previous,
    tollDurationTotalSeconds: previous,
    tollDurationSource: "valhalla_trace",
    tollDurationReason: null,
  };
}
