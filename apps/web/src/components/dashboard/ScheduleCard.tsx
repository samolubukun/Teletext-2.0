"use client";
// Schedule publishing and expiry for one page. Times are entered in the browser's time zone.
import { validateSchedule, type PageStatus } from "@teletext/core";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, Card, errorMessage, inputClass } from "./ui";

/** Epoch ms -> "2026-11-12T14:30" for <input type="datetime-local">, in local time. */
function toLocalInput(ms: number | undefined): string {
  if (ms === undefined) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function describe(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ScheduleCard(props: {
  pageId: Id<"pages">;
  status: PageStatus;
  publishAt: number | undefined;
  expiresAt: number | undefined;
  scheduleNote: string | undefined;
  uncheckedFacts: number;
}) {
  const setSchedule = useMutation(api.pages.setSchedule);
  const [publishLocal, setPublishLocal] = useState(toLocalInput(props.publishAt));
  const [expiresLocal, setExpiresLocal] = useState(toLocalInput(props.expiresAt));
  const [confirmFacts, setConfirmFacts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // A snapshot taken when the card mounts; the server re-checks with its own clock.
  const [openedAt] = useState(() => Date.now());

  if (props.status === "archived") return null;
  const canSchedulePublish = props.status === "draft" || props.status === "review";

  const publishAt = fromLocalInput(publishLocal);
  const expiresAt = fromLocalInput(expiresLocal);
  const problems = validateSchedule({ status: props.status, publishAt: canSchedulePublish ? publishAt : null, expiresAt }, openedAt);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await setSchedule({
        pageId: props.pageId,
        publishAt: canSchedulePublish ? publishAt : null,
        expiresAt,
        confirmFacts,
      });
      setMessage({ kind: "ok", text: "Schedule saved." });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Schedule">
      <p className="mb-3 text-xs text-neutral-400">
        Times use your device&apos;s time zone. The page publishes or expires on its own at the time you pick; you do not need to be signed in.
      </p>

      {props.scheduleNote && (
        <p className="mb-3 rounded border border-red-700 p-2 text-sm text-red-300" role="alert">
          {props.scheduleNote}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {canSchedulePublish && (
          <label className="text-sm">
            Publish at
            <input type="datetime-local" className={inputClass} value={publishLocal} onChange={(e) => setPublishLocal(e.target.value)} />
          </label>
        )}
        <label className="text-sm">
          Expire at (the page is archived automatically)
          <input type="datetime-local" className={inputClass} value={expiresLocal} onChange={(e) => setExpiresLocal(e.target.value)} />
        </label>

        {canSchedulePublish && publishAt !== null && props.uncheckedFacts > 0 && (
          <label className="flex items-start gap-2 rounded border border-red-700 p-2 text-sm text-red-200">
            <input type="checkbox" checked={confirmFacts} onChange={(e) => setConfirmFacts(e.target.checked)} />I checked the {props.uncheckedFacts} value(s) that are not in my source, and they are correct.
          </label>
        )}

        {problems.length > 0 && (
          <ul className="text-sm text-yellow-200">
            {problems.map((p) => (
              <li key={p.field + p.message}>
                {p.message} <span className="text-neutral-400">{p.fix}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={busy || problems.length > 0}>
            {busy ? "Saving..." : "Save schedule"}
          </Button>
          {(props.publishAt !== undefined || props.expiresAt !== undefined) && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPublishLocal("");
                setExpiresLocal("");
                setBusy(true);
                setSchedule({ pageId: props.pageId, publishAt: null, expiresAt: null })
                  .then(() => setMessage({ kind: "ok", text: "Schedule cleared." }))
                  .catch((e: unknown) => setMessage({ kind: "error", text: errorMessage(e) }))
                  .finally(() => setBusy(false));
              }}
            >
              Clear schedule
            </Button>
          )}
        </div>

        {(props.publishAt !== undefined || props.expiresAt !== undefined) && (
          <p className="font-mono text-xs text-green-400">
            {props.publishAt !== undefined ? `Publishes ${describe(props.publishAt)}. ` : ""}
            {props.expiresAt !== undefined ? `Expires ${describe(props.expiresAt)}.` : ""}
          </p>
        )}
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-400" : "text-green-400"}`}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
