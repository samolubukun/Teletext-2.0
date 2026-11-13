"use client";
// Join a team with a one-time invite code (link: /dashboard/join?code=ABCD-EFGH-JKMN).
import { useUser } from "@hexclave/next";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Button, Card, Shell, errorMessage, inputClass } from "@/components/dashboard/ui";

function JoinForm() {
  useUser({ or: "redirect" });
  const router = useRouter();
  const params = useSearchParams();
  const accept = useMutation(api.team.acceptInvite);
  const [code, setCode] = useState(params.get("code") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await accept({ code });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/dashboard/${result.orgId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Join a team">
      <form onSubmit={onJoin} className="flex flex-col gap-3">
        <label className="text-sm" htmlFor="invite-code">
          Invite code from the organization owner
        </label>
        <input
          id="invite-code"
          className={`${inputClass} uppercase`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH-JKMN"
          autoComplete="off"
          maxLength={20}
          required
        />
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 12}>{busy ? "Joining..." : "Join"}</Button>
      </form>
    </Card>
  );
}

export default function JoinPage() {
  return (
    <Shell crumbs={[{ label: "Join a team" }]}>
      <div className="max-w-md">
        <Suspense fallback={<p className="text-sm text-neutral-400">Loading...</p>}>
          <JoinForm />
        </Suspense>
      </div>
    </Shell>
  );
}
