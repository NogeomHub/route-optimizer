import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const SOURCE_URL =
  "https://voyage.aprr.fr/sites/default/files/2026-02/TARIFS_APRR.pdf";
const EXPECTED_SHA256 =
  "f05dfa58cb4ffba8b940b95319186fbf60f86d3791dce6a9df0919946b635d14";
const OUTPUT = new URL(
  "../server/pricing/generated/aprr-2026-matrix.json",
  import.meta.url,
);

const normalize = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const joinColumn = (items, minX, maxX) => {
  const parts = items
    .filter((item) => item.x >= minX && item.x < maxX)
    .sort((a, b) => a.x - b.x);
  let text = "";
  let end = null;
  for (const part of parts) {
    const gap = end == null ? 0 : part.x - end;
    text += end != null && gap > 1.5 ? ` ${part.s}` : part.s;
    end = part.x + part.w;
  }
  return text.trim();
};

const money = (value) => {
  const m = value.match(/^(\d+),(\d{2})$/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`APRR PDF HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== EXPECTED_SHA256)
  throw new Error(
    `APRR source changed (${sha256}); review the new official tariff edition before importing it.`,
  );

const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
const rows = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items
    .filter((item) => item.str?.trim())
    .map((item) => ({
      s: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
      w: item.width ?? 0,
    }));
  const bands = new Map();
  for (const item of items) {
    const key = item.y.toFixed(1);
    const row = bands.get(key) ?? [];
    row.push(item);
    bands.set(key, row);
  }
  for (const band of bands.values()) {
    const entryRaw = joinColumn(band, 30, 145);
    const exitRaw = joinColumn(band, 145, 260);
    const distanceRaw = joinColumn(band, 260, 305);
    const class1Raw = joinColumn(band, 305, 345).replace(/€/g, "").trim();
    const cents = money(class1Raw);
    if (
      !entryRaw ||
      !exitRaw ||
      !/^\d+,\d{2}$/.test(distanceRaw) ||
      cents == null
    )
      continue;
    rows.push({
      entry: normalize(entryRaw),
      exit: normalize(exitRaw),
      cents,
      distanceKm: Number(distanceRaw.replace(",", ".")),
      page: pageNumber,
    });
  }
}

const matrix = {};
for (const row of rows) {
  const key = `${row.entry}\u0000${row.exit}`;
  const previous = matrix[key];
  if (previous && previous.cents !== row.cents)
    throw new Error(`Conflicting APRR tariff row ${row.entry} -> ${row.exit}`);
  matrix[key] = { cents: row.cents, distanceKm: row.distanceKm, page: row.page };
}

for (const [entry, exit, expected] of [
  ["PONT D AIN", "CHALON SUD", 1070],
  ["AMBERIEU", "CHALON SUD", 1180],
  ["PONT D AIN", "LES EPRUNES", 3990],
]) {
  const actual = matrix[`${entry}\u0000${exit}`]?.cents;
  if (actual !== expected)
    throw new Error(`APRR sanity check failed ${entry} -> ${exit}: ${actual}`);
}

if (Object.keys(matrix).length < 20_000)
  throw new Error(`Suspiciously small APRR matrix: ${Object.keys(matrix).length} rows`);

await mkdir(new URL("../server/pricing/generated/", import.meta.url), {
  recursive: true,
});
await writeFile(
  OUTPUT,
  JSON.stringify({
    schemaVersion: 1,
    operator: "APRR",
    effectiveFrom: "2026-02-01",
    sourceUrl: SOURCE_URL,
    sourceSha256: sha256,
    generatedAt: new Date().toISOString(),
    normalization: "NFKD ASCII uppercase whitespace",
    matrix,
  }),
);
console.log(
  `Generated APRR 2026 class-1 matrix: ${Object.keys(matrix).length} directed rows from ${pdf.numPages} pages.`,
);
