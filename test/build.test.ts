import { describe, it, expect } from "vitest";
import { parseSamples, splitInbox, stripQuote, buildSamples } from "../src/voice/build.js";

const base = `# Samples of my writing

Each sample starts with "- ". Continuation lines are indented two spaces.

## email

- Hi Jim,
  Can you look around for a better rate?
  Thanks

## chat

- ship it friday

## post

- I agree with the author on the first point.
  The second one does not hold up.
`;

describe("build", () => {
  it("parses sections and multi-line samples", () => {
    const s = parseSamples(base);
    expect(s.email).toEqual(["Hi Jim,\nCan you look around for a better rate?\nThanks"]);
    expect(s.chat).toEqual(["ship it friday"]);
    expect(s.post).toEqual(["I agree with the author on the first point.\nThe second one does not hold up."]);
  });

  it("tolerates a samples file with no post section", () => {
    const s = parseSamples("## email\n\n- hi\n\n## chat\n\n- yo\n");
    expect(s.post).toEqual([]);
  });

  it("splits inbox text on === lines", () => {
    expect(splitInbox("a\n\nb\n===\nc")).toEqual(["a\n\nb", "c"]);
    expect(splitInbox("only one")).toEqual(["only one"]);
  });

  it("strips quoted replies", () => {
    expect(stripQuote("Will ask this week.\n\nOn Sun, Oct 4, 2026 at 8:52 PM Mike wrote:\n> hi")).toBe("Will ask this week.");
    expect(stripQuote("Sure.\n> quoted")).toBe("Sure.");
    expect(stripQuote("Sure.\n-----Original Message-----\nblah")).toBe("Sure.");
  });

  it("strips Apple Mail and full-weekday headers but keeps a sentence starting with On", () => {
    expect(stripQuote("Sure.\nOn Oct 4, 2026, at 8:52 PM, Mike <m@x.com> wrote:\n> hi")).toBe("Sure.");
    expect(stripQuote("Sure.\nOn Monday, October 5, 2026 at 9:00 AM Mike <\nm@x.com> wrote:\n> hi")).toBe("Sure.");
    expect(stripQuote("Sure.\nOn 5 Oct 2026, at 13:13, Mike wrote:\n> hi")).toBe("Sure.");
    expect(stripQuote("On Mon I will send it over.")).toBe("On Mon I will send it over.");
  });

  it("strips a Gmail quote header that wraps onto a second line", () => {
    const msg = "Thanks, they look great.\n\nOn Mon, May 11, 2026 at 1:13 PM Someone Long Name <\nsomeone@example.com> wrote:\n> hi";
    expect(stripQuote(msg)).toBe("Thanks, they look great.");
  });

  it("does not duplicate a multi-paragraph inbox message on rebuild", () => {
    const post = "First paragraph.\n\nSecond paragraph.";
    const once = buildSamples({ existing: base, candidates: [], inbox: [], posts: [post] });
    const twice = buildSamples({ existing: once, candidates: [], inbox: [], posts: [post] });
    expect(parseSamples(twice).post).toEqual(parseSamples(once).post);
    expect(parseSamples(twice).post).toHaveLength(2);
  });

  it("appends new samples and never deletes", () => {
    const out = buildSamples({
      existing: base,
      candidates: ["ship it friday", "can we push to monday"],
      inbox: ["Hey Syd,\nFilling in some spaces.\n\nOn Mon wrote:\n> x"],
      posts: ["The reading overstates the risk.\nTwo of the three studies were small."],
    });
    const s = parseSamples(out);
    expect(s.chat).toEqual(["ship it friday", "can we push to monday"]);
    expect(s.email).toEqual([
      "Hi Jim,\nCan you look around for a better rate?\nThanks",
      "Hey Syd,\nFilling in some spaces.",
    ]);
    expect(s.post).toEqual([
      "I agree with the author on the first point.\nThe second one does not hold up.",
      "The reading overstates the risk.\nTwo of the three studies were small.",
    ]);
    expect(out.startsWith("# Samples of my writing")).toBe(true);
  });
});
