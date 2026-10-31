import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash } from "../src/util.mjs";
export const cookieName = "__Host-route-v3";
const equal = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const matchesToken = (actual, expected) =>
  typeof actual === "string" && equal(hash(actual), hash(expected));
const sign = (value, secret) =>
  createHmac("sha256", secret).update(value).digest("base64url");
export function sessionCookie(secret, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + 8 * 3600}.${randomBytes(24).toString("base64url")}`;
  return `${cookieName}=${payload}.${sign(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}
export const clearCookie = `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export function sessionValid(request, secret, now = Date.now()) {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(cookieName + "="));
  if (values.length !== 1) return false;
  const value = values[0].slice(cookieName.length + 1);
  if (value.length > 200) return false;
  const [expiry, nonce, signature, extra] = value.split(".");
  if (
    extra ||
    !/^\d{10}$/.test(expiry ?? "") ||
    !/^[\w-]{32}$/.test(nonce ?? "") ||
    !signature
  )
    return false;
  const seconds = Math.floor(now / 1000);
  return (
    Number(expiry) > seconds &&
    Number(expiry) <= seconds + 8 * 3600 &&
    equal(signature, sign(`${expiry}.${nonce}`, secret))
  );
}
