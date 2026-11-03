"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startAttemptAction } from "@/app/attempt/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EnterForm({
  examId,
  requireCode,
  resume,
}: {
  examId: string;
  requireCode: boolean;
  resume: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid max-w-sm gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await startAttemptAction(examId, code);
          if (!r.ok) return setError(r.error);
          router.push(`/attempt/${r.attemptId}`);
        });
      }}
    >
      {requireCode && !resume && (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Access code</span>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            className="font-mono uppercase"
          />
        </label>
      )}
      <Button type="submit" disabled={pending || (requireCode && !resume && !code.trim())}>
        {pending ? "Starting…" : resume ? "Resume exam" : "Start exam"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
