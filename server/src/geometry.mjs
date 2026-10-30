import { PocError, hash, finite } from "./util.mjs";
const invalid = (message) => {
  throw new PocError("INVALID_PROVIDER", message);
};
export function distance(a, b) {
  const [x, y, xx, yy] = [...a, ...b].map((n) => (n * Math.PI) / 180);
  const h =
    Math.sin((yy - y) / 2) ** 2 +
    Math.cos(y) * Math.cos(yy) * Math.sin((xx - x) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function decode(shape) {
  if (typeof shape !== "string" || shape.length > 2000000)
    invalid("Polyline absente ou trop grande.");
  const position = [0, 0],
    points = [];
  let i = 0;
  while (i < shape.length) {
    for (let axis = 0; axis < 2; axis++) {
      let result = 0,
        shift = 0,
        byte;
      do {
        if (i >= shape.length || shift > 30) invalid("Polyline tronquée.");
        byte = shape.charCodeAt(i++) - 63;
        if (byte < 0 || byte > 63) invalid("Caractère polyline invalide.");
        result += (byte & 31) * 2 ** shift;
        shift += 5;
      } while (byte >= 32);
      position[axis] += result % 2 ? -(Math.floor(result / 2) + 1) : result / 2;
    }
    const point = [position[1] / 1e6, position[0] / 1e6];
    if (!finite(point[0], -180, 180) || !finite(point[1], -90, 90))
      invalid("Coordonnées polyline invalides.");
    points.push(point);
  }
  if (points.length < 2) invalid("Géométrie vide.");
  return points;
}
const roundEven = (x) => {
  const n = Math.floor(x),
    f = x - n;
  return f === 0.5 ? (n % 2 === 0 ? n : n + 1) : Math.round(x);
};
export function corridor(points) {
  const cells = new Map();
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1],
      b = points[k],
      length = distance(a, b),
      n = Math.max(1, Math.ceil(length / 0.1));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n,
        key = a
          .map((x, j) => roundEven((x + (b[j] - x) * t) / 0.002))
          .join(",");
      cells.set(key, (cells.get(key) ?? 0) + length / n);
    }
  }
  return cells;
}
/** Historical near-dedup approximation: >=99.9% weighted overlap, ETA/km ±0.25%.
 * It is not topological equivalence; keep all member hashes and raw responses.
 */
export function nearDuplicate(a, b) {
  if (
    Math.abs(a.distanceKm - b.distanceKm) >
      0.0025 * Math.min(a.distanceKm, b.distanceKm) ||
    Math.abs(a.durationSeconds - b.durationSeconds) >
      0.0025 * Math.min(a.durationSeconds, b.durationSeconds)
  )
    return false;
  a._corridor ??= corridor(a.geometry.coordinates);
  b._corridor ??= corridor(b.geometry.coordinates);
  let common = 0,
    ta = 0,
    tb = 0;
  for (const [k, v] of a._corridor) {
    common += Math.min(v, b._corridor.get(k) ?? 0);
    ta += v;
  }
  for (const v of b._corridor.values()) tb += v;
  return common / Math.max(ta, tb, 1e-9) >= 0.999;
}

export function trips(response) {
  if (!response || !Array.isArray(response.alternates ?? []))
    invalid("Réponse /route invalide.");
  const list = [
    response.trip,
    ...(response.alternates ?? []).map((a) => a.trip),
  ];
  if (list.length > 3) invalid("Nombre inattendu d’alternatives.");
  return list.map((trip) => {
    if (
      trip?.status !== 0 ||
      trip.units !== "kilometers" ||
      trip.legs?.length !== 1 ||
      !finite(trip.summary?.time, 0, 1e8) ||
      !finite(trip.summary?.length, 0, 1e6)
    )
      invalid("Unités, durée ou étapes /route invalides.");
    const shape = trip.legs[0].shape;
    return {
      durationSeconds: trip.summary.time,
      distanceKm: trip.summary.length,
      shape,
      shapeHash: hash(shape),
      geometry: { type: "LineString", coordinates: decode(shape) },
      pricingStatus: "not_computed",
      tollExposure: null,
      producedBy: [],
    };
  });
}
export function addTrips(groups, response, profile) {
  return trips(response).map((candidate, alternate) => {
    let group = groups.find(
      (g) =>
        g.shapeHash === candidate.shapeHash ||
        g.memberHashes?.includes(candidate.shapeHash),
    );
    group ??= groups.find((g) => nearDuplicate(g, candidate));
    if (!group) {
      group = {
        ...candidate,
        id: `G${String(groups.length + 1).padStart(3, "0")}`,
        memberHashes: [],
      };
      groups.push(group);
    }
    if (!group.memberHashes.includes(candidate.shapeHash))
      group.memberHashes.push(candidate.shapeHash);
    group.producedBy.push({
      profile,
      alternate,
      shapeHash: candidate.shapeHash,
    });
    return group.id;
  });
}
export function publicRoutes(groups) {
  return groups.map(({ _corridor, ...row }) => row);
}

export function analyze(trace, route) {
  if (
    trace?.units !== "kilometers" ||
    !Array.isArray(trace.edges) ||
    !trace.edges.length
  )
    invalid("Trace absente ou unités inconnues.");
  const points = decode(trace.shape),
    sections = [],
    axes = new Set();
  let total = 0,
    toll = 0;
  for (const e of trace.edges) {
    if (
      typeof e.toll !== "boolean" ||
      !finite(e.length, 0, 1e6) ||
      !Number.isInteger(e.begin_shape_index) ||
      !Number.isInteger(e.end_shape_index) ||
      e.begin_shape_index < 0 ||
      e.end_shape_index < e.begin_shape_index ||
      e.end_shape_index >= points.length ||
      !Array.isArray(e.names ?? []) ||
      (e.names ?? []).some((n) => typeof n !== "string")
    )
      invalid("Attributs edge invalides : ne jamais inférer gratuit.");
    total += e.length;
    if (e.toll) toll += e.length;
    (e.names ?? []).forEach((n) => axes.add(n));
    let section = sections.at(-1);
    if (!section || section.toll !== e.toll) {
      section = {
        toll: e.toll,
        distanceKm: 0,
        start: points[e.begin_shape_index],
      };
      sections.push(section);
    }
    section.distanceKm += e.length;
    section.end = points[e.end_shape_index];
  }
  const original = route.geometry.coordinates;
  if (
    Math.abs(total - route.distanceKm) >
      Math.max(0.5, 0.03 * route.distanceKm) ||
    distance(points[0], original[0]) > 0.2 ||
    distance(points.at(-1), original.at(-1)) > 0.2
  )
    invalid("Trace incohérente avec la route.");
  return {
    tollKm: toll,
    totalAnalyzedKm: total,
    tollPercent: total ? (100 * toll) / total : null,
    sections,
    axes: [...axes],
    basis: "OSM edge.toll — exposition, jamais coût en euros",
  };
}

export function optimize(routes) {
  const analyzed = routes.filter((r) => r.tollExposure !== null);
  return analyzed
    .filter(
      (a) =>
        !analyzed.some(
          (b) =>
            b.durationSeconds <= a.durationSeconds &&
            b.tollExposure.tollKm <= a.tollExposure.tollKm &&
            (b.durationSeconds < a.durationSeconds ||
              b.tollExposure.tollKm < a.tollExposure.tollKm),
        ),
    )
    .sort((a, b) => a.durationSeconds - b.durationSeconds)
    .map((r) => r.id);
}
