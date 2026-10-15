# reply-bot design

Date: 2026-10-14
Status: approved

## Purpose

The user pastes rough text. The app returns the same message rewritten so it
reads like they wrote it: short, direct, no AI tells. Meaning is preserved.
Nothing is invented. Single user, runs on localhost.

Success looks like: the user pastes ten real replies, copies the output without
editing in most cases, and no reader guesses a model was involved.

## What the user said vs. what we assumed

Said:
- Paste in what I want to say, get it back in my voice.
- No AI tells. Use blader/humanizer.
- I speak short and to the point.
- Learn my voice from my sent mail and from how I write to Claude.
- Local web app. Final text only in the output.

- Also used for school discussion posts (added mid-design).

Assumed:
- Two shapes of input. Replies: email, Slack, DMs, comments, short. Posts:
  discussion-board posts for school, a few paragraphs, sometimes with
  citations, usually with a minimum length.
- One user, no auth, no hosting.
- Opus 5.5 is acceptable for cost and quality.

## Architecture

One Node process, TypeScript, ES modules.

```
reply-bot/
  package.json
  tsconfig.json
  .env                      ANTHROPIC_API_KEY (gitignored)
  .env.example
  src/
    app.ts                  Express app factory, static + POST /rewrite
    server.ts               entry: loads .env, checks key, listens
    rewrite.ts              calls Claude, streams, maps errors
    lint.ts                 regex tell detector
    prompt.ts               assembles system prompt from the three files
    voice/
      transcripts.ts        mines ~/.claude/projects/**/*.jsonl
      build.ts              merges candidates into samples.md
  prompts/
    humanizer.md            26 patterns + process, from blader/humanizer (MIT)
  voice/
    profile.md              style rules, hand-written
    samples.md              curated snippets, reviewed by the user
    candidates-chat.md      generated, not committed
    inbox/                  pasted or exported sent mail, not committed
  public/
    index.html
    app.js
    style.css
  test/
    lint.test.ts
    transcripts.test.ts
    prompt.test.ts
    rewrite.live.test.ts
    fixtures/
      session.jsonl
  docs/superpowers/specs/   this file
```

Dependencies: `express`, `@anthropic-ai/sdk`, `dotenv`, `tsx` (dev run),
`vitest` (tests), `typescript`.

## Components

### prompt.ts

Reads `prompts/humanizer.md`, `voice/profile.md`, `voice/samples.md` once at
startup and builds a single system string in that fixed order. Output bytes
must be identical across calls so the prompt cache holds. A file change
requires a restart. Exposes `loadSystem(): string`,
`buildUser(input: string, context?: string, mode?: Mode): string`, and
`buildRetryUser(input, context, mode, findings)` for the second pass, where
`Mode = "reply" | "post"` and the default is `reply`. A fixed trailer after
the samples tells the model it is not in a chat, must never ask questions,
and must not invent missing details.

The user message layout:

```
<context>
{context or "none"}
</context>

<draft>
{input}
</draft>

{mode instruction}
```

Reply mode instruction: rewrite the draft so it reads like the `## chat`
and `## email` samples. Keep every claim. Add nothing. Cut words. If the
draft includes a quoted thread, rewrite only the new message. Output only
the rewritten text.

Post mode instruction: rewrite the draft so it reads like the `## post`
samples, or like the email samples if there are no post samples. Keep
every claim and every paragraph break. Keep the length within ten percent
of the draft, since posts have minimums. Keep quotes, citations, titles,
and names exactly as written. Normal capitalization, full sentences, no
greeting. Output only the rewritten text.

The mode decides instruction text only. The system prompt is the same for
both so the cache is shared.

### rewrite.ts

Calls Claude Opus 5.5 (`claude-opus-5-5`) through the Anthropic SDK with
streaming, adaptive thinking, effort `medium`, `max_tokens` 4096,
`cache_control` on the system block, and the server-side `fallbacks:
"default"` beta. Yields text deltas to the caller. Returns the final text and
stop reason.

On `stop_reason === "refusal"` returns an error the UI shows as "model
declined, try rewording". Other SDK errors surface by class: auth error,
rate limit, connection, other. Each maps to a one-line message.

### lint.ts

`lint(text: string): Finding[]` where `Finding = { rule, match, line }`.
Rules, each a regex or small function:

| rule | catches |
|---|---|
| em-dash | an em-dash character, or a spaced double hyphen |
| curly-quotes | typographic double or single quotes; counts only when another rule also fires, matching humanizer's treatment |
| not-x-but-y | "not (just/only/merely) ... but (rather/also)" within 60 chars |
| triad | a sentence that is only three comma-separated items ending in ", and X" |
| closer | a final sentence under six words starting "In short", "Simply put", "The bottom line", "That's the point" |
| ai-words | whole words: delve, tapestry, testament, landscape, crucial, robust, leverage, seamless, navigate, underscore, pivotal, foster, realm, embark, vibrant, multifaceted |
| hedge-stack | two or more of perhaps, arguably, somewhat, fairly, rather, quite in one sentence |
| chat-residue | "Certainly!", "Absolutely!", "Great question", "I hope this helps". "Let me know if" is excluded because people write it themselves. |
| heading-echo | first line equals the first sentence of the second line |

Rules are data, not logic, so adding one is a one-line change.

### POST /rewrite

Request: `{ text: string, context?: string, mode?: "reply" | "post" }`.
Text max 20,000 chars. Unknown mode values fall back to `reply`.

