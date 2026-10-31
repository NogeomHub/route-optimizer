import { it, expect } from "vitest";
import { gpsText, googleMapsUrl, type Guide } from "./GpsSteps";
const guide: Guide = {
  status: "suggested",
  origin: { lat: 45.9, lon: 5.1 },
  destination: { lat: 48.9, lon: 2.6 },
  steps: [
    {
      label: "289 Grande Rue 01240 Lent",
      lat: 46.11874,
      lon: 5.194797,
      city: "Lent",
      postcode: "01240",
      roads: ["D 22"],
      separationKm: 6.9,
      routeKm: 19,
      zone: 1,
      offsetMeters: 9,
    },
  ],
};
it("copy text includes labels, ordered steps, coordinates and recalculation caveat", () => {
  const text = gpsText(guide, ["Crans", "Le Pin"])!;
  expect(text).toContain("Départ : Crans");
  expect(text).toContain(
    "Étape 1 : 289 Grande Rue 01240 Lent (46.118740, 5.194797)",
  );
  expect(text).toContain("Destination : Le Pin");
  expect(text).toContain("recalculés");
});
it("Google Maps official URL uses no key, preserves waypoint order and at most three mobile steps", () => {
  const url = new URL(googleMapsUrl(guide)!);
  expect(url.origin).toBe("https://www.google.com");
  expect(url.searchParams.get("api")).toBe("1");
  expect(url.searchParams.get("waypoints")).toBe("46.11874,5.194797");
  expect(url.searchParams.has("key")).toBe(false);
  expect(
    googleMapsUrl({ ...guide, steps: Array(4).fill(guide.steps[0]) }),
  ).toBe(null);
});
it("unreliable guidance is never copyable or shareable as a GPS itinerary", () => {
  for (const status of ["unavailable", "reference"] as const) {
    expect(gpsText({ ...guide, status }, ["A", "B"])).toBe(null);
    expect(googleMapsUrl({ ...guide, status })).toBe(null);
  }
});
