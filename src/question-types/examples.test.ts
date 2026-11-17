import { describe, expect, it } from "vitest";
import { validateQuestion } from "@/engine/generate";
import { examplesFor } from "./examples";
import { questionTypes } from "./registry";

describe("question examples", () => {
  it.each([...questionTypes.keys()])("%s has at least one valid example", (id) => {
    const type = questionTypes.get(id)!;
    const examples = examplesFor(id);
    expect(examples.length).toBeGreaterThan(0);
    for (const e of examples) {
      // Image questions start without their image (the author uploads one); nothing else may block.
      expect(validateQuestion(type, e.def).filter((i) => i.severity === "blocking" && !i.code.endsWith(".no-image"))).toEqual([]);
      expect(e.label).not.toBe("Untitled question");
    }
  });

  it("hands out copies, so editing one never changes the next", () => {
    const [a] = examplesFor("mcq");
    (a.def as { stem: string }).stem = "changed";
    expect((examplesFor("mcq")[0].def as { stem: string }).stem).not.toBe("changed");
  });
});
