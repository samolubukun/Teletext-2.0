"use client";
// Printable poster for one page: big page number, QR code, address. Print with the browser's print dialog.
import { useUser } from "@hexclave/next";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";
import { Button, Shell } from "@/components/dashboard/ui";
import { displayAddress, pageLink } from "@/lib/pageLink";

type Theme = "light" | "teletext";

export default function PosterPage() {
  useUser({ or: "redirect" });
  const { orgId, pageId } = useParams<{ orgId: string; pageId: string }>();
  const data = useQuery(api.pages.get, { pageId: pageId as Id<"pages"> });
  const [theme, setTheme] = useState<Theme>("light");
  // The address never changes while the page is open, so there is nothing to subscribe to. The server snapshot is "".
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );
  const [qr, setQr] = useState<string | null>(null);

  const link = data && origin ? pageLink(origin, data.number) : null;

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    // High error correction survives a smudged or folded poster. The data URL is a PNG, so it prints crisply.
    QRCode.toDataURL(link, { errorCorrectionLevel: "H", margin: 2, width: 720, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (data === undefined) {
    return (
      <Shell>
        <p className="text-sm text-neutral-400">Loading...</p>
      </Shell>
    );
  }

  const dark = theme === "teletext";
  const address = displayAddress(origin);

  return (
    <Shell crumbs={[{ href: `/dashboard/${orgId}`, label: data.orgName }, { href: `/dashboard/${orgId}/pages/${pageId}`, label: `Page ${data.number}` }, { label: "Poster" }]}>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Button onClick={() => window.print()}>Print poster</Button>
        <Button variant="ghost" onClick={() => setTheme(dark ? "light" : "teletext")} aria-pressed={dark}>
          {dark ? "Use the ink-saving look" : "Use the teletext look"}
        </Button>
        <Link href={`/dashboard/${orgId}/pages/${pageId}`} className="font-mono text-sm text-cyan-300 underline">
          Back to the page
        </Link>
      </div>

      {data.status !== "published" && (
        <p role="status" className="mb-4 rounded border border-yellow-600 bg-yellow-950/40 p-3 text-sm text-yellow-200 print:hidden">
          Page {data.number} is {data.status}, not published. Anyone who scans this poster will see &quot;page not found&quot; until you publish it.
        </p>
      )}

      {/* The poster itself: A4 portrait. Everything inside is what gets printed. */}
      <article
        aria-label={`Poster for page ${data.number}`}
        className={`mx-auto flex aspect-[210/297] w-full max-w-[640px] flex-col items-center justify-between rounded border p-8 text-center font-mono print:max-w-none print:border-0 print:rounded-none ${
          dark ? "border-neutral-700 bg-black text-white" : "border-neutral-300 bg-white text-black"
        }`}
      >
        <div>
          <p className={`text-xl font-bold tracking-widest ${dark ? "text-cyan-300" : "text-neutral-700"}`}>{data.orgName.toUpperCase()}</p>
          <h1 className={`mt-4 text-3xl font-bold leading-tight ${dark ? "text-yellow-300" : "text-black"}`}>{data.title}</h1>
          <p className="mt-3 text-xl">Read it on your phone. No app. No login.</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {qr && link ? (
            // A data URL, not a remote image, so next/image optimisation does not apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code that opens page ${data.number} at ${link}`} width={300} height={300} className="h-[300px] w-[300px]" />
          ) : (
            <div className="flex h-[300px] w-[300px] items-center justify-center border border-dashed text-sm">Making the QR code...</div>
          )}
          <p className="text-lg">Scan with your phone camera</p>
        </div>

        <div>
          <p className="text-lg">or go to</p>
          <p className="text-2xl font-bold">{address || "..."}</p>
          <p className="mt-3 text-lg">and type page</p>
          <p className={`text-8xl font-bold leading-none tracking-widest ${dark ? "text-yellow-300" : "text-black"}`}>{data.number}</p>
        </div>
      </article>

      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } body { background: #fff !important; } }`}</style>
    </Shell>
  );
}
