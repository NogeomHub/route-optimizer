import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { dispatchBackground } from "../runtime.mjs";
import { handlers } from "../handlers.mjs";
import { harness, input } from "../../test/helpers.mjs";
const env = {
  V3_HOSTING_ENABLED: "true",
  V3_SITE_ORIGIN: "https://precious-custard-773d34.netlify.app",
  V3_ACCESS_TOKEN: "a".repeat(64),
  V3_SESSION_SECRET: "b".repeat(64),
  V3_WORKER_TOKEN: "c".repeat(64),
  V3_OPERATOR_CONTACT: "test@example.test",
  V3_FOSSGIS_POLICY_REVIEWED: "true",
};
const config = { origin: env.V3_SITE_ORIGIN, workerToken: env.V3_WORKER_TOKEN };
// Sanitized signature of the REAL production HTTP 401 response observed 31/10/2026.
// No cookies, site ID, credentials or arbitrary response text are needed to reproduce it.
const accessPage =
  '<!DOCTYPE html><html><head><title>Login Redirect</title></head><body><script>window.location="https://app.netlify.com/edge-access?domain=example.netlify.app";</script></body></html>';
const capture = async (fn) => {
  const logs = [];
  const oldError = console.error,
    oldInfo = console.info;
  console.error = (...v) => logs.push(v.join(" "));
  console.info = (...v) => logs.push(v.join(" "));
  try {
    return { value: await fn(), logs };
  } finally {
    console.error = oldError;
    console.info = oldInfo;
  }
};
test("real HTTP boundary reproduces Netlify private-site denial BEFORE background invocation, then native empty ACK", async () => {
  let protectedSite = true,
    invocations = 0,
    runs = 0;
  const paths = [];
  let finish;
  const finished = new Promise((r) => (finish = r));
  const worker = handlers({
    env,
    makeRuntime: () => ({
      jobs: {
        run: async () => {
          runs++;
          return { completed: true };
        },
      },
      http: { close: async () => {} },
    }),
  }).background;
  const server = createServer(async (req, res) => {
    paths.push(req.url);
    assert.equal(req.url, "/.netlify/functions/search-background");
    assert.equal(req.headers.authorization, "Bearer " + config.workerToken);
    assert.equal(req.headers.cookie, undefined); // Never forward the browser's outer Netlify session.
    if (protectedSite) {
      res.writeHead(401, {
        "Content-Type": "text/html",
        "x-nf-request-id": "01M690MGRPXYKHFSXMZWDTQXFW",
      });
      res.end(accessPage);
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    // Local adapter of Netlify's documented asynchronous invocation protocol.
    // HTTP ACK does not contain the worker return value or prove job completion.
    res.writeHead(202);
    res.end();
    invocations++;
    try {
      await worker(
        new Request(config.origin + req.url, {
          method: "POST",
          headers: { Authorization: req.headers.authorization },
          body: Buffer.concat(chunks),
        }),
      );
    } finally {
      finish();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const local = "http://127.0.0.1:" + server.address().port;
  const transport = (endpoint, options) => {
    assert.equal(
      endpoint,
      config.origin + "/.netlify/functions/search-background",
    );
    return fetch(local + new URL(endpoint).pathname, options);
  };
  try {
    const denial = await capture(async () => {
      await assert.rejects(
        dispatchBackground(
          "11111111-1111-4111-8111-111111111111",
          config,
          transport,
        ),
        (e) => {
          assert.equal(e.details.status, 401);
          assert.equal(e.details.failureType, "NETLIFY_ACCESS_PROTECTION");
          assert.equal(
            e.details.responseKind,
            "netlify_edge_access_login_page",
          );
          return true;
        },
      );
    });
    assert.equal(invocations, 0);
    assert.equal(runs, 0);
    assert.match(denial.logs.join("\n"), /01M690MGRPXYKHFSXMZWDTQXFW/);
    assert.ok(!denial.logs.join("").includes(config.workerToken));
    assert.ok(!denial.logs.join("").includes("<html>"));
    await capture(async () => {
      const h = harness({
        dispatch: (id) => dispatchBackground(id, config, transport),
      });
      await assert.rejects(
        h.jobs.create(input),
        (e) => e.code === "DISPATCH_FAILED" && e.status === 503,
      );
    });
    assert.equal(invocations, 0);
    protectedSite = false;
    await capture(async () => {
      await dispatchBackground(
        "11111111-1111-4111-8111-111111111111",
        config,
        transport,
      );
      await finished;
    });
    assert.equal(invocations, 1);
    assert.equal(runs, 1);
    assert.deepEqual(paths, [
      "/.netlify/functions/search-background",
      "/.netlify/functions/search-background",
      "/.netlify/functions/search-background",
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test("diagnostics distinguish redirects, missing endpoint, HTTP rejection, network and timeout without logging remote secrets", async () => {
  const cases = [
    [
      async () =>
        new Response("private=" + config.workerToken, {
          status: 302,
          headers: {
            Location:
              "https://app.netlify.com/login?token=" + config.workerToken,
          },
        }),
      "HTTP_REDIRECT",
      302,
    ],
    [
      async () => new Response("missing", { status: 404 }),
      "FUNCTION_ENDPOINT_NOT_FOUND",
      404,
    ],
    [
      async () =>
        new Response(JSON.stringify({ token: config.workerToken }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      "HTTP_REJECTED",
      503,
    ],
    [
      async () => {
        throw new TypeError("network " + config.workerToken);
      },
      "NETWORK_ERROR",
      null,
    ],
    [
      async () => {
        throw new DOMException("secret " + config.workerToken, "TimeoutError");
      },
      "TIMEOUT",
      null,
    ],
  ];
  for (const [transport, type, status] of cases) {
    const { logs } = await capture(async () => {
      await assert.rejects(dispatchBackground("id", config, transport), (e) => {
        assert.equal(e.details.failureType, type);
        assert.equal(e.details.status, status);
        return true;
      });
    });
    assert.ok(!logs.join("").includes(config.workerToken));
    assert.ok(!logs.join("").includes("Location"));
  }
});

test("production Bearer rejection signature is classified without logging its body", async () => {
  const id = "01M690TJK32PNMDP936HC30S95";
  const { logs } = await capture(async () => {
    await assert.rejects(
      dispatchBackground(
        "id",
        config,
        async () =>
          new Response("Error - Request ID: " + id, {
            status: 401,
            headers: { "x-nf-request-id": id, "Content-Type": "text/plain" },
          }),
      ),
      (e) => {
        assert.equal(e.details.failureType, "NETLIFY_ACCESS_PROTECTION");
        assert.equal(e.details.responseKind, "netlify_edge_auth_error");
        return true;
      },
    );
  });
  assert.match(logs.join(""), /netlify_edge_auth_error/);
});
