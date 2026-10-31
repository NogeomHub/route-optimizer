import { getStore } from "@netlify/blobs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { BlobsStore } from "./store.mjs";
import { Cache } from "../src/store.mjs";
import { Jobs } from "../src/jobs.mjs";
import { HttpClient, FossgisProvider, IgnGeocoder } from "../src/providers.mjs";
import { AuditedTollPricingProvider } from "../pricing/provider.mjs";
import { uuid } from "../src/util.mjs";
export async function dispatchBackground(jobId, config, fetchImpl = fetch) {
  const r = await fetchImpl(
    config.origin + "/.netlify/functions/search-background",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.workerToken,
      },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    },
  );
  if (r.status !== 202) throw Error("Background invocation not accepted");
}
export function runtime(config, { background = false } = {}) {
  const store = new BlobsStore(
    getStore({ name: "route-optimizer-v3", consistency: "strong" }),
  );
  const http = new HttpClient({
    timeoutMs: background ? 90000 : 20000,
    record: (entry) =>
      store.put(
        `network/${new Date(entry.startedAt).toISOString().slice(0, 10)}/${uuid()}`,
        { ...entry, expiresAt: Date.now() + 86400000 },
      ),
  });
  const jobs = new Jobs({
    store,
    provider: new FossgisProvider(http, { policyReviewed: true }),
    geocoder: new IgnGeocoder(http, new Cache(store)),
    earlyNoTolls: config.earlyNoTolls,
    pricingProvider: new AuditedTollPricingProvider({
      resourceRoot: pathToFileURL(
        resolve(process.cwd(), "server/pricing") + "/",
      ),
    }),
    dispatch: (id) => dispatchBackground(id, config),
  });
  return { jobs, http };
}
