import { test, expect } from "@playwright/test";

test("bounded partial search explains its ceiling without inventing monetary advice", async ({
  page,
}) => {
  const id = "88888888-8888-4888-8888-888888888888";
  await page.addInitScript((id) => localStorage.setItem("v3-job", id), id);
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    const json = path.endsWith("/geometry")
      ? {
          type: "LineString",
          coordinates: [
            [2, 48],
            [2.1, 48.1],
          ],
        }
      : path.endsWith("/gps")
        ? { status: "unavailable", reason: "NO_RETAINED_ROUTE" }
        : {
            jobId: id,
            status: "failed",
            error: { code: "CALL_BUDGET" },
            callBudget: { limit: 32, used: 32, preflightReserved: 1 },
            progress: {
              stage: "analyse",
              profilesExecuted: 12,
              profileCeiling: 12,
              uniqueGeometries: 1,
              analyzed: 0,
            },
            result: {
              partial: true,
              routes: [
                {
                  id: "G001",
                  durationSeconds: 600,
                  distanceKm: 10,
                  tollExposure: null,
                  geometryUrl: `/api/search/${id}/routes/G001/geometry`,
                },
              ],
            },
          };
    return r.fulfill({ json });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Budget d’appels atteint",
  );
  await expect(page.getByText(/Budget FOSSGIS : 32 \/ 32/)).toBeVisible();
  await expect(page.getByText(/12 \/ 12 profils analysés/)).toBeVisible();
  await expect(page.locator("[data-route-id='G001']")).toContainText(
    "Péage non déterminé",
  );
  await expect(
    page.getByText("SELON VOS CRITÈRES", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/les économies ne sont pas disponibles/),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Trajet conseillé", exact: true }),
  ).toHaveCount(0);
});
