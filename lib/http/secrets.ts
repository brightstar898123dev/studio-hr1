import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (hashes first so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y) && a.length === b.length;
}

/** Checks "Authorization: Bearer <secret>". */
export function hasBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return !!m && safeEqual(m[1]!.trim(), secret);
}
