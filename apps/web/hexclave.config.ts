// Hexclave (formerly Stack Auth) project config, pushed with:
//   npx @hexclave/cli@latest config push --cloud-project-id "8434a39c-5dd4-4a5d-a833-694a52c73318" --config-file ./hexclave.config.ts
// Email + password sign-in so judges can use a test account; email codes (OTP) as a passwordless option.
import { defineHexclaveConfig } from "@hexclave/next/config";

export const config = defineHexclaveConfig({
  auth: {
    allowSignUp: true,
    password: { allowSignIn: true },
    otp: { allowSignIn: true },
  },
  domains: { allowLocalhost: true },
});
