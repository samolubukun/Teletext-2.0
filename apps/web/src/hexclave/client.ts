// Hexclave (formerly Stack Auth) client app. Only the publisher dashboard uses it; the public
// reader never loads the auth SDK. Convex verifies the Hexclave JWT, so no server secret is needed.
import { HexclaveClientApp } from "@hexclave/next";

let app: HexclaveClientApp<true> | null = null;

export function hexclaveConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_HEXCLAVE_PROJECT_ID);
}

export function getHexclaveClientApp(): HexclaveClientApp<true> {
  if (!app) {
    app = new HexclaveClientApp({
      // The dashboard is client-only (Convex does the authorization), so browser cookies are enough.
      // "nextjs-cookie" calls next/headers cookies(), which fails while client pages are prerendered.
      tokenStore: "cookie",
      urls: { default: { type: "hosted" }, afterSignIn: "/dashboard", afterSignUp: "/dashboard", afterSignOut: "/" },
      // Session replays record dashboard screens; keep them off for publisher privacy.
      analytics: { replays: { enabled: false } },
    });
  }
  return app;
}
