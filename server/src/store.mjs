import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { uuid, hash, PocError } from "./util.mjs";

/** Storage port. Conditional puts MUST be atomic; reads MUST be strongly consistent.
 * Values are JSON-serializable. TTL is application-managed, never an assumed SDK TTL.
 */
export class MemoryStore {
  records = new Map();
  async get(key) {
    return structuredClone(this.records.get(key) ?? null);
  }
  async put(key, data, condition = {}) {
    const old = this.records.get(key);
    if (
      (condition.new && old) ||
      (condition.etag && old?.etag !== condition.etag)
    )
      return false;
    this.records.set(key, { data: structuredClone(data), etag: uuid() });
    return true;
  }
}

/** Local harness only: atomic rename, one process, serialized writes. NOT distributed CAS.
 * Restarting that process reloads records from disk. Never use this adapter on Netlify.
 */
export class FileStore {
  constructor(directory) {
    this.directory = directory;
    this.tail = Promise.resolve();
  }
  file(key) {
    return join(this.directory, hash(key) + ".json");
  }
  async get(key) {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async put(key, data, condition = {}) {
    const run = this.tail.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const old = await this.get(key);
      if (
        (condition.new && old) ||
        (condition.etag && old?.etag !== condition.etag)
      )
        return false;
      const temp = this.file(key) + "." + uuid();
      await writeFile(temp, JSON.stringify({ key, data, etag: uuid() }));
      await rename(temp, this.file(key));
      return true;
    });
    this.tail = run.catch(() => {});
    return run;
  }
}

export async function mutate(store, key, fn) {
  for (let i = 0; i < 12; i++) {
    const row = await store.get(key);
    const next = fn(row?.data ?? null);
    if (next === undefined) return row?.data ?? null;
    if (await store.put(key, next, row ? { etag: row.etag } : { new: true }))
      return next;
  }
  throw new PocError(
    "STORE_CONTENTION",
    "Concurrence de stockage, réessayez plus tard.",
    503,
  );
}

export class Cache {
  constructor(store, now = Date.now) {
    this.store = store;
    this.now = now;
  }
  async get(namespace, key) {
    const row = await this.store.get(`cache/${namespace}/${hash(key)}`);
    return row && row.data.expiresAt > this.now() ? row.data.value : null;
  }
  async set(namespace, key, value, ttlMs) {
    await this.store.put(`cache/${namespace}/${hash(key)}`, {
      value,
      createdAt: this.now(),
      expiresAt: this.now() + ttlMs,
    });
  }
}

export class Lease {
  constructor(store, key, owner, now = Date.now, ttlMs = 180000) {
    Object.assign(this, { store, key, owner, now, ttlMs });
  }
  async acquire() {
    const row = await this.store.get(this.key);
    if (row && row.data.until > this.now() && row.data.owner !== this.owner)
      return false;
    const fence = (row?.data.fence ?? 0) + 1;
    const acquired = await this.store.put(
      this.key,
      { owner: this.owner, fence, until: this.now() + this.ttlMs },
      row ? { etag: row.etag } : { new: true },
    );
    if (acquired) this.fence = fence;
    return acquired;
  }
  async renew() {
    const row = await this.store.get(this.key);
    if (!row || row.data.owner !== this.owner || row.data.until <= this.now())
      throw new PocError(
        "LEASE_LOST",
        "Verrou perdu : arrêt sans nouvel appel.",
        409,
      );
    if (
      !(await this.store.put(
        this.key,
        { ...row.data, until: this.now() + this.ttlMs },
        { etag: row.etag },
      ))
    )
      throw new PocError(
        "LEASE_LOST",
        "Verrou renouvelé par une autre exécution.",
        409,
      );
  }
  async release() {
    const row = await this.store.get(this.key);
    if (row?.data.owner === this.owner)
      await this.store.put(
        this.key,
        { ...row.data, until: 0 },
        { etag: row.etag },
      );
  }
}
