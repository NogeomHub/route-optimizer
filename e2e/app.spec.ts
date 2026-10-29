import { test, expect } from "@playwright/test";
test("compare, sélectionne, filtre et signale les entrées invalides", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.getByText("Mode démonstration")).toBeVisible();
  await page.getByRole("button", { name: "Optimiser mon trajet" }).click();
  await expect(page.locator(".route-card")).toHaveCount(4);
  const recommendation = page
    .locator(".route-card")
    .filter({ hasText: "Recommandé" });
  await expect(recommendation).toHaveAttribute("aria-pressed", "true");
  await expect(recommendation).toContainText("4 h 47");
  await expect(recommendation).toContainText("13,20");
  await expect(recommendation).toContainText("0,69");
  await page.locator(".route-card").filter({ hasText: "Économique" }).click();
  await expect(page.locator(".map-footer")).toContainText(
    "Routes gratuites majoritaires",
  );
  await page.locator("#extra").fill("90");
  await page.getByRole("button", { name: "Optimiser mon trajet" }).click();
  await expect(page.locator(".route-card")).toHaveCount(5);
  await expect(
    page.locator(".route-card").filter({ hasText: "Sans péage" }),
  ).toContainText("+78 min");
  await page.locator("#extra").fill("0");
  await page.getByRole("spinbutton").fill("1");
  await page.getByRole("button", { name: "Optimiser mon trajet" }).click();
  await expect(page.getByRole("status")).toContainText("Aucun compromis");
  await expect(page.locator(".route-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Destination", exact: true })
    .fill("Paris");
  await page.getByRole("button", { name: "Optimiser mon trajet" }).click();
  await expect(page.getByRole("alert")).toContainText("différente");
  expect(errors).toEqual([]);
});
for (const width of [390, 1280])
  test(`affichage sans débordement à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page.getByRole("button", { name: "Optimiser mon trajet" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".map-surface")).toBeVisible();
    await page.screenshot({
      path: `/tmp/route-optimizer-${width}.png`,
      fullPage: true,
    });
  });
