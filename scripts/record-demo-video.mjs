// scripts/record-demo-video.mjs
// Automated End-to-End Demo Video Recorder for Teletext 2.0 (Kiroween 2026)
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.DEMO_BASE_URL ?? "https://teletext-2-0.vercel.app";
const EMAIL = process.env.E2E_JUDGE_EMAIL ?? "judge@example.com";
const PASSWORD = process.env.E2E_JUDGE_PASSWORD ?? "judge@example.com";
const OUTPUT_DIR = path.resolve("records");
const FINAL_MP4 = path.resolve("teletext-2.0-demo.mp4");

const STACK_LOOKUP_ID = "kx78f8n60zz0ar06b7528a979d8jx38e";
const STACK_FORM_ID = "kx75f390zyytg6pf9v6t5za7mh8jwrp1";
const STACK_QUIZ_ID = "kx74aznqwewfej312y2q59jy9h8jwzvy";
const ORG_ID = "jd77skhjfx79n74ttp44jqqes98jwd8z";
const PAGE_412_ID = "js7c5zhwv4kwf01f6zz75gkpjx8jwjwy";

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanType(page, locator, text, delayMs = 50) {
  await locator.focus();
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delayMs);
  }
}

async function record() {
  console.log("=== Teletext 2.0: Starting Complete End-to-End Demo Recording ===");
  console.log(`Target: ${BASE_URL}`);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--start-maximized", "--disable-infobars"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    // =============================================================
    // PART 1: THE READER EXPERIENCE & ZERO-LOGIN BROADCAST
    // =============================================================
    console.log("\n[Scene 1] Reader Experience & Dialing...");
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await sleep(3500); // Admire Page 100 Index

    // Dial 400 (Greenfield High School)
    console.log("  Dialing 4-0-0...");
    await page.keyboard.type("4", { delay: 250 });
    await page.keyboard.type("0", { delay: 250 });
    await page.keyboard.type("0", { delay: 250 });
    await page.waitForURL(/\/p\/400/, { timeout: 15000 }).catch(() => {});
    await sleep(3500); // Read Greenfield High portal

    // Dial 412 (Exam Results notice page)
    console.log("  Dialing 4-1-2...");
    await page.keyboard.type("4", { delay: 250 });
    await page.keyboard.type("1", { delay: 250 });
    await page.keyboard.type("2", { delay: 250 });
    await page.waitForURL(/\/p\/412/, { timeout: 15000 }).catch(() => {});
    await sleep(3500); // Read P412 notice

    // Test Fastext Navigation: Press 'R' to return to Page 100
    console.log("  Pressing Fastext RED (Index)...");
    await page.keyboard.press("r");
    await page.waitForURL(/\/p\/100/, { timeout: 15000 }).catch(() => {});
    await sleep(2500);

    // =============================================================
    // PART 2: STAGE 2 STACKS (INTERACTIVE TELETEXT CARDS)
    // =============================================================

    // --- STACK 1: Secure Exam Results Lookup (P412) ---
    console.log("\n[Scene 2] Stage 2 Stacks: Exam Results Lookup...");
    await page.goto(`${BASE_URL}/stacks/${STACK_LOOKUP_ID}`, { waitUntil: "networkidle" });
    await sleep(3000);

    const sidInput = page.locator('input[type="text"]').first();
    const pinInput = page.locator('input[type="password"]').first();

    console.log("  Entering Student ID: 1001...");
    await humanType(page, sidInput, "1001", 70);
    await sleep(800);

    console.log("  Entering PIN: 1234...");
    await humanType(page, pinInput, "1234", 70);
    await sleep(1000);

    console.log("  Clicking 'SHOW RESULT'...");
    const showResultBtn = page.getByRole("button", { name: /show result/i });
    await showResultBtn.click();
    await sleep(4500); // Admire student report card: Ada Bello, GPA, score

    // Test Wrong PIN rejection
    console.log("  Testing invalid PIN rejection...");
    await sidInput.fill("");
    await humanType(page, sidInput, "1001", 50);
    await pinInput.fill("");
    await humanType(page, pinInput, "0000", 50);
    await sleep(600);
    await showResultBtn.click();
    await sleep(3500); // Admire safe error rejection message

    // --- STACK 2: Parent Absence & Inquiry Form (P420) ---
    console.log("\n[Scene 3] Stage 2 Stacks: Parent Absence Form...");
    await page.goto(`${BASE_URL}/stacks/${STACK_FORM_ID}`, { waitUntil: "networkidle" });
    await sleep(3000);

    const formInputs = page.locator('input[type="text"]');
    console.log("  Entering parent name...");
    await humanType(page, formInputs.nth(0), "Mrs. Ngozi Okafor", 50);
    await sleep(600);

    console.log("  Entering student name...");
    await humanType(page, formInputs.nth(1), "Chioma Okafor (JSS3)", 50);
    await sleep(600);

    console.log("  Entering absence message...");
    await humanType(page, formInputs.nth(2), "Chioma will be absent this Friday for a doctor appointment.", 40);
    await sleep(1000);

    console.log("  Clicking 'SEND'...");
    const sendBtn = page.getByRole("button", { name: /send/i });
    await sendBtn.click();
    await sleep(4000); // Admire confirmation reference message

    // --- STACK 3: School Library Trivia Quiz (P430) ---
    console.log("\n[Scene 4] Stage 2 Stacks: Library Trivia Quiz...");
    await page.goto(`${BASE_URL}/stacks/${STACK_QUIZ_ID}`, { waitUntil: "networkidle" });
    await sleep(3000);

    console.log("  Starting Quiz...");
    const startBtn = page.getByRole("button", { name: /start/i });
    await startBtn.click();
    await sleep(2500);

    // Question 1: Dewey Decimal
    console.log("  Question 1: Selecting Dewey Decimal...");
    const q1Select = page.locator("select");
    if (await q1Select.isVisible()) {
      await q1Select.selectOption("Dewey Decimal");
      await sleep(1000);
    }
    const nextBtn1 = page.getByRole("button", { name: /next/i });
    await nextBtn1.click();
    await sleep(2500);

    // Question 2: 14 days
    console.log("  Question 2: Selecting 14 days...");
    const q2Select = page.locator("select");
    if (await q2Select.isVisible()) {
      await q2Select.selectOption("14 days");
      await sleep(1000);
    }
    const nextBtn2 = page.getByRole("button", { name: /next/i });
    await nextBtn2.click();
    await sleep(2500);

    // Question 3: Every student
    console.log("  Question 3: Selecting Every student...");
    const q3Select = page.locator("select");
    if (await q3Select.isVisible()) {
      await q3Select.selectOption("Every student");
      await sleep(1000);
    }
    const nextBtn3 = page.getByRole("button", { name: /next/i });
    await nextBtn3.click();
    await sleep(2500);

    // Final Score
    console.log("  Viewing Final Score...");
    const scoreBtn = page.getByRole("button", { name: /score/i });
    if (await scoreBtn.isVisible()) {
      await scoreBtn.click();
      await sleep(4000); // Admire score message: "Perfect! 3 out of 3."
    }

    // =============================================================
    // PART 3: ORGANIZATION ADMIN & AUTHORING WORKFLOW
    // =============================================================
    console.log("\n[Scene 5] Organization Admin: Sign In via Hexclave...");
    await page.goto(`${BASE_URL}/dashboard`);
    console.log("  Waiting for Hexclave sign-in portal...");
    await page.waitForURL(/built-with-hexclave\.com/, { timeout: 45000 });
    await sleep(2000);

    console.log("  Entering admin credentials...");
    const emailField = page.locator('input[type="email"]');
    await emailField.waitFor({ timeout: 20000 });
    await humanType(page, emailField, EMAIL, 50);
    await sleep(500);

    const passField = page.locator('input[type="password"]');
    await humanType(page, passField, PASSWORD, 50);
    await sleep(800);

    console.log("  Clicking Sign In button...");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 45000 });
    await sleep(3500); // Show Organizations overview

    // Open Greenfield High School
    console.log("  Entering Greenfield High School Workspace...");
    const orgLink = page.getByRole("link", { name: /Greenfield High/i }).first();
    await orgLink.click();
    await page.waitForURL(/\/dashboard\/[a-z0-9]+/, { timeout: 15000 });
    await sleep(3500); // Admire Greenfield High Dashboard overview

    // Scroll through Dashboard: Pages, Stacks, Traffic Analytics
    console.log("  Exploring Dashboard: Pages, Stacks, Analytics...");
    await page.mouse.wheel(0, 400);
    await sleep(2000);
    await page.mouse.wheel(0, -400);
    await sleep(1500);

    // --- SCENE 6: CREATING A NEW TELETEXT PAGE ---
    console.log("\n[Scene 6] Admin Authoring: Creating a New Teletext Page...");
    const pageTitleInput = page.locator('input[placeholder="Term 1 exam results"]');
    if (await pageTitleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("  Entering new page title: 'Sports Day Schedule & Roster'...");
      await humanType(page, pageTitleInput, "Sports Day Schedule & Roster", 30);
      await sleep(800);
      const createPageBtn = page.getByRole("button", { name: "Create page" });
      await createPageBtn.click();
      await page.waitForURL(/\/pages\/[a-z0-9]+/, { timeout: 20000 }).catch(() => {});
      await sleep(3500); // Admire new page editor canvas

      // Navigate back to Organization Dashboard via breadcrumb
      console.log("  Navigating back to Greenfield High Dashboard...");
      const backCrumb = page.getByRole("link", { name: /Greenfield High/i }).first();
      if (await backCrumb.isVisible({ timeout: 5000 }).catch(() => false)) {
        await backCrumb.click();
      } else {
        await page.goto(`${BASE_URL}/dashboard/${ORG_ID}`);
      }
      await page.waitForURL(new RegExp(`/dashboard/${ORG_ID}`), { timeout: 15000 }).catch(() => {});
      await sleep(2000);
    }

    // --- SCENE 7: CREATING A NEW INTERACTIVE STACK (STAGE 2) ---
    console.log("\n[Scene 7] Admin Authoring: Creating a New Stage 2 Interactive Stack...");
    const templateSelect = page.locator("select").filter({ hasText: /Lookup - results/i });
    if (await templateSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("  Selecting 'Quiz - questions and score' template...");
      await templateSelect.selectOption("quiz");
      await sleep(1000);

      console.log("  Clicking 'Create manual draft'...");
      const createDraftBtn = page.getByRole("button", { name: "Create manual draft" });
      await createDraftBtn.click();
      await sleep(3000); // Admire draft creation status and new item in list
    }

    // --- SCENE 8: VISUAL DECK EDITOR & JSON SCHEMA TOGGLE ---
    console.log("\n[Scene 8] Stage 2: Stacks Visual Deck Editor & JSON Schema Toggle...");
    await page.goto(`${BASE_URL}/dashboard/${ORG_ID}/stacks/${STACK_LOOKUP_ID}`);
    await sleep(4000); // Admire Visual Deck Editor

    // Click card chips in the carousel
    console.log("  Inspecting Card Deck in Visual Editor...");
    const cardChip = page.getByRole("button", { name: /LOOKUP/i }).first();
    if (await cardChip.isVisible()) {
      await cardChip.click();
      await sleep(2000);
    }

    // Toggle to JSON Code mode using role="tab"
    console.log("  Toggling to Declarative JSON / Script Mode...");
    const jsonTab = page.getByRole("tab", { name: /Advanced JSON|JSON/i });
    if (await jsonTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await jsonTab.click();
      await sleep(4000); // Show full declarative JSON code editor

      console.log("  Toggling back to Visual Deck Editor...");
      const visualTab = page.getByRole("tab", { name: /Visual Editor|Visual/i });
      if (await visualTab.isVisible()) {
        await visualTab.click();
        await sleep(3000); // Show visual card controls
      }
    }

    // --- SCENE 9: PAGE AUTHORING WITH AI CONDENSER & FACT GUARD ---
    console.log("\n[Scene 9] Teletext Page Editor & AI Fact Guard...");
    await page.goto(`${BASE_URL}/dashboard/${ORG_ID}/pages/${PAGE_412_ID}`);
    await sleep(3500); // Admire 40x24 teletext grid and toolbar

    console.log("  Pasting school memo into AI Condenser...");
    const sourceBox = page.locator("#source");
    if (await sourceBox.isVisible()) {
      const MEMO = `Dear Parents,
The Term 1 reports for JSS3 will be ready on Friday 13 November 2026.
Collect them in the Main Hall between 09:00 and 15:00. Please bring your child's ID card.
Outstanding fees of N2,500 must be cleared first.
Call the school office on 0800 000 0000.
Mrs Adaeze Okafor, Principal`;
      await sourceBox.fill("");
      await humanType(page, sourceBox, MEMO, 12);
      await sleep(1500);

      console.log("  Clicking 'Condense with AI'...");
      const condenseBtn = page.getByRole("button", { name: /Condense with AI/i });
      if (await condenseBtn.isVisible()) {
        await condenseBtn.click();
        await page.getByRole("status").filter({ hasText: /ready/i }).waitFor({ timeout: 60000 }).catch(() => {});
        await sleep(4500); // Admire Fact Guard validating dates, fees, phone numbers!
      }
    }

    // --- SCENE 10: A4 PRINTABLE POSTER ---
    console.log("\n[Scene 10] Printable Noticeboard Poster...");
    const posterLink = page.getByRole("link", { name: /QR poster|poster/i }).first();
    if (await posterLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("  Viewing Printable A4 Noticeboard Poster...");
      await posterLink.click();
      await sleep(4500); // Admire retro poster with big QR code
    }

    // --- SCENE 11: FINAL LIVE TELETEXT READER SHOWCASE ---
    console.log("\n[Scene 11] Final Reader Showcase...");
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await sleep(4000);

    console.log("\n=== Complete End-to-End Recording Finished Successfully! ===");
  } catch (err) {
    console.error("Recording encountered an error:", err);
  } finally {
    const videoObj = page.video();
    await context.close();
    await browser.close();

    if (videoObj) {
      const rawVideoPath = await videoObj.path();
      console.log(`Raw video saved at: ${rawVideoPath}`);

      // Transcode to MP4 with FFmpeg
      console.log("Transcoding with FFmpeg to MP4...");
      try {
        const cmd = `ffmpeg -y -i "${rawVideoPath}" -c:v libx264 -pix_fmt yuv420p -crf 22 -preset fast -movflags +faststart "${FINAL_MP4}"`;
        execSync(cmd, { stdio: "inherit" });
        console.log(`\n🎉 SUCCESS! Final MP4 video ready at:\n${FINAL_MP4}`);
      } catch (ffErr) {
        console.error("FFmpeg conversion error:", ffErr);
      }
    }
  }
}

record();
