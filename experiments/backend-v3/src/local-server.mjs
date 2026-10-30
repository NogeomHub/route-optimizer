import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileStore, Cache } from './store.mjs';
import { HttpClient, FossgisProvider, IgnGeocoder } from './providers.mjs';
import { Jobs } from './jobs.mjs';
import { createApi } from './api.mjs';
import { uuid } from './util.mjs';

/** HTTP harness, real providers, local disk. NOT Netlify background or hosted Blobs. */
export async function startLocal({ directory = '.local', port = 8787, token, earlyNoTolls = false, policyReviewed = false, quiet = false } = {}) {
  if (!token || token.length < 32) throw new Error('POC_API_TOKEN must contain at least 32 characters.');
  await mkdir(join(directory,'network'),{ recursive: true });
  const store = new FileStore(join(directory,'blobs'));
  const http = new HttpClient({ record: async entry => {
    await writeFile(join(directory,'network',`${entry.startedAt}-${uuid()}.json`),JSON.stringify(entry));
  } });
  const provider = new FossgisProvider(http,{ policyReviewed });
  const active = new Set(); let jobs;
  const dispatch = async id => {
    const task = new Promise(resolve => setImmediate(resolve)).then(() => jobs.run(id));
    active.add(task); task.finally(() => active.delete(task)).catch(e => { if (!quiet) console.error('Local runner:',e.message); });
  };
  jobs = new Jobs({ store, provider, geocoder: new IgnGeocoder(http,new Cache(store)), dispatch, earlyNoTolls });
  let api;
  const server = createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      if (url.pathname === '/') {
        res.writeHead(200,{ 'Content-Type': 'text/html; charset=utf-8' });
        res.end(await readFile(new URL('../public/index.html',import.meta.url))); return;
      }
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const response = await api(new Request(baseUrl + req.url,{ method: req.method, headers: req.headers,
        ...(['GET','HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks), duplex: 'half' }) }));
      res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end('Local harness error'); }
  });
  await new Promise(resolve => server.listen(port,'127.0.0.1',resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  api = createApi({ jobs, token, origins: [baseUrl], operatorContact: process.env.POC_OPERATOR_CONTACT ?? 'POC local privé — opérateur du dépôt' });
  if (!quiet) console.log(`POC local (pas Netlify): ${baseUrl}`);
  return { server, baseUrl, jobs, store, http, active, async close() { await Promise.allSettled([...active]); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await http.close(); } };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await startLocal({ directory: process.env.POC_LOCAL_DIRECTORY ?? '.local', port: Number(process.env.PORT ?? 8787),
    token: process.env.POC_API_TOKEN, policyReviewed: process.env.POC_FOSSGIS_POLICY_REVIEWED === 'true', earlyNoTolls: process.env.POC_EARLY_NO_TOLLS === 'true' });
}
