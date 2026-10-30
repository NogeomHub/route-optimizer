import { createHash, randomUUID } from 'node:crypto';
export const VERSION = 'adaptive-budget40-stop8-poc-v1';
export const uuid = randomUUID;
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export class PocError extends Error {
  constructor(code, message, status = 502, details) { super(message); Object.assign(this, { code, status, details }); }
}
export function finite(n, min, max) { return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max; }
export function coordinates(value) {
  if (!value || !finite(value.lat, -90, 90) || !finite(value.lon, -180, 180)) throw new PocError('INVALID_INPUT', 'Coordonnées lat/lon invalides.', 400);
  return { lat: value.lat, lon: value.lon };
}
export function graphIdentity(status) {
  if (typeof status?.version !== 'string' || !Number.isFinite(status?.tileset_last_modified)) throw new PocError('INVALID_GRAPH', 'Version/graphe Valhalla absent.');
  return { version: status.version, tileset: status.tileset_last_modified };
}
