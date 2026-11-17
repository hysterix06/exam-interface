import { describe, expect, it } from "vitest";
import { applyTemplate, EXAM_TEMPLATES, templateById } from "./exam-templates";

describe("exam templates", () => {
  const topics = [
    { id: "a", drawable: 10 },
    { id: "b", drawable: 1 },
    { id: "c", drawable: 0 },
  ];

  it("blank keeps the org defaults and adds no sections", () => {
    const r = applyTemplate(templateById("blank"), { timeLimitMinutes: 45 }, topics);
    expect(r.settings.timeLimitMinutes).toBe(45);
    expect(r.blueprint.sections).toEqual([]);
  });

  it("draws per topic without exceeding what a topic holds", () => {
    const r = applyTemplate(templateById("midterm"), {}, topics);
    expect(r.blueprint.sections).toEqual([
      { topicId: "a", count: 5 },
      { topicId: "b", count: 1 },
    ]);
    expect(r.settings).toMatchObject({ timeLimitMinutes: 60, requireCode: true, release: "answers" });
  });

  it("overrides defaults and falls back to blank for unknown ids", () => {
    expect(applyTemplate(templateById("practice"), { timeLimitMinutes: 45 }, []).settings.timeLimitMinutes).toBeNull();
    expect(templateById("nope").id).toBe("blank");
    expect(templateById(undefined).id).toBe("blank");
    for (const t of EXAM_TEMPLATES) expect(() => applyTemplate(t, {}, topics)).not.toThrow();
  });
});
