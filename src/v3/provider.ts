import type { TollPricing } from "./pricing";
export interface Place {
  label: string;
  lat: number;
  lon: number;
  postcode?: string;
  city?: string;
  type?: string;
}
export interface DynamicRoute {
  id: string;
  durationSeconds: number;
  distanceKm: number;
  tollExposure: { tollKm: number } | null;
  geometryUrl: string;
  pricing?: TollPricing;
}
export interface Job {
  jobId: string;
  status: string;
  progress: {
    stage: string;
    profilesExecuted: number;
    profileCeiling: number;
    uniqueGeometries: number;
    analyzed: number;
  };
  error?: { code: string };
  result?: { routes: DynamicRoute[]; partial?: boolean; stopReason?: string };
}
export function friendly(code?: string) {
  if (code === "NEEDS_SELECTION")
    return "Plusieurs adresses possibles : choisissez une suggestion pour chaque lieu.";
  if (code === "EXPIRED" || code === "NOT_FOUND")
    return "Cette recherche n’est plus disponible. Lancez une nouvelle comparaison.";
  if (code === "TIME_BUDGET" || code === "TIMEOUT")
    return "Délai dépassé. Le résultat est incomplet ; relancez pour réutiliser les calculs disponibles.";
  if (code === "PROVIDER_BUSY")
    return "Une recherche est déjà en cours. Attendez son arrêt avant de relancer.";
  return "Le service est temporairement indisponible. Réessayez dans quelques instants.";
}
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  }).catch((error) => {
    if (signal?.aborted) throw error;
    throw new Error(friendly());
  });
  const value = await response.json().catch(() => {
    throw new Error(friendly());
  });
  if (!response.ok) throw new Error(friendly(value.error?.code));
  return value;
}
/** Business API port. No upstream endpoints, credentials, or costing options in React. */
export interface RoutingProvider {
  geocode(text: string, signal?: AbortSignal): Promise<Place[]>;
  search(
    origin: Place,
    destination: Place,
  ): Promise<{ jobId: string; status: string; reused: boolean }>;
  poll(id: string): Promise<Job>;
  cancel(id: string): Promise<unknown>;
  resume(id: string): Promise<unknown>;
}
export const provider: RoutingProvider = {
  async geocode(text, signal) {
    return (
      await request<{ candidates: Place[] }>(
        "/api/geocode?q=" + encodeURIComponent(text),
        undefined,
        signal,
      )
    ).candidates;
  },
  search: (origin, destination) =>
    request("/api/search", { origin, destination }),
  poll: (id) => request("/api/search/" + id),
  cancel: (id) => request("/api/search/" + id + "/cancel", {}),
  resume: (id) => request("/api/search/" + id + "/resume", {}),
};
export function pareto(routes: DynamicRoute[]) {
  return routes.filter(
    (a) =>
      a.tollExposure &&
      !routes.some(
        (b) =>
          b.tollExposure &&
          b.durationSeconds <= a.durationSeconds &&
          b.tollExposure.tollKm <= a.tollExposure!.tollKm &&
          (b.durationSeconds < a.durationSeconds ||
            b.tollExposure.tollKm < a.tollExposure!.tollKm),
      ),
  );
}
