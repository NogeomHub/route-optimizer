import { etaShortlist, etaPareto, etaEligible } from "./eta.mjs";

export class EtaService {
  constructor({
    cache,
    store,
    provider,
    ttlMs = 15 * 60 * 1000,
    failureTtlMs = 60 * 1000,
  } = {}) {
    Object.assign(this, { cache, store, provider, ttlMs, failureTtlMs });
  }

  async enrich(job, result, { departAt = "now" } = {}) {
    if (!this.provider || !result?.routes?.length) return result;
    const shortlist = etaShortlist(result.routes);
    const selected = new Set(shortlist);
    const etaById = {};
    let failures = 0;

    for (const route of result.routes) {
      if (!selected.has(route.id)) continue;
      const key = {
        provider: this.provider.id,
        shapeHash: route.shapeHash,
        departAt: departAt === "now" ? "live" : departAt,
      };
      let eta = await this.cache.get("eta-tomtom", key);
      if (!eta) {
        try {
          const geometry = await this.store.get(route.geometryKey);
          const shape = geometry?.data?.shape;
          if (!shape) throw new Error("Route shape unavailable");
          eta = await this.provider.reassess({ ...route, shape }, { departAt });
          await this.cache.set("eta-tomtom", key, eta, this.ttlMs);
        } catch (error) {
          eta = {
            status: "fallback",
            provider: this.provider.id,
            durationMinutes: Math.round((route.durationSeconds / 60) * 10) / 10,
            reason: error?.code ?? "ETA_FAILED",
          };
          // A short negative cache prevents repeated polling from hammering
          // TomTom during an outage/rate-limit while allowing a quick recovery.
          await this.cache.set("eta-tomtom", key, eta, this.failureTtlMs);
        }
      }
      if (eta.status === "fallback") failures++;
      etaById[route.id] = { status: eta.status ?? "ok", ...eta };
    }

    const routes = result.routes.map((route) => ({
      ...route,
      eta: etaById[route.id] ?? {
        status: "not_requested",
        provider: this.provider.id,
        durationMinutes: Math.round((route.durationSeconds / 60) * 10) / 10,
      },
    }));
    const finalPareto = etaPareto(routes);
    const eligible = etaEligible(routes, job.parameters.maxExtraMinutes);
    return {
      ...result,
      routes,
      eta: {
        provider: this.provider.id,
        mode: departAt === "now" ? "live" : "scheduled",
        shortlist,
        failures,
        cacheTtlSeconds: Math.round(this.ttlMs / 1000),
        failureCacheTtlSeconds: Math.round(this.failureTtlMs / 1000),
      },
      // Never label the exposure Pareto as an ETA Pareto. An empty array means
      // no authoritative TomTom time/price frontier is currently available.
      etaPareto: finalPareto,
      eligibleRouteIds: eligible ?? result.eligibleRouteIds,
    };
  }
}

export function attachEta(jobs, service) {
  const baseView = jobs.view.bind(jobs);
  jobs.view = async (id, options = {}) => {
    const value = await baseView(id, options);
    if (options.includeResult === false) return value;
    if (value.status !== "completed" || !value.result || !service) return value;
    const job = await jobs.read(id);
    value.result = await service.enrich(job, value.result);
    return value;
  };
  return jobs;
}
