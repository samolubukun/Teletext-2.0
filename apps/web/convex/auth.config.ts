// Convex verifies Hexclave (formerly Stack Auth) JWTs.
// Set HEXCLAVE_PROJECT_ID on the Convex deployment: `npx convex env set HEXCLAVE_PROJECT_ID <id>`.
// This mirrors getConvexProvidersConfig() from @hexclave/next (v1.0.135). We inline it because the
// package's import chain pulls in Next.js internals that the Convex bundler cannot evaluate.
// Docs: https://docs.hexclave.com/guides/integrations/convex/overview
import type { AuthConfig } from "convex/server";

const projectId = process.env.HEXCLAVE_PROJECT_ID;
if (!projectId) {
  throw new Error("HEXCLAVE_PROJECT_ID is not set on this Convex deployment.");
}
// Convex requires every env var read here to be set, so the default API host is fixed.
const baseUrl = "https://api.hexclave.com";
const id = encodeURIComponent(projectId);

export default {
  providers: [
    {
      type: "customJwt",
      issuer: `${baseUrl}/api/v1/projects/${id}`,
      jwks: `${baseUrl}/api/v1/projects/${id}/.well-known/jwks.json`,
      algorithm: "ES256",
    },
    {
      type: "customJwt",
      issuer: `${baseUrl}/api/v1/projects-anonymous-users/${id}`,
      jwks: `${baseUrl}/api/v1/projects/${id}/.well-known/jwks.json?include_anonymous=true`,
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;
