import type { RouteCandidate } from "../domain/types";
/** Fictional scenario, unrelated to the entered addresses. Monetary values in cents. */
export const demoCandidates: RouteCandidate[] = [
  {
    id: "fast",
    durationMinutes: 268,
    distanceKm: 480,
    tollCents: 3140,
    description:
      "Priorité au temps de trajet, avec de longues portions à péage.",
    roadSummary: "Autoroutes à péage",
  },
  {
    id: "light",
    durationMinutes: 279,
    distanceKm: 470,
    tollCents: 2400,
    description:
      "Un premier détour pour éviter les portions les moins rentables.",
    roadSummary: "Autoroute majoritaire",
  },
  {
    id: "balanced",
    durationMinutes: 287,
    distanceKm: 455,
    tollCents: 1820,
    description:
      "L’autoroute là où elle compte, les routes gratuites pour le reste.",
    roadSummary: "Autoroute + routes gratuites",
  },
  {
    id: "economy",
    durationMinutes: 305,
    distanceKm: 448,
    tollCents: 860,
    description:
      "Quelques portions payantes utiles, une majorité de routes gratuites.",
    roadSummary: "Routes gratuites majoritaires",
  },
  {
    id: "free",
    durationMinutes: 346,
    distanceKm: 432,
    tollCents: 0,
    description:
      "Un scénario entièrement sans péage, avec plus de temps sur la route.",
    roadSummary: "Routes gratuites uniquement",
  },
  {
    id: "dominated",
    durationMinutes: 298,
    distanceKm: 465,
    tollCents: 2100,
    description: "Candidat dominé, écarté par la frontière de Pareto.",
    roadSummary: "Mixte",
  },
];
