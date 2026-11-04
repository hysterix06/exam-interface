"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOrgAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { RELEASE_LABELS, type ExamSettings } from "@/engine/exam";
import type { OrgSettings } from "@/server/admin/org";

export function OrgSettingsForm({ name, settings }: { name: string; settings: OrgSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="grid max-w-xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const limit = String(f.get("timeLimit") ?? "").trim();
        start(async () => {
          const r = await saveOrgAction({
            name: String(f.get("name") ?? ""),
            settings: {
              defaults: {
                timeLimitMinutes: limit ? Math.max(1, Math.floor(Number(limit)) || 1) : null,
                attemptsAllowed: Math.max(1, Math.floor(Number(f.get("attempts"))) || 1),
                release: String(f.get("release")) as ExamSettings["release"],
              },
            },
          });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      <Field label="Organisation name">
        <Input name="name" defaultValue={name} required />
      </Field>
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-medium">New exams start with</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time limit (minutes)" hint="Blank for no limit.">
            <Input name="timeLimit" type="number" min={1} defaultValue={settings.defaults.timeLimitMinutes ?? ""} />
          </Field>
          <Field label="Attempts allowed">
            <Input name="attempts" type="number" min={1} defaultValue={settings.defaults.attemptsAllowed} />
          </Field>
        </div>
        <Field label="When results are released, students see">
          <Select name="release" defaultValue={settings.defaults.release}>
            {Object.entries(RELEASE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save settings
        </Button>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </form>
  );
}
