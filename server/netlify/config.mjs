import { hash } from "../src/util.mjs";
export function configuration(env = process.env) {
  if (env.V3_HOSTING_ENABLED !== "true")
    throw Error("Hosted backend must be explicitly enabled");
  const accessToken = env.V3_ACCESS_TOKEN,
    sessionSecret = env.V3_SESSION_SECRET,
    workerToken = env.V3_WORKER_TOKEN;
  const secrets = [accessToken, sessionSecret, workerToken];
  if (
    secrets.some((v) => typeof v !== "string" || !/^[a-f0-9]{64}$/i.test(v)) ||
    new Set(secrets).size !== 3
  )
    throw Error(
      "Configure three distinct random 64-character hexadecimal secrets",
    );
  const origin = env.V3_SITE_ORIGIN;
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== origin ||
    parsed.username ||
    parsed.password
  )
    throw Error("Canonical HTTPS origin required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.V3_OPERATOR_CONTACT ?? ""))
    throw Error("Operator contact required");
  if (env.V3_FOSSGIS_POLICY_REVIEWED !== "true")
    throw Error("Review FOSSGIS personal usage policy first");
  if (
    env.V3_EARLY_NO_TOLLS &&
    !["true", "false"].includes(env.V3_EARLY_NO_TOLLS)
  )
    throw Error("Invalid early-stop configuration");
  return {
    accessToken,
    sessionSecret,
    workerToken,
    origin,
    contact: env.V3_OPERATOR_CONTACT,
    apiToken: hash("business-api:" + sessionSecret),
    earlyNoTolls: env.V3_EARLY_NO_TOLLS === "true",
  };
}
