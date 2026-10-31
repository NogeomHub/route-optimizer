import { test, expect, type Page } from "@playwright/test";
const id = "22222222-2222-4222-8222-222222222222";
// Explicit synthetic UI contract data; real corridor pricing is tested separately.
const source = {
  url: "https://example.test/official.pdf",
  sha256: "a".repeat(64),
  locator: "Synthetic source cell",
};
const component = (cents: number, entry = "Entrée", exit = "Sortie") => ({
  operator: "APRR",
  system: "closed",
  entry,
  exit,
  cents,
  status: "verified",
  effectiveFrom: "2026-02-01",
  sourceVerifiedAt: "2026-10-30",
  vehicleClass: 1,
  source,
});
const pricing = (
  status: string,
  totalCents: number | null,
  knownSubtotalCents = 0,
  components: any[] = [],
) => ({
  status,
  totalCents,
  knownSubtotalCents,
  components,
  currency: "EUR",
  vehicleClass: 1,
  on: "2026-10-30",
  coverageComplete: status === "complete_verified",
});
const route = (name: string, seconds: number, toll: number, p: any) => ({
  id: name,
  durationSeconds: seconds,
  distanceKm: 100,
  tollExposure: { tollKm: toll },
  pricing: p,
  geometryUrl: `/api/search/${id}/routes/${name}/geometry`,
});
const samples = () => [
  route(
    "A",
    100,
    100,
    pricing("complete_verified", 4070, 4070, [component(4070)]),
  ),
  route(
    "B",
    200,
    80,
    pricing("complete_verified", 3430, 3430, [component(3430)]),
  ),
  route(
    "C",
    300,
    90,
    pricing("complete_verified", 3920, 3920, [
      component(1640, "Pont d’Ain", "Dijon"),
      component(2280, "Pouilly", "Les Éprunes"),
    ]),
  ),
  route(
    "D",
    150,
    0,
    pricing("partial", 99999, 1500, [
      component(1500),
      {
        operator: "ALIAE",
        system: "free_flow",
        entry: "A79",
        exit: "A79",
        cents: null,
        status: "unavailable",
      },
    ]),
  ),
  route("E", 250, 20, pricing("unavailable", 12345)),
  route("F", 350, 30, pricing("stale", 12345)),
];
async function setup(page: Page, rows: any[]) {
  await page.addInitScript(
    (jobId) => localStorage.setItem("v3-job", jobId),
    id,
  );
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    await r.fulfill({
      json: path.endsWith("/geometry")
        ? {
            type: "LineString",
            coordinates: [
              [2, 48],
              [2.01, 48.01],
              [2.02, 48.02],
            ],
          }
        : {
            jobId: id,
            status: "completed",
            progress: {
              stage: "terminé",
              profilesExecuted: 12,
              profileCeiling: 40,
              uniqueGeometries: rows.length,
              analyzed: rows.length,
            },
            result: { routes: rows },
          },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Comparaison terminée" }),
  ).toBeVisible();
}
test("all four statuses, source detail, genuine monetary view and savings filter without losing unknowns", async ({
  page,
}) => {
  await setup(page, samples());
  const card = (key: string) => page.locator(`[data-route-id="${key}"]`);
  await expect(card("A").locator(".v3-price")).toHaveText(/40,70/);
  await expect(card("B")).toContainText(/Économie : 6,40/);
  await expect(card("D").locator(".v3-price")).toHaveText("Tarif incomplet");
  await expect(card("D")).toContainText(/15,00.*identifiés/);
  await expect(card("E").locator(".v3-price")).toHaveText(
    "Tarif non disponible",
  );
  await expect(card("F").locator(".v3-price")).toHaveText("Tarif à vérifier");
  await expect(page.getByText(/999,99|123,45/)).toHaveCount(0);
  await card("C").locator("summary").click();
  await expect(card("C")).toContainText(/16,40/);
  await expect(card("C")).toContainText(/22,80/);
  await expect(card("C")).toContainText("01/02/2026");
  await expect(card("C")).toContainText("Source vérifiée le 30/10/2026");
  await expect(card("C")).not.toContainText("vérifié jusqu’au");
  await expect(
    card("C").getByRole("link", { name: "Source officielle APRR" }),
  ).toHaveCount(2);
  await card("D").locator("summary").click();
  await expect(card("D")).toContainText("Section A79 non tarifée");
  await expect(
    page.getByRole("group", { name: "Graphique temps et coût" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sélectionner D", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Économie minimale", { exact: true }).fill("6");
  await expect(
    page.locator('.v3-routes[aria-label="Trajets à tarif complet"] article'),
  ).toHaveCount(1);
  await expect(card("B")).toBeVisible();
  await expect(page.locator(".v3-unpriced article")).toHaveCount(3);
  await expect(card("B")).toContainText(
    "Économie maximale respectant le détour",
  );
  await page
    .getByRole("button", { name: "Sélectionner B", exact: true })
    .click();
  await expect(page.locator('[data-rendered-route="B"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Temps / exposition au péage", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Graphique temps et exposition" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sélectionner D", exact: true })
    .click();
  await expect(card("D")).toHaveClass(/selected/);
  await expect(page.locator('[data-rendered-route="D"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Temps / coût du péage", exact: true })
    .click();
  await expect(
    page.getByText(/visible sur la carte, sans point monétaire/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("incomplete fastest route disables savings and never uses a slower priced reference silently", async ({
  page,
}) => {
  const rows = samples();
  rows[0].pricing = pricing("partial", 4070, 1500, [component(1500)]);
  await setup(page, rows);
  await expect(
    page.getByLabel("Économie minimale", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/La route la plus rapide n’a pas de tarif complet/),
  ).toBeVisible();
  await expect(
    page.locator(".v3-route-select").filter({ hasText: "Économie :" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".v3-route-select").filter({ hasText: "Économie maximale" }),
  ).toHaveCount(0);
  await expect(page.locator('[data-route-id="B"]')).toBeVisible();
});
test("observed free price keeps its evidence warning; stale-only results retain exposure view", async ({
  page,
}) => {
  await setup(page, [
    route("Z", 100, 0, {
      ...pricing("complete_verified", 0),
      evidenceBasis: "road_data_zero",
    }),
    route("S", 200, 10, pricing("stale", 12345)),
  ]);
  const z = page.locator('[data-route-id="Z"]');
  await expect(z.locator(".v3-price")).toHaveText(/0,00/);
  await expect(z).toContainText("Sans péage détecté");
  await z.locator("summary").click();
  await expect(z).toContainText("sans confirmation de facturation");
  await expect(
    page.getByRole("button", { name: "Temps / coût du péage", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("group", { name: "Graphique temps et exposition" }),
  ).toBeVisible();
});
