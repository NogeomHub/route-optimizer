import { test, expect } from "@playwright/test";

test("cards, recommendation and details preserve unknown/zero and the TomTom time basis", async ({
  page,
}) => {
  const jobId = "22222222-2222-4222-8222-222222222222";
  await page.addInitScript((id) => localStorage.setItem("v3-job", id), jobId);
  const base = {
    durationSeconds: 18000,
    distanceKm: 500,
    geometryUrl: `/api/search/${jobId}/routes/A/geometry`,
    pricing: {
      status: "complete_verified",
      totalCents: 2140,
      knownSubtotalCents: 2140,
      coverageComplete: true,
      currency: "EUR",
      vehicleClass: 1,
      components: [],
    },
    tollExposure: { tollKm: 286 },
  };
  const routes = [
    {
      ...base,
      id: "A",
      tollDistanceKm: 286,
      tollDurationSeconds: 10020,
      tollDurationTotalSeconds: 18000,
      tollDurationRatio: 10020 / 18000,
      tollDurationSource: "valhalla_trace",
      eta: { status: "ok", provider: "tomtom", durationMinutes: 250 },
    },
    {
      ...base,
      id: "B",
      durationSeconds: 17400,
      tollDurationSeconds: null,
      tollDurationRatio: null,
      tollDistanceKm: 286,
    },
    {
      ...base,
      id: "C",
      durationSeconds: 17400,
      tollExposure: { tollKm: 0 },
      tollDurationSeconds: 0,
      tollDurationRatio: 0,
      tollDistanceKm: 0,
      tollDurationTotalSeconds: 17400,
      tollDurationSource: "verified_no_toll",
    },
  ];
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.route("**/api/**", (r) =>
    r.fulfill({
      json: r.request().url().endsWith("/geometry")
        ? {
            type: "LineString",
            coordinates: [
              [2, 48],
              [2.01, 48.01],
            ],
          }
        : {
            jobId,
            status: "completed",
            progress: {
              stage: "terminé",
              profilesExecuted: 12,
              profileCeiling: 40,
              uniqueGeometries: 3,
              analyzed: 3,
            },
            result: { routes },
          },
    }),
  );
  await page.goto("/");
  const a = page.locator('[data-route-id="A"]');
  await expect(
    a
      .getByText("Route payante : 2 h 47 · 286 km (56 % du temps Valhalla)", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    a.getByText(/l’ETA totale TomTom est distincte/).first(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-route-id="B"]')
      .getByText("Route payante : 286 km · durée non déterminée", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-route-id="C"]')
      .getByText("Route payante : 0 min · 0 km", { exact: true })
      .first(),
  ).toBeVisible();
  await a.getByText("Détail du péage", { exact: true }).click();
  await expect(a.locator("details").getByText(/2 h 47 · 286 km/)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Trajet conseillé" })
      .getByText(/Route payante : 2 h 47/),
  ).toBeVisible();
});
