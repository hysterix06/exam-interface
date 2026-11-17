import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3.5)).toBe("3.5");
    expect(csvCell(false)).toBe("false");
  });
  it("defuses spreadsheet formulas in text but not in numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell(-2)).toBe("-2");
  });
  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], [1, null]])).toBe("a,b\r\n1,\r\n");
  });
});

