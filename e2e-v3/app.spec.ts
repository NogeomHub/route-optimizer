import { test, expect } from "@playwright/test";
// Explicit synthetic API responses: browser interactions, never claimed as live routing.
const id = "12345678-1234-1234-1234-123456789012";
const progress = {
  stage: "routage",
  profilesExecuted: 12,
  profileCeiling: 40,
  uniqueGeometries: 3,
  analyzed: 3,
};
const routes = [
  {
    id: "G001",
    durationSeconds: 600,
    distanceKm: 12,
    tollExposure: { tollKm: 8 },
  },
  {
    id: "G002",
    durationSeconds: 1200,
    distanceKm: 14,
    tollExposure: { tollKm: 0 },
  },
  {
    id: "G003",
    durationSeconds: 1800,
    distanceKm: 18,
    tollExposure: { tollKm: 9 },
  },
].map((r) => ({
  ...r,
  geometryUrl: `/api/search/${id}/routes/${r.id}/geometry`,
}));
test("explicit address selection, reverse, cache, filtering, chart and real geometry rendering", async ({
  page,
}) => {
  const searches: unknown[] = [];
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let value: unknown;
    if (url.pathname === "/api/geocode")
      value = {
        candidates: [1, 2].map((n) => ({
          label: `${url.searchParams.get("q")} commune ${n}`,
          city: `Commune ${n}`,
          postcode: "77181",
          lat: 48 + n / 100,
          lon: 2,
        })),
      };
    else if (url.pathname.endsWith("/geometry"))
      value = {
        type: "LineString",
        coordinates: [
          [2, 48],
          [2.01, 48.01],
          [2.02, 48.02],
        ],
      };
    else if (route.request().method() === "POST") {
      searches.push(route.request().postDataJSON());
      value = { jobId: id, status: "completed", reused: true };
    } else
      value = { jobId: id, status: "completed", progress, result: { routes } };
    await route.fulfill({ json: value });
  });
  await page.goto("/");
  await expect(
    page.getByText("V3 · personnel · local", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comparer les itinéraires" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Choisissez une suggestion",
  );
  await page.getByLabel("Départ", { exact: true }).fill("Crans");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("button", { name: /Crans commune 2/ }).click();
  await page.getByLabel("Destination", { exact: true }).fill("Le Pin");
  await page.getByRole("button", { name: /Le Pin commune 1/ }).click();
  await page
    .getByRole("button", { name: "Inverser départ et destination" })
    .click();
  await expect(page.getByLabel("Départ", { exact: true })).toHaveValue(
    "Le Pin commune 1",
  );
  await page.getByRole("button", { name: "Comparer les itinéraires" }).click();
  await expect(
    page.getByText("Résultat récupéré depuis le cache"),
  ).toBeVisible();
  expect(searches[0]).toMatchObject({
    origin: { label: "Le Pin commune 1" },
    destination: { label: "Crans commune 2" },
  });
  await expect(page.locator('[data-rendered-route="G001"]')).toBeVisible();
  await page.getByRole("button", { name: "Sélectionner G002" }).click();
  await expect(page.locator('[data-rendered-route="G002"]')).toBeVisible();
  await expect(page.locator(".v3-route.selected")).toContainText("G002");
  await page.getByLabel("Détour maximal", { exact: true }).fill("0");
  await expect(page.locator(".v3-route")).toHaveCount(1);
  await expect(page.locator('[data-rendered-route="G001"]')).toBeVisible();
  await page
    .getByLabel("Destination", { exact: true })
    .fill("Adresse modifiée");
  await page.getByRole("button", { name: "Comparer les itinéraires" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Choisissez une suggestion",
  );
  expect(searches.length).toBe(1);
  await page.screenshot({
    path: "test-results/v3-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/v3-mobile.png", fullPage: true });
});
test("interrupted job recovery, progression, cancellation and user-friendly failure", async ({
  page,
}) => {
  let status = "running";
  const actions: string[] = [];
  await page.addInitScript(
    (jobId) => localStorage.setItem("v3-job", jobId),
    id,
  );
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "POST") {
      actions.push(route.request().url());
      if (route.request().url().endsWith("/cancel")) status = "cancelled";
    }
    await route.fulfill({ json: { jobId: id, status, progress } });
  });
  await page.goto("/");
  await expect(page.getByText("Recherche des itinéraires…")).toBeVisible();
  await expect(page.getByText(/12 \/ 40 profils/)).toBeVisible();
  await page
    .getByRole("button", { name: "Reprendre un calcul interrompu" })
    .click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(
    page.getByText("Recherche annulée", { exact: true }),
  ).toBeVisible();
  expect(actions.some((a) => a.endsWith("/resume"))).toBe(true);
  expect(actions.some((a) => a.endsWith("/cancel"))).toBe(true);
});

test("unknown address and failed job remain understandable without technical errors", async ({
  page,
}) => {
  await page.addInitScript(
    (jobId) => localStorage.setItem("v3-job", jobId),
    id,
  );
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      json: route.request().url().includes("/geocode")
        ? { candidates: [] }
        : {
            jobId: id,
            status: "failed",
            progress,
            error: {
              code: "TIME_BUDGET",
              message: "Node HTTP stack must never be rendered",
            },
          },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Délai dépassé");
  await expect(page.getByText("Node HTTP stack")).toHaveCount(0);
  await page.getByLabel("Départ", { exact: true }).fill("Adresse inconnue");
  await expect(page.getByText(/Adresse introuvable/)).toBeVisible();
});
