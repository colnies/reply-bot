import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

export type RewriteResult = { text: string; stopReason: string | null };

export type RewriteOpts = {
  system: string;
  user: string;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  client?: Anthropic;
};

// User-scoped keys (sk-ant-usr-...) are not bound to a workspace, so the API
// requires an anthropic-workspace-id header. Workspace-scoped keys don't need it.
export function makeClient(env: NodeJS.ProcessEnv = process.env): Anthropic {
  const ws = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {}),
  });
}

let shared: Anthropic | undefined;
const defaultClient = () => (shared ??= makeClient());

export async function rewrite(opts: RewriteOpts): Promise<RewriteResult> {
  const client = opts.client ?? defaultClient();
  const params = {
    model: MODEL,
    // Streaming, so a high cap is safe. 4096 could truncate a long post and
    // thinking tokens count against it too.
    max_tokens: 16000,
    output_config: { effort: "medium" as const },
    betas: ["server-side-fallback-2026-07-01"],
    // Breakpoint on the system block so the varying user message sits after it.
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: opts.user }],
    ...({ fallbacks: "default" } as object),
  };
  const stream = client.beta.messages.stream(params as any, { signal: opts.signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      opts.onDelta?.(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, stopReason: final.stop_reason ?? null };
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "API key rejected";
  if (err instanceof Anthropic.RateLimitError) return "rate limited, wait a minute";
  if (err instanceof Anthropic.APIConnectionError) return "can't reach Anthropic";
  if (err instanceof Anthropic.APIError) return `Anthropic error ${err.status ?? ""}: ${err.message}`.trim();
  if (err instanceof Error) return err.message;
  return String(err);
}
