import { fetch as undiciFetch, EnvHttpProxyAgent, Agent } from "undici";
import { PocError, hash } from "./util.mjs";

/** Future providers must expose ALL costing options, alternatives and strict traces. */
export class RoutingProvider {
  id = "abstract";
  status() {
    throw new Error("Implement status");
  }
  route() {
    throw new Error("Implement route");
  }
  trace() {
    throw new Error("Implement trace");
  }
}
export class HttpClient {
  constructor({ fetchImpl, timeoutMs = 90000, record = async () => {} } = {}) {
    this.dispatcher = fetchImpl
      ? null
      : process.env.HTTPS_PROXY || process.env.HTTP_PROXY
        ? new EnvHttpProxyAgent()
        : new Agent({ connections: 1 });
    this.fetch =
      fetchImpl ??
      ((url, options) =>
        undiciFetch(url, { ...options, dispatcher: this.dispatcher }));
    Object.assign(this, { timeoutMs, record });
  }
  async json(url, payload, kind) {
    const startedAt = Date.now();
    let status = null,
      raw = "",
      error = null;
    try {
      const response = await this.fetch(url, {
        method: payload === undefined ? "GET" : "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "RouteOptimizer-BackendPOC/0.1 (+https://github.com/NogeomHub/route-optimizer; personal experiment)",
          Referer: "https://github.com/NogeomHub/route-optimizer",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      // Bound memory. No retry and no permissive fallback endpoint/map matching.
      const reader = response.body?.getReader();
      const chunks = [];
      let bytes = 0;
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > 16 * 1024 * 1024) {
            await reader.cancel();
            throw new PocError(
              "RESPONSE_TOO_LARGE",
              "Réponse amont trop grande.",
            );
          }
          chunks.push(Buffer.from(part.value));
        }
        raw = Buffer.concat(chunks).toString("utf8");
      } else raw = await response.text();
      if (!response.ok)
        throw new PocError(
          response.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_HTTP",
          `HTTP amont ${response.status}.`,
          502,
          {
            upstreamStatus: response.status,
            retryAfter: response.headers.get("retry-after"),
          },
        );
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new PocError("INVALID_PROVIDER", "JSON amont invalide.");
      }
      if (value?.error)
        throw new PocError(
          "INVALID_PROVIDER",
          "Erreur retournée par le fournisseur.",
        );
      return value;
    } catch (e) {
      error = {
        code: e.code ?? "NETWORK_ERROR",
        message: e.message,
        cause: e.cause?.message,
      };
      if (
        e.name === "TimeoutError" ||
        e.cause?.code === "UND_ERR_CONNECT_TIMEOUT"
      )
        throw new PocError("TIMEOUT", "Délai du service dépassé.", 504);
      if (e instanceof PocError) throw e;
      throw new PocError(
        "NETWORK_ERROR",
        "Appel amont interrompu ou indisponible.",
      );
    } finally {
      await this.record({
        kind,
        url,
        payload: payload ?? null,
        startedAt,
        endedAt: Date.now(),
        status,
        raw,
        error,
        responseHash: hash(raw),
      });
    }
  }
  async close() {
    await this.dispatcher?.close();
  }
}

export class FossgisProvider extends RoutingProvider {
  id = "fossgis-valhalla-personal-poc";
  constructor(http, { policyReviewed = false } = {}) {
    super();
    if (!policyReviewed)
      throw new PocError(
        "POLICY_NOT_REVIEWED",
        "Activer explicitement le POC personnel après lecture des conditions FOSSGIS.",
        503,
      );
    this.http = http;
    this.endpoint = "https://valhalla1.openstreetmap.de";
  }
  status() {
    return this.http.json(this.endpoint + "/status", undefined, "status");
  }
  route(locations, parameters) {
    return this.http.json(
      this.endpoint + "/route",
      {
        locations,
        costing: "auto",
        costing_options: { auto: parameters },
        units: "kilometers",
        language: "fr-FR",
        alternates: 2,
        shape_format: "polyline6",
      },
      "route",
    );
  }
  trace(route) {
    return this.http.json(
      this.endpoint + "/trace_attributes",
      {
        encoded_polyline: route.shape,
        shape_match: "edge_walk",
        costing: "auto",
        units: "kilometers",
        filters: {
          action: "include",
          attributes: [
            "shape",
            "edge.toll",
            "edge.length",
            "edge.names",
            "edge.begin_shape_index",
            "edge.end_shape_index",
          ],
        },
      },
      "trace_attributes",
    );
  }
}

export class IgnGeocoder {
  constructor(http, cache) {
    Object.assign(this, { http, cache });
  }
  async candidates(text) {
    if (typeof text !== "string" || text.trim().length < 3 || text.length > 200)
      throw new PocError(
        "INVALID_INPUT",
        "Adresse attendue : 3 à 200 caractères.",
        400,
      );
    const query = text.trim().normalize("NFC").replace(/\s+/g, " ");
    const key = {
      provider: "ign-geoplateforme-search",
      query,
      limit: 5,
      country: "FR",
    };
    const cached = await this.cache.get("geocoding", key);
    if (cached !== null) return cached;
    const response = await this.http.json(
      "https://data.geopf.fr/geocodage/search?" +
        new URLSearchParams({ q: query, limit: "5" }),
      undefined,
      "geocoding",
    );
    if (!Array.isArray(response.features))
      throw new PocError("INVALID_PROVIDER", "Réponse IGN invalide.");
    const candidates = response.features
      .map((f) => ({
        label: f.properties?.label,
        lat: f.geometry?.coordinates?.[1],
        lon: f.geometry?.coordinates?.[0],
        postcode: f.properties?.postcode,
        city: f.properties?.city,
        type: f.properties?.type,
        source: "IGN Géoplateforme",
      }))
      .filter(
        (x) =>
          typeof x.label === "string" &&
          Number.isFinite(x.lat) &&
          Number.isFinite(x.lon),
      );
    await this.cache.set(
      "geocoding",
      key,
      candidates,
      candidates.length ? 86400000 : 60000,
    );
    return candidates;
  }
}
