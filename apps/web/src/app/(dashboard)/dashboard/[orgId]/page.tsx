"use client";
import { PLAN_LIMITS, PLAN_NAMES, type Plan } from "@teletext/core";
import { useUser } from "@hexclave/next";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { TeamCard } from "@/components/dashboard/TeamCard";
import { Button, Card, Shell, StatusBadge, errorMessage, inputClass } from "@/components/dashboard/ui";

export default function OrgPage() {
  useUser({ or: "redirect" });
  const { orgId } = useParams<{ orgId: string }>();
  const id = orgId as Id<"organizations">;
  const org = useQuery(api.orgs.get, { orgId: id });
  const pages = useQuery(api.pages.list, { orgId: id });
  const free = useQuery(api.pages.freeNumbers, { orgId: id });
  const createPage = useMutation(api.pages.create);
  const changePlan = useMutation(api.orgs.changePlan);
  const router = useRouter();
  const [number, setNumber] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "review" | "published" | "archived">("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (org === undefined) return <Shell><p className="text-sm text-neutral-400">Loading...</p></Shell>;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = number === "" ? free?.[0] : number;
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const pageId = await createPage({ orgId: id, number: n, title: title || `Page ${n}` });
      router.push(`/dashboard/${orgId}/pages/${pageId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const shown = (pages ?? []).filter((p) => filter === "all" || p.status === filter);

  return (
    <Shell crumbs={[{ label: org.name }]}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl text-yellow-300">{org.name}</h1>
          <p className="font-mono text-sm text-neutral-400">
            Your pages: {org.rangeStart}-{org.rangeEnd}. Plan: {PLAN_NAMES[org.plan]} ({org.publishedCount}/{org.limits.publishedPages} published). Role: {org.role}.
          </p>
        </div>
        <Link href={`/p/${org.rangeStart}`} className="font-mono text-sm text-cyan-300 underline" target="_blank">
          Open page {org.rangeStart} in the reader
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title="Pages"
            actions={
              <select className="rounded bg-neutral-950 p-1 font-mono text-xs" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by status">
                {["all", "draft", "review", "published", "archived"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            }
          >
            {pages === undefined ? (
              <p className="text-sm text-neutral-400">Loading...</p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-neutral-400">No pages yet. Create your first page on the right.</p>
            ) : (
              <table className="w-full font-mono text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1">No.</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.pageId} className="border-t border-neutral-800">
                      <td className="py-2 text-cyan-300">{p.number}</td>
                      <td>
                        <Link href={`/dashboard/${orgId}/pages/${p.pageId}`} className="hover:underline">
                          {p.title}
                        </Link>
                        {p.isLive && <span className="ml-2 rounded bg-red-600 px-1 text-xs">LIVE</span>}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                        {p.publishAt !== undefined && <span className="ml-2 text-xs text-yellow-300">publishes {new Date(p.publishAt).toLocaleString()}</span>}
                        {p.expiresAt !== undefined && <span className="ml-2 text-xs text-yellow-300">expires {new Date(p.expiresAt).toLocaleString()}</span>}
                      </td>
                      <td className="text-xs text-neutral-400">{new Date(p.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {org.canWrite && (
            <Card title="New page">
              <form onSubmit={onCreate} className="flex flex-col gap-3">
                <label className="text-sm">
                  Page number
                  <select className={inputClass} value={number} onChange={(e) => setNumber(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">Next free ({free?.[0] ?? "..."})</option>
                    {(free ?? []).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Title
                  <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Term 1 exam results" maxLength={60} />
                </label>
                {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
                <Button disabled={busy || !free?.length}>{busy ? "Creating..." : "Create page"}</Button>
              </form>
            </Card>
          )}

          {org.role === "owner" && <TeamCard orgId={id} />}

          <Card title="Plan">
            <ul className="mb-3 space-y-1 font-mono text-xs text-neutral-300">
              {(Object.keys(PLAN_LIMITS) as Plan[]).map((p) => (
                <li key={p} className={p === org.plan ? "text-green-400" : ""}>
                  {PLAN_NAMES[p]}: {PLAN_LIMITS[p].publishedPages} pages, {PLAN_LIMITS[p].aiRequestsPerHour} AI drafts/hour
                  {p === org.plan ? " (current)" : ""}
                </li>
              ))}
            </ul>
            {org.canBill ? (
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PLAN_LIMITS) as Plan[])
                  .filter((p) => p !== org.plan)
                  .map((p) => (
                    <Button
                      key={p}
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await changePlan({ orgId: id, plan: p });
                        } catch (err) {
                          setError(errorMessage(err));
                        }
                      }}
                    >
                      Switch to {PLAN_NAMES[p]} (demo checkout)
                    </Button>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">Only the owner can change the plan.</p>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
