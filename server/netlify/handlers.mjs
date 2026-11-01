import { configuration } from "./config.mjs";
import { runtime } from "./runtime.mjs";
import {
  clearCookie,
  matchesToken,
  sessionCookie,
  sessionValid,
} from "./auth.mjs";
import { authorized, createApi, json } from "../src/api.mjs";

function requestOrigin(config, env, requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin === config.origin) return url.origin;

  // Netlify Functions expose SITE_NAME at runtime, but build-only metadata such
  // as CONTEXT and DEPLOY_PRIME_URL is not available there. Recognize only the
  // standard Deploy Preview hostname belonging to this exact Netlify site.
  const siteName = env.SITE_NAME;
  if (
    url.protocol !== "https:" ||
    typeof siteName !== "string" ||
    !/^[a-z0-9-]+$/i.test(siteName)
  )
    return null;
  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const previewHost = new RegExp(
    `^deploy-preview-[1-9]\\d*--${escaped}\\.netlify\\.app$`,
    "i",
  );
  return previewHost.test(url.hostname) ? url.origin : null;
}

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
        origin = request.headers.get("origin"),
        acceptedOrigin = requestOrigin(c, env, request.url);
      if (!acceptedOrigin || (origin && origin !== acceptedOrigin))
        return json({ error: { code: "ORIGIN_DENIED" } }, 403);
      // No cross-origin access; every mutation requires a same-origin browser request.
      if (request.method !== "GET" && origin !== acceptedOrigin)
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
          if (
            body?.remember !== undefined &&
            typeof body.remember !== "boolean"
          )
            return json({ error: { code: "INVALID_INPUT" } }, 400);
          if (!matchesToken(body?.token, c.accessToken))
            return json({ error: { code: "UNAUTHORIZED" } }, 401);
          return json({ authenticated: true }, 200, {
            "Set-Cookie": sessionCookie(
              c.sessionSecret,
              now(),
              body.remember === true,
            ),
          });
        }
        return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
      }
      if (
        url.pathname !== "/api/about" &&
        !sessionValid(request, c.sessionSecret, now())
      )
        return json({ error: { code: "UNAUTHORIZED" } }, 401);
      const activeConfig =
        acceptedOrigin === c.origin ? c : { ...c, origin: acceptedOrigin };
      context = makeRuntime(activeConfig);
      const headers = new Headers(request.headers);
      headers.set("Authorization", "Bearer " + c.apiToken);
      return await createApi({
        jobs: context.jobs,
        guidance: context.guidance,
        token: c.apiToken,
        origins: [acceptedOrigin],
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
    const acceptedOrigin = requestOrigin(c, env, request.url);
    if (!acceptedOrigin) return;
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
    const activeConfig =
      acceptedOrigin === c.origin ? c : { ...c, origin: acceptedOrigin };
    const context = makeRuntime(activeConfig, { background: true });
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
