import { timingSafeEqual } from "node:crypto";
import { PocError } from "./util.mjs";
export function authorized(request, token) {
  if (!token || token.length < 32) return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from("Bearer " + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

export function createApi({
  jobs,
  token,
  origins = [],
  operatorContact = "not-configured",
}) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const cors = {
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      ...(origins.includes(origin)
        ? { "Access-Control-Allow-Origin": origin }
        : {}),
    };
    if (origin && !origins.includes(origin))
      return json(
        { error: { code: "ORIGIN_DENIED", message: "Origine non autorisée." } },
        403,
        cors,
      );
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    try {
      const url = new URL(request.url),
        path = url.pathname.replace(/\/$/, "");
      if (path === "/api/about" && request.method === "GET")
        return json(
          {
            prototype: false,
            personalOnly: true,
            operatorContact,
            attribution:
              "Data © OpenStreetMap contributors (ODbL). Géocodage IGN Géoplateforme.",
            copyright: "https://www.openstreetmap.org/copyright",
            reportMapError: "https://www.openstreetmap.org/fixthemap",
          },
          200,
          cors,
        );
      if (!authorized(request, token))
        return json(
          {
            error: { code: "UNAUTHORIZED", message: "Jeton personnel requis." },
          },
          401,
          cors,
        );
      if (path === "/api/geocode" && request.method === "GET")
        return json(
          {
            candidates: await jobs.geocoder.candidates(
              url.searchParams.get("q"),
            ),
          },
          200,
          cors,
        );
      if (path === "/api/search" && request.method === "POST") {
        const text = await request.text();
        if (Buffer.byteLength(text) > 8192)
          throw new PocError("TOO_LARGE", "Requête trop grande.", 413);
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          throw new PocError("INVALID_INPUT", "JSON invalide.", 400);
        }
        const result = await jobs.create(body);
        return json(result, result.status === "completed" ? 200 : 202, cors);
      }
      const match = path.match(
        /^\/api\/search\/([\da-f-]+)(?:\/(cancel|resume|routes\/([^/]+)\/geometry))?$/,
      );
      if (match) {
        const [, id, action, rid] = match;
        if (action === "resume" && request.method === "POST") {
          const job = await jobs.read(id);
          if (!["queued", "running"].includes(job.status))
            throw new PocError(
              "NOT_RESUMABLE",
              "Relancer une recherche pour cet état terminal.",
              409,
            );
          await jobs.dispatch(id);
          return json({ jobId: id, status: job.status }, 202, cors);
        }
        if (action === "cancel" && request.method === "POST") {
          const row = await jobs.cancel(id);
          return json({ jobId: id, status: row.status }, 200, cors);
        }
        if (!action && request.method === "GET") {
          const view = await jobs.view(id, {
            includeResult: url.searchParams.get("result") !== "0",
          });
          if (view.result)
            view.result = {
              ...view.result,
              routes: view.result.routes.map(
                ({ geometry, shape, geometryKey, ...r }) => ({
                  ...r,
                  geometryUrl: `/api/search/${id}/routes/${r.id}/geometry`,
                }),
              ),
            };
          return json(view, 200, cors);
        }
        if (rid && request.method === "GET") {
          const text = JSON.stringify(await jobs.geometry(id, rid));
          if (Buffer.byteLength(text) > 5 * 1024 * 1024)
            throw new PocError("TOO_LARGE", "Géométrie trop volumineuse.", 413);
          return new Response(text, {
            headers: {
              ...cors,
              "Content-Type": "application/geo+json",
              "Cache-Control": "no-store",
            },
          });
        }
      }
      throw new PocError("NOT_FOUND", "Endpoint introuvable.", 404);
    } catch (e) {
      console.error("[API]", e);
      return json(
        {
          error: {
            code: e.code ?? "INTERNAL_ERROR",
            message: e instanceof PocError ? e.message : "Erreur interne.",
            ...(e instanceof PocError && e.details
              ? { details: e.details }
              : {}),
          },
        },
        e instanceof PocError ? e.status : 500,
        cors,
      );
    }
  };
}
