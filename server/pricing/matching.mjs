import { decode, analyze } from "../src/geometry.mjs";
const METERS = 111195;
export const inside = (p, b) =>
  p && b[0] <= p.lon && p.lon <= b[2] && b[1] <= p.lat && p.lat <= b[3];
export function pathIndex(points) {
  const exact = new Map(points.map((p, i) => [p.join(","), i]));
  const memo = new Map();
  const positions = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    positions.push(
      positions.at(-1) +
        Math.hypot(
          (b[0] - a[0]) * METERS * Math.cos((a[1] * Math.PI) / 180),
          (b[1] - a[1]) * METERS,
        ),
    );
  }
  function nearest(point, fast = false) {
    const key = point.join(",");
    if (fast && exact.has(key)) return { distance: 0, index: exact.get(key) };
    if (memo.has(key)) return memo.get(key);
    let best = Infinity,
      index = 0,
      visits = 0,
      previous = -2;
    const k = Math.cos((point[1] * Math.PI) / 180) * METERS;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      if (
        Math.max(a[0], b[0]) < point[0] - 0.002 ||
        Math.min(a[0], b[0]) > point[0] + 0.002 ||
        Math.max(a[1], b[1]) < point[1] - 0.002 ||
        Math.min(a[1], b[1]) > point[1] + 0.002
      )
        continue;
      const ax = (a[0] - point[0]) * k,
        ay = (a[1] - point[1]) * METERS,
        bx = (b[0] - point[0]) * k,
        by = (b[1] - point[1]) * METERS;
      const dx = bx - ax,
        dy = by - ay,
        den = dx * dx + dy * dy;
      const t = den ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / den)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) {
        best = d;
        index = i + t;
      }
      if (d <= 12) {
        if (i > previous + 1) visits++;
        previous = i;
      }
    }
    const value = { distance: best, index, visits };
    memo.set(key, value);
    return value;
  }
  const at = (index) => {
    const i = Math.min(Math.floor(index), positions.length - 2);
    return positions[i] + (positions[i + 1] - positions[i]) * (index - i);
  };
  return { nearest, at };
}
export function directed(proof, path, tolerance) {
  if (proof.oneway !== "yes" || proof.points.length < 2) return false;
  const rows = proof.points.map((p) => path.nearest(p));
  return (
    rows.every((r) => r.distance <= tolerance) &&
    rows.slice(1).every((r, i) => r.index > rows[i].index)
  );
}
/** Deliberately bounded to reviewed models. A road name or toll length is never a price. */
export function matchTransactions(
  { route, trace, origin, destination, on },
  model,
) {
  if (
    !inside(origin, model.scope.origin_region) ||
    !inside(destination, model.scope.destination_region)
  )
    return null;
  // Strict units, toll booleans, lengths and shape consistency, including zero-toll routes.
  analyze(trace, route);
  const points = route.geometry.coordinates,
    path = pathIndex(points),
    tol = model.matching.max_distance_m;
  const events = [];
  for (const pt of model.points) {
    const n = pt.node,
      hit = path.nearest([n.lon, n.lat]);
    if (
      hit.distance > tol ||
      !(pt.direction_proofs ?? []).every((p) => directed(p, path, tol))
    )
      continue;
    events.push({
      station: pt.station,
      operator: pt.operator,
      system: pt.system,
      index: hit.index,
      mappingConfidence:
        ["closed", "open"].includes(pt.system) && hit.visits === 1
          ? "reviewed"
          : "ambiguous",
      evidence: {
        nodeId: n.id,
        coordinate: [n.lon, n.lat],
        distanceMeters: hit.distance,
        visits: hit.visits,
        wayIds: (pt.direction_proofs ?? []).map((p) => p.way_id),
        references: pt.evidence,
      },
    });
  }
  events.sort((a, b) => a.index - b.index);
  const gates = [];
  for (const e of events) {
    const last = gates.at(-1);
    if (
      last &&
      last.station === e.station &&
      Math.abs(last.index - e.index) < 20
    ) {
      if (e.mappingConfidence !== "reviewed")
        last.mappingConfidence = "ambiguous";
      continue;
    }
    gates.push(e);
  }
  const transactions = [],
    unknown = [];
  let pending = null;
  for (const e of gates) {
    if (e.system === "open")
      transactions.push({
        operator: e.operator,
        system: "open",
        entry: e.station,
        exit: "Système Ouvert",
        mappingConfidence: e.mappingConfidence,
        evidence: [e.evidence],
        interval: [e.index, e.index],
      });
    else if (!pending) pending = e;
    else {
      transactions.push({
        operator: e.operator,
        system: "closed",
        entry: pending.station,
        exit: e.station,
        mappingConfidence:
          pending.mappingConfidence === e.mappingConfidence &&
          e.mappingConfidence === "reviewed"
            ? "reviewed"
            : "ambiguous",
        evidence: [pending.evidence, e.evidence],
        interval: [pending.index, e.index],
      });
      pending = null;
    }
  }
  if (pending) unknown.push("UNRESOLVED_TICKET");
  const refsFor = (e) =>
    new Set((e.names ?? []).map((n) => n.replace(/\s/g, "").toUpperCase()));
  const intersects = (a, b) => b.some((v) => a.has(v));
  const freeRefs = model.free_flow.road_refs;
  const freeFlow = trace.edges.some((e) => intersects(refsFor(e), freeRefs));
  if (freeFlow)
    transactions.push({
      operator: model.free_flow.operator,
      system: "free_flow",
      entry: "A79 traversal",
      exit: "A79 traversal",
      mappingConfidence: "reviewed",
      evidence: [],
      reason: "A79_UNPRICED",
    });
  const tracePoints = decode(trace.shape),
    spans = [];
  for (const e of trace.edges) {
    if (!e.toll) continue;
    const a = tracePoints[e.begin_shape_index],
      b = tracePoints[e.end_shape_index],
      ha = path.nearest(a, true),
      hb = path.nearest(b, true);
    spans.push({
      range: [path.at(ha.index), path.at(hb.index)],
      refs: refsFor(e),
      km: e.length,
      matched: ha.distance <= tol && hb.distance <= tol,
      start: a,
      end: b,
    });
  }
  const groups = [];
  for (const s of spans) {
    const last = groups.at(-1);
    if (last && s.range[0] <= last.range[1] + 1) {
      last.range[1] = s.range[1];
      for (const ref of s.refs) last.refs.add(ref);
    } else groups.push({ range: [...s.range], refs: new Set(s.refs) });
  }
  let uncovered = 0;
  for (const s of spans) {
    if (intersects(s.refs, freeRefs)) continue; // Still an explicitly unknown pricing component.
    let covered = false;
    const within = (b) =>
      [s.start, s.end].every((p) => inside({ lon: p[0], lat: p[1] }, b));
    for (const t of transactions) {
      if (t.mappingConfidence !== "reviewed") continue;
      if (t.system === "closed") {
        const [lo, hi] = t.interval.map(path.at),
          margin = model.matching.coverage_boundary_tolerance_m;
        if (s.matched && lo - margin <= s.range[0] && s.range[1] <= hi + margin)
          covered = true;
        const z = (model.closed_exit_zones ?? []).find(
          (z) => z.station === t.exit,
        );
        if (
          z &&
          s.matched &&
          within(z.bounds) &&
          intersects(s.refs, z.road_refs) &&
          s.range[0] >= hi - 200
        )
          covered = true;
      } else if (t.system === "open") {
        const z = model.open_zones.find((z) => z.station === t.entry);
        if (!z) continue;
        if (z.bounds && s.matched && within(z.bounds)) covered = true;
        const gate = path.at(t.interval[0]);
        if (
          intersects(s.refs, z.road_refs) &&
          groups.some(
            (g) =>
              intersects(g.refs, z.road_refs) &&
              g.range[0] - 200 <= gate &&
              gate <= g.range[1] + 200 &&
              g.range[0] <= s.range[0] &&
              s.range[1] <= g.range[1],
          )
        )
          covered = true;
      }
    }
    if (!covered) uncovered += s.km;
  }
  if (uncovered > 0.05) unknown.push("COVERAGE_INCOMPLETE");
  return {
    transactions,
    coverageComplete: unknown.length === 0,
    unknown,
    uncoveredTollKm: uncovered,
    evidenceBasis:
      !transactions.length && !spans.length && !unknown.length
        ? "road_data_zero"
        : "official_transactions",
    scope: model.id,
    matchingVerifiedAt: model.verified_at,
    verificationDue: Boolean(
      model.verification_due_from && on >= model.verification_due_from,
    ),
  };
}
