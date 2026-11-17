import { describe, expect, it } from "vitest";
import { sniffFile } from "@/engine/image-size";
import { parseWorkbook } from "@/lib/xlsx";
import { fieldCountsWorkbook, SEED_PNGS } from "./images";

describe("seed images", () => {
  it.each(Object.keys(SEED_PNGS))("%s is a valid 800×600 PNG", (name) => {
    expect(sniffFile(SEED_PNGS[name]())).toEqual({ kind: "image", mime: "image/png", width: 800, height: 600 });
  });

  it("builds a starter workbook the parser reads", async () => {
    const r = await parseWorkbook(await fieldCountsWorkbook(), { rows: 10, cols: 3 });
    if ("error" in r) throw new Error(r.error);
    expect(r.cells).toMatchObject({ A1: "Quadrat", B2: "12", A8: "Total" });
  });
});
