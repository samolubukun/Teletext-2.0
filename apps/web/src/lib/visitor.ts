import { createHash } from "node:crypto";

/**
 * A salted SHA-256 of the caller's IP, used only as a rate-limit key. The IP itself is never stored or logged.
 * Returns null when no salt is configured in production, so public writes fail closed rather than use a known salt.
 */
export function visitorHash(request: Request): string | null {
  const salt = process.env.RATE_LIMIT_SALT ?? (process.env.NODE_ENV === "production" ? "" : "dev-only-salt");
  if (!salt) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Reads a small JSON body. Returns undefined when it is too large or not JSON. */
export async function readSmallJson(request: Request, maxChars = 2000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxChars) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
