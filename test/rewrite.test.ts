import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { rewrite, describeError, makeClient, MODEL } from "../src/rewrite.js";

function fakeClient(deltas: string[], stopReason = "end_turn") {
  const calls: any[] = [];
  const options: any[] = [];
  const stream = (params: any, opts?: any) => {
    calls.push(params);
    options.push(opts);
    const s: any = {
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) yield { type: "content_block_delta", delta: { type: "text_delta", text: d } };
      },
      finalMessage: async () => ({
        content: [{ type: "text", text: deltas.join("") }],
        stop_reason: stopReason,
      }),
    };
    return s;
  };
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, calls, options };
}

describe("rewrite", () => {
  it("streams deltas and returns the final text", async () => {
    const { client, calls } = fakeClient(["hel", "lo"]);
    const got: string[] = [];
    const r = await rewrite({ system: "S", user: "U", client, onDelta: (t) => got.push(t) });
    expect(got).toEqual(["hel", "lo"]);
    expect(r).toEqual({ text: "hello", stopReason: "end_turn" });
    const p = calls[0];
    expect(p.model).toBe(MODEL);
    expect(p.max_tokens).toBe(16000);
    expect(p.output_config).toEqual({ effort: "medium" });
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.fallbacks).toBe("default");
    // The cache breakpoint must sit on the system block, not top-level: top-level
    // marks the last block (the user message), which changes every call.
    expect(p.cache_control).toBeUndefined();
    expect(p.system).toEqual([{ type: "text", text: "S", cache_control: { type: "ephemeral" } }]);
    expect(p.messages).toEqual([{ role: "user", content: "U" }]);
    expect(p.thinking).toBeUndefined();
  });

  it("forwards the abort signal to the SDK request", async () => {
    const { client, options } = fakeClient(["x"]);
    const ac = new AbortController();
    await rewrite({ system: "S", user: "U", client, signal: ac.signal });
    expect(options[0]?.signal).toBe(ac.signal);
  });

  it("reports a refusal stop reason", async () => {
    const { client } = fakeClient([], "refusal");
    const r = await rewrite({ system: "S", user: "U", client });
    expect(r.stopReason).toBe("refusal");
  });

  it("sends the workspace header only when ANTHROPIC_WORKSPACE_ID is set", () => {
    const withWs = makeClient({ ANTHROPIC_API_KEY: "k", ANTHROPIC_WORKSPACE_ID: "wrkspc_1" });
    const without = makeClient({ ANTHROPIC_API_KEY: "k" });
    expect((withWs as any)._options.defaultHeaders).toEqual({ "anthropic-workspace-id": "wrkspc_1" });
    expect((without as any)._options.defaultHeaders).toBeUndefined();
  });

  it("maps SDK errors to one-line messages", () => {
    expect(describeError(new Anthropic.AuthenticationError(401, {}, "x", new Headers()))).toBe("API key rejected");
    expect(describeError(new Anthropic.RateLimitError(429, {}, "x", new Headers()))).toBe("rate limited, wait a minute");
    expect(describeError(new Anthropic.APIConnectionError({ message: "x" }))).toBe("can't reach Anthropic");
    expect(describeError(new Error("boom"))).toBe("boom");
  });
});
