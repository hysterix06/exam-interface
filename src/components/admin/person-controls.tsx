"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetPasswordAction, setActiveAction, setRoleAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { StatusText } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import { OneTimeSecret } from "./one-time-secret";

/** Role, sign-in access and password for one person. */
export function PersonControls({ id, role, active, isSelf }: { id: string; role: Role; active: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Something went wrong." });
      if (r.ok) router.refresh();
    });

  return (
    <div className="grid gap-6">
      <Field label="Role" hint="Instructors only see the courses they teach. Administrators see everything." className="max-w-xs">
        <Select
          defaultValue={role}
          disabled={pending}
          onChange={(e) => run(() => setRoleAction({ id, role: e.target.value as Role }), "Role changed.")}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Dialog onOpenChange={(o) => !o && setPassword(null)}>
          <DialogTrigger asChild>
            <Button variant="outline">Reset password</Button>
          </DialogTrigger>
          <DialogContent title="Reset password" description={password ? undefined : "Their current password stops working straight away."}>
            {password ? (
              <OneTimeSecret label="Their new one-time password" value={password} />
            ) : (
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await resetPasswordAction(id);
                      if (r.ok) setPassword(r.password);
                      else setMsg({ ok: false, text: r.error });
                    })
                  }
                >
                  Reset
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {!isSelf &&
          (active ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Switch off account</Button>
              </DialogTrigger>
              <DialogContent title="Switch off this account?" description="They’re signed out and can’t sign in. Their attempts, grades and history are kept, and you can switch it back on.">
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="destructive" onClick={() => run(() => setActiveAction({ id, active: false }), "Account switched off.")}>
                      Switch off
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Button variant="outline" disabled={pending} onClick={() => run(() => setActiveAction({ id, active: true }), "Account switched back on.")}>
              Switch account back on
            </Button>
          ))}
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </div>
  );
}
