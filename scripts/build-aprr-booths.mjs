import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sources = [
  {
    label: "primary-overpass",
    path: new URL(
      "../experiments/tolls/sources/open/osm-toll-nodes.json",
      import.meta.url,
    ),
  },
  {
    label: "extra-overpass",
    path: new URL(
      "../experiments/tolls/sources/open/osm-toll-nodes-extra.json",
      import.meta.url,
    ),
  },
  {
    label: "reviewed-seed",
    path: new URL(
      "../server/pricing/data/osm-aprr-toll-booths.json",
      import.meta.url,
    ),
  },
];
const outputPath = new URL(
  "../server/pricing/generated/aprr-toll-booths.json",
  import.meta.url,
);

const sourceMeta = [];
const collected = [];
let snapshotDate = "";

for (const source of sources) {
  const raw = readFileSync(source.path);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const parsed = JSON.parse(raw.toString("utf8"));
  sourceMeta.push({ label: source.label, sha256 });

  if (source.label === "reviewed-seed") {
    snapshotDate = snapshotDate || parsed.snapshot_date || "";
    for (const booth of parsed.booths ?? []) collected.push(booth);
    continue;
  }

  snapshotDate =
    snapshotDate || String(parsed?.osm3s?.timestamp_osm_base ?? "").slice(0, 10);
  for (const element of parsed.elements ?? []) {
    if (
      element?.type !== "node" ||
      element?.tags?.barrier !== "toll_booth" ||
      String(element?.tags?.operator ?? "").toUpperCase() !== "APRR" ||
      !Number.isFinite(element.lat) ||
      !Number.isFinite(element.lon) ||
      typeof element?.tags?.name !== "string" ||
      !element.tags.name.trim()
    )
      continue;
    collected.push({
      osm_type: element.type,
      osm_id: element.id,
      lat: element.lat,
      lon: element.lon,
      name: element.tags.name,
      operator_ref: element.tags["operator:ref"] ?? null,
      highway_ref: element.tags["highway:ref"] ?? null,
    });
  }
}

const byId = new Map();
for (const booth of collected) {
  const key = `${booth.osm_type ?? "node"}:${booth.osm_id}`;
  byId.set(key, booth);
}
const booths = [...byId.values()].sort((a, b) => a.osm_id - b.osm_id);

const required = ["Pont-d'Ain", "Chalon Sud", "Tournus", "Mâcon Nord"];
for (const name of required) {
  if (!booths.some((booth) => booth.name === name)) {
    throw new Error(`APRR merged snapshot is missing required station: ${name}`);
  }
}
if (booths.length < 50) {
  throw new Error(
    `APRR merged snapshot unexpectedly small: ${booths.length} toll-booth nodes`,
  );
}

const generated = {
  schema_version: 2,
  snapshot_date: snapshotDate || "2026-11-02",
  source:
    "OpenStreetMap contributors; merged repository-pinned Overpass snapshots plus reviewed regression seed",
  sources: sourceMeta,
  license: "ODbL 1.0",
  attribution: "© OpenStreetMap contributors",
  coverage:
    "all named APRR toll_booth nodes in the repository snapshots, supplemented by reviewed regression stations; generated deterministically at build time",
  booths,
};

mkdirSync(new URL("../server/pricing/generated/", import.meta.url), {
  recursive: true,
});
writeFileSync(outputPath, JSON.stringify(generated, null, 2) + "\n");
console.log(
  `Generated ${booths.length} APRR toll-booth nodes from ${sources.length} pinned sources.`,
);
