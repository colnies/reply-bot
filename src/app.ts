import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lint } from "./lint.js";
import { buildUser, buildRetryUser, toMode } from "./prompt.js";
import { describeError, type RewriteOpts, type RewriteResult } from "./rewrite.js";

export type Deps = { system: string; rewrite: (o: RewriteOpts) => Promise<RewriteResult> };

const MAX_CHARS = 20_000;
const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(deps: Deps) {
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use(express.static(path.resolve(here, "..", "public")));

  app.post("/rewrite", async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const context = typeof req.body?.context === "string" ? req.body.context : undefined;
    const mode = toMode(req.body?.mode);
    if (!text.trim()) return res.status(400).json({ message: "draft is empty" });
    if (text.length > MAX_CHARS) return res.status(400).json({ message: `draft is over ${MAX_CHARS} characters` });

    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders();
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Listen on res, not req: req "close" also fires once the body is fully read.
    // res "close" before res.end() means the client went away.
    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    try {
      const first = await deps.rewrite({
        system: deps.system,
        user: buildUser(text, context, mode),
        onDelta: (t) => send("delta", { text: t }),
        signal: ac.signal,
      });
      if (first.stopReason === "refusal") {
        send("error", { message: "model declined, try rewording" });
        return res.end();
      }
      if (first.stopReason === "max_tokens") {
        send("error", { message: "output cut off, split the draft" });
        return res.end();
      }
      let finalText = first.text;
      let findings = lint(finalText);
      let reran = false;
      if (findings.length > 0 && !ac.signal.aborted) {
        const second = await deps.rewrite({
          system: deps.system,
          user: buildRetryUser(text, context, mode, findings),
          signal: ac.signal,
        });
        if (second.stopReason === "end_turn" && second.text) {
          finalText = second.text;
          findings = lint(finalText);
          reran = true;
        }
      }
      send("done", { text: finalText, findings, reran });
    } catch (err) {
      if (!ac.signal.aborted) send("error", { message: describeError(err) });
    }
    res.end();
  });

  return app;
}
