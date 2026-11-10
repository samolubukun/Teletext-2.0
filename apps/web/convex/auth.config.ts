// Convex verifies Hexclave (formerly Stack Auth) JWTs.
// Set HEXCLAVE_PROJECT_ID in the Convex dashboard (or `npx convex env set HEXCLAVE_PROJECT_ID <id>`).
// Docs: https://docs.hexclave.com/guides/integrations/convex/overview
import { getConvexProvidersConfig } from "@hexclave/next";
import type { AuthConfig } from "convex/server";

const projectId = process.env.HEXCLAVE_PROJECT_ID;
if (!projectId) {
  throw new Error("HEXCLAVE_PROJECT_ID is not set on this Convex deployment.");
}

export default {
  providers: getConvexProvidersConfig({ projectId }),
} satisfies AuthConfig;
