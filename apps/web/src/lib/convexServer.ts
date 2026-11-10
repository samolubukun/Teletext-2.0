/** True when the Convex URL is configured. Route handlers return a clear 503 otherwise. */
export function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
}

export function cacheHeaders(seconds: number): HeadersInit {
  return {
    "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=600`,
    "Content-Type": "application/json; charset=utf-8",
  };
}
