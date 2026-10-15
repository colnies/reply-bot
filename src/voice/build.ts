import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toBullets } from "./transcripts.js";

const HEADER = `# Samples of my writing

Each sample starts with "- ". Continuation lines are indented two spaces.`;

export type Sections = { email: string[]; chat: string[]; post: string[] };

const SECTION_NAMES = ["email", "chat", "post"] as const;

export function parseSamples(md: string): Sections {
  const out: Sections = { email: [], chat: [], post: [] };
  let section: keyof Sections | null = null;
  let current: string[] | null = null;
  const flush = () => {
    if (section && current) out[section].push(current.join("\n"));
    current = null;
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    if (raw.startsWith("## ")) {
      flush();
      const name = raw.slice(3).trim() as keyof Sections;
      section = (SECTION_NAMES as readonly string[]).includes(name) ? name : null;
    } else if (raw.startsWith("- ")) {
      flush();
      current = [raw.slice(2)];
    } else if (raw.startsWith("  ") && current) {
      current.push(raw.slice(2));
    } else if (raw.trim() === "") {
      flush();
    }
  }
  flush();
  return out;
}

export function splitInbox(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/^===\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Three quote-header shapes: a single-line "On ... wrote:" (Apple Mail, UK
// format), a Gmail header that wraps so "wrote:" lands on the next line
// (recognised by "On <weekday>, "), and Outlook's separators. The weekday
// form requires the comma so "On Mon I will send it over." survives.
const QUOTE_START =
  /^(>|On .+ wrote:$|On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*, .+|-----Original Message-----|From: )/;

export function stripQuote(message: string): string {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l) => QUOTE_START.test(l.trim()));
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}

// Stored samples lose blank lines and edge whitespace (see toBullets), so a
// raw inbox message must be normalised the same way before comparing, or
// every rebuild re-adds multi-paragraph messages.
const key = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

export function buildSamples(args: { existing: string; candidates: string[]; inbox: string[]; posts: string[] }): string {
  const s = parseSamples(args.existing);
  const have = new Set([...s.email, ...s.chat, ...s.post].map(key));
  const add = (list: string[], items: string[]) => {
    for (const item of items) {
      const t = item.trim();
      if (!t || have.has(key(t))) continue;
      have.add(key(t));
      list.push(t);
    }
  };
  add(s.email, args.inbox.map(stripQuote));
  add(s.chat, args.candidates);
  add(s.post, args.posts.map(stripQuote));
  return `${HEADER}\n\n## email\n\n${toBullets(s.email)}\n\n## chat\n\n${toBullets(s.chat)}\n\n## post\n\n${toBullets(s.post)}\n`;
}

function readInboxDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory() || !/\.(txt|md)$/i.test(name)) continue;
    out.push(...splitInbox(readFileSync(p, "utf8")));
  }
  return out;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const voice = path.resolve(here, "..", "..", "voice");
  const samplesFile = path.join(voice, "samples.md");
  const candidatesFile = path.join(voice, "candidates-chat.md");
  const inboxDir = path.join(voice, "inbox");
  const existing = existsSync(samplesFile) ? readFileSync(samplesFile, "utf8") : HEADER;
  const candidates = existsSync(candidatesFile)
    ? parseSamples("## chat\n" + readFileSync(candidatesFile, "utf8").split("\n").slice(2).join("\n")).chat
    : [];
  const inbox = readInboxDir(inboxDir);
  const posts = readInboxDir(path.join(inboxDir, "posts"));
  const out = buildSamples({ existing, candidates, inbox, posts });
  writeFileSync(samplesFile, out);
  const s = parseSamples(out);
  console.log(`samples.md: ${s.email.length} email, ${s.chat.length} chat, ${s.post.length} post`);
}
