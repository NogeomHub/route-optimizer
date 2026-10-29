import archive from "../data/archive.json";
import type { RouteCandidate } from "../domain/types";
import type {
  RoutingProvider,
  GeometryProvider,
  RoutingRequest,
} from "./RoutingProvider";
export const ARCHIVED_JOURNEY = {
  origin: "Crans, 01320, France",
  destination: "Le Pin, 77181, France",
};
export const archivedCandidates: RouteCandidate[] = archive as RouteCandidate[];
/** No API calls, geocoding or arbitrary city substitution. The snapshot is immutable. */
export class ArchivedRoutingProvider
  implements RoutingProvider, GeometryProvider
{
  readonly mode = "archived" as const;
  private cache = new Map<string, [number, number][]>();
  async getCandidates(request: RoutingRequest) {
    if (
      request.origin !== ARCHIVED_JOURNEY.origin ||
      request.destination !== ARCHIVED_JOURNEY.destination
    )
      throw new Error("Seul le trajet archivé Crans → Le Pin est disponible.");
    return structuredClone(archivedCandidates);
  }
  async getGeometry(
    id: string,
    signal?: AbortSignal,
  ): Promise<[number, number][]> {
    if (!archivedCandidates.some((r) => r.id === id))
      throw new Error("Itinéraire inconnu.");
    const cached = this.cache.get(id);
    if (cached) return cached;
    const response = await fetch(
      `${import.meta.env.BASE_URL}data/routes/${id}.geojson`,
      { signal },
    );
    if (!response.ok) throw new Error("Le tracé archivé est indisponible.");
    const feature = await response.json();
    const coords = feature?.geometry?.coordinates;
    if (
      feature?.properties?.id !== id ||
      feature?.geometry?.type !== "LineString" ||
      !Array.isArray(coords) ||
      coords.length < 2 ||
      !coords.every(
        (p: unknown) =>
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === "number" &&
          typeof p[1] === "number" &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90,
      )
    )
      throw new Error("Le tracé archivé est invalide.");
    this.cache.set(id, coords);
    return coords;
  }
}
export const archivedProvider = new ArchivedRoutingProvider();
