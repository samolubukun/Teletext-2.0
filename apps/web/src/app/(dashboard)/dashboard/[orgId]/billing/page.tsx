"use client";
// DEMO checkout. It switches the plan so the real limits can be seen. No payment is taken and
// the card fields are checked in the browser only: they are never sent, stored or logged.
import { PLAN_LIMITS, PLAN_NAMES, type Plan } from "@teletext/core";
import { useUser } from "@hexclave/next";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button, Card, Shell, errorMessage, inputClass } from "@/components/dashboard/ui";
import { digitsOnly, expiryValid, luhnValid } from "@/lib/fakeCard";

/** Demo prices only. */
const PRICE: Record<Plan, string> = { free: "N0", pro: "N5,000 / month", org: "N20,000 / month" };
const TEST_CARD = "4242 4242 4242 4242";

export default function BillingPage() {
  useUser({ or: "redirect" });
  const { orgId } = useParams<{ orgId: string }>();
  const id = orgId as Id<"organizations">;
  const org = useQuery(api.orgs.get, { orgId: id });
  const changePlan = useMutation(api.orgs.changePlan);
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>("pro");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  // A snapshot of the month, so rendering and validation stay pure.
  const [today] = useState(() => new Date());

  if (org === undefined) return <Shell><p className="text-sm text-neutral-400">Loading...</p></Shell>;
  const crumbs = [{ href: `/dashboard/${orgId}`, label: org.name }, { label: "Plan and checkout" }];

  if (!org.canBill) {
    return (
      <Shell crumbs={crumbs}>
        <p className="text-sm text-neutral-300">Only the owner can change the plan.</p>
      </Shell>
    );
  }

  const downgrade = plan === "free";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!downgrade) {
      if (name.trim().length < 2) return setError("Enter the name on the card.");
      if (!luhnValid(card)) return setError("That card number does not look right. Use the demo card shown below.");
      if (!expiryValid(expiry, today.getFullYear(), today.getMonth() + 1)) return setError("Enter a future expiry date as MM/YY.");
      if (!/^\d{3,4}$/.test(digitsOnly(cvc))) return setError("Enter the 3 or 4 digit security code.");
    }
    setBusy(true);
    try {
      await changePlan({ orgId: id, plan });
      setDone(plan);
      setCard("");
      setCvc("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell crumbs={crumbs}>
      <h1 className="mb-1 font-mono text-2xl text-yellow-300">Plan and checkout</h1>
      <p className="mb-4 rounded border border-yellow-700 bg-yellow-950/40 p-3 text-sm text-yellow-200" role="note">
        Demo checkout. No money is taken and nothing you type here is sent or stored. The plan limits are real.
      </p>

      {done ? (
        <Card title="Done">
          <p className="mb-3 text-sm text-green-400" role="status">
            Your plan is now {PLAN_NAMES[done]}. Receipt DEMO-{String(today.getTime()).slice(-6)} (not a real receipt).
          </p>
          <Button onClick={() => router.push(`/dashboard/${orgId}`)}>Back to the dashboard</Button>
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
          <Card title="Choose a plan">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Plan</legend>
              {(Object.keys(PLAN_LIMITS) as Plan[]).map((p) => (
                <label key={p} className={`flex cursor-pointer items-start gap-2 rounded border p-2 font-mono text-xs ${plan === p ? "border-cyan-400" : "border-neutral-800"}`}>
                  <input type="radio" name="plan" checked={plan === p} onChange={() => setPlan(p)} className="mt-1" />
                  <span>
                    <span className="text-sm text-white">
                      {PLAN_NAMES[p]} <span className="text-neutral-400">{PRICE[p]}</span>
                      {p === org.plan ? <span className="ml-2 text-green-400">(current)</span> : null}
                    </span>
                    <br />
                    {PLAN_LIMITS[p].publishedPages} published pages, {PLAN_LIMITS[p].editors} editors, {PLAN_LIMITS[p].aiRequestsPerHour} AI drafts/hour
                    {PLAN_LIMITS[p].scheduling ? ", scheduling" : ""}
                    {PLAN_LIMITS[p].analytics ? ", analytics" : ""}
                  </span>
                </label>
              ))}
            </fieldset>
          </Card>

          <Card title={downgrade ? "Switch to Free" : "Payment (demo)"}>
            {downgrade ? (
              <p className="mb-3 text-sm text-neutral-300">No payment is needed. If you have more published pages than the Free plan allows, archive some first.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="text-sm">
                  Name on card
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={60} />
                </label>
                <label className="text-sm">
                  Card number
                  <input className={inputClass} value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" autoComplete="off" placeholder={TEST_CARD} maxLength={23} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Expiry (MM/YY)
                    <input className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} autoComplete="off" placeholder="12/30" maxLength={5} />
                  </label>
                  <label className="text-sm">
                    Security code
                    <input className={inputClass} value={cvc} onChange={(e) => setCvc(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="123" maxLength={4} />
                  </label>
                </div>
                <p className="text-xs text-neutral-400">
                  Demo card: <button type="button" className="text-cyan-300 underline" onClick={() => { setCard(TEST_CARD); setExpiry("12/30"); setCvc("123"); if (!name) setName("Demo Owner"); }}>fill it in</button>
                </p>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
            <div className="mt-4">
              <Button disabled={busy || plan === org.plan}>{plan === org.plan ? "This is your plan" : busy ? "Working..." : downgrade ? "Switch to Free" : `Pay ${PRICE[plan]} (demo)`}</Button>
            </div>
          </Card>
        </form>
      )}
    </Shell>
  );
}
