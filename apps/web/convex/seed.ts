// Demo content (fake people, fake numbers). Run once: `npx convex run seed:run`.
// Give a signed-in user ownership of Greenfield High: `npx convex run seed:claimDemo '{"userId":"<hexclave user id>"}'`.
import { defaultFastext, type Block, type FastextLink } from "@teletext/core";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { renderForOrg, searchTextOf } from "./lib/renderPage";

const SEED_USER = "seed";

type SeedPage = { number: number; blocks: Block[]; fastext?: FastextLink[]; live?: boolean };
type SeedOrg = { name: string; slug: string; category: string; range: [number, number]; plan: "free" | "pro" | "org"; pages: SeedPage[] };

const fx = (red: [string, number], green: [string, number], yellow: [string, number], blue: [string, number]): FastextLink[] => [
  { color: "red", label: red[0], page: red[1] },
  { color: "green", label: green[0], page: green[1] },
  { color: "yellow", label: yellow[0], page: yellow[1] },
  { color: "blue", label: blue[0], page: blue[1] },
];

const ORGS: SeedOrg[] = [
  {
    name: "Teletext 2.0",
    slug: "teletext",
    category: "Service",
    range: [101, 199],
    plan: "org",
    pages: [
      {
        number: 101,
        fastext: fx(["INDEX", 100], ["PUBLISH", 102], ["SCHOOLS", 400], ["HEALTH", 500]),
        blocks: [
          { type: "heading", level: 1, text: "HOW TO USE TELETEXT" },
          { type: "paragraph", text: "Type a three-digit page number to go to a page. Page 100 is the index." },
          {
            type: "keyvalue",
            rows: [
              { label: "Left / Right", value: "next or previous screen" },
              { label: "Up / Down", value: "next or previous page" },
              { label: "R G Y B", value: "the coloured buttons" },
              { label: "Backspace", value: "fix a typed number" },
            ],
          },
          { type: "paragraph", text: "Pages work offline once you have read them. The time on each page shows when it was updated." },
        ],
      },
      {
        number: 102,
        fastext: fx(["INDEX", 100], ["HELP", 101], ["SCHOOLS", 400], ["TRANSPORT", 600]),
        blocks: [
          { type: "heading", level: 1, text: "PUBLISH ON TELETEXT" },
          { type: "paragraph", text: "Schools, clinics, councils and community groups can publish free pages in two minutes." },
          { type: "bullets", items: ["Sign up and get your own page numbers.", "Paste a notice. AI turns it into a page.", "Check the highlighted facts and publish."] },
          { type: "paragraph", text: "Readers need no app, no login and very little data." },
        ],
      },
    ],
  },
  {
    name: "Greenfield High",
    slug: "greenfield-high",
    category: "Schools",
    range: [400, 449],
    plan: "pro",
    pages: [
      {
        number: 400,
        fastext: fx(["INDEX", 100], ["RESULTS", 412], ["DATES", 420], ["ALERTS", 430]),
        blocks: [
          { type: "heading", level: 1, text: "GREENFIELD HIGH" },
          { type: "link", label: "Term 1 exam results", page: 412 },
          { type: "link", label: "Results table JSS3 maths", page: 413 },
          { type: "link", label: "Term dates 2026/27", page: 420 },
          { type: "link", label: "Closures and alerts", page: 430 },
          { type: "paragraph", text: "School office: Mon to Fri, 08:00 to 16:00." },
        ],
      },
      {
        number: 412,
        fastext: fx(["INDEX", 100], ["SCHOOL", 400], ["TABLE", 413], ["DATES", 420]),
        blocks: [
          { type: "heading", level: 1, text: "TERM 1 EXAM RESULTS" },
          { type: "paragraph", text: "Results are now available." },
          {
            type: "keyvalue",
            rows: [
              { label: "Check results:", value: "page 413" },
              { label: "Collect reports:", value: "Fri 13 Nov" },
              { label: "Time:", value: "09:00 - 15:00" },
              { label: "Place:", value: "Main hall" },
            ],
          },
          { type: "paragraph", text: "Questions? Call the office: 0800 000 0000" },
        ],
      },
      {
        number: 413,
        fastext: fx(["INDEX", 100], ["SCHOOL", 400], ["NOTICE", 412], ["DATES", 420]),
        blocks: [
          { type: "heading", level: 2, text: "JSS3 MATHS RESULTS - TERM 1" },
          {
            type: "table",
            header: ["ID", "Name", "Grade", "Score"],
            rows: [
              ["1001", "A. Bello", "A", "86"], ["1002", "C. Eze", "B", "74"], ["1003", "F. Musa", "C", "61"],
              ["1004", "G. Okoro", "A", "91"], ["1005", "H. Ade", "B", "70"], ["1006", "I. Nwosu", "B", "77"],
              ["1007", "J. Sani", "C", "58"], ["1008", "K. Obi", "A", "88"], ["1009", "L. Yusuf", "B", "72"],
              ["1010", "M. Lawal", "C", "60"], ["1011", "N. Uche", "A", "84"], ["1012", "O. Bala", "B", "69"],
              ["1013", "P. Ojo", "B", "75"], ["1014", "Q. Danjuma", "A", "93"], ["1015", "R. Ibe", "C", "55"],
              ["1016", "S. Ayo", "B", "71"], ["1017", "T. Garba", "A", "85"], ["1018", "U. Eke", "B", "73"],
              ["1019", "V. Ali", "C", "62"], ["1020", "W. Chukwu", "A", "89"], ["1021", "X. Bassey", "B", "76"],
              ["1022", "Y. Idris", "B", "68"], ["1023", "Z. Femi", "A", "90"], ["1024", "A. Umar", "C", "57"],
            ],
          },
          { type: "paragraph", text: "Names are fake demo data." },
        ],
      },
      {
        number: 420,
        fastext: fx(["INDEX", 100], ["SCHOOL", 400], ["RESULTS", 412], ["ALERTS", 430]),
        blocks: [
          { type: "heading", level: 1, text: "TERM DATES 2026/27" },
          {
            type: "keyvalue",
            rows: [
              { label: "Term 1 ends", value: "Fri 18 Dec" },
              { label: "Term 2 starts", value: "Mon 11 Jan" },
              { label: "Mid-term break", value: "Thu 18 Feb - Fri 19 Feb" },
              { label: "Term 2 ends", value: "Fri 9 Apr" },
              { label: "Term 3 starts", value: "Mon 3 May" },
            ],
          },
          { type: "paragraph", text: "Dates can change. This page always shows the latest." },
        ],
      },
      {
        number: 430,
        fastext: fx(["INDEX", 100], ["SCHOOL", 400], ["RESULTS", 412], ["DATES", 420]),
        blocks: [
          { type: "heading", level: 1, text: "CLOSURE ALERT" },
          { type: "paragraph", tone: "alert", text: "The school is closed on Wed 25 Nov for a staff training day." },
          { type: "paragraph", text: "Classes resume on Thu 26 Nov at 08:00. Boarding students stay on site." },
        ],
      },
    ],
  },
  {
    name: "Sunrise Clinic",
    slug: "sunrise-clinic",
    category: "Health",
    range: [500, 549],
    plan: "free",
    pages: [
      {
        number: 500,
        fastext: fx(["INDEX", 100], ["HOURS", 510], ["VACCINES", 512], ["TIPS", 520]),
        blocks: [
          { type: "heading", level: 1, text: "SUNRISE CLINIC" },
          { type: "link", label: "Opening hours", page: 510 },
          { type: "link", label: "Vaccine days this month", page: 512 },
          { type: "link", label: "Health tip of the week", page: 520 },
          { type: "paragraph", text: "Emergency? Go to the nearest hospital or call 112." },
        ],
      },
      {
        number: 510,
        fastext: fx(["INDEX", 100], ["CLINIC", 500], ["VACCINES", 512], ["TIPS", 520]),
        blocks: [
          { type: "heading", level: 1, text: "OPENING HOURS" },
          {
            type: "table",
            header: ["Day", "Open", "Close"],
            rows: [["Mon-Fri", "08:00", "18:00"], ["Sat", "09:00", "14:00"], ["Sun", "Closed", ""]],
          },
          { type: "paragraph", text: "Antenatal clinic: Tue and Thu mornings." },
        ],
      },
      {
        number: 512,
        fastext: fx(["INDEX", 100], ["CLINIC", 500], ["HOURS", 510], ["TIPS", 520]),
        blocks: [
          { type: "heading", level: 1, text: "VACCINE DAYS - NOV" },
          {
            type: "keyvalue",
            rows: [
              { label: "Polio (OPV)", value: "Tue 17 Nov, 09:00-13:00" },
              { label: "Measles", value: "Thu 19 Nov, 09:00-13:00" },
              { label: "HPV (girls 9-14)", value: "Sat 21 Nov, 10:00-13:00" },
            ],
          },
          { type: "paragraph", text: "Bring the child's health card. All vaccines are free." },
        ],
      },
      {
        number: 520,
        fastext: fx(["INDEX", 100], ["CLINIC", 500], ["HOURS", 510], ["VACCINES", 512]),
        blocks: [
          { type: "heading", level: 1, text: "HEALTH TIP: WATER" },
          { type: "paragraph", text: "Boil drinking water for one full minute, then let it cool in a covered pot." },
          { type: "bullets", items: ["Wash hands with soap before eating.", "Keep food covered.", "See a nurse if diarrhoea lasts more than two days."] },
        ],
      },
    ],
  },
  {
    name: "City Bus Union",
    slug: "city-bus-union",
    category: "Transport",
    range: [600, 649],
    plan: "pro",
    pages: [
      {
        number: 600,
        fastext: fx(["INDEX", 100], ["ROUTE 12", 610], ["ROUTE 7", 611], ["ALERTS", 620]),
        blocks: [
          { type: "heading", level: 1, text: "CITY BUS UNION" },
          { type: "link", label: "Route 12 live", page: 610 },
          { type: "link", label: "Route 7 live", page: 611 },
          { type: "link", label: "Service alerts", page: 620 },
          { type: "paragraph", text: "Fares: N300 per trip, N150 for students with ID." },
        ],
      },
      {
        number: 610,
        live: true,
        fastext: fx(["INDEX", 100], ["BUSES", 600], ["ROUTE 7", 611], ["ALERTS", 620]),
        blocks: [
          { type: "heading", level: 2, text: "ROUTE 12 - LIVE" },
          {
            type: "table",
            header: ["Stop", "Next", "Status"],
            rows: [["Central", "14:40", "On time"], ["Market Rd", "14:46", "Delayed 5 min"], ["Hospital", "14:55", "On time"], ["University", "15:03", "On time"]],
          },
          { type: "paragraph", tone: "alert", text: "ALERT: Road works on Park Ave. Route 12 uses Mill St until Fri." },
        ],
      },
      {
        number: 611,
        live: true,
        fastext: fx(["INDEX", 100], ["BUSES", 600], ["ROUTE 12", 610], ["ALERTS", 620]),
        blocks: [
          { type: "heading", level: 2, text: "ROUTE 7 - LIVE" },
          {
            type: "table",
            header: ["Stop", "Next", "Status"],
            rows: [["Airport", "14:35", "On time"], ["Stadium", "14:50", "On time"], ["Central", "15:05", "Delayed 10 min"]],
          },
        ],
      },
      {
        number: 620,
        fastext: fx(["INDEX", 100], ["BUSES", 600], ["ROUTE 12", 610], ["ROUTE 7", 611]),
        blocks: [
          { type: "heading", level: 1, text: "SERVICE ALERTS" },
          { type: "bullets", items: ["Route 12 diverted via Mill St until Fri 13 Nov.", "No night buses on Sun 15 Nov.", "New stop at Ojo Market from Mon 16 Nov."] },
        ],
      },
    ],
  },
];

