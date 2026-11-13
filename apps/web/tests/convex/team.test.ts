/// <reference types="vite/client" />
// Team management: invites, roles, removal. Fake user ids only.
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js"]);
type T = ReturnType<typeof convexTest>;

const as = (t: T, subject: string, extra: Record<string, string> = {}) => t.withIdentity({ subject, ...extra });
const owner = (t: T) => as(t, "user_owner_a", { name: "Ada Owner" });

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(new RegExp(code));
}

describe("team", () => {
  let t: T;
  let orgA: Id<"organizations">;
  let orgB: Id<"organizations">;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    orgA = await owner(t).mutation(api.orgs.create, { name: "Greenfield High" });
    orgB = await as(t, "user_owner_b").mutation(api.orgs.create, { name: "Lakeside Clinic" });
  });

  const invite = async (role: "editor" | "viewer" = "editor") => (await owner(t).mutation(api.team.createInvite, { orgId: orgA, role })).code;

  it("an invite code lets a new user join with the invited role, once", async () => {
    const code = await invite("editor");
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const joined = await as(t, "user_new", { name: "Bola Editor" }).mutation(api.team.acceptInvite, { code });
    expect(joined).toMatchObject({ ok: true, orgId: orgA });
    // The new member can now write; the code is spent.
    const detail = await as(t, "user_new").query(api.orgs.get, { orgId: orgA });
    expect(detail.role).toBe("editor");
    expect(detail.canWrite).toBe(true);
    expect(await as(t, "user_other").mutation(api.team.acceptInvite, { code })).toMatchObject({ ok: false, code: "invalid_invite" });
  });

  it("codes are case and dash insensitive", async () => {
    const code = await invite("viewer");
    await as(t, "user_new").mutation(api.team.acceptInvite, { code: code.toLowerCase().replaceAll("-", " ") });
    expect((await as(t, "user_new").query(api.orgs.get, { orgId: orgA })).role).toBe("viewer");
  });

  it("only a hash is stored, never the code", async () => {
    const code = await invite();
    const rows = await t.run(async (ctx) => ctx.db.query("invites").collect());
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(code.replaceAll("-", ""));
    expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("unknown, malformed, expired and revoked codes all give the same error", async () => {
    const expired = await invite();
    await t.run(async (ctx) => {
      const row = await ctx.db.query("invites").first();
      if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1000 });
    });
    const revoked = await invite();
    const list = await owner(t).query(api.team.list, { orgId: orgA });
    const toRevoke = list.invites.find((i) => i.expiresAt > Date.now());
    if (!toRevoke) throw new Error("expected an open invite");
    await owner(t).mutation(api.team.revokeInvite, { inviteId: toRevoke.inviteId });

    const results = [];
    for (const code of ["ZZZZ-ZZZZ-ZZZZ", "short", "", expired, revoked]) {
      results.push(await as(t, "user_new").mutation(api.team.acceptInvite, { code }));
    }
    expect(results.every((r) => !r.ok && r.code === "invalid_invite")).toBe(true);
    expect(new Set(results.map((r) => (r.ok ? "" : r.message))).size).toBe(1);
  });

  it("guessing is rate limited: 8 wrong codes lock that person out for 10 minutes, even for a correct code", async () => {
    const good = await invite("editor");
    const guesser = as(t, "user_guesser");
    for (let i = 0; i < 8; i++) {
      expect(await guesser.mutation(api.team.acceptInvite, { code: `AAAA-BBBB-CC${i}D` })).toMatchObject({ code: "invalid_invite" });
    }
    expect(await guesser.mutation(api.team.acceptInvite, { code: good })).toMatchObject({ ok: false, code: "rate" });
    // Another person is not affected, and the code was never spent by the locked-out attempt.
    expect(await as(t, "user_honest").mutation(api.team.acceptInvite, { code: good })).toMatchObject({ ok: true });
  });

  it("the lock-out ends after 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const good = await invite("viewer");
      const guesser = as(t, "user_guesser");
      for (let i = 0; i < 8; i++) await guesser.mutation(api.team.acceptInvite, { code: `AAAA-BBBB-CC${i}D` });
      expect(await guesser.mutation(api.team.acceptInvite, { code: good })).toMatchObject({ code: "rate" });
      vi.setSystemTime(Date.now() + 11 * 60_000);
      expect(await guesser.mutation(api.team.acceptInvite, { code: good })).toMatchObject({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("signed-out callers cannot accept, and existing members cannot re-join", async () => {
    const code = await invite();
    await rejectsWith(t.mutation(api.team.acceptInvite, { code }), "unauthenticated");
    await rejectsWith(owner(t).mutation(api.team.acceptInvite, { code }), "already_member");
  });

  it("only the owner can create invites, list the team or change members", async () => {
    const code = await invite("editor");
    await as(t, "user_editor").mutation(api.team.acceptInvite, { code });
    const viewerCode = await invite("viewer");
    await as(t, "user_viewer").mutation(api.team.acceptInvite, { code: viewerCode });

    for (const user of ["user_editor", "user_viewer", "user_outsider"]) {
      await rejectsWith(as(t, user).mutation(api.team.createInvite, { orgId: orgA, role: "editor" }), "forbidden");
      await rejectsWith(as(t, user).query(api.team.list, { orgId: orgA }), "forbidden");
    }
    const team = await owner(t).query(api.team.list, { orgId: orgA });
    const editor = team.members.find((m) => m.role === "editor");
    if (!editor) throw new Error("expected an editor");
    await rejectsWith(as(t, "user_editor").mutation(api.team.setRole, { memberId: editor.memberId, role: "viewer" }), "forbidden");
    await rejectsWith(as(t, "user_editor").mutation(api.team.removeMember, { memberId: editor.memberId }), "forbidden");
  });

  it("the owner of another organization cannot manage this team", async () => {
    const code = await invite("editor");
    await as(t, "user_editor").mutation(api.team.acceptInvite, { code });
    const team = await owner(t).query(api.team.list, { orgId: orgA });
    const editor = team.members.find((m) => m.role === "editor");
    if (!editor) throw new Error("expected an editor");
    const ownerB = as(t, "user_owner_b");
    await rejectsWith(ownerB.mutation(api.team.createInvite, { orgId: orgA, role: "editor" }), "forbidden");
    await rejectsWith(ownerB.mutation(api.team.setRole, { memberId: editor.memberId, role: "viewer" }), "forbidden");
    await rejectsWith(ownerB.mutation(api.team.removeMember, { memberId: editor.memberId }), "forbidden");
    const inviteId = (await (async () => { await invite(); return (await owner(t).query(api.team.list, { orgId: orgA })).invites[0]; })())?.inviteId;
    if (!inviteId) throw new Error("expected an invite");
    await rejectsWith(ownerB.mutation(api.team.revokeInvite, { inviteId }), "forbidden");
    // Org B is untouched.
    expect((await ownerB.query(api.team.list, { orgId: orgB })).members).toHaveLength(1);
  });

  it("the owner can change roles and remove members; removed members lose access at once", async () => {
    await as(t, "user_editor", { email: "bola@example.com" }).mutation(api.team.acceptInvite, { code: await invite("editor") });
    let team = await owner(t).query(api.team.list, { orgId: orgA });
    const member = team.members.find((m) => m.role === "editor");
    if (!member) throw new Error("expected an editor");
    expect(member.label).toBe("bola@example.com");

    await owner(t).mutation(api.team.setRole, { memberId: member.memberId, role: "viewer" });
    expect((await as(t, "user_editor").query(api.orgs.get, { orgId: orgA })).canWrite).toBe(false);

    await owner(t).mutation(api.team.removeMember, { memberId: member.memberId });
    await rejectsWith(as(t, "user_editor").query(api.orgs.get, { orgId: orgA }), "forbidden");
    team = await owner(t).query(api.team.list, { orgId: orgA });
    expect(team.members).toHaveLength(1);
  });

  it("an owner can never be demoted, removed or created through the team functions", async () => {
    const team = await owner(t).query(api.team.list, { orgId: orgA });
    const me = team.members.find((m) => m.isYou);
    if (!me) throw new Error("expected the owner");
    expect(me.role).toBe("owner");
    await rejectsWith(owner(t).mutation(api.team.setRole, { memberId: me.memberId, role: "viewer" }), "owner");
    await rejectsWith(owner(t).mutation(api.team.removeMember, { memberId: me.memberId }), "owner");
    // The validator only allows editor or viewer invites, so nobody can be invited as owner.
    await expect(owner(t).mutation(api.team.createInvite, { orgId: orgA, role: "owner" as unknown as "editor" })).rejects.toThrow();
  });

  it("limits open invites per organization", async () => {
    for (let i = 0; i < 10; i++) await invite();
    await rejectsWith(owner(t).mutation(api.team.createInvite, { orgId: orgA, role: "editor" }), "limit");
  });

  it("a member of org B who joins org A keeps separate roles per organization", async () => {
    await as(t, "user_owner_b").mutation(api.team.acceptInvite, { code: await invite("viewer") });
    expect((await as(t, "user_owner_b").query(api.orgs.get, { orgId: orgA })).role).toBe("viewer");
    expect((await as(t, "user_owner_b").query(api.orgs.get, { orgId: orgB })).role).toBe("owner");
  });
});
