"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createApiTokenAction, resetCalendarFeedAction, revokeTokenAction } from "@/app/(student)/account/data/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { StatusText } from "@/components/ui/notice";
import { Row, RowList } from "@/components/ui/row-list";
import { Select } from "@/components/ui/select";

function Secret({ value, hint }: { value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5" role="status">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm whitespace-nowrap select-all">{value}</code>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

/** The private calendar URL: shown once when made; making a new one turns the old one off. */
export function CalendarFeed({ hasFeed, origin }: { hasFeed: boolean; origin: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-4">
      {url ? (
        <Secret value={url} hint="Paste it into Google Calendar (Other calendars → From URL), Apple Calendar (File → New Calendar Subscription) or Outlook. It’s private: anyone with it can read your calendar. This is the only time it’s shown." />
      ) : (
        <p className="text-sm text-muted-foreground">
          {hasFeed ? "You have a calendar feed. For your privacy its address isn’t shown again; make a new one if you need it (the old one stops working)." : "Subscribe from your own calendar app; it stays up to date by itself."}
        </p>
      )}
      <div>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            (!hasFeed || confirm("Make a new address? The current one stops working.")) &&
            start(async () => {
              const r = await resetCalendarFeedAction();
              setUrl(`${origin}/feeds/${r.secret}.ics`);
              router.refresh();
            })
          }
        >
          {hasFeed ? "Make a new address" : "Get my calendar address"}
        </Button>
      </div>
    </div>
  );
}

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Read-only API tokens: make one (shown once), see when each was last used, revoke. */
export function ApiTokens({ tokens }: { tokens: TokenRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createApiTokenAction({ name, expiresInDays: days === "never" ? null : Number(days) });
            if (!r.ok) return setError(r.error);
            setError(null);
            setSecret(r.secret);
            setName("");
            router.refresh();
          });
        }}
      >
        <Field label="Token name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My grade tracker" required />
        </Field>
        <Field label="Expires">
          <Select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
            <option value="never">Never</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          Create token
        </Button>
      </form>
      {error && <StatusText ok={false}>{error}</StatusText>}
      {secret && <Secret value={secret} hint="Copy it now: it won’t be shown again. It can read everything you can see in Modus, and nothing more." />}
      {tokens.length > 0 && (
        <RowList>
          {tokens.map((t) => (
            <Row
              key={t.id}
              title={t.name}
              detail={
                <>
                  <code className="font-mono">{t.prefix}…</code>
                  {" · "}
                  {t.lastUsedAt ? (
                    <>
                      used <LocalTime iso={t.lastUsedAt} format="relative" />
                    </>
                  ) : (
                    "never used"
                  )}
                  {t.expiresAt && (
                    <>
                      {" · expires "}
                      <LocalTime iso={t.expiresAt} format="date" />
                    </>
                  )}
                </>
              }
              aside={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeTokenAction(t.id);
                      if (r.ok) router.refresh();
                    })
                  }
                >
                  Revoke
                </Button>
              }
            />
          ))}
        </RowList>
      )}
    </div>
  );
}
