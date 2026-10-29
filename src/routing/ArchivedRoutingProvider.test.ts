import { it, expect, vi, afterEach } from "vitest";
import { ArchivedRoutingProvider } from "./ArchivedRoutingProvider";
afterEach(() => vi.unstubAllGlobals());
it("charge la géométrie par URL relative à la base et la met en cache", async () => {
  const coords = [
    [5.19119, 45.964963],
    [2.62868, 48.913865],
  ];
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        properties: { id: "R18" },
        geometry: { type: "LineString", coordinates: coords },
      }),
    });
  vi.stubGlobal("fetch", fetch);
  const p = new ArchivedRoutingProvider();
  expect(await p.getGeometry("R18")).toEqual(coords);
  await p.getGeometry("R18");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(
    `${import.meta.env.BASE_URL}data/routes/R18.geojson`,
  );
});
it("refuse une erreur HTTP, un ID incohérent et une géométrie invalide", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: { id: "R1" },
        geometry: {
          type: "LineString",
          coordinates: [
            [5, 46],
            [2, 48],
          ],
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: { id: "R18" },
        geometry: {
          type: "LineString",
          coordinates: [
            [1000, 46],
            [2, 48],
          ],
        },
      }),
    });
  vi.stubGlobal("fetch", fetch);
  const p = new ArchivedRoutingProvider();
  await expect(p.getGeometry("R18")).rejects.toThrow("indisponible");
  await expect(p.getGeometry("R18")).rejects.toThrow("invalide");
  await expect(p.getGeometry("R18")).rejects.toThrow("invalide");
  await expect(p.getGeometry("../x")).rejects.toThrow("inconnu");
  expect(fetch).toHaveBeenCalledTimes(3);
});
