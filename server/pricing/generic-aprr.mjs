import { readFileSync } from "node:fs";
import { analyze, decode } from "../src/geometry.mjs";
import { pathIndex } from "./matching.mjs";

export const normalizeStation = (value = "") =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const optionalJson = (url) => {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

export function loadGeneratedAprr(root = new URL("./", import.meta.url)) {
  return optionalJson(new URL("./generated/aprr-2026-matrix.json", root));
}

export function loadAprrBooths(root = new URL("./", import.meta.url)) {
  return (
    optionalJson(new URL("./generated/aprr-toll-booths.json", root)) ??
    optionalJson(new URL("./data/osm-aprr-toll-booths.json", root))
  );
}

const officialNames = (matrix) => {
  const names = new Set();
  for (const key of Object.keys(matrix.matrix)) {
    const [entry, exit] = key.split("\u0000");
    names.add(entry);
    if (exit !== "SYSTEME OUVERT") names.add(exit);
  }
  return [...names];
};

export function resolveOfficialStation(osmName, names) {
  const value = normalizeStation(osmName)
    .replace(/^GARE DE PEAGE DE /, "")
    .replace(/^PEAGE DE /, "")
    .replace(/^PEAGE /, "");
  if (names.includes(value)) return value;
  const candidates = names.filter(
    (name) => name.length >= 5 && (value.includes(name) || name.includes(value)),
  );
  if (candidates.length === 1) return candidates[0];
  candidates.sort((a, b) => b.length - a.length);
  if (
    candidates.length > 1 &&
    candidates[0].length >= candidates[1].length + 4
  )
    return candidates[0];
  return null;
}

const eventEvidence = (event) =>
  event.booth
    ? {
        osmType: event.booth.osm_type,
        osmId: event.booth.osm_id,
        coordinate: [event.booth.lon, event.booth.lat],
        distanceMeters: event.hit.distance,
        source: "OpenStreetMap contributors, ODbL 1.0",
      }
    : {
        traceEdgeName: event.edgeName,
        coordinate: event.point,
        source: "Valhalla trace_attributes station name on OSM-derived road data",
        ...(event.aliasReason ? { aliasReason: event.aliasReason } : {}),
      };

const PLAZA_COVERAGE_BUFFER_METERS = 1000;

function collapseLegacyTraceAliases(events, path) {
  const centreEvents = events.filter((e) => e.station === "CHALON CENTRE");
  return events.map((event) => {
    if (event.station !== "CHALON NORD" || event.booth) return event;
    const centre = centreEvents.find(
      (candidate) =>
        Math.abs(path.at(candidate.index) - path.at(event.index)) <=
        PLAZA_COVERAGE_BUFFER_METERS,
    );
    if (!centre) return event;
    return {
      ...event,
      station: "CHALON CENTRE",
      aliasReason:
        "APRR_2024_FORMER_CHALON_NORD_RENAMED_CHALON_CENTRE_25_2",
    };
  });
}

export function matchGenericAprrTransactions(
  { route, trace, on },
  matrix,
  stationData,
  { toleranceMeters = 60 } = {},
) {
  const analysis = analyze(trace, route);
  const tollEdges = trace.edges.filter((edge) => edge.toll);
  if (!tollEdges.length) {
    return {
      transactions: [],
      coverageComplete: analysis.tollKm === 0,
      unknown: [],
      uncoveredTollKm: 0,
      evidenceBasis: "road_data_zero",
      scope: "fully-analyzed-no-toll",
      matchingVerifiedAt: stationData?.snapshot_date ?? "2026-11-02",
      verificationDue: false,
    };
  }
  if (!matrix || !stationData?.booths?.length) return null;

  const tracePoints = decode(trace.shape);
  const points = route.geometry.coordinates;
  const path = pathIndex(points);
  const names = officialNames(matrix);
  let events = [];
  for (const booth of stationData.booths) {
    const station = resolveOfficialStation(booth.name, names);
    if (!station) continue;
    const hit = path.nearest([booth.lon, booth.lat]);
    if (hit.distance > toleranceMeters) continue;
    events.push({ station, index: hit.index, booth, hit });
  }

  for (const edge of trace.edges) {
    for (const edgeName of edge.names ?? []) {
      if (!/^PEAGE\b/.test(normalizeStation(edgeName))) continue;
      const station = resolveOfficialStation(edgeName, names);
      if (!station) continue;
      const shapeIndex = Math.round(
        (edge.begin_shape_index + edge.end_shape_index) / 2,
      );
      const point = tracePoints[shapeIndex];
      const hit = path.nearest(point, true);
      events.push({
        station,
        index: hit.index,
        edgeName,
        point,
        hit: { ...hit, distance: 0 },
      });
    }
  }
  events.sort((a, b) => a.index - b.index);
  events = collapseLegacyTraceAliases(events, path);

  const gates = [];
  for (const event of events) {
    const last = gates.at(-1);
    if (
      last &&
      last.station === event.station &&
      Math.abs(path.at(last.index) - path.at(event.index)) <
        PLAZA_COVERAGE_BUFFER_METERS
    ) {
      if ((!last.booth && event.booth) || event.hit.distance < last.hit.distance)
        Object.assign(last, event);
      continue;
    }
    gates.push({ ...event });
  }
  if (!gates.length) return null;

  const transactions = [];
  const unknown = [];
  let pending = null;
  for (const gate of gates) {
    const openKey = `${gate.station}\u0000SYSTEME OUVERT`;
    const isOpen = Boolean(matrix.matrix[openKey]);
    if (isOpen) {
      if (pending) unknown.push("GENERIC_APRR_MIXED_SYSTEM_AMBIGUITY");
      transactions.push({
        operator: "APRR",
        system: "open",
        entry: gate.station,
        exit: "Système Ouvert",
        mappingConfidence: "reviewed",
        tariffSource: "generated_aprr_matrix",
        evidence: [eventEvidence(gate)],
        interval: [gate.index, gate.index],
      });
      continue;
    }
    if (!pending) pending = gate;
    else {
      const key = `${pending.station}\u0000${gate.station}`;
      transactions.push({
        operator: "APRR",
        system: "closed",
        entry: pending.station,
        exit: gate.station,
        mappingConfidence: matrix.matrix[key] ? "reviewed" : "ambiguous",
        tariffSource: "generated_aprr_matrix",
        evidence: [eventEvidence(pending), eventEvidence(gate)],
        interval: [pending.index, gate.index],
        reason: matrix.matrix[key] ? undefined : "NO_GENERATED_APRR_CELL",
      });
      pending = null;
    }
  }
  if (pending) unknown.push("UNRESOLVED_TICKET");

  const tollSpans = tollEdges.map((edge) => {
    const start = tracePoints[edge.begin_shape_index];
    const end = tracePoints[edge.end_shape_index];
    const a = path.nearest(start, true);
    const b = path.nearest(end, true);
    return {
      lo: path.at(Math.min(a.index, b.index)),
      hi: path.at(Math.max(a.index, b.index)),
      km: edge.length,
    };
  });
  let uncoveredTollKm = 0;
  for (const span of tollSpans) {
    const covered = transactions.some((transaction) => {
      if (transaction.mappingConfidence !== "reviewed") return false;
      if (transaction.system === "closed") {
        const [a, b] = transaction.interval.map(path.at);
        const lo = Math.min(a, b) - PLAZA_COVERAGE_BUFFER_METERS;
        const hi = Math.max(a, b) + PLAZA_COVERAGE_BUFFER_METERS;
        return lo <= span.lo && span.hi <= hi;
      }
      const gate = path.at(transaction.interval[0]);
      return (
        span.lo - PLAZA_COVERAGE_BUFFER_METERS <= gate &&
        gate <= span.hi + PLAZA_COVERAGE_BUFFER_METERS
      );
    });
    if (!covered) uncoveredTollKm += span.km;
  }
  if (uncoveredTollKm > 0.05) unknown.push("COVERAGE_INCOMPLETE");

  return {
    transactions,
    coverageComplete:
      unknown.length === 0 &&
      transactions.length > 0 &&
      transactions.every((t) => t.mappingConfidence === "reviewed"),
    unknown,
    uncoveredTollKm,
    evidenceBasis:
      "generated_official_aprr_matrix_plus_reviewed_osm_or_trace_station_names",
    scope: "generic-aprr-2026",
    matchingVerifiedAt: stationData.snapshot_date ?? "2026-11-02",
    verificationDue: on >= "2027-01-28",
  };
}
