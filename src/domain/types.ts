export interface RouteCandidate {
  id: string;
  durationMinutes: number;
  distanceKm: number;
  tollCents: number | null;
  pricing?: RoutePricing;
  energyCostCents?: number;
  description: string;
  roadSummary: string;
}
export interface Preferences {
  maxExtraMinutes: number;
  minSavingCents: number;
}
export interface RouteMetrics {
  extraMinutes: number;
  savingCents: number;
  eurosPerMinute: number | null;
}

export interface RoutePricing {
  status: "complete" | "partial";
  knownSubtotalCents: number;
  sections: { entry: string; exit: string; cents: number; pdfPage: number }[];
  uncertainties: {
    operator: string;
    entry?: string | null;
    exit?: string | null;
  }[];
}
export type CompleteRoute = RouteCandidate & { tollCents: number };
