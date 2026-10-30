import { runtime, configuration } from '../../src/runtime.mjs';
import { authorized } from '../../src/api.mjs';

export default async request => {
  const config = configuration();
  // Background's HTTP 202 precedes execution. Unauthorized invocation must NEVER
  // reach Valhalla, even though that acknowledgement cannot serve as auth feedback.
  if (!authorized(request,config.workerToken)) return;
  const body = await request.text(); if (Buffer.byteLength(body) > 1024) return;
  let id; try { id = JSON.parse(body).jobId; } catch { return; }
  const context = runtime();
  try {
    const outcome = await context.jobs.run(id);
    if (outcome.retry) throw new Error('Lease still active; platform retry may resume after expiration');
  } finally { await context.http.close(); }
};
