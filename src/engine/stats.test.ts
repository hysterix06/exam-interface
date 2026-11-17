import { describe, expect, it } from "vitest";
import { averagePercent, medianPercent } from "./stats";

describe("explained stats", () => {
  it("averages with its working", () => {
    const a = averagePercent([50, 70, 90])!;
    expect(a.value).toBe(70);
    expect(a.explanation.inputs.map((i) => i.value)).toEqual(["3", "210%", "210% ÷ 3 = 70%"]);
    expect(averagePercent([])).toBeNull();
  });

  it("takes the middle value, or the mean of the middle two", () => {
    const odd = medianPercent([90, 10, 50])!;
    expect(odd.value).toBe(50);
    expect(odd.explanation.inputs[1]).toEqual({ label: "Student 2 of 3", value: "50%" });
    const even = medianPercent([10, 40, 60, 90])!;
    expect(even.value).toBe(50);
    expect(even.explanation.inputs.at(-1)!.value).toBe("(40% + 60%) ÷ 2 = 50%");
    expect(medianPercent([])).toBeNull();
  });
});
