"use client";

import { useState, useTransition } from "react";
import { changePasswordAction, updateNameAction } from "@/app/(student)/account/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";

export function NameForm({ name }: { name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex max-w-md flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get("name") ?? "");
        start(async () => {
          const r = await updateNameAction(v);
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
        });
      }}
    >
      <Field label="Name" className="min-w-56 flex-1">
        <Input name="name" defaultValue={name} required autoComplete="name" />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        Save
      </Button>
      {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
    </form>
  );
}

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const next = String(f.get("next") ?? "");
        if (next !== String(f.get("confirm") ?? "")) return setMsg({ ok: false, text: "The new passwords don’t match." });
        start(async () => {
          const r = await changePasswordAction({ current: String(f.get("current") ?? ""), next });
          setMsg(r.ok ? { ok: true, text: "Password changed." } : { ok: false, text: r.error });
          if (r.ok) form.reset();
        });
      }}
    >
      <Field label="Current password">
        <Input name="current" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <Input name="next" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="New password, again">
        <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Change password
        </Button>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </form>
  );
}
