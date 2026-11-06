// Operator configuration only; never accept an unbounded browser override.
export function searchLimits(env = process.env) {
  const integer = (name, fallback, min, max) => {
    const value = env[name] ?? String(fallback);
    if (!/^[0-9]+$/.test(value) || Number(value) < min || Number(value) > max)
      throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return Number(value);
  };
  return {
    maxProviderCalls: integer("V3_MAX_PROVIDER_CALLS", 32, 4, 192),
    maxProfiles: integer("V3_MAX_PROFILES", 12, 1, 40),
  };
}
