// Hexclave (formerly Stack Auth) project config, pushed with:
//   npx @hexclave/cli@latest config push --cloud-project-id "8434a39c-5dd4-4a5d-a833-694a52c73318" --config-file ./hexclave.config.ts
// Sign-in methods: Google and email + password, on one page (no email-code tab).
// Domains (localhost, the Vercel URL) are environment-level settings: the cloud rejects them in
// this branch config, so add the production domain in the Hexclave dashboard after deploying.
import { defineHexclaveConfig } from "@hexclave/next/config";

export const config = defineHexclaveConfig({
  auth: {
    allowSignUp: true,
    password: { allowSignIn: true },
    otp: { allowSignIn: false },
    oauth: {
      providers: {
        google: { type: "google", allowSignIn: true },
      },
    },
  },
});
