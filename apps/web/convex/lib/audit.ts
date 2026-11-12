// Append-only audit trail. Call from inside the mutation that does the action, so both commit together.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function recordAudit(ctx: MutationCtx, orgId: Id<"organizations">, actorId: string, action: string, detail: string): Promise<void> {
  await ctx.db.insert("auditLog", { orgId, actorId, action: action.slice(0, 40), detail: detail.slice(0, 200), at: Date.now() });
}
