import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKERS = [
  "tool_result",
  "system-reminder",
  "Caveat:",
  "[Request interrupted",
  "[Image:",
  "safety classifier",
];
const CODE_CHARS = /[\/\\:_{}()=;]/g;
// A Windows path, a unix path with two or more segments, or a URL.
const PATHY = /[A-Za-z]:\\\S+|\/\S+\/\S+|https?:\/\/\S+/;

export function keep(text: string): boolean {
  const t = text.trim();
  if (t.length < 20 || t.length > 600) return false;
  if (t.startsWith("<")) return false;
  if (MARKERS.some((m) => t.includes(m))) return false;
  if (PATHY.test(t)) return false;
  // Three or more lines is pasted content, not a typed message.
  if (t.split("\n").length > 2) return false;
  const codey = (t.match(CODE_CHARS) ?? []).length / t.length;
  if (codey > 0.3) return false;
  return true;
}

export function extractText(line: string): { text: string; ts: number } | null {
  let o: any;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (o?.type !== "user") return null;
  const content = o.message?.content;
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    if (content.some((b) => b?.type !== "text")) return null;
    text = content.map((b) => b.text ?? "").join(" ");
  } else {
    return null;
  }
  text = text.trim();
  if (!text) return null;
  const ts = Date.parse(o.timestamp ?? "") || 0;
  return { text, ts };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

export function mine(dir: string, opts: { exclude?: string[] } = {}): string[] {
  const exclude = opts.exclude ?? ["reply-bot"];
  const found: { text: string; ts: number }[] = [];
  for (const file of walk(dir)) {
    if (exclude.some((e) => file.includes(e))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      const r = extractText(line);
      if (r && keep(r.text)) found.push(r);
    }
  }
  found.sort((a, b) => b.ts - a.ts);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of found) {
    const key = f.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f.text);
  }
  return out;
}

export function toBullets(samples: string[]): string {
  return samples
    .map((s) => "- " + s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n  "))
    .join("\n");
}

const here = path.dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const dir = process.env.CLAUDE_PROJECTS_DIR ?? path.join(os.homedir(), ".claude", "projects");
  const samples = mine(dir).slice(0, 150);
  const outDir = path.resolve(here, "..", "..", "voice");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "candidates-chat.md");
  writeFileSync(outFile, `# chat candidates (generated)\n\n${toBullets(samples)}\n`);
  console.log(`${samples.length} candidates written to ${outFile}`);
}
