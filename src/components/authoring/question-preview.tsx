"use client";

import { ButtonTabs } from "@/components/ui/button-tabs";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exploreVariants } from "@/engine/authoring/variants";
import { createRng } from "@/engine/rng";
import { getQuestionType } from "@/question-types/registry";
import { getQuestionTypeUi } from "@/question-types/ui-registry";
import { GradeLines } from "./grade-lines";

type Tab = "student" | "variants";

/**
 * Live preview of one question exactly as a student would get it for a seed,
 * plus the answer key, the variables used, a "try it" grader, and the variant
 * explorer. Everything runs the same pure core the server uses.
 */
export function QuestionPreview({
  typeId,
  def,
  points,
}: {
  typeId: string;
  def: unknown;
  points: number;
}) {
  const [tab, setTab] = useState<Tab>("student");
  const [seed, setSeed] = useState("preview-1");
  const [answer, setAnswer] = useState<{ forSeed: string; value: unknown } | null>(null);

  const type = getQuestionType(typeId);
  const ui = getQuestionTypeUi(typeId);

  const generated = useMemo(() => {
    const parsed = type.defSchema.safeParse(def);
    if (!parsed.success) return { error: "Finish the question to see a preview." } as const;
    try {
      return { ok: type.generate(parsed.data, createRng(seed)) } as const;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as const;
    }
  }, [type, def, seed]);

  const variants = useMemo(
    () => (tab === "variants" ? exploreVariants(typeId, def) : null),
    [tab, typeId, def],
  );

  const reroll = () => {
    const n = Number(/(\d+)$/.exec(seed)?.[1] ?? 0);
    setSeed(`preview-${n + 1}`);
  };

  // An answer typed for one seed isn't meaningful for another.
  const value = answer && answer.forSeed === seed ? answer.value : null;

  return (
    <div className="grid gap-4">
      <ButtonTabs
        label="Preview"
        value={tab}
        onChange={setTab}
        options={[
          { value: "student", label: "Student view" },
          { value: "variants", label: "Variants" },
        ]}
      />

      {tab === "student" && (
        <>
          <div className="flex items-end gap-2">
            <label className="grid flex-1 gap-1 text-xs text-muted-foreground">
              Preview with seed
              <Input value={seed} onChange={(e) => setSeed(e.target.value)} className="font-mono" />
            </label>
            <Button type="button" variant="outline" onClick={reroll}>
              <RefreshCw /> Reroll
            </Button>
          </div>

          {"error" in generated ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {generated.error}
            </p>
          ) : (
            (() => {
              const { instance, vars } = generated.ok;
              const { Renderer } = ui;
              const result = type.grade(instance, value as never, { points });
              const keyed = type.keyResponse(instance);
              return (
                <>
                  <div className="rounded-lg border p-5">
                    <Renderer
                      instance={type.redact(instance)}
                      value={value}
                      onChange={(v: unknown) => setAnswer({ forSeed: seed, value: v })}
                    />
                  </div>

                  {Object.keys(vars).length > 0 && (
                    <section>
                      <h3 className="mb-1 text-sm font-medium">Variables used</h3>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 font-mono text-xs">
                        {Object.entries(vars).map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd>{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}

                  <section>
                    <h3 className="mb-1 text-sm font-medium">Answer key</h3>
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <Renderer instance={type.redact(instance)} value={keyed} readOnly />
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-1 text-sm font-medium">Try answering</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Answer above to see exactly how it would be graded, worth {points}{" "}
                      {points === 1 ? "point" : "points"}.
                    </p>
                    <GradeLines result={result} />
                  </section>
                </>
              );
            })()
          )}
        </>
      )}

      {tab === "variants" && variants && (
        <>
          {!variants.ok ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Finish the question to explore variants.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {variants.rows.length} generated versions, {variants.distinct} distinct. Check the answers
                look right, especially the odd cases.
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Seed</th>
                      <th className="px-3 py-2 font-medium">Variables</th>
                      <th className="px-3 py-2 font-medium">Question and answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.rows.map((r) => {
                      const { Renderer } = ui;
                      return (
                        <tr key={r.seed} className="border-t align-top">
                          <td className="px-3 py-2 font-mono text-xs">{r.seed}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {Object.keys(r.vars).length
                              ? Object.entries(r.vars).map(([k, v]) => `${k}=${v}`).join(", ")
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Renderer instance={type.redact(r.instance)} value={r.key} readOnly />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
