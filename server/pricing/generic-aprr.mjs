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

export function loadGeneratedAprr(root = new URL("./", import.meta.url)) {
  try {
    return JSON.parse(
      readFileSync(new URL("./generated/aprr-2026-matrix.json", root), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function loadAprrBooths(root = new URL("./", import.meta.url)) {
  return JSON.parse(
    readFileSync(new URL("./data/osm-aprr-toll-booths.json", root), "utf8"),
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
    .replace(/^PEAGE DE /, "");
  if (names.includes(value)) return value;
  const candidates = names.filter(
    (name) =>
      name.length >= 5 && (value.includes(name) || name.includes(value)),
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

const evidence = (booth, hit) => ({
  osmType: booth.osm_type,
  osmId: booth.osm_id,
  coordinate: [booth.lon, booth.lat],
  distanceMeters: hit.distance,
  source: "OpenStreetMap contributors, ODbL 1.0",
});

export function matchGenericAprrTransactions(
  { route, trace, on },
  matrix,
  stationData,
  { toleranceMeters = 25 } = {},
) {
  if (!matrix || !stationData?.booths?.length) return null;
  analyze(trace, route);
  const tracePoints = decode(trace.shape);
  const tollEdges = trace.edges.filter((edge) => edge.toll);
  if (!tollEdges.length) return null;

  const points = route.geometry.coordinates;
  const path = pathIndex(points);
  const names = officialNames(matrix);
  const events = [];
  for (const booth of stationData.booths) {
    const station = resolveOfficialStation(booth.name, names);
    if (!station) continue;
    const hit = path.nearest([booth.lon, booth.lat]);
    if (hit.distance > toleranceMeters) continue;
    events.push({ station, index: hit.index, booth, hit });
  }
  events.sort((a, b) => a.index - b.index);

  const gates = [];
  for (const event of events) {
    const last = gates.at(-1);
    if (
      last &&
      last.station === event.station &&
      Math.abs(last.index - event.index) < 30
    ) {
      if (event.hit.distance < last.hit.distance) Object.assign(last, event);
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
        evidence: [evidence(gate.booth, gate.hit)],
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
        evidence: [
          evidence(pending.booth, pending.hit),
          evidence(gate.booth, gate.hit),
        ],
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
        const lo = Math.min(a, b) - 250;
        const hi = Math.max(a, b) + 250;
        return lo <= span.lo && span.hi <= hi;
      }
      const gate = path.at(transaction.interval[0]);
      return span.lo - 500 <= gate && gate <= span.hi + 500;
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
    evidenceBasis: "generated_official_aprr_matrix_plus_osm_toll_booths",
    scope: "generic-aprr-2026",
    matchingVerifiedAt: "2026-11-02",
    verificationDue: on >= "2027-01-28",
  };
}
