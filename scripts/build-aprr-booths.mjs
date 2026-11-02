import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL(
  "../experiments/tolls/sources/open/osm-toll-nodes.json",
  import.meta.url,
);
const outputPath = new URL(
  "../server/pricing/generated/aprr-toll-booths.json",
  import.meta.url,
);

const raw = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(raw).digest("hex");
const snapshot = JSON.parse(raw.toString("utf8"));

const booths = (snapshot.elements ?? [])
  .filter(
    (element) =>
      element?.type === "node" &&
      element?.tags?.barrier === "toll_booth" &&
      String(element?.tags?.operator ?? "").toUpperCase() === "APRR" &&
      Number.isFinite(element.lat) &&
      Number.isFinite(element.lon) &&
      typeof element?.tags?.name === "string" &&
      element.tags.name.trim(),
  )
  .map((element) => ({
    osm_type: element.type,
    osm_id: element.id,
    lat: element.lat,
    lon: element.lon,
    name: element.tags.name,
    operator_ref: element.tags["operator:ref"] ?? null,
    highway_ref: element.tags["highway:ref"] ?? null,
  }))
  .sort((a, b) => a.osm_id - b.osm_id);

const required = ["Pont-d'Ain", "Chalon Sud", "Tournus", "Mâcon Nord"];
for (const name of required) {
  if (!booths.some((booth) => booth.name === name)) {
    throw new Error(`APRR OSM snapshot is missing required reviewed station: ${name}`);
  }
}
if (booths.length < 50) {
  throw new Error(
    `APRR OSM snapshot unexpectedly small: ${booths.length} reviewed toll-booth nodes`,
  );
}

const generated = {
  schema_version: 2,
  snapshot_date: String(snapshot?.osm3s?.timestamp_osm_base ?? "").slice(0, 10),
  source: "OpenStreetMap contributors; repository-pinned Overpass snapshot",
  source_file: "experiments/tolls/sources/open/osm-toll-nodes.json",
  source_sha256: sourceSha256,
  license: "ODbL 1.0",
  attribution: "© OpenStreetMap contributors",
  coverage:
    "all named APRR toll_booth nodes present in the repository-pinned OSM snapshot; generated at build time",
  booths,
};

mkdirSync(new URL("../server/pricing/generated/", import.meta.url), {
  recursive: true,
});
writeFileSync(outputPath, JSON.stringify(generated, null, 2) + "\n");
console.log(
  `Generated ${booths.length} APRR toll-booth nodes from pinned OSM snapshot (${sourceSha256}).`,
);
