import type { RouteCandidate } from "../domain/types";
export interface RoutingRequest {
  origin: string;
  destination: string;
}
/** A real implementation must return trustworthy durations, tolls and distances.
 * Preference filtering is intentionally kept in the optimization layer. */
export interface RoutingProvider {
  readonly mode: "demo" | "live";
  getCandidates(request: RoutingRequest): Promise<RouteCandidate[]>;
}
