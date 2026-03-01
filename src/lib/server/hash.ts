import { createHash, timingSafeEqual } from "node:crypto";

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function verifyToken(raw: string, hashed: string) {
  const incoming = Buffer.from(hashToken(raw), "utf8");
  const target = Buffer.from(hashed, "utf8");

  if (incoming.length !== target.length) return false;
  return timingSafeEqual(incoming, target);
}
