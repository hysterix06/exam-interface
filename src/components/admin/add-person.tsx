"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPersonAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import { OneTimeSecret } from "./one-time-secret";

export function AddPerson({ courses, defaultOpen = false }: { courses: { id: string; title: string }[]; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ name: string; password: string } | null>(null);
  const [role, setRole] = useState<Role>("student");

  const reset = () => {
    setError(null);
    setMade(null);
    setRole("student");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Add person</Button>
      </DialogTrigger>
      <DialogContent title={made ? `${made.name} can sign in` : "Add a person"} description={made ? undefined : "They get an account with a one-time password."}>
        {made ? (
          <>
            <OneTimeSecret label="Their one-time password" value={made.password} />
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Add another
              </Button>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const fullName = String(f.get("fullName") ?? "");
              start(async () => {
                const r = await addPersonAction({
                  fullName,
                  email: String(f.get("email") ?? ""),
                  role,
                  courseId: String(f.get("courseId") ?? "") || null,
                });
                if (!r.ok) return setError(r.error);
                setError(null);
                setMade({ name: fullName.split(" ")[0] || "They", password: r.password });
                router.refresh();
              });
            }}
          >
            <Field label="Name">
              <Input name="fullName" required autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={role === "student" ? "Enrol in" : "Teaches"}>
                <Select name="courseId" defaultValue="">
                  <option value="">No course yet</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {error && <StatusText ok={false}>{error}</StatusText>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add person"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
