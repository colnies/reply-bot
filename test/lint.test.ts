import { describe, it, expect } from "vitest";
import { lint } from "../src/lint.js";

const rules = (text: string) => lint(text).map((f) => f.rule);

describe("lint", () => {
  it("returns nothing for clean short prose", () => {
    expect(lint("Sounds good. I'll send it over tomorrow.")).toEqual([]);
  });

  it("flags an em-dash and a spaced double hyphen", () => {
    expect(rules("We tried it — it failed.")).toContain("em-dash");
    expect(rules("We tried it -- it failed.")).toContain("em-dash");
    expect(rules("We tried it - it failed.")).not.toContain("em-dash");
  });

  it("flags curly quotes only alongside another finding", () => {
    expect(rules("I don’t think so.")).toEqual([]);
    expect(rules("I don’t think so — really.")).toContain("curly-quotes");
  });

  it("flags not-x-but-y framing", () => {
    expect(rules("It's not about speed but about trust.")).toContain("not-x-but-y");
    expect(rules("This isn't just a tool but a way of working.")).toContain("not-x-but-y");
    expect(rules("I'm not going but Sam is.")).not.toContain("not-x-but-y");
  });

  it("flags a bare triad sentence", () => {
    expect(rules("Fast, cheap, and reliable.")).toContain("triad");
    expect(rules("I bought eggs, milk, and the bread you asked for since we were out.")).not.toContain("triad");
  });

  it("flags a stock closer", () => {
    expect(rules("We shipped it.\nIn short, it worked.")).toContain("closer");
    expect(rules("Bottom line: we need another week.")).toContain("closer");
    expect(rules("Ship it Friday.")).not.toContain("closer");
  });

  it("flags stock AI words as whole words", () => {
    expect(rules("Let's delve into the robust landscape.")).toContain("ai-words");
    expect(rules("The crucifix sat in the museum.")).not.toContain("ai-words");
  });

  it("flags two or more hedges in one sentence", () => {
    expect(rules("It's perhaps somewhat late.")).toContain("hedge-stack");
    expect(rules("It's perhaps late. Somewhat.")).not.toContain("hedge-stack");
  });

  it("flags chat residue", () => {
    expect(rules("Certainly! Here is the plan.")).toContain("chat-residue");
    expect(rules("I hope this helps.")).toContain("chat-residue");
    expect(rules("Let me know if you need anything.")).not.toContain("chat-residue");
  });

  it("flags a short label sentence that only names the previous point", () => {
    expect(rules("The error shrinks each step. That's the vanishing gradient problem. Gates help.")).toContain("label-sentence");
    expect(rules("Attention grows with length. This matters a lot for code generation. A function on line 300...")).toContain("label-sentence");
    expect(rules("That's fine.")).not.toContain("label-sentence");
    expect(rules("This is the second one I tried and it broke in the same place.")).not.toContain("label-sentence");
  });

  it("flags a heading repeated as the first sentence", () => {
    expect(rules("Deploy plan\nDeploy plan. We go Friday.")).toContain("heading-echo");
  });

  it("reports the line number and the matched text", () => {
    const [f] = lint("fine.\nok — sure.");
    expect(f.line).toBe(2);
    expect(f.match).toBe("—");
  });
});
