from pathlib import Path
import re

p = Path("server/src/gps.mjs")
s = p.read_text()
s = s.replace(
    'export const GPS_VERSION = "divergence-address-v1";',
    'export const GPS_VERSION = "divergence-corridor-v2";',
)

s, n = re.subn(
    r"    // Long alternative corridors need two ordered anchors, not a single arbitrary midpoint\.\n    const slots = length > 40 \? 2 : 1;\n    for \(let slot = 0; slot < slots; slot\+\+\) \{\n      const lo =\n          km\[zone\.start\] \+\n          length \* \(slots === 1 \? 0\.12 : slot === 0 \? 0\.12 : 0\.55\),\n        hi =\n          km\[zone\.start\] \+\n          length \* \(slots === 1 \? 0\.88 : slot === 0 \? 0\.45 : 0\.88\);\n      const candidates = \[\];",
    """    // Spread anchors across the whole divergent corridor. Google Maps URLs support
    // at most three waypoints on mobile browsers, so use that budget deliberately.
    const slots = Math.min(3, Math.max(1, Math.ceil(length / 28)));
    for (let slot = 0; slot < slots; slot++) {
      const bandStart = km[zone.start] + (length * slot) / slots,
        bandEnd = km[zone.start] + (length * (slot + 1)) / slots,
        margin = Math.min(2, (bandEnd - bandStart) * 0.15),
        lo = bandStart + margin,
        hi = bandEnd - margin,
        target = (lo + hi) / 2;
      const candidates = [];""",
    s,
    count=1,
)
assert n == 1, "slot block not found"

old = """          zoneEndKm: km[zone.end],
        });"""
new = """          zoneEndKm: km[zone.end],
          targetDeltaKm: Math.abs(km[i] - target),
        });"""
assert old in s
s = s.replace(old, new, 1)

old = """      candidates.sort(
        (a, b) => b.separationKm - a.separationKm || a.routeKm - b.routeKm,
      );"""
new = """      candidates.sort(
        (a, b) =>
          a.targetDeltaKm - b.targetDeltaKm ||
          b.separationKm - a.separationKm ||
          a.routeKm - b.routeKm,
      );"""
assert old in s
s = s.replace(old, new, 1)

s, n = re.subn(
    r"    const steps = \[\],\n      start = this\.now\(\);\n    let failure;\n    for \(const trials of analysis\.groups\) \{.*?    return guide;",
    """    const steps = [],
      start = this.now();
    for (const trials of analysis.groups) {
      const fallback = trials[0];
      let selected;
      for (const c of trials) {
        if (this.now() - start > 10000) break;
        let locations;
        try {
          locations = await this.reverseGeocoder.reverse(c.point);
        } catch {
          continue;
        }
        if (!Array.isArray(locations)) continue;
        const place = locations.find(
          (p) =>
            ["housenumber", "street"].includes(p.type) &&
            p.label &&
            p.city &&
            p.postcode &&
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lon) &&
            distance(c.point, [p.lon, p.lat]) <= 0.08 &&
            analysis.routeDistance([p.lon, p.lat]) <= 0.08 &&
            analysis.referenceDistance([p.lon, p.lat]) >= 2,
        );
        if (place) {
          selected = {
            ...c,
            ...place,
            source: "IGN Géoplateforme",
            evidence: "cached_maneuver_and_trace",
            separationKm: analysis.referenceDistance([place.lon, place.lat]),
            offsetMeters: Math.round(
              distance(c.point, [place.lon, place.lat]) * 1000,
            ),
            coordinateOnly: false,
          };
          break;
        }
      }
      if (!selected && fallback) {
        selected = {
          ...fallback,
          label: `${fallback.roads[0] ?? "Repère"} · ${fallback.point[1].toFixed(6)}, ${fallback.point[0].toFixed(6)}`,
          lat: fallback.point[1],
          lon: fallback.point[0],
          city: "",
          postcode: "",
          source: "Valhalla + trace",
          evidence: "cached_maneuver_and_trace_coordinate",
          separationKm: analysis.referenceDistance(fallback.point),
          offsetMeters: 0,
          coordinateOnly: true,
        };
      }
      if (!selected) return { ...base, ...unavailable("NO_RELIABLE_ANCHOR") };
      steps.push(selected);
    }
    const guide = {
      ...base,
      status: "suggested",
      steps,
      warning:
        "Corridor guidé par coordonnées : Google Maps recalcule entre les repères. Vérifiez le tracé et les péages ; les prix affichés concernent uniquement le trajet Valhalla.",
    };
    await this.cache.set(
      "gps-guidance",
      key,
      guide,
      Math.max(0, Math.min(86400000, job.expiresAt - this.now())),
    );
    return guide;""",
    s,
    count=1,
    flags=re.S,
)
assert n == 1, "guidance block not found"
p.write_text(s)

