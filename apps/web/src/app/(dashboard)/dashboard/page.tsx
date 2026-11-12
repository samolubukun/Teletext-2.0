"use client";
import { useUser } from "@hexclave/next";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Button, Card, Shell, errorMessage, inputClass } from "@/components/dashboard/ui";

const CATEGORIES = ["Schools", "Health", "Transport", "Council", "Community", "News"];

export default function DashboardHome() {
  const user = useUser({ or: "redirect" });
  const orgs = useQuery(api.orgs.mine);
  const createOrg = useMutation(api.orgs.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Schools");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const orgId = await createOrg({ name, category });
      router.push(`/dashboard/${orgId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="mb-1 font-mono text-2xl text-yellow-300">Hello{user.displayName ? `, ${user.displayName}` : ""}</h1>
      <p className="mb-6 text-sm text-neutral-400">Publish to the public in two minutes. Readers type your page number.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Your organizations">
          {orgs === undefined ? (
            <p className="text-sm text-neutral-400">Loading...</p>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-neutral-400">You have no organizations yet. Create one to get your own page numbers.</p>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {orgs.map((o) => (
                <li key={o.orgId} className="flex items-center justify-between py-2">
                  <Link href={`/dashboard/${o.orgId}`} className="font-mono text-cyan-300 hover:underline">
                    {o.name}
                  </Link>
                  <span className="font-mono text-xs text-neutral-400">
                    pages {o.rangeStart}-{o.rangeEnd} - {o.plan} - {o.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Join a team">
          <p className="mb-3 text-sm text-neutral-400">Got an invite code from an organization owner?</p>
          <Link href="/dashboard/join" className="font-mono text-sm text-cyan-300 underline">
            Enter invite code
          </Link>
        </Card>

        <Card title="Create an organization">
          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <label className="text-sm">
              Name
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Greenfield High" required minLength={2} maxLength={60} />
            </label>
            <label className="text-sm">
              Category (groups you on page 100)
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            <Button disabled={busy || name.trim().length < 2}>{busy ? "Creating..." : "Create and get 50 page numbers"}</Button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
