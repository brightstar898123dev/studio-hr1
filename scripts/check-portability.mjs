#!/usr/bin/env node
/**
 * Portability and secret check.
 *
 * The repo will be moved to another GitHub account, so it must not contain:
 *  - the current GitHub owner or repo name (read from `git remote get-url origin`),
 *  - extra forbidden words from PORTABILITY_FORBIDDEN (comma separated),
 *  - URLs or email addresses on real domains (only example/vendor domains are allowed),
 *  - anything that looks like a secret key.
 *
 * Runs as part of `npm run lint`. Exits with code 1 and lists every problem it finds.
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const SKIP_FILES = [/^package-lock\.json$/, /^pnpm-lock\.yaml$/, /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf)$/i];

// Domains that may appear in code and docs. Subdomains are allowed too.
const ALLOWED_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "example.com",
  "example.org",
  "example.net",
  "company.com", // placeholder domain used throughout the docs
  // Vendors and standards we link to on purpose
  "brevo.com",
  "sendinblue.com",
  "openrouter.ai",
  "supabase.com",
  "supabase.co",
  "supabase.io",
  "vercel.com",
  "vercel.app",
  "github.com",
  "githubusercontent.com",
  "nextjs.org",
  "shadcn.com",
  "tailwindcss.com",
  "w3.org",
  "schemas.microsoft.com",
  "json-schema.org",
  "mermaid.js.org",
  "playwright.dev",
  "vitest.dev",
  "openssl.org",
  "google.com",
  "googleapis.com",
  "zoho.com",
  "zoho.in",
  "flowmingo.ai",
  "mxtoolbox.com",
  "dmarcian.com",
  "npmjs.com",
  "nodejs.org",
];

const SECRET_PATTERNS = [
  { name: "OpenRouter key", re: /sk-or-v1-[a-f0-9]{20,}/i },
  { name: "Brevo API key", re: /xkeysib-[a-f0-9]{20,}/i },
  { name: "JWT / Supabase key", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "GitHub token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{30,}/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
];

function isAllowedDomain(host) {
  const h = host.toLowerCase().replace(/\.$/, "");
  // Not a real domain name (e.g. "https://..." placeholders or partial hosts): nothing to check.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  return ALLOWED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

function forbiddenWords() {
  const words = new Set();
  try {
    const url = execSync("git remote get-url origin", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const m = url.match(/[:/]([^/:]+)\/([^/]+?)(\.git)?$/);
    if (m) {
      // Ignore the local git proxy user names that are not real accounts.
      if (m[1] && m[1].length > 2) words.add(m[1]);
      if (m[2] && m[2].length > 2) words.add(m[2]);
    }
  } catch {
    // No git remote (e.g. a fresh copy). Nothing to check from git.
  }
  for (const w of (process.env.PORTABILITY_FORBIDDEN ?? "").split(",")) {
    if (w.trim().length > 2) words.add(w.trim());
  }
  // The app's own generic package name is fine even if a future repo uses it.
  try {
    words.delete(JSON.parse(readFileSync("package.json", "utf8")).name);
  } catch {
    // no package.json
  }
  return [...words];
}

function listFiles() {
  const out = execSync("git ls-files --cached --others --exclude-standard", { stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .split("\n")
    .filter(Boolean);
  return out.filter((f) => !SKIP_FILES.some((re) => re.test(f)));
}

const problems = [];
const words = forbiddenWords();
const urlRe = /\bhttps?:\/\/([a-z0-9.-]+)(?::\d+)?/gi;
const emailRe = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;

for (const file of listFiles()) {
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted but not yet staged, or unreadable
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    for (const w of words) {
      if (line.toLowerCase().includes(w.toLowerCase())) {
        problems.push(`${where}  contains the account/repo name "${w}". Use an env var instead.`);
      }
    }
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) problems.push(`${where}  looks like a secret (${name}). Move it to an env var.`);
    }
    for (const m of line.matchAll(urlRe)) {
      const host = m[1] ?? "";
      if (!isAllowedDomain(host)) {
        problems.push(`${where}  hardcoded URL host "${host}". Read it from an env var or settings.`);
      }
    }
    for (const m of line.matchAll(emailRe)) {
      const host = m[1] ?? "";
      // Ignore npm scoped packages and similar (e.g. "@types/node" never matches, but "x@1.2.3" could).
      if (/^\d/.test(host)) continue;
      if (!isAllowedDomain(host)) {
        problems.push(`${where}  hardcoded email address on "${host}". Use settings or an env var.`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`Portability check failed (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nSee START_HERE.md -> 'Moving to a new account' for why this matters.");
  process.exit(1);
}
console.log(`Portability check passed (${listFiles().length} files, no account names, real domains or secrets).`);