Response: `text/event-stream`. Events:
- `delta` with `{ text }` as tokens arrive
- `done` with `{ text, findings, reran }`
- `error` with `{ message }`

Flow:
1. Stream a first pass to the client.
2. Lint the result.
3. If findings exist, run one second pass (not streamed) with the findings
   appended to the user message: "The previous attempt contained these
   tells: ... Fix them. Output only the text." Lint again.
4. Send `done` with the final text, remaining findings, and `reran: true`
   when a second pass happened. The client replaces the pane with the final
   text.

Only one rerun. If tells remain, the UI shows the count and the user decides.

### voice/transcripts.ts

Scans `%USERPROFILE%/.claude/projects/**/*.jsonl` (path overridable by env
`CLAUDE_PROJECTS_DIR`). For each line that parses as JSON with
`type === "user"`, extracts the text content. Drops a message when any of
these hold:
- shorter than 20 chars or longer than 600
- starts with `<` (tool results, system reminders)
- contains `tool_result`, `system-reminder`, `Caveat:`, `[Request interrupted`,
  `[Image:`
- is mostly a path, URL, or code: over 30% of chars are `/ \ : _ { } ( ) = ;`
- is from the reply-bot project folder itself

Dedupes exact matches. Writes `voice/candidates-chat.md`, one snippet per
`- ` bullet, newest first, capped at 150. Exposes `mine(dir): string[]` for
testing.

### voice/build.ts

Reads `candidates-chat.md`, every `.txt` or `.md` file in `voice/inbox/`,
and `samples.md`. Appends chat candidates not already present under
`## chat`, and inbox entries not already present under `## email`. In inbox
files, messages are separated by a line containing only `===`; a file with
no separator is one message. Within a message, the first line starting with
`>`, `On ... wrote:`, `-----Original Message-----`, or `From: ` and
everything after it are dropped as quoted reply. Rewrites `samples.md`.
Never deletes. The user prunes by hand.

`samples.md` format: `## email`, `## chat`, and `## post` sections. Each
sample starts with `- ` and continuation lines are indented two spaces.
Files in `voice/inbox/posts/` feed `## post` the same way `voice/inbox/`
feeds `## email`: `===` between posts, quoted-reply stripping applied.
The user pastes past discussion posts there.

### Mail samples

Done once during setup, not by the app. Sent mail reaches `samples.md` one of
two ways: a coding agent with a mail connector pulls messages the user wrote
(not forwards, not blanks), strips quoted replies, and removes anything
private; or the user exports or pastes a batch of sent messages into
`voice/inbox/` as plain text and `voice:build` picks them up under
`## email`. The second path always works. The user reviews `samples.md`
before first run.

### profile.md (initial content, the user edits)

- Short sentences. One idea each.
- Say the thing first. No warm-up.
- Lowercase sentence starts are fine in chat. Normal case in email.
- No greeting or sign-off unless the draft has one.
- No hedging, no "just", no "I think" unless the draft is actually unsure.
- Contractions always.
- No bullet lists in replies. Prose only.
- No em-dashes. Commas or periods.
- Don't add thanks, apologies, or pleasantries the draft didn't have.
- Keep the draft's typos out. Keep its slang in.

For posts:
- Full sentences, normal capitalization, paragraphs kept.
- Plain words over academic ones. Say "use" not "utilize".
- One point per paragraph. Start with the point.
- Don't restate the prompt or the reading. Respond to it.
- Hold the length. Don't pad, don't cut below the draft.

### UI

`index.html`: a reply/post toggle, context input (single line, placeholder
"who's this to, what thread"), draft textarea, Rewrite button, result pane,
Copy button, a small status line under the result (`clean`, `2 tells
left`, or an error). The toggle's last value is remembered in localStorage.
`app.js`: posts to `/rewrite`, reads the event stream, writes deltas into
the result pane, swaps in the final on `done`. Keyboard: Ctrl+Enter
rewrites. Light and dark follow `prefers-color-scheme`. No framework.

## Error handling

| case | behavior |
|---|---|
| no API key | server exits at startup with a one-line message |
| 401 | status line: "API key rejected" |
| 429 | SDK retries twice, then status line: "rate limited, wait a minute" |
| network | status line: "can't reach Anthropic" |
| refusal | status line: "model declined, try rewording" |
| empty draft | button disabled |
| over 20k chars | status line with the limit |

## Testing

- `lint.test.ts`: each rule has a positive and a negative case. A known
  clean sample from `samples.md` produces zero findings.
- `transcripts.test.ts`: fixture jsonl with user text, tool results, a
  system reminder, an image ref, and a path-heavy line. Asserts exactly the
  real messages survive.
- `prompt.test.ts`: `buildSystem()` called twice returns identical strings.
  The humanizer file is included before the profile, which is before samples.
- `rewrite.live.test.ts`: runs only when `LIVE_TEST=1`. One real call with a
  padded draft. Asserts output shorter than input and lint-clean after
  rerun.
- `prompt.test.ts` also checks post mode holds the length instruction and
  reply mode holds the cut instruction.
- Manual acceptance: the user runs ten real drafts, at least three of them
  posts.

## Out of scope for v1

Gmail OAuth inside the app, multiple variants, history, hosting, learning
from edits, automatic refresh of samples.

## Attribution

`prompts/humanizer.md` is adapted from github.com/blader/humanizer, MIT
license. The LICENSE text is kept at the top of that file.
