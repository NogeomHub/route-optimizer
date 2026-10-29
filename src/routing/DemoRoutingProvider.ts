import type { RoutingProvider, RoutingRequest } from "./RoutingProvider";
import { demoCandidates } from "./demoData";
export class DemoRoutingProvider implements RoutingProvider {
  readonly mode = "demo" as const;
  async getCandidates(request: RoutingRequest) {
    if (!request.origin.trim() || !request.destination.trim())
      throw new Error("Renseignez un départ et une destination.");
    if (
      request.origin.trim().toLocaleLowerCase("fr") ===
      request.destination.trim().toLocaleLowerCase("fr")
    )
      throw new Error("Choisissez une destination différente du départ.");
    return demoCandidates.map((route) => ({ ...route }));
  }
}
