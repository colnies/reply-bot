# reply-bot

Paste a draft, get it back in your own voice with no AI tells.

A local web app. It builds a system prompt from a rules file, a short
description of how you write, and real samples of your writing, then streams
a rewrite back from Claude. A regex lint catches the usual tells and reruns
once if any slip through.

## Setup

Using a coding agent? Point it at [AGENTS.md](AGENTS.md) and it will walk you
through this.

1. Node 22 or newer. `npm install`.
2. `cp .env.example .env` and set `ANTHROPIC_API_KEY`. A user-scoped key
   (starts with `sk-ant-usr-`) also needs `ANTHROPIC_WORKSPACE_ID`, from the
   console under Settings > Workspaces.
3. `cp voice/profile.example.md voice/profile.md` and edit it to match how
   you write.
4. Add samples of your writing. See below. Until you do, the server uses
   `voice/samples.example.md` and the output sounds like nobody in particular.
5. `npm run dev` and open http://localhost:3000.

## Your voice

The model sees three files. Edit them, then restart the server.

- `prompts/humanizer.md` - AI tell rules, adapted from blader/humanizer (MIT).
- `voice/profile.md` - how you write, as rules the model can check.
- `voice/samples.md` - real snippets of your writing, in three sections:
  `email`, `chat`, and `post`.

Both `voice/*.md` files are gitignored. Only the `.example.md` templates are
tracked, so your mail never ends up in a commit.

Build the samples:

- Drop sent emails as `.txt` or `.md` into `voice/inbox/`. Separate messages
  with a line containing only `===`. Quoted replies are stripped for you.
- Drop past discussion posts or essays into `voice/inbox/posts/` the same way.
- If you use Claude Code, `npm run voice:transcripts` mines your typed
  messages from its transcripts into `voice/candidates-chat.md`.
- `npm run voice:build` merges everything into `voice/samples.md`. It never
  deletes. Open the file and prune anything you don't want the model to see.

## Modes

- **reply** - chat and email. Cuts words, keeps every claim, drops any quoted
  thread below your message.
- **post** - school discussion posts. Holds the length, keeps paragraphs,
  citations, and names as written.

## Test

`npm test`. Set `LIVE_TEST=1` to include one real API call.

## License

MIT. See [LICENSE](LICENSE).
