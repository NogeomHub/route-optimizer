import { PocError, hash, sleep } from "./util.mjs";
import { decode } from "./geometry.mjs";

const minute = (seconds) =>
  seconds == null ? null : Math.round((seconds / 60) * 10) / 10;

export class TomTomEtaProvider {
  id = "tomtom-routing-eta-v1";

  constructor(http, { apiKey, wait = sleep, maxAttempts = 4 } = {}) {
    if (typeof apiKey !== "string" || !apiKey.trim())
      throw new PocError("TOMTOM_NOT_CONFIGURED", "Clé TomTom absente.", 503);
    Object.assign(this, { http, apiKey: apiKey.trim(), wait, maxAttempts });
  }

  async reassess(route, { departAt = "now" } = {}) {
    if (!route?.shape) throw new PocError("INVALID_ROUTE", "Géométrie ETA absente.");
    const coordinates = decode(route.shape);
    if (coordinates.length < 2)
      throw new PocError("INVALID_ROUTE", "Géométrie ETA insuffisante.");
    const supportingPoints = coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
    const origin = supportingPoints[0], destination = supportingPoints.at(-1);
    const locations = `${origin.latitude},${origin.longitude}:${destination.latitude},${destination.longitude}`;
    const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${locations}/json`);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("traffic", "true");
    url.searchParams.set("departAt", departAt);
    url.searchParams.set("routeType", "fastest");
    url.searchParams.set("travelMode", "car");
    url.searchParams.set("reconstructionMode", "strict");
    url.searchParams.set("computeTravelTimeFor", "all");
    url.searchParams.set("routeRepresentation", "summaryOnly");
    url.searchParams.set("maxAlternatives", "0");

    let response;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        response = await this.http.json(url.href, { supportingPoints }, "tomtom_eta", 60000);
        break;
      } catch (error) {
        if (error.code !== "PROVIDER_RATE_LIMIT" || attempt === this.maxAttempts) throw error;
        await this.wait(3000 * attempt);
      }
    }
    const summary = response?.routes?.[0]?.summary;
    if (!summary || !Number.isFinite(summary.travelTimeInSeconds) || !Number.isFinite(summary.lengthInMeters))
      throw new PocError("INVALID_PROVIDER", "Résumé ETA TomTom invalide.");
    return {
      provider: this.id,
      shapeHash: route.shapeHash ?? hash(route.shape),
      departAt,
      durationMinutes: minute(summary.travelTimeInSeconds),
      distanceKm: Math.round((summary.lengthInMeters / 1000) * 10) / 10,
      noTrafficMinutes: minute(summary.noTrafficTravelTimeInSeconds),
      historicTrafficMinutes: minute(summary.historicTrafficTravelTimeInSeconds),
      liveTrafficMinutes: minute(summary.liveTrafficIncidentsTravelTimeInSeconds),
      trafficDelayMinutes: minute(summary.trafficDelayInSeconds),
      departureTime: summary.departureTime ?? null,
      arrivalTime: summary.arrivalTime ?? null,
    };
  }
}
