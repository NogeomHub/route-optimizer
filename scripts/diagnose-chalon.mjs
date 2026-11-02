import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocal } from "../server/src/local-server.mjs";

const directory = await mkdtemp(join(tmpdir(), "route-optimizer-chalon-"));
const token = randomBytes(32).toString("hex");
const local = await startLocal({
  directory,
  port: 0,
  token,
  policyReviewed: true,
  earlyNoTolls: false,
  quiet: true,
});
const api = async (path, body) => {
  const response = await fetch(local.baseUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
};

try {
  const candidates = await api(
    "/api/geocode?q=" +
      encodeURIComponent("1 Rue Sarah Bernhardt 71100 Chalon-sur-Saône"),
  );
  console.log("GEOCODE", JSON.stringify(candidates, null, 2));
  const destination =
    candidates.candidates.find(
      (c) => c.postcode === "71100" && /chalon/i.test(c.city ?? c.label ?? ""),
    ) ?? candidates.candidates[0];
  if (!destination) throw new Error("No Chalon destination candidate");
  const origin = { lon: 5.1917, lat: 45.9667 };
  console.log("SELECTED", JSON.stringify({ origin, destination }, null, 2));

  const launched = await api("/api/search", {
    origin,
    destination,
    parameters: { maxExtraMinutes: 45, vehicleClass: 1, profile: "standard" },
  });
  console.log("LAUNCHED", JSON.stringify(launched));
  let view;
  do {
    view = await api("/api/search/" + launched.jobId);
    console.log("PROGRESS", JSON.stringify(view.progress));
    if (!["queued", "running", "cancel_requested"].includes(view.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (true);

  console.log("FINAL_STATUS", view.status, JSON.stringify(view.error ?? null));
  console.log("PRICING_META", JSON.stringify(view.result?.pricing ?? null, null, 2));
  for (const route of view.result?.routes ?? []) {
    console.log(
      "ROUTE_PRICING",
      route.id,
      JSON.stringify(
        {
          durationSeconds: route.durationSeconds,
          distanceKm: route.distanceKm,
          tollExposure: route.tollExposure,
          pricingStatus: route.pricingStatus,
          pricing: route.pricing,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await local.close();
  await rm(directory, { recursive: true, force: true });
}
