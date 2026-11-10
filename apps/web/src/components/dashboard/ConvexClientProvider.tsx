"use client";
import { useHexclaveApp } from "@hexclave/next";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";

/** Convex client for the dashboard, authenticated with the Hexclave session token. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const hexclave = useHexclaveApp();
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` in apps/web.");
    const c = new ConvexReactClient(url);
    c.setAuth(hexclave.getConvexClientAuth({}));
    return c;
  });
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
