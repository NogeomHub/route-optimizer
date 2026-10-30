import { runtime, configuration } from '../../src/runtime.mjs';
import { createApi, json } from '../../src/api.mjs';

export default async (request,netlifyContext) => {
  let context;
  try {
    const config = configuration();
    const site = netlifyContext?.site?.url ?? process.env.URL; // Canonical Netlify site, never user-controlled Host.
    if (!site?.startsWith('https://')) throw new Error('Netlify URL unavailable');
    context = runtime({ dispatch: async jobId => {
      const response = await fetch(new URL('/.netlify/functions/search-background',site),{ method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.workerToken },
        body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(10000) });
      if (response.status !== 202) throw new Error('Background worker not accepted');
    } });
    return await createApi({ jobs: context.jobs, token: config.token, origins: config.origins, operatorContact: config.contact })(request);
  } catch { return json({ error: { code: 'CONFIGURATION', message: 'Configurer le site POC et ses variables de fonctions.' } },503); }
  finally { await context?.http.close(); }
};
export const config = { path: ['/api/search','/api/search/*','/api/geocode','/api/about'] };
