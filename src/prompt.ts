import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Finding } from "./lint.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, "..");

const TRAILER = `You are not in a chat. Embedded mode applies: return only the final text.
Never ask questions and never add commentary, headings, or a list of patterns.
If a detail is missing, leave it as the draft had it. Do not invent facts.
Match the samples: their sentence length, word choice, and punctuation.`;

const read = (root: string, rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n").trim();

export type VoiceName = "profile" | "samples";

// voice/profile.md and voice/samples.md are personal and gitignored. A fresh
// clone has only the .example.md templates, so fall back to those per file
// and let the server warn. Returns paths relative to the project root.
export function resolveVoice(root: string = defaultRoot): Record<VoiceName, string> {
  const pick = (name: VoiceName) => {
    const personal = `voice/${name}.md`;
    return existsSync(path.join(root, personal)) ? personal : `voice/${name}.example.md`;
  };
  return { profile: pick("profile"), samples: pick("samples") };
}

export function loadSystem(root: string = defaultRoot): string {
  const voice = resolveVoice(root);
  return [
    read(root, "prompts/humanizer.md"),
    read(root, voice.profile),
    read(root, voice.samples),
    TRAILER,
  ].join("\n\n");
}

export type Mode = "reply" | "post";

export function toMode(value: unknown): Mode {
  return value === "post" ? "post" : "reply";
}

const INSTRUCTION: Record<Mode, string> = {
  reply: `Rewrite the draft so it reads like the "chat" and "email" samples. Keep every claim. Add nothing. Cut words.
If the draft includes a quoted thread below it, rewrite only the new message and drop the quote.
Output only the rewritten text.`,
  post: `This is a school discussion post. Rewrite the draft so it reads like the "post" samples, or like the "email" samples if there are no post samples.
Keep every claim and every paragraph break. Keep the length within ten percent of the draft, since posts have minimums.
Keep quotes, citations, titles, and names exactly as written. Normal capitalization, full sentences, no greeting.
Output only the rewritten text.`,
};

export function buildUser(input: string, context?: string, mode: Mode = "reply"): string {
  const ctx = context?.trim() ? context.trim() : "none";
  return `<context>\n${ctx}\n</context>\n\n<draft>\n${input}\n</draft>\n\n${INSTRUCTION[mode]}`;
}

export function buildRetryUser(
  input: string,
  context: string | undefined,
  mode: Mode,
  findings: Finding[],
): string {
  const list = findings.map((f) => `- ${f.rule}: "${f.match}" (line ${f.line})`).join("\n");
  return `${buildUser(input, context, mode)}\n\nThe previous attempt contained these tells:\n${list}\nFix them. Output only the text.`;
}
