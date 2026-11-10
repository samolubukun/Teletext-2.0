// Only dashboard routes mount the auth and Convex providers. The public reader stays tiny.
import { HexclaveProvider, HexclaveTheme } from "@hexclave/next";
import { Suspense } from "react";
import { ConvexClientProvider } from "@/components/dashboard/ConvexClientProvider";
import { getHexclaveClientApp, hexclaveConfigured } from "@/hexclave/client";

function SetupNeeded() {
  return (
    <main className="mx-auto max-w-xl p-6 font-mono text-sm">
      <h1 className="mb-4 text-xl text-yellow-300">Publisher dashboard not configured</h1>
      <p className="mb-2">Set these in apps/web/.env.local, then restart the dev server:</p>
      <pre className="rounded bg-neutral-900 p-3">NEXT_PUBLIC_HEXCLAVE_PROJECT_ID=...{"\n"}NEXT_PUBLIC_CONVEX_URL=...</pre>
      <p className="mt-4">See README.md, section &quot;Run it locally&quot;.</p>
    </main>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!hexclaveConfigured() || !process.env.NEXT_PUBLIC_CONVEX_URL) return <SetupNeeded />;
  return (
    <Suspense fallback={<p className="p-6 font-mono text-sm">Loading...</p>}>
      <HexclaveProvider app={getHexclaveClientApp()}>
        <HexclaveTheme>
          <ConvexClientProvider>
            <div className="min-h-screen bg-neutral-950 text-neutral-100">{children}</div>
          </ConvexClientProvider>
        </HexclaveTheme>
      </HexclaveProvider>
    </Suspense>
  );
}
