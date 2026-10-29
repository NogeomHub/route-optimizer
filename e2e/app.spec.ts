import { test, expect } from "@playwright/test";
// Browser tests use the real local route/price snapshot. Only external raster
// tiles are isolated to keep tests offline and avoid repeated requests to OSM.
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ecf0e6"/></svg>',
    }),
  );
});
test("archives réelles, sélection carte et graphique, filtres précis et montants", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.getByText("Trajet réel · pré-calculé")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Départ", exact: true }),
  ).toHaveAttribute("readonly", "");
  const cards = page.locator(".route-list > .route-card");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R27",
  );
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "OpenStreetMap",
  );
  const r27 = page.locator('.route-card[data-route-id="R27"]');
  await expect(r27).toContainText("Recommandé");
  await expect(r27).toContainText("31,40");
  await expect(r27).toContainText("9,30");
  await expect(r27).toContainText("0,31");
  const previous = await page
    .locator(".real-map path.leaflet-interactive")
    .first()
    .getAttribute("d");
  await page.locator('.route-card[data-route-id="R14"]').click();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R14",
  );
  await expect(page.locator(".map-footer")).toContainText("R14");
  expect(
    await page
      .locator(".real-map path.leaflet-interactive")
      .first()
      .getAttribute("d"),
  ).not.toBe(previous);
  await page.getByRole("button", { name: /Afficher R27,/ }).click();
  await expect(r27).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R27",
  );
  await page.locator("#extra").fill("30");
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.route-card[data-route-id="R12"]')).toHaveCount(0);
  await page.getByRole("spinbutton").fill("7");
  await expect(cards).toHaveCount(1);
  await expect(r27).toBeVisible();
  await page.getByRole("spinbutton").fill("10");
  await expect(cards).toHaveCount(0);
  await expect(page.locator(".empty")).toContainText("Aucun compromis");
  await expect(page.locator(".real-map")).toHaveCount(0);
  await page.getByRole("spinbutton").fill("");
  await page.locator("#extra").fill("180");
  await expect(cards).toHaveCount(8);
  await expect(page.locator('.route-card[data-route-id="R1"]')).toContainText(
    "aucun péage détecté",
  );
  await page.locator('.route-card[data-route-id="R12"]').click();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R12",
  );
  await page.locator(".pricing-details summary").click();
  await expect(page.locator(".pricing-details")).toContainText("17,50");
  // Rapid switches must not let a stale async result overwrite the selection.
  await page.locator('.route-card[data-route-id="R14"]').click();
  await page.locator('.route-card[data-route-id="R18"]').click();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R18",
  );
  expect(errors).toEqual([]);
});
test("un tarif incomplet est consultable mais jamais comparé comme zéro", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#extra").fill("90");
  await page.locator(".partial-section summary").click();
  const r13 = page.locator('.partial-card[data-route-id="R13"]');
  await expect(r13).toContainText("Tarif incomplet");
  await r13.click();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R13",
  );
  await expect(r13).toContainText("5,00");
  await expect(r13).not.toContainText("économisés");
  await expect(page.locator(".chart-note")).toContainText(
    "R13 : tarif incomplet",
  );
  await page.locator(".pricing-details summary").click();
  await expect(page.locator(".pricing-details")).toContainText(
    "sous-total, jamais un total",
  );
  await page.locator("#extra").fill("30");
  await expect(r13).toHaveCount(0);
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R27",
  );
});
test("échec de géométrie explicite puis reprise, sans faux tracé", async ({
  page,
}) => {
  await page.route("**/data/routes/R27.geojson", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Tracé indisponible");
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "",
  );
  await page.unroute("**/data/routes/R27.geojson");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R27",
  );
});
test("fond OSM indisponible : avertissement, géométrie réelle conservée", async ({
  page,
}) => {
  await page.unroute("https://tile.openstreetmap.org/**");
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("./");
  await expect(page.locator(".tile-warning")).toBeVisible();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R27",
  );
});
for (const width of [320, 390, 1280])
  test(`responsive et base de déploiement à ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const response = page.waitForResponse(
      (r) => r.url() === `${baseURL}data/routes/R27.geojson`,
    );
    await page.goto("./");
    expect((await response).status()).toBe(200);
    await expect(page.locator(".real-map")).toHaveAttribute(
      "data-rendered-route",
      "R27",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.locator(".real-map .leaflet-overlay-pane path").first(),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/route-v2-${width}-${process.env.TEST_PREVIEW ? "pages" : "dev"}.png`,
      fullPage: true,
    });
  });

test("une réponse tardive ne remplace pas le trajet sélectionné", async ({
  page,
}) => {
  let finish!: () => void;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/data/routes/R14.geojson", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue().catch(() => {});
    finish();
  });
  await page.goto("./");
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R27",
  );
  await page.locator('.route-card[data-route-id="R14"]').click();
  await page.locator('.route-card[data-route-id="R18"]').click();
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R18",
  );
  await delayed;
  await expect(page.locator(".real-map")).toHaveAttribute(
    "data-rendered-route",
    "R18",
  );
});
