import { zipFunctions } from "@netlify/zip-it-and-ship-it";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "route-netlify-package-"));
const result = await zipFunctions(
  "netlify/functions",
  join(directory, "zips"),
  {
    basePath: root,
    config: {
      "*": {
        nodeBundler: "esbuild",
        nodeVersion: "24.x",
        includedFiles: [
          "server/pricing/**",
          "server/src/geometry.mjs",
          "server/src/util.mjs",
        ],
      },
    },
  },
);
assert.deepEqual(result.map((r) => r.name).sort(), [
  "api",
  "search-background",
]);
for (const f of result) {
  const target = join(directory, f.name);
  await mkdir(target);
  execFileSync("unzip", ["-q", f.path, "-d", target]);
  const entries = execFileSync("unzip", ["-Z1", f.path], {
    encoding: "utf8",
  }).split("\n");
  assert.ok(
    !entries.some((p) => p.includes(".local-v3") || p.includes("experiments/")),
  );
  for (const resource of [
    "provider.mjs",
    "matching.mjs",
    "data/models.json",
    "data/aprr-2026.json",
    "data/cofiroute-2026.json",
  ])
    assert.ok(
      entries.includes("server/pricing/" + resource),
      resource + " missing",
    );
  // Load the isolated package, never source files from the checkout. No network or Blobs credentials.
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { pathToFileURL } from 'node:url';
    const {AuditedTollPricingProvider} = await import(pathToFileURL(process.cwd() + '/server/pricing/provider.mjs'));
    const p = new AuditedTollPricingProvider();
    assert.equal(p.catalogs[0].rules.length, 16);
    assert.equal(p.models.length, 2);
    assert.equal(p.quote({operator:'APRR',system:'closed',entry:'AMBERIEU',exit:'LES EPRUNES',mappingConfidence:'reviewed'}, {on:'2026-10-31'}).cents,4070);
  `,
    ],
    { cwd: target, stdio: "inherit" },
  );
  const entry = entries.find(
    (p) => p === "netlify/functions/" + f.name + ".mjs",
  );
  assert.ok(entry);
  const assembled = await readFile(join(target, entry), "utf8");
  for (const productModule of [
    "server/src/jobs.mjs",
    "server/pricing/provider.mjs",
    "server/netlify/runtime.mjs",
  ])
    assert.ok(
      assembled.includes(productModule),
      productModule + " not in function bundle",
    );
  assert.ok(
    !assembled.includes(".local-v3") &&
      !assembled.includes("experiments/backend-v3"),
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {pathToFileURL} from 'node:url';
    Object.assign(process.env, {V3_HOSTING_ENABLED:'true',V3_SITE_ORIGIN:'https://v3.example.test',V3_ACCESS_TOKEN:'a'.repeat(64),V3_SESSION_SECRET:'b'.repeat(64),V3_WORKER_TOKEN:'c'.repeat(64),V3_OPERATOR_CONTACT:'test@example.test',V3_FOSSGIS_POLICY_REVIEWED:'true',NETLIFY_BLOBS_CONTEXT:Buffer.from(JSON.stringify({siteID:'synthetic',token:'synthetic',edgeURL:'https://never.example.test',uncachedEdgeURL:'https://never.example.test'})).toString('base64')});
    globalThis.fetch = async () => {throw Error('Unexpected network request in packaged smoke test');};
    const module = await import(pathToFileURL(process.cwd() + '/' + ${JSON.stringify(entry)}));
    if (${JSON.stringify(f.name)} === 'api') {
      const r = await module.default(new Request('https://v3.example.test/api/about'));
      assert.equal(r.status,200);assert.equal((await r.json()).personalOnly,true);
      assert.ok(module.config.path.includes('/api/session'));
    } else {
      assert.equal(await module.default(new Request('https://v3.example.test/.netlify/functions/search-background', {method:'POST',body:'{}'})),undefined);
    }
  `,
    ],
    { cwd: target, stdio: "inherit" },
  );
  console.log(
    f.name,
    "packaged with product pricing resources:",
    entries.length,
    "entries",
  );
  console.log(
    "Entrypoints:",
    entries.filter((p) => /api\.(m?js)$|search-background\.(m?js)$/.test(p)),
  );
}
console.log(
  "Local packaging only; no site created/deployed. Archives:",
  directory,
);
