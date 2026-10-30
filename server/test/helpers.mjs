import { MemoryStore } from "../src/store.mjs";
import { Jobs } from "../src/jobs.mjs";
export function encode(points) {
  let result = "",
    old = [0, 0];
  for (const [lon, lat] of points)
    for (const [axis, n] of [
      [0, Math.round(lat * 1e6)],
      [1, Math.round(lon * 1e6)],
    ]) {
      let delta = n - old[axis];
      old[axis] = n;
      let v = delta < 0 ? -delta * 2 - 1 : delta * 2;
      while (v >= 32) {
        result += String.fromCharCode(((v % 32) | 32) + 63);
        v = Math.floor(v / 32);
      }
      result += String.fromCharCode(v + 63);
    }
  return result;
}
// EXPLICIT SYNTHETIC TEST DATA. Never included in live results.
export const points = [
    [2, 48],
    [2.01, 48.01],
  ],
  shape = encode(points);
export const trip = (s = shape) => ({
  status: 0,
  units: "kilometers",
  summary: { time: 100, length: 1.4 },
  legs: [{ shape: s }],
});
export const response = { trip: trip(), alternates: [] };
export const trace = {
  shape,
  units: "kilometers",
  edges: [
    {
      toll: false,
      length: 1.4,
      begin_shape_index: 0,
      end_shape_index: 1,
      names: ["Synthetic road"],
    },
  ],
};
export const input = {
  origin: { lat: 48, lon: 2 },
  destination: { lat: 48.01, lon: 2.01 },
};
export function harness(options = {}) {
  let time = 1000000;
  const calls = [],
    dispatched = [];
  const store = options.store ?? new MemoryStore();
  const provider = {
    id: "synthetic-provider",
    async status() {
      calls.push({ kind: "status", at: time });
      return { version: "test", tileset_last_modified: 1 };
    },
    async route(locations, parameters) {
      calls.push({ kind: "route", at: time, parameters });
      return structuredClone(response);
    },
    async trace() {
      calls.push({ kind: "trace", at: time });
      return structuredClone(trace);
    },
    ...options.provider,
  };
  const now = () => time,
    advance = (ms) => {
      time += ms;
    };
  const geocoder = {
    async candidates() {
      return [
        { ...input.origin, label: "Synthetic origin" },
        { ...input.destination, label: "Synthetic destination" },
      ];
    },
  };
  const jobs = new Jobs({
    ...options,
    store,
    provider,
    geocoder: options.geocoder ?? geocoder,
    now,
    wait: async (ms) => {
      time += ms;
    },
    dispatch:
      options.dispatch ??
      (async (id) => {
        dispatched.push(id);
      }),
  });
  return { jobs, calls, store, now, advance, provider, dispatched };
}
