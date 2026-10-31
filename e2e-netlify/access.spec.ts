import { test, expect } from "@playwright/test";
test("hosted mode requires session; login, same-origin business API, expiry and logout", async ({
  page,
}) => {
  let authenticated = false;
  const log: {
    path: string;
    body: string | null;
    headers: Record<string, string>;
  }[] = [];
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const q = r.request(),
      path = new URL(q.url()).pathname;
    log.push({ path, body: q.postData(), headers: q.headers() });
    if (path === "/api/session") {
      if (q.method() === "POST") {
        if (q.postDataJSON().token !== "synthetic-personal-key")
          return r.fulfill({
            status: 401,
            json: { error: { code: "UNAUTHORIZED" } },
          });
        authenticated = true;
      }
      if (q.method() === "DELETE") authenticated = false;
      return r.fulfill({ json: { authenticated } });
    }
    if (!authenticated)
      return r.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHORIZED" } },
      });
    return r.fulfill({
      json: {
        candidates: [
          {
            label: "Crans",
            lat: 45.963641,
            lon: 5.193902,
            postcode: "01320",
            city: "Crans",
            type: "municipality",
          },
        ],
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Route Optimizer · accès personnel" }),
  ).toBeVisible();
  await expect(page.getByLabel("Départ", { exact: true })).toHaveCount(0);
  await page.getByLabel("Clé d’accès", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Clé d’accès incorrecte.");
  await page
    .getByLabel("Clé d’accès", { exact: true })
    .fill("synthetic-personal-key");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByLabel("Départ", { exact: true })).toBeVisible();
  await expect(page.locator(".v3-header")).toContainText([
    "Accès personnel",
    "V3 · personnel",
  ]);
  await expect(
    page.getByText("V3 · personnel · local", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Départ", { exact: true }).fill("Crans");
  await expect(page.locator("#origin-list button")).toHaveCount(1);
  expect(
    log
      .filter((r) => r.path !== "/api/session")
      .every((r) => !r.headers.authorization),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: localStorage, session: sessionStorage }),
    ),
  ).not.toContain("synthetic-personal-key");
  authenticated = false;
  await page.getByLabel("Destination", { exact: true }).fill("Le Pin");
  await expect(page.getByLabel("Clé d’accès", { exact: true })).toBeVisible();
  await page
    .getByLabel("Clé d’accès", { exact: true })
    .fill("synthetic-personal-key");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByLabel("Clé d’accès", { exact: true })).toBeVisible();
});
test("missing hosted configuration gives an understandable error", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      status: 503,
      json: { error: { code: "HOSTING_UNAVAILABLE" } },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText(
    "Service temporairement indisponible.",
  );
});
