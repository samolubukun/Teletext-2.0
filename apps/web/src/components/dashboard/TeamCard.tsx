"use client";
// Owner-only team management: invite by one-time code, change roles, remove members.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, errorMessage, inputClass } from "./ui";

type InviteRole = "editor" | "viewer";

export function TeamCard({ orgId }: { orgId: Id<"organizations"> }) {
  const team = useQuery(api.team.list, { orgId });
  const createInvite = useMutation(api.team.createInvite);
  const revokeInvite = useMutation(api.team.revokeInvite);
  const setRole = useMutation(api.team.setRole);
  const removeMember = useMutation(api.team.removeMember);
  const [role, setInviteRole] = useState<InviteRole>("editor");
  const [fresh, setFresh] = useState<{ code: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // A snapshot, so rendering stays pure; refreshed whenever the team data changes.
  const [now] = useState(() => Date.now());

  const guard = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onCreate = () =>
    guard(async () => {
      const { code } = await createInvite({ orgId, role });
      setCopied(false);
      setFresh({ code, link: `${window.location.origin}/dashboard/join?code=${encodeURIComponent(code)}` });
    });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
  };

  return (
    <Card title="Team">
      <p className="mb-3 text-xs text-neutral-400">
        Invite people with a one-time code. Editors can write and publish pages. Viewers can only read the dashboard. Only owners manage the team and the plan.
      </p>

      {team === undefined ? (
        <p className="text-sm text-neutral-400">Loading...</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2" aria-label="Team members">
          {team.members.map((m) => (
            <li key={m.memberId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1 font-mono text-xs">
              <span>
                {m.label}
                {m.isYou ? <span className="text-neutral-500"> (you)</span> : null}
              </span>
              {m.role === "owner" ? (
                <span className="text-green-400">owner</span>
              ) : (
                <span className="flex items-center gap-2">
                  <select
                    className="rounded bg-neutral-950 p-1"
                    value={m.role}
                    aria-label={`Role for ${m.label}`}
                    onChange={(e) => void guard(async () => void (await setRole({ memberId: m.memberId, role: e.target.value as InviteRole })))}
                  >
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 !text-xs"
                    aria-label={`Remove ${m.label}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.label} from this organization?`)) void guard(async () => void (await removeMember({ memberId: m.memberId })));
                    }}
                  >
                    Remove
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          Invite as
          <select className={`${inputClass} mt-1`} value={role} onChange={(e) => setInviteRole(e.target.value as InviteRole)}>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <Button onClick={() => void onCreate()}>Create invite</Button>
      </div>

      {fresh && (
        <div className="mt-3 rounded border border-yellow-600 bg-yellow-950/40 p-3 text-xs" role="status">
          <p className="mb-1 text-yellow-200">Share this now. It is shown once and works for one person, for 7 days.</p>
          <p className="mb-2 font-mono text-lg text-white">{fresh.code}</p>
          <p className="mb-2 break-all font-mono text-neutral-300">{fresh.link}</p>
          <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => void copy(fresh.link)}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}

      {team && team.invites.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 font-mono text-xs font-bold uppercase text-neutral-400">Open invites</h3>
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {team.invites.map((i) => (
              <li key={i.inviteId} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1">
                <span>
                  {i.role} - {i.expiresAt < now ? <span className="text-red-400">expired</span> : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                </span>
                <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => void guard(async () => void (await revokeInvite({ inviteId: i.inviteId })))}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
