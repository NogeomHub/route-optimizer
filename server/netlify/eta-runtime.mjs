import { Cache } from "../src/store.mjs";
import { TomTomEtaProvider } from "../src/tomtom.mjs";
import { EtaService, attachEta } from "../src/eta-service.mjs";

export function attachConfiguredEta({ jobs, store, http, apiKey }) {
  if (!apiKey) return jobs;
  const cache = new Cache(store);
  const provider = new TomTomEtaProvider(http, { apiKey });
  return attachEta(jobs, new EtaService({ cache, store, provider }));
}