async function insertPage(ctx: MutationCtx, orgId: Id<"organizations">, page: SeedPage, now: number) {
  const org = await ctx.db.get(orgId);
  if (!org) return;
  const fastext = page.fastext ?? defaultFastext(page.number, org.helpPage ?? org.rangeStart);
  const { rendered, warnings } = renderForOrg(org, page.number, page.blocks, fastext, now);
  const heading = page.blocks.find((b) => b.type === "heading");
  const title = heading && heading.type === "heading" ? heading.text : `Page ${page.number}`;
  const pageId = await ctx.db.insert("pages", {
    orgId,
    number: page.number,
    title,
    status: "published",
    isLive: page.live ?? false,
    updatedAt: now,
    searchText: searchTextOf(title, page.blocks),
  });
  const versionId = await ctx.db.insert("pageVersions", {
    pageId,
    version: 1,
    blocks: page.blocks,
    rendered,
    fastext,
    errorCount: warnings.filter((w) => w.level === "error").length,
    warningCount: warnings.filter((w) => w.level === "warning").length,
    uncheckedFacts: 0,
    createdBy: SEED_USER,
  });
  await ctx.db.patch(pageId, { currentVersionId: versionId });
}

export const run = internalMutation({
  args: {},
  returns: v.object({ created: v.number(), skipped: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;
    for (const seed of ORGS) {
      const existing = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", seed.slug)).unique();
      if (existing) {
        skipped++;
        continue;
      }
      const orgId = await ctx.db.insert("organizations", {
        name: seed.name,
        slug: seed.slug,
        plan: seed.plan,
        rangeStart: seed.range[0],
        rangeEnd: seed.range[1],
        helpPage: seed.slug === "teletext" ? 101 : seed.range[0],
        utcOffsetMinutes: 60,
        category: seed.category,
      });
      await ctx.db.insert("members", { orgId, userId: SEED_USER, role: "owner" });
      for (const page of seed.pages) await insertPage(ctx, orgId, page, now);
      created++;
    }
    return { created, skipped };
  },
});

/** Makes a real (Hexclave) user the owner of a demo organization, for the judges' demo login. */
export const claimDemo = internalMutation({
  args: { userId: v.string(), slug: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { userId, slug }) => {
    const org = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug ?? "greenfield-high")).unique();
    if (!org) return "Run seed:run first.";
    const existing = await ctx.db.query("members").withIndex("by_org_user", (q) => q.eq("orgId", org._id).eq("userId", userId)).unique();
    if (existing) await ctx.db.patch(existing._id, { role: "owner" });
    else await ctx.db.insert("members", { orgId: org._id, userId, role: "owner" });
    return `${userId} now owns ${org.name}.`;
  },
});
