"use client";
import { REPORT_NOTE_MAX, REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "@teletext/core";
import { useState } from "react";

/** Small form under the reader: tells the page's organization something is wrong. No sign-in, no personal data. */
export function ReportPage({ number }: { number: number }) {
  const [reason, setReason] = useState<ReportReason>("wrong");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, reason, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (res.ok) {
        setState("sent");
        setNote("");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMessage(data?.error?.message ?? "The report could not be sent.");
      setState("error");
    } catch {
      setMessage("You seem to be offline. Try again when you are connected.");
      setState("error");
    }
  };

  return (
    <details className="rounded border border-neutral-800 p-3 font-mono text-xs text-neutral-300">
      <summary className="cursor-pointer">Report page {number}</summary>
      {state === "sent" ? (
        <p className="mt-3 text-green-400" role="status">
          Thank you. The publisher will review page {number}.
        </p>
      ) : (
        <form onSubmit={send} className="mt-3 flex flex-col gap-2">
          <label className="flex items-center justify-between gap-2">
            What is wrong?
            <select className="bg-neutral-900 p-1" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Details (optional, no personal information)
            <textarea className="rounded border border-neutral-700 bg-neutral-950 p-2" rows={2} maxLength={REPORT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {state === "error" && (
            <p className="text-red-400" role="alert">
              {message}
            </p>
          )}
          <button className="self-start rounded border border-neutral-600 px-2 py-1" disabled={state === "sending"}>
            {state === "sending" ? "Sending..." : "Send report"}
          </button>
        </form>
      )}
    </details>
  );
}
