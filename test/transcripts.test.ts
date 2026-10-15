import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mine, keep, extractText } from "../src/voice/transcripts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");

describe("transcripts", () => {
  it("keeps only real typed messages, newest first", () => {
    // exclude: [] because the default "reply-bot" exclusion matches this repo's own path
    expect(mine(fixtures, { exclude: [] })).toEqual([
      "ok lets fix 2,3,4,5. make sure we dont break any existing functionality",
      "supermemory still isnt loading on startup",
    ]);
  });

  it("drops a content array that contains a tool_result", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-10-01T10:01:00Z",
      message: { content: [{ type: "tool_result" }, { type: "text", text: "a long enough message here" }] },
    });
    expect(extractText(line)).toBeNull();
  });

  it("drops paths, short, long, and marker messages", () => {
    expect(keep("C:\\Users\\Colin\\getout\\src\\checkout\\cart.ts:120")).toBe(false);
    expect(keep("look at C:\\Users\\Colin\\getout\\src\\checkout\\cart.ts:120 please")).toBe(false);
    expect(keep("see https://example.com/x for the details on this")).toBe(false);
    expect(keep("ok")).toBe(false);
    expect(keep("x".repeat(601))).toBe(false);
    expect(keep("[Request interrupted by user for tool use]")).toBe(false);
    expect(keep("Caveat: the messages below were generated")).toBe(false);
    expect(keep("Your response above was stopped by a safety classifier. The rest was withheld.")).toBe(false);
    expect(keep("can we push the deploy to friday")).toBe(true);
  });

  it("drops pasted multi-line content but keeps a two-line message", () => {
    expect(keep("only see this option\nRun workflows from fork pull requests\nThis tells Actions to run workflows")).toBe(false);
    expect(keep("deployed it\nlet me know if anything looks off")).toBe(true);
  });

  it("skips excluded folders", () => {
    expect(mine(fixtures, { exclude: ["fixtures"] })).toEqual([]);
  });
});
