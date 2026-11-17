import { describe, expect, it } from "vitest";
import { validateAssignment } from "@/engine/assignments/preflight";
import { parseAssignmentSettings } from "@/engine/assignments/settings";
import { courseInfoSchema } from "@/engine/course";
import { BIO, CHEM } from "./academics-content";

describe.each([BIO, CHEM])("$code academics content", (c) => {
  it("has weights that add up to 100% and valid contact details", () => {
    expect(c.categories.reduce((s, x) => s + x.weight, 0)).toBe(100);
    expect(courseInfoSchema.safeParse(c.info).success).toBe(true);
  });
  it("only puts exams and assignments in categories that exist", () => {
    const names = c.categories.map((x) => x.name);
    for (const cat of [...Object.values(c.examCategories), ...c.assignments.map((a) => a.category)]) expect(names).toContain(cat);
  });
  it("has assignments that would pass pre-flight", () => {
    for (const a of c.assignments) {
      const now = Date.now();
      const issues = validateAssignment({
        title: a.title,
        points: a.points,
        opensAt: new Date(now + a.opensInDays * 86_400_000),
        dueAt: new Date(now + a.dueInDays * 86_400_000),
        categoryId: "x",
        categoryIds: ["x"],
        rubric: a.rubric,
        settings: parseAssignmentSettings(a.settings),
      });
      expect(issues, a.title).toEqual([]);
      expect(parseAssignmentSettings(a.settings)).toMatchObject(a.settings);
      if (a.demo !== "open") expect(a.answers.length).toBeGreaterThan(0);
    }
  });
});
