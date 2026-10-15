import { describe, it, expect } from "vitest";
import "dotenv/config";
import { rewrite } from "../src/rewrite.js";
import { loadSystem, buildUser } from "../src/prompt.js";
import { lint } from "../src/lint.js";

const live = process.env.LIVE_TEST === "1";

describe.skipIf(!live)("rewrite (live)", () => {
  it("shortens a padded draft and leaves no tells", async () => {
    const draft =
      "Hey! I just wanted to reach out and circle back regarding the deploy. " +
      "It's not just about timing but about making sure we're aligned. " +
      "Perhaps we could potentially push it to Friday? Let me know your thoughts!";
    const r = await rewrite({ system: loadSystem(), user: buildUser(draft, "slack, to Sam") });
    expect(r.stopReason).toBe("end_turn");
    expect(r.text.length).toBeLessThanOrEqual(draft.length);
    expect(lint(r.text)).toEqual([]);
  }, 120_000);
});
