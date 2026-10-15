import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSystem, resolveVoice, buildUser, buildRetryUser, toMode } from "../src/prompt.js";

// A throwaway project root with example voice files and no personal ones.
function scaffold(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "reply-bot-prompt-"));
  mkdirSync(path.join(root, "prompts"));
  mkdirSync(path.join(root, "voice"));
  writeFileSync(path.join(root, "prompts", "humanizer.md"), "# Humanizer\nrules\n");
  writeFileSync(path.join(root, "voice", "profile.example.md"), "# How I write (example)\n");
  writeFileSync(path.join(root, "voice", "samples.example.md"), "# Samples of my writing (example)\n");
  return root;
}

describe("prompt", () => {
  it("builds the same system string twice", () => {
    expect(loadSystem()).toBe(loadSystem());
  });

  it("falls back to the example voice files on a fresh clone", () => {
    const root = scaffold();
    expect(resolveVoice(root)).toEqual({
      profile: "voice/profile.example.md",
      samples: "voice/samples.example.md",
    });
    const s = loadSystem(root);
    expect(s).toContain("How I write (example)");
    expect(s).toContain("Samples of my writing (example)");
  });

  it("prefers personal voice files when they exist", () => {
    const root = scaffold();
    writeFileSync(path.join(root, "voice", "profile.md"), "# How I write (mine)\n");
    expect(resolveVoice(root)).toEqual({
      profile: "voice/profile.md",
      samples: "voice/samples.example.md",
    });
    const s = loadSystem(root);
    expect(s).toContain("How I write (mine)");
    expect(s).not.toContain("How I write (example)");
    expect(s).toContain("Samples of my writing (example)");
  });

  it("orders humanizer, profile, samples, trailer", () => {
    const s = loadSystem(scaffold());
    const h = s.indexOf("Humanizer");
    const p = s.indexOf("How I write");
    const m = s.indexOf("Samples of my writing");
    const t = s.indexOf("You are not in a chat");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(p);
    expect(p).toBeLessThan(m);
    expect(m).toBeLessThan(t);
  });

  it("wraps the draft and context in reply mode", () => {
    const u = buildUser("hey can we push to friday", "reply to Sam, slack");
    expect(u).toContain("<context>\nreply to Sam, slack\n</context>");
    expect(u).toContain("<draft>\nhey can we push to friday\n</draft>");
    expect(u).toContain("Output only the rewritten text.");
    expect(u).toContain("quoted thread");
    expect(u).toContain("Cut words.");
    expect(u).not.toContain("ten percent");
  });

  it("holds length and keeps citations in post mode", () => {
    const u = buildUser("In the reading, Smith argues...", "week 3 discussion", "post");
    expect(u).toContain("<draft>\nIn the reading, Smith argues...\n</draft>");
    expect(u).toContain("ten percent");
    expect(u).toContain("citations");
    expect(u).toContain("paragraph break");
    expect(u).not.toContain("Cut words.");
  });

  it("uses 'none' when context is missing", () => {
    expect(buildUser("x")).toContain("<context>\nnone\n</context>");
  });

  it("coerces unknown modes to reply", () => {
    expect(toMode("post")).toBe("post");
    expect(toMode("POST")).toBe("reply");
    expect(toMode(undefined)).toBe("reply");
    expect(toMode(42)).toBe("reply");
  });

  it("appends findings on retry and keeps the mode", () => {
    const u = buildRetryUser("x", undefined, "post", [
      { rule: "em-dash", match: "—", line: 1 },
    ]);
    expect(u).toContain("<draft>\nx\n</draft>");
    expect(u).toContain("ten percent");
    expect(u).toContain("em-dash");
    expect(u).toContain("Fix them. Output only the text.");
  });
});
