export interface RouteCandidate {
  id: string;
  durationMinutes: number;
  distanceKm: number;
  tollCents: number;
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
