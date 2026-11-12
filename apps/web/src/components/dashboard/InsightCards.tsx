"use client";
// Dashboard cards for traffic and safety: analytics (Pro and up), reader reports, and the audit log (owner only).
import { dayKeyDaysAgo } from "@teletext/core";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, errorMessage } from "./ui";

function dayLabel(day: number): string {
  const s = String(day);
  return `${s.slice(6, 8)}/${s.slice(4, 6)}`;
}

export function AnalyticsCard({ orgId }: { orgId: Id<"organizations"> }) {
  // The first day of a 14-day window, fixed at mount because queries cannot read the clock.
  const [sinceDay] = useState(() => dayKeyDaysAgo(Date.now(), 13));
  const data = useQuery(api.traffic.summary, { orgId, sinceDay });
  return (
    <Card title="Readers, last 14 days">
      {data === undefined ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : data.locked || !data.summary ? (
        <p className="text-sm text-neutral-300">Analytics are part of the Pro and Organization plans. Use the plan card to switch (demo checkout).</p>
      ) : data.summary.total === 0 ? (
        <p className="text-sm text-neutral-400">No views yet. Open one of your pages in the reader and come back.</p>
      ) : (
        <div className="flex flex-col gap-3 font-mono text-xs">
          <p className="text-lg text-yellow-300">{data.summary.total} views</p>
          <div className="flex h-16 items-end gap-1" role="img" aria-label={`Views per day, ${data.summary.byDay.length} days`}>
            {data.summary.byDay.map((d) => {
              const max = Math.max(...data.summary!.byDay.map((x) => x.views), 1);
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${dayLabel(d.day)}: ${d.views}`}>
                  <div className="w-full bg-cyan-400" style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }} />
                </div>
              );
            })}
          </div>
          <p className="text-neutral-400">
            Phones {data.summary.byDevice.mobile}, computers {data.summary.byDevice.desktop}, other {data.summary.byDevice.other}
          </p>
          <ol className="flex flex-col gap-1">
            {data.summary.topPages.map((p) => (
              <li key={p.pageNumber} className="flex justify-between gap-2">
                <span>
                  <span className="text-cyan-300">{p.pageNumber}</span> {p.title}
                </span>
                <span>{p.views}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

export function ReportsCard({ orgId, canPublish }: { orgId: Id<"organizations">; canPublish: boolean }) {
  const reports = useQuery(api.reports.list, { orgId });
  const resolve = useMutation(api.reports.resolve);
  const [error, setError] = useState<string | null>(null);
  const act = async (reportId: Id<"reports">, action: "dismiss" | "archive") => {
    setError(null);
    try {
      await resolve({ reportId, action });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Card title={`Reader reports${reports && reports.length > 0 ? ` (${reports.length})` : ""}`}>
      {reports === undefined ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-neutral-400">No open reports.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <li key={r.reportId} className="rounded border border-neutral-800 p-2 font-mono text-xs">
              <p>
                <span className="text-cyan-300">{r.pageNumber}</span> {r.pageTitle}: <span className="text-yellow-300">{r.reasonLabel}</span>
              </p>
              {r.note && <p className="mt-1 text-neutral-300">{r.note}</p>}
              <p className="mt-1 text-neutral-500">{new Date(r.createdAt).toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => act(r.reportId, "dismiss")}>
                  Dismiss
                </Button>
                {canPublish && (
                  <Button variant="ghost" onClick={() => act(r.reportId, "archive")}>
                    Take page offline
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-400" role="alert">{error}</p>}
    </Card>
  );
}

export function AuditCard({ orgId }: { orgId: Id<"organizations"> }) {
  const rows = useQuery(api.audit.list, { orgId });
  return (
    <Card title="Activity log">
      {rows === undefined ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing recorded yet.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto font-mono text-xs">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className="border-t border-neutral-800 pt-1">
              <span className="text-neutral-500">{new Date(r.at).toLocaleString()}</span> <span className="text-cyan-300">{r.by}</span> {r.detail}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
