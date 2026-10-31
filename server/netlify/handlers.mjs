import { configuration } from "./config.mjs";
import { runtime } from "./runtime.mjs";
import {
  clearCookie,
  matchesToken,
  sessionCookie,
  sessionValid,
} from "./auth.mjs";
import { authorized, createApi, json } from "../src/api.mjs";

export function handlers({
  env = process.env,
  makeRuntime = runtime,
  now = Date.now,
} = {}) {
  const api = async (request) => {
    let context;
    try {
      const c = configuration(env),
        url = new URL(request.url),
        origin = request.headers.get("origin");
      if (url.origin !== c.origin || (origin && origin !== c.origin))
        return json({ error: { code: "ORIGIN_DENIED" } }, 403);
      // No cross-origin access; every mutation requires a same-origin browser request.
      if (request.method !== "GET" && origin !== c.origin)
        return json({ error: { code: "ORIGIN_DENIED" } }, 403);
      if (url.pathname === "/api/session") {
        if (request.method === "GET")
          return json({
            authenticated: sessionValid(request, c.sessionSecret, now()),
          });
        if (request.method === "DELETE")
          return json({ authenticated: false }, 200, {
            "Set-Cookie": clearCookie,
          });
        if (request.method === "POST") {
          const text = await request.text();
          if (Buffer.byteLength(text) > 512)
            return json({ error: { code: "TOO_LARGE" } }, 413);
          let body;
          try {
            body = JSON.parse(text);
          } catch {
            return json({ error: { code: "INVALID_INPUT" } }, 400);
          }
          if (!matchesToken(body?.token, c.accessToken))
            return json({ error: { code: "UNAUTHORIZED" } }, 401);
          return json({ authenticated: true }, 200, {
            "Set-Cookie": sessionCookie(c.sessionSecret, now()),
          });
        }
        return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
      }
      if (
        url.pathname !== "/api/about" &&
        !sessionValid(request, c.sessionSecret, now())
      )
        return json({ error: { code: "UNAUTHORIZED" } }, 401);
      context = makeRuntime(c);
      const headers = new Headers(request.headers);
      headers.set("Authorization", "Bearer " + c.apiToken);
      return await createApi({
        jobs: context.jobs,
        token: c.apiToken,
        origins: [c.origin],
        operatorContact: c.contact,
      })(new Request(request, { headers }));
    } catch (e) {
      console.error("[netlify API]", e.message);
      return json(
        {
          error: {
            code: "HOSTING_UNAVAILABLE",
            message: "Service temporairement indisponible.",
          },
        },
        503,
      );
    } finally {
      await context?.http.close();
    }
  };
  const background = async (request) => {
    const c = configuration(env);
    if (new URL(request.url).origin !== c.origin) return;
    if (!authorized(request, c.workerToken) || request.method !== "POST")
      return;
    const text = await request.text();
    if (Buffer.byteLength(text) > 1024) return;
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return;
    }
    if (!/^[a-f0-9-]{36}$/.test(body?.jobId ?? "")) return;
    const context = makeRuntime(c, { background: true });
    try {
      console.info(
        "[netlify background]",
        JSON.stringify({ event: "started", jobId: body.jobId }),
      );
      const outcome = await context.jobs.run(body.jobId);
      console.info(
        "[netlify background]",
        JSON.stringify({ event: "finished", jobId: body.jobId, ...outcome }),
      );
      if (outcome.retry) throw Error("Runner lease busy; retry after expiry");
    } finally {
      await context.http.close();
    }
  };
  return { api, background };
}
