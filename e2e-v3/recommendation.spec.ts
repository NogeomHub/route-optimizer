import { test, expect } from "@playwright/test";
const id = "33333333-3333-4333-8333-333333333333";
const p = (cents: number, status = "complete_verified") => ({
  status,
  totalCents: status === "complete_verified" ? cents : null,
  knownSubtotalCents: cents,
  currency: "EUR",
  vehicleClass: 1,
  on: "2026-10-31",
  coverageComplete: status === "complete_verified",
  components: [],
});
const rows = [
  {
    id: "F",
    durationSeconds: 100,
    distanceKm: 100,
    tollExposure: { tollKm: 90 },
    pricing: p(4000),
  },
  {
    id: "B",
    durationSeconds: 200,
    distanceKm: 110,
    tollExposure: { tollKm: 60 },
    pricing: p(3000),
  },
  {
    id: "U",
    durationSeconds: 150,
    distanceKm: 105,
    tollExposure: { tollKm: 50 },
    pricing: p(100, "partial"),
  },
].map((r) => ({
  ...r,
  geometryUrl: `/api/search/${id}/routes/${r.id}/geometry`,
}));
async function setup(page: any, guidance = true) {
  await page.addInitScript((id: string) => {
    localStorage.setItem("v3-job", id);
    localStorage.setItem("v3-labels", JSON.stringify(["Crans", "Le Pin"]));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copiedGps = text;
        },
      },
    });
  }, id);
  await page.route("**/tile.openstreetmap.org/**", (r: any) => r.abort());
  await page.route("**/api/**", async (r: any) => {
    const path = new URL(r.request().url()).pathname;
    const value = path.endsWith("/gps")
      ? guidance
        ? {
            status: "suggested",
            routeId: "B",
            origin: { lat: 45.9, lon: 5.1 },
            destination: { lat: 48.9, lon: 2.6 },
            steps: [
              {
                label: "289 Grande Rue 01240 Lent",
                city: "Lent",
                postcode: "01240",
                lat: 46.11874,
                lon: 5.194797,
                roads: ["D 22"],
                separationKm: 6.9,
                routeKm: 19,
                zone: 1,
                offsetMeters: 9,
              },
            ],
          }
        : { status: "unavailable", steps: [] }
      : path.endsWith("/geometry")
        ? {
            type: "LineString",
            coordinates: [
              [2, 48],
              [2.1, 48.1],
            ],
          }
        : {
            jobId: id,
            status: "completed",
            progress: {
              stage: "terminé",
              profilesExecuted: 40,
              profileCeiling: 40,
              uniqueGeometries: 3,
              analyzed: 3,
            },
            result: { routes: rows },
          };
    await r.fulfill({ json: value });
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Trajet conseillé", exact: true }),
  ).toBeVisible();
}
test("recommendation precedes chart/cards, selects map/point, copy and Google Maps work; filter fallback explicit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const advised = page.getByRole("region", {
    name: "Trajet conseillé",
    exact: true,
  });
  await expect(advised).toHaveAttribute("data-recommended-route", "B");
  await expect(advised).toContainText("30,00");
  await expect(advised).toContainText("économie 10,00");
  await expect(page.locator('[data-rendered-route="B"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sélectionner B", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Étapes GPS" })).toContainText(
    "289 Grande Rue",
  );
  await page.getByRole("button", { name: "Copier les étapes GPS" }).click();
  await expect(
    page.getByText("Étapes copiées.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).copiedGps)).toContain(
    "Étape 1 : 289 Grande Rue",
  );
  expect(
    await page
      .getByRole("link", { name: "Ouvrir dans Google Maps" })
      .getAttribute("href"),
  ).toContain("waypoints=46.11874%2C5.194797");
  expect(
    await page.evaluate(() => {
      const a = document.querySelector(".v3-recommended")!,
        chart = document.querySelector(".v3-chart")!,
        map = document.querySelector(".v3-map")!,
        cards = document.querySelector(".v3-routes")!;
      return (
        !!(
          a.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING
        ) &&
        !!(
          map.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      );
    }),
  ).toBe(true);
  await page.getByLabel("Économie minimale", { exact: true }).fill("20");
  await expect(advised).toContainText(
    "Aucun itinéraire au tarif complet ne satisfait vos critères",
  );
  await expect(
    page.getByRole("region", { name: "Option hors critères" }),
  ).toContainText("B");
  await expect(page.locator('[data-rendered-route="B"]')).toBeVisible();
  await expect(page.locator('[data-route-id="U"] .v3-price')).toHaveText(
    "Tarif incomplet",
  );
  await page.getByLabel("Économie minimale", { exact: true }).fill("0");
  await page.getByLabel("Détour maximal", { exact: true }).fill("0");
  await expect(advised).toHaveAttribute("data-recommended-route", "F");
  await expect(page.locator('[data-rendered-route="F"]')).toBeVisible();
});
test("unreliable guidance displays no copy or direct GPS link", async ({
  page,
}) => {
  await setup(page, false);
  await expect(page.getByRole("region", { name: "Étapes GPS" })).toContainText(
    "Étapes fiables non disponibles",
  );
  await expect(
    page.getByRole("button", { name: "Copier les étapes GPS" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Ouvrir dans Google Maps" }),
  ).toHaveCount(0);
});
