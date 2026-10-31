import { getStore } from "@netlify/blobs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { BlobsStore } from "./store.mjs";
import { Cache } from "../src/store.mjs";
import { Jobs } from "../src/jobs.mjs";
import { HttpClient, FossgisProvider, IgnGeocoder } from "../src/providers.mjs";
import { AuditedTollPricingProvider } from "../pricing/provider.mjs";
import { uuid } from "../src/util.mjs";
// The public function endpoint passes through Netlify site-access protection.
// A browser's Netlify login does not authenticate this server-to-server request.
export async function dispatchBackground(jobId, config, fetchImpl = fetch) {
  const endpoint = new URL(
    "/.netlify/functions/search-background",
    config.origin,
  ).href;
  let response;
  const diagnostic = { endpoint, status: null, failureType: null };
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.workerToken,
      },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10000),
      // Never forward the worker secret to a login redirect. Inspect its status.
      redirect: "manual",
    });
    diagnostic.status = response.status;
    const requestId = response.headers.get("x-nf-request-id");
    if (
      /^[a-zA-Z0-9_-]{1,128}$/.test(requestId ?? "") &&
      ![config.workerToken, config.accessToken, config.sessionSecret].includes(
        requestId,
      )
    )
      diagnostic.requestId = requestId;
    if (response.status === 202) {
      await response.body?.cancel();
      console.info(
        "[netlify dispatch]",
        JSON.stringify({ ...diagnostic, event: "accepted" }),
      );
      return;
    }
    // Inspect a bounded prefix, but never log raw HTML/JSON, cookies, auth
    // headers, Location query strings or arbitrary remote error messages.
    let prefix = "";
    const reader = response.body?.getReader();
    if (reader) {
      let bytes = 0;
      try {
        while (bytes < 2048) {
          const { value, done } = await reader.read();
          if (done) break;
          const part = value.subarray(0, 2048 - bytes);
          prefix += new TextDecoder().decode(part);
          bytes += part.byteLength;
        }
      } finally {
        await reader.cancel();
      }
    }
    const accessPage =
      /app\.netlify\.com[^\n]{0,30}edge-access|Login Redirect/i.test(prefix);
    const netlifyAuthError = Boolean(
      requestId && prefix.trim() === "Error - Request ID: " + requestId,
    );
    diagnostic.failureType =
      [401, 403].includes(response.status) && (accessPage || netlifyAuthError)
        ? "NETLIFY_ACCESS_PROTECTION"
        : response.status >= 300 && response.status < 400
          ? "HTTP_REDIRECT"
          : response.status === 404
            ? "FUNCTION_ENDPOINT_NOT_FOUND"
            : "HTTP_REJECTED";
    diagnostic.responseKind = accessPage
      ? "netlify_edge_access_login_page"
      : netlifyAuthError
        ? "netlify_edge_auth_error"
        : /text\/html/i.test(response.headers.get("content-type") ?? "")
          ? "html"
          : /application\/json/i.test(
                response.headers.get("content-type") ?? "",
              )
            ? "json"
            : "other";
  } catch (error) {
    diagnostic.failureType =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "TIMEOUT"
        : response
          ? "RESPONSE_READ_ERROR"
          : "NETWORK_ERROR";
  }
  console.error("[netlify dispatch]", JSON.stringify(diagnostic));
  throw Object.assign(
    new Error("Background dispatch failed: " + diagnostic.failureType),
    {
      code: "BACKGROUND_DISPATCH_REJECTED",
      details: diagnostic,
    },
  );
}
export function runtime(config, { background = false } = {}) {
  const store = new BlobsStore(
    getStore({ name: "route-optimizer-v3", consistency: "strong" }),
  );
  const http = new HttpClient({
    timeoutMs: background ? 90000 : 20000,
    record: (entry) =>
      store.put(
        `network/${new Date(entry.startedAt).toISOString().slice(0, 10)}/${uuid()}`,
        { ...entry, expiresAt: Date.now() + 86400000 },
      ),
  });
  const jobs = new Jobs({
    store,
    provider: new FossgisProvider(http, { policyReviewed: true }),
    geocoder: new IgnGeocoder(http, new Cache(store)),
    earlyNoTolls: config.earlyNoTolls,
    pricingProvider: new AuditedTollPricingProvider({
      resourceRoot: pathToFileURL(
        resolve(process.cwd(), "server/pricing") + "/",
      ),
    }),
    dispatch: (id) => dispatchBackground(id, config),
  });
  return { jobs, http };
}
