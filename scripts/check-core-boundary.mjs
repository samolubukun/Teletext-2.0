// Boundary guard: packages/core must stay pure (see .kiro/steering/tech.md).
// Fails when a source file uses the DOM, network, clock, randomness, or imports app/runtime packages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["packages/core/src"];

const RULES = [
  { re: /\bDate\.now\s*\(/, why: "reads the clock (pass `now` in instead)" },
  { re: /\bnew\s+Date\s*\(\s*\)/, why: "reads the clock (pass `now` in instead)" },
  { re: /\bMath\.random\s*\(/, why: "uses randomness (pass ids or seeds in instead)" },
  { re: /\bcrypto\.(randomUUID|getRandomValues)\s*\(/, why: "uses randomness" },
  { re: /\bperformance\.now\s*\(/, why: "reads the clock" },
  { re: /\bfetch\s*\(/, why: "uses the network" },
  { re: /\b(window|document|localStorage|sessionStorage|navigator)\b/, why: "uses browser globals" },
  { re: /\bprocess\.env\b/, why: "reads environment variables" },
  { re: /from\s+["'](node:|fs|path|http|https|child_process)/, why: "imports a Node runtime module" },
  { re: /from\s+["'](convex|next|react|react-dom|@hexclave)/, why: "imports an app or backend package" },
  { re: /from\s+["']@teletext\/(stacks|web|ai)/, why: "core must not depend on other workspace packages" },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
  }
  return out;
}

const problems = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      for (const rule of RULES) {
        if (rule.re.test(code)) {
          problems.push(`${relative(process.cwd(), file)}:${i + 1}  ${rule.why}\n    ${line.trim()}`);
        }
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`Boundary guard: ${problems.length} problem(s) in packages/core\n`);
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Boundary guard: packages/core is pure.");
