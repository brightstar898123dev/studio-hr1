import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Variables set by Node, Next.js, Vercel or CI themselves; nobody needs to configure them. */
const PLATFORM = new Set(["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE", "CI", "PORTABILITY_FORBIDDEN"]);

describe(".env.example", () => {
  const example = readFileSync(".env.example", "utf8");
  const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!));

  it("documents every environment variable the code reads", () => {
    const files = execSync("git ls-files --cached --others --exclude-standard -- '*.ts' '*.tsx' '*.mjs'", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.startsWith("tests/") && !f.endsWith(".config.ts"));
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]!);
    }
    // Keys parsed by lib/config/env.ts
    const envTs = readFileSync("lib/config/env.ts", "utf8");
    const schema = envTs.slice(envTs.indexOf("EnvSchema = z.object({"), envTs.indexOf("});", envTs.indexOf("EnvSchema")));
    for (const m of schema.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)) used.add(m[1]!);
    const missing = [...used].filter((k) => !PLATFORM.has(k) && !documented.has(k));
    expect(missing).toEqual([]);
  });

  it("contains placeholders only, never real secrets", () => {
    expect(example).not.toMatch(/sk-or-v1-[a-f0-9]{20,}|xkeysib-|eyJ[A-Za-z0-9_-]{20,}\./);
    expect(example).toMatch(/MOCK_EMAIL=true/);
    expect(example).toMatch(/OPENROUTER_MODEL=\S+:free/);
  });
});
