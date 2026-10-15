import "dotenv/config";
import { createApp } from "./app.js";
import { serverConfig } from "./config.js";
import { loadSystem, resolveVoice } from "./prompt.js";
import { rewrite } from "./rewrite.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

for (const [name, file] of Object.entries(resolveVoice())) {
  if (file.endsWith(".example.md")) {
    console.warn(`voice/${name}.md not found, using ${file}. Output will sound generic until you add your own. See AGENTS.md.`);
  }
}

const { host, port } = serverConfig();
const app = createApp({ system: loadSystem(), rewrite });
app.listen(port, host, () => {
  console.log(`reply-bot on http://localhost:${port}`);
});
