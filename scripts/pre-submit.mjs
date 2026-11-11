// Pre-submit check (see docs/kiro-checklist.md). Run: npm run pre-submit
// Verifies the things Devpost judges look at, plus secret and private-document leaks.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// --secrets-only: just the leak checks (used by the Secret guard hook on every save).
const secretsOnly = process.argv.includes("--secrets-only");
const problems = [];
const ok = [];
const check = (label, pass, detail = "", always = false) => {
  if (secretsOnly && !always) return;
  if (pass) ok.push(label);
  else problems.push(`${label}${detail ? `: ${detail}` : ""}`);
};

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

// License visible
check("LICENSE exists and is MIT", existsSync("LICENSE") && /MIT License/.test(readFileSync("LICENSE", "utf8")));

// .kiro committed and not ignored
const tracked = git(["ls-files"]).split(/\r?\n/).filter(Boolean);
check(".kiro/steering is committed", tracked.some((f) => f.startsWith(".kiro/steering/")));
check(".kiro/specs is committed", tracked.some((f) => f.startsWith(".kiro/specs/")));
check(".kiro/hooks is committed", tracked.some((f) => f.startsWith(".kiro/hooks/")));
const ignored = git(["check-ignore", ".kiro", ".kiro/specs", ".kiro/steering", ".kiro/hooks"]).trim();
check(".kiro is not git-ignored", ignored === "", ignored);

// README
const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
check("README.md exists", readme.length > 500);
check("README has no TODO placeholders left", !/_TODO/.test(readme), "fill in the live URL, video and demo login");

// Env example complete
const example = existsSync("apps/web/.env.example") ? readFileSync("apps/web/.env.example", "utf8") : "";
for (const name of ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_HEXCLAVE_PROJECT_ID", "GEMINI_API_KEY"]) {
  check(`.env.example lists ${name}`, example.includes(name));
}

// Private files must not be tracked
check("no .env files are tracked", !tracked.some((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example")), "", true);
check("planning document is not tracked", !tracked.some((f) => /Kiroween 2026\.md$/i.test(f)), "", true);

// Secrets in tracked files
const secretHits = git(["grep", "-nIE", "AQ\\.[A-Za-z0-9_-]{25,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|GEMINI_API_KEY=[A-Za-z0-9._-]{10,}", "--", ":!package-lock.json"]).trim();
check("no API keys in tracked files", secretHits === "", secretHits.split("\n")[0], true);

// Core purity
if (!secretsOnly) {
  try {
    execFileSync("node", ["scripts/check-core-boundary.mjs"], { stdio: "ignore" });
    ok.push("packages/core is pure");
  } catch {
    problems.push("packages/core is not pure (run npm run check:boundary)");
  }
}

for (const label of ok) console.log(`  ok    ${label}`);
for (const p of problems) console.log(`  FAIL  ${p}`);
console.log(problems.length === 0 ? "\nPre-submit: all checks passed." : `\nPre-submit: ${problems.length} problem(s).`);
process.exit(problems.length === 0 ? 0 : 1);
