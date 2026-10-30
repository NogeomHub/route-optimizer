import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FileStore, Cache } from "./store.mjs";
import { HttpClient, FossgisProvider, IgnGeocoder } from "./providers.mjs";
import { Jobs } from "./jobs.mjs";
import { createApi } from "./api.mjs";
import { uuid } from "./util.mjs";
import { AuditedTollPricingProvider } from "../pricing/provider.mjs";

/** Loopback-only development server, one process and persistent local disk. */
export async function startLocal({
  directory = ".local-v3",
  port = 8787,
  token,
  earlyNoTolls = false,
  policyReviewed = false,
  quiet = false,
} = {}) {
  if (!token || token.length < 32)
    throw new Error(
      "Un jeton local de 32 caractères au minimum est nécessaire.",
    );
  await mkdir(join(directory, "network"), { recursive: true });
  const store = new FileStore(join(directory, "blobs"));
  const http = new HttpClient({
    record: async (entry) => {
      await writeFile(
        join(directory, "network", `${entry.startedAt}-${uuid()}.json`),
        JSON.stringify(entry),
      );
    },
  });
  const provider = new FossgisProvider(http, { policyReviewed });
  const active = new Set();
  let jobs;
  const dispatch = async (id) => {
    const task = new Promise((resolve) => setImmediate(resolve)).then(() =>
      jobs.run(id),
    );
    active.add(task);
    task
      .finally(() => active.delete(task))
      .catch((e) => {
        if (!quiet) console.error("Local runner:", e.message);
      });
  };
  jobs = new Jobs({
    store,
    provider,
    geocoder: new IgnGeocoder(http, new Cache(store)),
    dispatch,
    earlyNoTolls,
    pricingProvider: new AuditedTollPricingProvider(),
  });
  let api;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8192) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      const response = await api(
        new Request(baseUrl + req.url, {
          method: req.method,
          headers: req.headers,
          ...(["GET", "HEAD"].includes(req.method)
            ? {}
            : { body: Buffer.concat(chunks), duplex: "half" }),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Local harness error");
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  api = createApi({
    jobs,
    token,
    origins: [baseUrl, "http://127.0.0.1:5173", "http://localhost:5173"],
    operatorContact:
      process.env.POC_OPERATOR_CONTACT ??
      "Développement local privé — opérateur du dépôt",
  });
  if (!quiet) console.log(`Backend local V3: ${baseUrl}`);
  return {
    server,
    baseUrl,
    jobs,
    store,
    http,
    active,
    async close() {
      await Promise.allSettled([...active]);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await http.close();
    },
  };
}
