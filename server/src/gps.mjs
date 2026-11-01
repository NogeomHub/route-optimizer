import { distance, decode } from "./geometry.mjs";
import { hash, PocError } from "./util.mjs";
import { Cache } from "./store.mjs";
import { PROFILES } from "./strategy.mjs";
export const GPS_VERSION = "divergence-corridor-v2";
const rad = Math.PI / 180;
// Local metric projection, used only for route proximity (not route distance/price).
function indexLine(coords) {
  const scale = Math.cos(coords[0][1] * rad),
    project = (p) => [p[0] * 111.32 * scale, p[1] * 111.32];
  const points = coords.map(project),
    grid = new Map();
  const cell = 0.5;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    for (
      let x = Math.floor((Math.min(a[0], b[0]) - 0.2) / cell);
      x <= Math.floor((Math.max(a[0], b[0]) + 0.2) / cell);
      x++
    )
      for (
        let y = Math.floor((Math.min(a[1], b[1]) - 0.2) / cell);
        y <= Math.floor((Math.max(a[1], b[1]) + 0.2) / cell);
        y++
      ) {
        const key = x + "," + y;
        let items = grid.get(key);
        if (!items) {
          items = [];
          grid.set(key, items);
        }
        items.push(i);
      }
  }
  const segment = (p, i) => {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  return {
    near(p) {
      const q = project(p);
      return (
        grid.get(Math.floor(q[0] / cell) + "," + Math.floor(q[1] / cell)) ?? []
      ).some((i) => segment(q, i) <= 0.2);
    },
    distance(p) {
      const q = project(p);
      let d = Infinity;
      for (let i = 1; i < points.length; i++) d = Math.min(d, segment(q, i));
      return d;
    },
  };
}
export function corridorCandidates(route, reference, maneuvers, trace) {
  const coords = route.coordinates,
    fast = reference.coordinates;
  if (
    !Array.isArray(coords) ||
    !Array.isArray(fast) ||
    coords.length < 2 ||
    fast.length < 2 ||
    coords.length > 30000 ||
    fast.length > 30000 ||
    !Array.isArray(maneuvers) ||
    !trace?.edges?.length
  )
    return { reason: "MISSING_ROAD_EVIDENCE", groups: [] };
  const valid = (points) => {
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 80
      )
        return false;
      if (i) {
        const d = distance(points[i - 1], p);
        if (d > 5) return false;
        total += d;
      }
    }
    return total > 0 && total <= 2000;
  };
  if (!valid(coords) || !valid(fast))
    return { reason: "UNSUPPORTED_GEOMETRY", groups: [] };
  const line = indexLine(fast),
    own = indexLine(coords),
    km = [0];
  for (let i = 1; i < coords.length; i++)
    km.push(km.at(-1) + distance(coords[i - 1], coords[i]));
  const intervals = [];
  let start = null;
  for (let i = 0; i < coords.length; i++) {
    if (!line.near(coords[i])) {
      if (start === null) start = i;
    } else if (start !== null) {
      intervals.push({ start, end: i - 1 });
      start = null;
    }
  }
  if (start !== null) intervals.push({ start, end: coords.length - 1 });
  const merged = [];
  for (const q of intervals) {
    const last = merged.at(-1);
    if (last && km[q.start] - km[last.end] < 2) last.end = q.end;
    else merged.push({ ...q });
  }
  const zones = merged.filter((q) => km[q.end] - km[q.start] >= 3);
  if (!zones.length) return { reason: "NO_DISTINCT_CORRIDOR", groups: [] };
  const tracePoints = decode(trace.shape);
  const groups = [];
  for (let z = 0; z < zones.length; z++) {
    const zone = zones[z],
      length = km[zone.end] - km[zone.start];
    // Spread anchors across the whole divergent corridor. Google Maps URLs support
    // at most three waypoints on mobile browsers, so use that budget deliberately.
    const slots = Math.min(3, Math.max(1, Math.ceil(length / 28)));
    for (let slot = 0; slot < slots; slot++) {
      const bandStart = km[zone.start] + (length * slot) / slots,
        bandEnd = km[zone.start] + (length * (slot + 1)) / slots,
        margin = Math.min(2, (bandEnd - bandStart) * 0.15),
        lo = bandStart + margin,
        hi = bandEnd - margin,
        target = (lo + hi) / 2;
      const candidates = [];
      for (const m of maneuvers) {
        const a = m.begin_shape_index,
          b = m.end_shape_index,
          names = m.street_names ?? [];
        if (
          !Number.isInteger(a) ||
          !Number.isInteger(b) ||
          a < 0 ||
          b >= coords.length ||
          b <= a ||
          m.toll === true ||
          m.highway === true ||
          m.has_highway === true ||
          [17, 18, 19, 20, 21, 25, 26].includes(m.type) ||
          !names.length ||
          names.some((n) =>
            /^(A|E|N)\s?\d|autoroute|bretelle|giratoire|rond.point/i.test(n),
          ) ||
          !names.some((n) =>
            /^(D\s?\d|Rue\b|Route\b|Avenue\b|Boulevard\b|Chemin\b|Place\b)/i.test(
              n,
            ),
          )
        )
          continue;
        const mid = (km[a] + km[b]) / 2;
        let i = a;
        while (i < b && km[i] < mid) i++;
        if (
          km[i] < lo ||
          km[i] > hi ||
          km[i] - km[a] < 0.05 ||
          km[b] - km[i] < 0.05
        )
          continue;
        const point = coords[i],
          separation = line.distance(point);
        if (separation < 2) continue;
        // A trace edge at this position must positively confirm a non-toll ordinary named road.
        const edge = trace.edges.find(
          (e) =>
            e.toll === false &&
            Array.isArray(e.names) &&
            e.names.some((n) => names.includes(n)) &&
            tracePoints[e.begin_shape_index] &&
            tracePoints[e.end_shape_index] &&
            distance(tracePoints[e.begin_shape_index], point) +
              distance(point, tracePoints[e.end_shape_index]) <=
              e.length + 0.12,
        );
        if (!edge) continue;
        candidates.push({
          point,
          routeKm: km[i],
          separationKm: separation,
          roads: names,
          zone: z + 1,
          zoneStartKm: km[zone.start],
          zoneEndKm: km[zone.end],
          targetDeltaKm: Math.abs(km[i] - target),
        });
      }
      candidates.sort(
        (a, b) =>
          a.targetDeltaKm - b.targetDeltaKm ||
          b.separationKm - a.separationKm ||
          a.routeKm - b.routeKm,
      );
      // Distinct trials, not a flurry of reverse geocoding calls on adjacent shape vertices.
      const trials = [];
      for (const c of candidates) {
        if (trials.every((t) => Math.abs(t.routeKm - c.routeKm) > 2))
          trials.push(c);
        if (trials.length === 2) break;
      }
      if (!trials.length) return { reason: "NO_ACCESSIBLE_ANCHOR", groups: [] };
      groups.push(trials);
    }
  }
  if (groups.length > 3) return { reason: "TOO_MANY_DIVERGENCES", groups: [] };
  return {
    groups,
    referenceDistance: (p) => line.distance(p),
    routeDistance: (p) => own.distance(p),
  };
}
const unavailable = (reason) => ({
  status: "unavailable",
  reason,
  steps: [],
  version: GPS_VERSION,
});
export class GpsGuidance {
  constructor({ store, reverseGeocoder, now = Date.now }) {
    Object.assign(this, { store, reverseGeocoder, now });
    this.cache = new Cache(store, now);
  }
  async get(jobs, id, routeId) {
    const job = await jobs.read(id);
    if (job.status !== "completed") return unavailable("JOB_NOT_COMPLETED");
    const result = (await this.store.get(job.resultKey))?.data;
    const route = result?.routes.find((r) => r.id === routeId);
    if (!route) throw new PocError("NOT_FOUND", "Itinéraire introuvable.", 404);
    const reference = [...result.routes].sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds || a.id.localeCompare(b.id),
    )[0];
    const base = {
      routeId,
      referenceId: reference.id,
      origin: job.origin,
      destination: job.destination,
      version: GPS_VERSION,
    };
    if (route.id === reference.id)
      return {
        ...base,
        status: "reference",
        steps: [],
        reason: "FASTEST_REFERENCE",
      };
    const key = {
      version: GPS_VERSION,
      graph: job.graph,
      route: route.shapeHash,
      reference: reference.shapeHash,
      origin: job.origin,
      destination: job.destination,
    };
    const cached = await this.cache.get("gps-guidance", key);
    if (cached) return { ...cached, routeId, referenceId: reference.id };
    const load = async (r) => {
      const row = await this.store.get(r.geometryKey);
      return row?.data.expiresAt > this.now() ? row.data.geometry : null;
    };
    const [geometry, fast, trace] = await Promise.all([
      load(route),
      load(reference),
      this.cache.get("analyses", {
        provider: job.provider,
        graph: job.graph,
        shapeHash: route.shapeHash,
        shapeMatch: "edge_walk",
        attributesVersion: 1,
        costing: "auto",
      }),
    ]);
    if (!geometry || !fast || !trace)
      return { ...base, ...unavailable("EVIDENCE_NOT_RETAINED") };
    const source = route.producedBy?.find(
      (p) => p.shapeHash === route.shapeHash,
    );
    let maneuvers;
    if (source) {
      const response = await this.cache.get("valhalla", {
        locations: [job.origin, job.destination],
        parameters: PROFILES[source.profile],
        provider: job.provider,
        graph: job.graph,
        costing: "auto",
        alternates: 2,
        units: "kilometers",
        language: "fr-FR",
        shape_format: "polyline6",
      });
      const trips = response
        ? [response.trip, ...(response.alternates ?? []).map((a) => a.trip)]
        : [];
      maneuvers = trips.find(
        (t) => hash(t?.legs?.[0]?.shape ?? "") === route.shapeHash,
      )?.legs[0].maneuvers;
    }
    let analysis;
    try {
      analysis = corridorCandidates(geometry, fast, maneuvers, trace);
    } catch {
      return { ...base, ...unavailable("INVALID_ROAD_EVIDENCE") };
    }
    if (analysis.reason) return { ...base, ...unavailable(analysis.reason) };
    const steps = [],
      start = this.now();
    for (const trials of analysis.groups) {
      const fallback = trials[0];
      let selected;
      for (const c of trials) {
        if (this.now() - start > 10000) break;
        let locations;
        try {
          locations = await this.reverseGeocoder.reverse(c.point);
        } catch {
          continue;
        }
        if (!Array.isArray(locations)) continue;
        const place = locations.find(
          (p) =>
            ["housenumber", "street"].includes(p.type) &&
            p.label &&
            p.city &&
            p.postcode &&
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lon) &&
            distance(c.point, [p.lon, p.lat]) <= 0.08 &&
            analysis.routeDistance([p.lon, p.lat]) <= 0.08 &&
            analysis.referenceDistance([p.lon, p.lat]) >= 2,
        );
        if (place) {
          selected = {
            ...c,
            ...place,
            source: "IGN Géoplateforme",
            evidence: "cached_maneuver_and_trace",
            separationKm: analysis.referenceDistance([place.lon, place.lat]),
            offsetMeters: Math.round(
              distance(c.point, [place.lon, place.lat]) * 1000,
            ),
            coordinateOnly: false,
          };
          break;
        }
      }
      if (!selected && fallback) {
        selected = {
          ...fallback,
          label: `${fallback.roads[0] ?? "Repère"} · ${fallback.point[1].toFixed(6)}, ${fallback.point[0].toFixed(6)}`,
          lat: fallback.point[1],
          lon: fallback.point[0],
          city: "",
          postcode: "",
          source: "Valhalla + trace",
          evidence: "cached_maneuver_and_trace_coordinate",
          separationKm: analysis.referenceDistance(fallback.point),
          offsetMeters: 0,
          coordinateOnly: true,
        };
      }
      if (!selected) return { ...base, ...unavailable("NO_RELIABLE_ANCHOR") };
      steps.push(selected);
    }
    const guide = {
      ...base,
      status: "suggested",
      steps,
      warning:
        "Corridor guidé par coordonnées : Google Maps recalcule entre les repères. Vérifiez le tracé et les péages ; les prix affichés concernent uniquement le trajet Valhalla.",
    };
    await this.cache.set(
      "gps-guidance",
      key,
      guide,
      Math.max(0, Math.min(86400000, job.expiresAt - this.now())),
    );
    return guide;
  }
}
