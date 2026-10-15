export type Finding = { rule: string; match: string; line: number };

type Rule = { name: string; find: (text: string) => Omit<Finding, "rule">[] };

const lineOf = (text: string, index: number) =>
  text.slice(0, index).split("\n").length;

function regexRule(name: string, re: RegExp): Rule {
  return {
    name,
    find: (text) => {
      const out: Omit<Finding, "rule">[] = [];
      for (const m of text.matchAll(re)) {
        out.push({ match: m[0], line: lineOf(text, m.index ?? 0) });
      }
      return out;
    },
  };
}

type Sentence = { text: string; index: number };

function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+[.!?]*/g;
  for (const m of text.matchAll(re)) {
    const t = m[0].trim();
    if (t) out.push({ text: t, index: (m.index ?? 0) + m[0].indexOf(t) });
  }
  return out;
}

function sentenceRule(name: string, test: (s: string) => boolean): Rule {
  return {
    name,
    find: (text) =>
      sentences(text)
        .filter((s) => test(s.text))
        .map((s) => ({ match: s.text, line: lineOf(text, s.index) })),
  };
}

const AI_WORDS =
  "delve|tapestry|testament|landscape|crucial|robust|leverage|seamless|navigate|underscore|pivotal|foster|realm|embark|vibrant|multifaceted";

const HEDGES = /\b(perhaps|arguably|somewhat|fairly|rather|quite)\b/gi;

const rules: Rule[] = [
  regexRule("em-dash", /—| -- /g),
  regexRule("curly-quotes", /[“”‘’]/g),
  regexRule(
    "not-x-but-y",
    /\b(?:not|isn't|aren't|wasn't)\s+(?:just|only|merely|simply|about)\s[^.;]{1,60}?\bbut\b|\b(?:it's|this is|that's)\s+not\s[^.;]{1,60}?\bbut\b/gi,
  ),
  sentenceRule("triad", (s) => /^[^,]{1,30}, [^,]{1,30}, and [^,]{1,30}[.!?]?$/.test(s)),
  {
    name: "closer",
    find: (text) => {
      const all = sentences(text);
      const last = all[all.length - 1];
      if (!last) return [];
      return /^(in short|simply put|the bottom line|bottom line|that's the point)\b/i.test(last.text)
        ? [{ match: last.text, line: lineOf(text, last.index) }]
        : [];
    },
  },
  regexRule("ai-words", new RegExp(`\\b(${AI_WORDS})\\b`, "gi")),
  sentenceRule("hedge-stack", (s) => (s.match(HEDGES) ?? []).length >= 2),
  // A short sentence that only names or labels the point before it:
  // "That's the vanishing gradient problem." "This matters a lot for X."
  sentenceRule("label-sentence", (s) => {
    const words = s.split(/\s+/).length;
    return (
      words >= 3 &&
      words <= 8 &&
      /^(that's the|that is the|this is the|this matters|that matters|it matters|that's why|this is why)\b/i.test(s)
    );
  }),
  regexRule("chat-residue", /\b(Certainly!|Absolutely!|Great question|I hope this helps)/g),
  {
    name: "heading-echo",
    find: (text) => {
      const lines = text.split("\n");
      if (lines.length < 2) return [];
      const head = lines[0].trim().toLowerCase();
      const first = sentences(lines[1])[0]?.text.replace(/[.!?]+$/, "").trim().toLowerCase();
      return head && first && head === first ? [{ match: lines[0].trim(), line: 1 }] : [];
    },
  },
];

export function lint(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    for (const f of rule.find(text)) findings.push({ rule: rule.name, ...f });
  }
  const others = findings.filter((f) => f.rule !== "curly-quotes");
  const kept = others.length === 0 ? others : findings;
  return kept.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}
