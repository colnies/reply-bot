const draft = document.getElementById("draft");
const context = document.getElementById("context");
const go = document.getElementById("go");
const copy = document.getElementById("copy");
const result = document.getElementById("result");
const status = document.getElementById("status");

let busy = false;

function currentMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "reply";
}

// Remember the last mode. Wrapped because storage can be blocked.
try {
  const saved = localStorage.getItem("mode");
  const el = saved && document.querySelector(`input[name="mode"][value="${saved}"]`);
  if (el) el.checked = true;
} catch {}
for (const r of document.querySelectorAll('input[name="mode"]')) {
  r.addEventListener("change", () => {
    try { localStorage.setItem("mode", currentMode()); } catch {}
  });
}

function setStatus(text, isError) {
  status.textContent = text;
  status.className = "status" + (isError ? " err" : "");
}

function refresh() {
  go.disabled = busy || !draft.value.trim();
  copy.disabled = busy || !result.textContent.trim();
}

draft.addEventListener("input", refresh);

async function run() {
  if (go.disabled) return;
  busy = true;
  refresh();
  result.textContent = "";
  setStatus("writing...");
  try {
    const res = await fetch("/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: draft.value, context: context.value, mode: currentMode() }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ message: res.statusText }));
      setStatus(j.message || "request failed", true);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(chunk);
        const dt = /^data: (.*)$/m.exec(chunk);
        if (!ev || !dt) continue;
        handle(ev[1], JSON.parse(dt[1]));
      }
    }
  } catch (e) {
    setStatus("connection lost", true);
  } finally {
    busy = false;
    refresh();
  }
}

function handle(event, data) {
  if (event === "delta") {
    result.textContent += data.text;
  } else if (event === "done") {
    result.textContent = data.text;
    const n = data.findings.length;
    setStatus(n === 0 ? "clean" : `${n} tell${n === 1 ? "" : "s"} left`, n > 0);
  } else if (event === "error") {
    setStatus(data.message, true);
  }
}

go.addEventListener("click", run);
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") run();
});

copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(result.textContent);
  setStatus("copied");
});

refresh();
