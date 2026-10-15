import { describe, it, expect } from "vitest";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import type { RewriteOpts, RewriteResult } from "../src/rewrite.js";

type Ev = { event: string; data: any };

async function post(app: ReturnType<typeof createApp>, body: unknown): Promise<{ status: number; events: Ev[]; json?: any }> {
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/rewrite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.headers.get("content-type")?.includes("text/event-stream")) {
      return { status: res.status, events: [], json: await res.json() };
    }
    const raw = await res.text();
    const events = raw
      .split("\n\n")
      .filter((c) => c.trim())
      .map((chunk) => {
        const event = /^event: (.*)$/m.exec(chunk)![1];
        const data = JSON.parse(/^data: (.*)$/m.exec(chunk)![1]);
        return { event, data };
      });
    return { status: res.status, events };
  } finally {
    server.close();
  }
}

describe("POST /rewrite", () => {
  it("streams deltas, lints, reruns once, and reports clean", async () => {
    const seen: RewriteOpts[] = [];
    const rewrite = async (o: RewriteOpts) => {
      seen.push(o);
      if (seen.length === 1) {
        o.onDelta?.("ok — ");
        o.onDelta?.("sure");
        return { text: "ok — sure", stopReason: "end_turn" };
      }
      return { text: "ok, sure", stopReason: "end_turn" };
    };
    const { events } = await post(createApp({ system: "S", rewrite }), { text: "okay so sure", context: "slack" });
    expect(events.map((e) => e.event)).toEqual(["delta", "delta", "done"]);
    expect(events[2].data).toEqual({ text: "ok, sure", findings: [], reran: true });
    expect(seen[0].system).toBe("S");
    expect(seen[0].user).toContain("<draft>\nokay so sure\n</draft>");
    expect(seen[1].user).toContain("em-dash");
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("does not rerun when the first pass is clean", async () => {
    let n = 0;
    const rewrite = async () => (n++, { text: "fine.", stopReason: "end_turn" });
    const { events } = await post(createApp({ system: "S", rewrite }), { text: "that is fine" });
    expect(n).toBe(1);
    expect(events.at(-1)!.data).toEqual({ text: "fine.", findings: [], reran: false });
  });

  it("passes post mode through and coerces junk to reply", async () => {
    const seen: RewriteOpts[] = [];
    const rewrite = async (o: RewriteOpts) => (seen.push(o), { text: "fine.", stopReason: "end_turn" });
    const app = createApp({ system: "S", rewrite });
    await post(app, { text: "a discussion draft", mode: "post" });
    await post(app, { text: "a reply draft", mode: "bogus" });
    expect(seen[0].user).toContain("ten percent");
    expect(seen[1].user).toContain("Cut words.");
  });

  it("reports a refusal as an error event", async () => {
    const rewrite = async () => ({ text: "", stopReason: "refusal" });
    const { events } = await post(createApp({ system: "S", rewrite }), { text: "hello there" });
    expect(events.at(-1)).toEqual({ event: "error", data: { message: "model declined, try rewording" } });
  });

  it("reports a cut-off response as an error instead of clean", async () => {
    const rewrite = async () => ({ text: "half of a long po", stopReason: "max_tokens" });
    const { events } = await post(createApp({ system: "S", rewrite }), { text: "a long draft here" });
    expect(events.at(-1)).toEqual({ event: "error", data: { message: "output cut off, split the draft" } });
  });

  it("aborts the model call and skips the rerun when the client disconnects mid-stream", async () => {
    let aborted = false;
    let calls = 0;
    const rewrite = (o: RewriteOpts) =>
      new Promise<RewriteResult>((_resolve, reject) => {
        calls++;
        o.onDelta?.("first — ");
        o.signal!.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    const server = createApp({ system: "S", rewrite }).listen(0);
    const port = (server.address() as AddressInfo).port;
    const ac = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/rewrite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "a draft to abort" }),
        signal: ac.signal,
      });
      const reader = res.body!.getReader();
      await reader.read();
      ac.abort();
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      server.close();
    }
    expect(aborted).toBe(true);
    expect(calls).toBe(1);
  });

  it("maps a thrown error to an error event", async () => {
    const rewrite = async () => { throw new Error("boom"); };
    const { events } = await post(createApp({ system: "S", rewrite }), { text: "hello there" });
    expect(events.at(-1)).toEqual({ event: "error", data: { message: "boom" } });
  });

  it("rejects empty and oversized drafts with 400", async () => {
    const rewrite = async () => ({ text: "", stopReason: "end_turn" });
    const app = createApp({ system: "S", rewrite });
    expect((await post(app, { text: "   " })).status).toBe(400);
    const big = await post(app, { text: "x".repeat(20_001) });
    expect(big.status).toBe(400);
    expect(big.json.message).toContain("20000");
  });
});
