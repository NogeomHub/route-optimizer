import { VERSION, uuid, hash, canonical, PocError, coordinates, graphIdentity, sleep, finite } from './util.mjs';
import { Cache, Lease, mutate } from './store.mjs';
import { PROFILES, nextProfile } from './strategy.mjs';
import { addTrips, publicRoutes, analyze, optimize } from './geometry.mjs';

export const TERMINAL = new Set(['completed','failed','cancelled','expired']);
const TRANSITIONS = {
  queued: ['running','cancelled','failed','expired'], running: ['running','cancel_requested','completed','failed','expired'],
  cancel_requested: ['cancel_requested','cancelled','failed','expired'], completed: [], failed: [], cancelled: [], expired: []
};
// Keep jobs/progression/results small: geometry blobs are written once and
// referenced, never copied into every checkpoint or polling response.
const compactRoutes = routes => publicRoutes(routes).map(({ geometry,shape,...route }) => route);
export function transition(job, status) {
  if (status !== job.status && !TRANSITIONS[job.status]?.includes(status)) throw new Error(`Invalid transition ${job.status} -> ${status}`);
  return { ...job, status };
}

export class Jobs {
  constructor({ store, provider, geocoder, dispatch = async () => {}, now = Date.now, wait = sleep,
    delayMs = 2000, ttlMs = 86400000, budgetMs = 480000, earlyNoTolls = false }) {
    Object.assign(this, { store, provider, geocoder, dispatch, now, wait, delayMs, ttlMs, budgetMs, earlyNoTolls });
    this.cache = new Cache(store, now);
    if (delayMs < 2000 && provider.id === 'fossgis-valhalla-personal-poc') throw new Error('FOSSGIS delay must be >=2s');
  }
  async read(id) {
    if (typeof id !== 'string' || !/^[\da-f-]{36}$/.test(id)) throw new PocError('INVALID_JOB','Identifiant de job invalide.',400);
    const row = await this.store.get('jobs/' + id);
    if (!row) throw new PocError('NOT_FOUND','Job introuvable.',404);
    if (row.data.expiresAt <= this.now()) throw new PocError('EXPIRED','Job expiré ; relancez une recherche.',410);
    return row.data;
  }
  async resolve(input) {
    if (typeof input !== 'string') return { point: coordinates(input), candidates: null };
    const candidates = await this.geocoder.candidates(input);
    // Even a high-scoring first candidate cannot silently beat other candidates.
    if (candidates.length !== 1) return { point: null, candidates };
    return { point: coordinates(candidates[0]), candidates: null, label: candidates[0].label };
  }
  async create(input) {
    if (!input || typeof input !== 'object') throw new PocError('INVALID_INPUT','Requête JSON attendue.',400);
    const origin = await this.resolve(input.origin), destination = await this.resolve(input.destination);
    if (!origin.point || !destination.point) throw new PocError('NEEDS_SELECTION','Confirmez les lieux avant de lancer le calcul.',409,
      { origin: origin.candidates, destination: destination.candidates, resolvedOrigin: origin.point, resolvedDestination: destination.point });
    const p = input.parameters ?? {};
    if (Object.keys(p).some(k => !['maxExtraMinutes','vehicleClass'].includes(k)) ||
      !finite(p.maxExtraMinutes ?? 45,0,720) || (p.vehicleClass ?? 1) !== 1) throw new PocError('INVALID_INPUT','Paramètres utilisateur non pris en charge.',400);
    const parameters = { maxExtraMinutes: p.maxExtraMinutes ?? 45, vehicleClass: 1 };
    const graph = await this.currentGraph();
    const descriptor = { origin: origin.point, destination: destination.point, parameters, strategy: VERSION,
      earlyNoTolls: this.earlyNoTolls, provider: this.provider.id, graph };
    const searchKey = hash(descriptor), indexKey = 'search-index/' + searchKey;
    const jobId = uuid(), now = this.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const old = await this.store.get(indexKey);
      if (old && old.data.expiresAt > now) {
        const existing = await this.store.get('jobs/' + old.data.jobId);
        if (existing && !['failed','cancelled','expired'].includes(existing.data.status) && existing.data.expiresAt > now) {
          if (existing.data.status === 'queued') await this.dispatch(existing.data.id);
          return { jobId: existing.data.id, status: existing.data.status, reused: true };
        }
        if (!existing && old.data.pendingUntil > now) throw new PocError('CREATING','Création concurrente ; réessayez dans une seconde.',503);
      }
      const providerLock = await this.store.get('locks/provider/' + this.provider.id);
      if (providerLock?.data.until > now) throw new PocError('PROVIDER_BUSY','Une recherche personnelle est déjà en cours.',429);
      const index = { jobId, expiresAt: now + this.ttlMs, pendingUntil: now + 30000 };
      if (!await this.store.put(indexKey,index,old ? { etag: old.etag } : { new: true })) continue;
      const job = { schemaVersion: 1, id: jobId, searchKey, ...descriptor, status: 'queued', createdAt: now, updatedAt: now, expiresAt: now + this.ttlMs,
        progress: { stage: 'geocodage', profilesExecuted: 0, profileCeiling: 40, uniqueGeometries: 0, analyzed: 0, currentProfile: null },
        checkpoint: { history: [], routes: [], earlyChecked: false }, attempts: 0, error: null, resultKey: null };
      await this.store.put('jobs/' + jobId,job,{ new: true });
      try { await this.dispatch(jobId); }
      catch { await this.update(jobId,j => ({ ...transition(j,'failed'), error: { code: 'DISPATCH_FAILED', message: 'Worker non accepté ; relancez.' } }));
        throw new PocError('DISPATCH_FAILED','Lancement du worker impossible.',503); }
      return { jobId, status: 'queued', reused: false };
    }
    throw new PocError('STORE_CONTENTION','Créations concurrentes ; réessayez.',503);
  }
  async update(id, fn) {
    return mutate(this.store,'jobs/' + id,j => {
      if (!j) throw new PocError('NOT_FOUND','Job introuvable.',404);
      return { ...fn(j), updatedAt: this.now() };
    });
  }
  async cancel(id) {
    await this.read(id);
    return this.update(id,j => TERMINAL.has(j.status) ? j : transition(j,j.status === 'queued' ? 'cancelled' : 'cancel_requested'));
  }
  async view(id, { includeResult = true } = {}) {
    const j = await this.read(id);
    const value = { jobId: j.id, status: j.status, progress: j.progress, createdAt: j.createdAt, updatedAt: j.updatedAt,
      expiresAt: j.expiresAt, attempts: j.attempts, error: j.error, strategyVersion: j.strategy, provider: j.provider, graph: j.graph };
    if (includeResult && j.resultKey) value.result = (await this.store.get(j.resultKey))?.data ?? null;
    return value;
  }
  async geometry(id,routeId) {
    const view = await this.view(id);
    const route = view.result?.routes.find(r => r.id === routeId);
    if (!route) throw new PocError('NOT_FOUND','Géométrie introuvable.',404);
    if (route.geometry) return route.geometry; // Early local evidence format only.
    const value = await this.store.get(route.geometryKey);
    if (!value || value.data.expiresAt <= this.now()) throw new PocError('EXPIRED','Géométrie expirée.',410);
    return value.data.geometry;
  }
  async currentGraph() {
    const key = { provider: this.provider.id };
    const cached = await this.cache.get('status',key); if (cached) return cached;
    const lease = new Lease(this.store,'locks/provider/' + this.provider.id,'status-' + uuid(),this.now);
    if (!await lease.acquire()) throw new PocError('PROVIDER_BUSY','Fournisseur occupé ; réessayez.',429);
    try {
      const graph = graphIdentity(await this.network(() => this.provider.status(),async () => lease.renew()));
      await this.cache.set('status',key,graph,300000); return graph;
    } finally { await lease.release(); }
  }
  async network(fn, guard) {
    await guard();
    const last = (await this.store.get('schedule/' + this.provider.id))?.data.endedAt ?? 0;
    await this.wait(Math.max(0,last + this.delayMs - this.now()));
    await guard();
    try { return await fn(); }
    finally { await this.store.put('schedule/' + this.provider.id,{ endedAt: this.now() }); }
  }
  async run(id) {
    let job = await this.read(id);
    if (TERMINAL.has(job.status)) return { noop: true };
    const owner = uuid();
    const jobLease = new Lease(this.store,'locks/job/' + id,owner,this.now);
    if (!await jobLease.acquire()) return { noop: true, retry: true, reason: 'already_running' };
    const providerLease = new Lease(this.store,'locks/provider/' + this.provider.id,owner,this.now);
    let providerHeld = false, claimed = false;
    const startedAt = this.now();
    const check = async () => {
      const current = await this.read(id);
      if (current.status === 'cancel_requested' || current.status === 'cancelled') throw new PocError('CANCELLED','Annulation demandée.',409);
      if (TERMINAL.has(current.status) || (current.owner && current.owner !== owner)) throw new PocError('LEASE_LOST','Autre worker ou état terminal.',409);
      if (this.now()-startedAt > this.budgetMs) throw new PocError('TIME_BUDGET','Budget de temps atteint ; résultat partiel conservé.',504);
      await jobLease.renew(); if (providerHeld) await providerLease.renew();
    };
    const save = async (stage, currentProfile = null) => {
      await check();
      for (const route of job.checkpoint.routes) if (!route.geometryKey) {
        route.geometryKey = 'geometries/' + hash({ provider: job.provider, graph: job.graph, shapeHash: route.shapeHash });
        await this.store.put(route.geometryKey,{ geometry: route.geometry, shape: route.shape, createdAt: this.now(), expiresAt: job.expiresAt });
      }
      const checkpoint = job.checkpoint;
      const updated = await this.update(id,j => {
        if (j.owner !== owner) throw new PocError('LEASE_LOST','Worker remplacé.',409);
        return { ...j, checkpoint: { ...job.checkpoint, routes: compactRoutes(job.checkpoint.routes) },
          progress: { stage, currentProfile, profilesExecuted: job.checkpoint.history.length, profileCeiling: 40,
            uniqueGeometries: job.checkpoint.routes.length, analyzed: job.checkpoint.routes.filter(r => r.tollExposure !== null).length } };
      });
      // Keep the runner's own route objects; a checkpoint write must not replace
      // references being analyzed by the current loop with a serialized clone.
      job = { ...updated, checkpoint };
    };
    const upstream = fn => this.network(fn,check);
    const analyzeOne = async route => {
      if (route.tollExposure !== null) return;
      const key = { provider: job.provider, graph: job.graph, shapeHash: route.shapeHash, shapeMatch: 'edge_walk', attributesVersion: 1, costing: 'auto' };
      let trace = await this.cache.get('analyses',key);
      if (!trace) { trace = await upstream(() => this.provider.trace(route)); analyze(trace,route); await this.cache.set('analyses',key,trace,this.ttlMs); }
      route.tollExposure = analyze(trace,route); await save('analyse');
    };
    try {
      if (job.status === 'cancel_requested') throw new PocError('CANCELLED','Annulation avant démarrage.',409);
      if (!await providerLease.acquire()) throw new PocError('PROVIDER_BUSY','Une autre campagne occupe le fournisseur ; relancez.',429);
      providerHeld = true;
      await jobLease.renew();
      job = await this.update(id,j => {
        if ((j.fence ?? 0) >= jobLease.fence && j.owner !== owner) throw new PocError('LEASE_LOST','Un successeur a déjà revendiqué le job.',409);
        return { ...transition(j,'running'), owner, fence: jobLease.fence, attempts: j.attempts + 1 };
      });
      claimed = true;
      for (const route of job.checkpoint.routes) if (!route.geometry) {
        const record = await this.store.get(route.geometryKey);
        if (!record || record.data.expiresAt <= this.now()) throw new PocError('EXPIRED','Géométrie du checkpoint expirée.',410);
        route.geometry = record.data.geometry; route.shape = record.data.shape;
      }
      await check();
      const before = graphIdentity(await upstream(() => this.provider.status()));
      if (canonical(before) !== canonical(job.graph)) throw new PocError('GRAPH_CHANGED','Graphe changé ; nouvelle recherche nécessaire.');
      const history = () => job.checkpoint.history;
      while (true) {
        await check();
        // Isolated experimental option. Only after nine IDENTICAL observed sets,
        // strict analyses of all unique representatives and zero marked toll km.
        if (this.earlyNoTolls && history().length === 9 && !job.checkpoint.earlyChecked) {
          job.checkpoint.earlyChecked = true;
          const signatures = new Set(history().map(h => canonical([...new Set(h.routes)].sort())));
          if (signatures.size === 1) {
            for (const route of job.checkpoint.routes) await analyzeOne(route);
            if (job.checkpoint.routes.every(r => r.tollExposure?.tollKm === 0)) {
              job.checkpoint.stopReason = 'experimental_no_toll_after_9'; await save('analyse'); break;
            }
          }
        }
        const next = nextProfile(history()); if (!next) { job.checkpoint.stopReason = history().length >= 40 ? 'budget_40' : 'stagnation_8'; break; }
        const parameters = PROFILES[next.index];
        await save('routage',{ index: next.index, parameters, reason: next.reason });
        const key = { locations: [job.origin,job.destination], parameters, provider: job.provider, graph: job.graph,
          costing: 'auto', alternates: 2, units: 'kilometers', language: 'fr-FR', shape_format: 'polyline6' };
        let response = await this.cache.get('valhalla',key);
        if (!response) { response = await upstream(() => this.provider.route(key.locations,parameters));
          // Validate before any cache entry can become reusable.
          const isolated = []; addTrips(isolated,response,next.index);
          await this.cache.set('valhalla',key,response,this.ttlMs); }
        const ids = addTrips(job.checkpoint.routes,response,next.index);
        job.checkpoint.history.push({ profile: next.index, routes: ids, reason: next.reason, parameters });
        await save('routage');
      }
      for (const route of job.checkpoint.routes) { await check(); await analyzeOne(route); }
      await save('optimisation');
      const after = graphIdentity(await upstream(() => this.provider.status()));
      if (canonical(after) !== canonical(job.graph)) throw new PocError('GRAPH_CHANGED','Graphe changé pendant le calcul : ne pas valider les résultats.');
      await check();
      const routes = publicRoutes(job.checkpoint.routes), fastest = Math.min(...routes.map(r => r.durationSeconds));
      const result = { schemaVersion: 1, source: job.provider, origin: job.origin, destination: job.destination, graph: job.graph, expiresAt: job.expiresAt,
        provider: job.provider, strategyVersion: VERSION, stopReason: job.checkpoint.stopReason, routes: compactRoutes(routes),
        exposurePareto: optimize(routes), eligibleRouteIds: routes.filter(r => r.durationSeconds-fastest <= job.parameters.maxExtraMinutes*60).map(r => r.id),
        pricingStatus: 'not_computed', warning: 'Kilomètres marqués à péage OSM : ce ne sont pas des prix. Pas de navigation nationale garantie.' };
      const resultKey = 'results/' + id;
      await this.store.put(resultKey,result);
      await this.update(id,j => {
        if (j.owner !== owner) throw new PocError('LEASE_LOST','Worker remplacé.',409);
        if (j.status === 'cancel_requested') return transition(j,'cancelled');
        return { ...transition(j,'completed'), resultKey, progress: { ...j.progress, stage: 'terminé', currentProfile: null }, completedAt: this.now() };
      });
      return { completed: (await this.read(id)).status === 'completed' };
    } catch (e) {
      // A stale worker must never overwrite a newer worker's checkpoint/terminal state.
      const held = await this.store.get('locks/job/' + id);
      if (e.code !== 'LEASE_LOST' && held?.data.owner === owner && held.data.until > this.now()) await this.update(id,j => {
        if ((claimed && j.owner !== owner) || (j.fence ?? 0) > jobLease.fence || TERMINAL.has(j.status)) return j;
        const cancelled = e.code === 'CANCELLED' || j.status === 'cancel_requested';
        return { ...transition(j,cancelled ? 'cancelled' : 'failed'), error: cancelled ? null : { code: e.code ?? 'INTERNAL_ERROR', message: e instanceof PocError ? e.message : 'Erreur interne du worker.' } };
      });
      if (e.code === 'GRAPH_CHANGED') await this.cache.set('status',{ provider: this.provider.id },null,0);
      return { completed: false, code: e.code ?? 'INTERNAL_ERROR' };
    } finally { if (providerHeld) await providerLease.release(); await jobLease.release(); }
  }
}
