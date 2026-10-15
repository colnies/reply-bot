# AGENTS.md

Instructions for a coding agent (Claude Code, Codex, Cursor, or similar) that
is helping someone set up and run this repo. Read this whole file before
doing anything. The person you're helping is "the user" below.

## What this is

reply-bot is a local web app. The user pastes a rough draft, and it comes back
rewritten in their own voice with the usual AI tells removed. One Node
process: Express serves a static page and a streaming POST endpoint that calls
Claude. The voice comes from two Markdown files the user writes, plus a rules
file adapted from blader/humanizer. Design notes live in
`docs/superpowers/specs/2026-10-14-reply-bot-design.md`.

## Setup, in order

Do these for the user, or walk them through the ones that need their input.

1. **Install.** Node 22 or newer, then `npm install`.
2. **API key.** Copy `.env.example` to `.env`. The user needs an Anthropic API
   key from https://console.anthropic.com/settings/keys. Put it in
   `ANTHROPIC_API_KEY`. If the key starts with `sk-ant-usr-` it is user-scoped
   and also needs `ANTHROPIC_WORKSPACE_ID`, found in the console under
   Settings > Workspaces. Workspace-scoped keys leave that blank. Never paste
   the key anywhere but `.env`, and never commit `.env`.
3. **Voice profile.** Copy `voice/profile.example.md` to `voice/profile.md`
   and edit it with the user. Ask how they write: sentence length, greetings,
   capitalization, slang, what they never say. Write rules the model can
   check, not adjectives. "No exclamation marks" beats "friendly but direct".
4. **Voice samples.** The app only works well with real writing by the user.
   See "Building the samples" below. Without `voice/samples.md` the server
   falls back to `voice/samples.example.md` and warns at startup, and the
   output will sound generic.
5. **Run.** `npm run dev`, then open http://localhost:3000. The server binds
   to loopback only on purpose. Don't change that: it fronts a live API key.
6. **Check.** `npm test` should pass with no key. `LIVE_TEST=1 npm test` adds
   one real API call.

## Building the samples

`voice/samples.md` has three sections: `## email`, `## chat`, `## post`. Each
sample is a bullet, continuation lines indented two spaces. Twenty or more
samples per section is plenty. The model matches these more than anything in
the profile, so quality matters more than count.

Sources, from easiest to hardest:

- **Pasted text.** The user drops sent emails as `.txt` or `.md` files into
  `voice/inbox/`, one or many messages per file, separated by a line that is
  only `===`. Discussion posts or essays go in `voice/inbox/posts/` the same
  way. Then `npm run voice:build` merges them into `voice/samples.md`. It
  strips quoted replies and never deletes anything already there.
- **Claude Code transcripts.** If the user uses Claude Code,
  `npm run voice:transcripts` mines their typed messages from
  `~/.claude/projects` into `voice/candidates-chat.md`, and `voice:build`
  picks those up for the `## chat` section. Set `CLAUDE_PROJECTS_DIR` if the
  transcripts live elsewhere.
- **A mail connector.** If your session has Gmail or similar, you can search
  the user's sent mail and write the messages into `voice/inbox/` yourself.
  Keep only messages the user wrote: no forwards, no blanks, nothing under
  about fifteen words once the quoted thread is stripped.

Whatever the source, before the first run: tell the user to open
`voice/samples.md` and delete anything they don't want the model to see.
Drop anything private yourself first: account or policy numbers, legal,
health, money tied to a named provider, other people's email addresses.
Don't commit any of it. `voice/profile.md`, `voice/samples.md`,
`voice/candidates-chat.md`, and `voice/inbox/` are gitignored. Keep them that
way. If the user wants their voice files tracked in a private fork, that is
their call, but say the words "these contain your real emails" before they
do it.

## Layout

- `src/server.ts` reads `.env`, warns about missing voice files, starts Express.
- `src/app.ts` is the app and the `POST /rewrite` endpoint. Streams text,
  lints the result, and reruns once with the findings if any tells slipped in.
- `src/rewrite.ts` is the Claude call. Model and parameters live here.
- `src/prompt.ts` assembles the system prompt from `prompts/humanizer.md`,
  the voice profile, and the samples, then the user message for each mode.
- `src/lint.ts` is the regex lint for AI tells.
- `src/voice/` holds the transcript miner and the samples builder.
- `public/` is the UI. Plain HTML, CSS, and JS, no build step.
- `test/` is vitest. One file per module.

## Changing things

- Tests first. Every module has a test file. Add the failing test, then the
  code. `npm test` and `npm run typecheck` must pass before you call anything
  done.
- Prompt files are plain language. When editing `prompts/humanizer.md`, the
  profile, or the instructions in `src/prompt.ts`, write rules the model can
  check. No em-dashes in those files. The lint flags them in output and the
  model copies what it sees.
- The lint is intentionally cheap. Add a rule only for a tell that shows up in
  real output. Each rule needs a test with a true positive and a near miss.
- The model is set in `src/rewrite.ts`. Don't swap it or change the effort
  setting without the user asking.
- TypeScript, ESM, strict. Run with `tsx`, no compile step. Keep it that way.

## Don't

- Don't commit `.env`, anything under `voice/` except the `.example.md`
  files, or anything the user pasted from their mailbox.
- Don't bind the server to anything but 127.0.0.1.
- Don't add a database, auth, or accounts. This is a single-user local tool.
- Don't add dependencies for things Node already does.
