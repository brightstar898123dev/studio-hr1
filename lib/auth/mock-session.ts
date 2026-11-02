import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed cookie session used only in MOCK_DB (demo) mode. */
export const MOCK_SESSION_COOKIE = "hr_demo_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", `hr-demo:${secret}`).update(payload).digest("base64url");
}

export function createMockSession(email: string, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const payload = `${Buffer.from(email).toString("base64url")}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyMockSession(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailB64, expStr, sig] = parts as [string, string, string];
  const expected = sign(`${emailB64}.${expStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) * 1000 < now) return null;
  return { email: Buffer.from(emailB64, "base64url").toString("utf8") };
}

export const MOCK_SESSION_MAX_AGE = MAX_AGE_SECONDS;
