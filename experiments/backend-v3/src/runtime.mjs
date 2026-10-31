import { getStore } from '@netlify/blobs';
import { BlobsStore, Cache } from './store.mjs';
import { HttpClient, FossgisProvider, IgnGeocoder } from './providers.mjs';
import { Jobs } from './jobs.mjs';
import { hash, uuid } from './util.mjs';

/** Netlify injects Blobs context into functions. No personal access token required. */
export function runtime({ dispatch } = {}) {
  const store = new BlobsStore(getStore({ name: 'route-optimizer-v3-poc', consistency: 'strong' }));
  const http = new HttpClient({ record: async entry => {
    await store.put(`network/${new Date(entry.startedAt).toISOString().slice(0,10)}/${uuid()}`,{ ...entry, expiresAt: Date.now()+86400000 });
  } });
  const provider = new FossgisProvider(http,{ policyReviewed: process.env.POC_FOSSGIS_POLICY_REVIEWED === 'true' });
  const jobs = new Jobs({ store, provider, geocoder: new IgnGeocoder(http,new Cache(store)), dispatch,
    earlyNoTolls: process.env.POC_EARLY_NO_TOLLS === 'true' });
  return { jobs, http, store };
}

export function configuration() {
  const token = process.env.POC_API_TOKEN, workerToken = process.env.POC_WORKER_TOKEN, contact = process.env.POC_OPERATOR_CONTACT;
  if (!token || token.length < 32 || !workerToken || workerToken.length < 32 || hash(token) === hash(workerToken) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact ?? '')) {
    throw new Error('Set two distinct tokens (>=32 chars) and a valid operator email in Netlify function environment.');
  }
  const origins = (process.env.POC_ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  return { token, workerToken, contact, origins };
}