p = Path("server/test/gps.test.mjs")
t = p.read_text()
replacement = '''test("real archived corridor: three ordered full-corridor anchors, evidence, no new routing and persistent guidance cache", async () => {
  const h = await setup(),
    g = await h.gps.get(h.jobs, h.id, "G021");
  assert.equal(g.status, "suggested");
  assert.equal(g.steps.length, 3);
  for (const s of g.steps) {
    assert.ok(Number.isFinite(s.lat));
    assert.ok(Number.isFinite(s.lon));
    assert.ok(s.separationKm >= 2);
    assert.ok(s.offsetMeters <= 80);
    assert.ok(["IGN Géoplateforme", "Valhalla + trace"].includes(s.source));
    assert.ok(s.roads.every((n) => !/^A\\s?\\d/.test(n)));
  }
  assert.ok(g.steps[0].routeKm < g.steps[1].routeKm);
  assert.ok(g.steps[1].routeKm < g.steps[2].routeKm);
  assert.ok(g.steps[0].routeKm < 35);
  assert.ok(g.steps[2].routeKm > 55);
  assert.match(g.warning, /coordonnées/);
  const calls = h.calls();
  const reopened = new GpsGuidance({
    store: h.store,
    reverseGeocoder: { reverse() { throw Error("should be cached"); } },
    now: h.gps.now,
  });
  assert.deepEqual(await reopened.get(h.jobs, h.id, "G021"), g);
  assert.equal(h.calls(), calls);
  const reference = await h.gps.get(h.jobs, h.id, "G004");
  assert.equal(reference.status, "reference");
  assert.deepEqual(reference.steps, []);
});
test("missing maneuvers'''
t, n = re.subn(
    r'test\("real archived corridor: ordered discriminating address anchors, evidence, no new routing and persistent guidance cache", async \(\) => \{.*?\n\}\);\ntest\("missing maneuvers',
    lambda _: replacement,
    t,
    count=1,
    flags=re.S,
)
assert n == 1, "first test block not found"

replacement = '''test("reverse geocoding is optional: route-proven coordinates remain usable", async () => {
  for (const answer of [[], [{ label: "Somewhere", type: "municipality", city: "X", postcode: "12345", lat: 46.11874, lon: 5.194797 }], [{ label: "Far", type: "housenumber", city: "X", postcode: "12345", lat: 48, lon: 2 }]]) {
    const h = await setup();
    h.reverseGeocoder.reverse = async () => answer;
    const g = await h.gps.get(h.jobs, h.id, "G021");
    assert.equal(g.status, "suggested");
    assert.equal(g.steps.length, 3);
    assert.ok(g.steps.some((s) => s.coordinateOnly));
  }
  const h = await setup();
  h.reverseGeocoder.reverse = async () => { throw Error("IGN down"); };
  const g = await h.gps.get(h.jobs, h.id, "G021");
  assert.equal(g.status, "suggested");
  assert.equal(g.steps.length, 3);
  assert.ok(g.steps.every((s) => s.coordinateOnly));
});
test("ordinary-road proof'''
t, n = re.subn(
    r'test\("ambiguous, off-corridor, municipality-only or failed reverse geocoding fails closed without partial steps", async \(\) => \{.*?\n\}\);\ntest\("ordinary-road proof',
    lambda _: replacement,
    t,
    count=1,
    flags=re.S,
)
assert n == 1, "reverse test block not found"
p.write_text(t)
