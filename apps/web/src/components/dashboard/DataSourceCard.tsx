"use client";
// Link a page to a public Google Sheet or an RSS/Atom feed. The server refreshes it about every 15 minutes.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, errorMessage, inputClass } from "./ui";

export function DataSourceCard({ pageId }: { pageId: Id<"pages"> }) {
  const source = useQuery(api.dataSources.forPage, { pageId });
  const link = useMutation(api.dataSources.link);
  const unlink = useMutation(api.dataSources.unlink);
  const syncNow = useMutation(api.dataSources.syncNow);
  const [kind, setKind] = useState<"sheet" | "rss">("sheet");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Live data source">
      {source === undefined ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : source ? (
        <div className="flex flex-col gap-2 font-mono text-xs">
          <p>
            {source.kind === "sheet" ? "Google Sheet" : "Feed"}: <span className="break-all text-cyan-300">{source.url}</span>
          </p>
          <p className={source.lastStatus === "error" ? "text-red-400" : "text-neutral-300"} role="status">
            {source.lastStatus === undefined && "Waiting for the first sync..."}
            {source.lastStatus === "ok" && `Updated ${new Date(source.lastSyncedAt ?? 0).toLocaleString()}.`}
            {source.lastStatus === "unchanged" && `Checked ${new Date(source.lastSyncedAt ?? 0).toLocaleString()}. No changes.`}
            {source.lastStatus === "error" && `Last sync failed: ${source.lastNote ?? "unknown problem"} The page keeps its old content.`}
          </p>
          <p className="text-neutral-500">This page is rewritten from the source about every 15 minutes. Edits you make here are replaced. Status is not changed: publish it yourself.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => run(() => syncNow({ pageId }))}>
              Sync now
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => unlink({ pageId }))}>
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await link({ pageId, kind, url });
              setUrl("");
            });
          }}
        >
          <label className="text-sm">
            Source
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "sheet" | "rss")}>
              <option value="sheet">Google Sheet (first row is the header)</option>
              <option value="rss">News feed (RSS or Atom)</option>
            </select>
          </label>
          <label className="text-sm">
            Link
            <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "sheet" ? "https://docs.google.com/spreadsheets/d/..." : "https://example.org/feed.xml"} maxLength={500} />
          </label>
          <p className="text-xs text-neutral-400">
            {kind === "sheet"
              ? "In Google Sheets choose Share, then anyone with the link can view. Only the first 40 rows and 8 columns are used. Do not link sheets with personal data."
              : "The newest 10 items become a list of headlines."}{" "}
            Needs a Pro or Organization plan.
          </p>
          <Button disabled={busy || url.trim().length === 0}>{busy ? "Linking..." : "Link and sync"}</Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-400" role="alert">{error}</p>}
    </Card>
  );
}
