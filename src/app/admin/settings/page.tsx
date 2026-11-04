import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { OrgSettingsForm } from "@/components/admin/org-settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { requireAdmin } from "@/server/access";
import { getOrg, systemStatus } from "@/server/admin/org";

export const metadata: Metadata = { title: "Settings" };

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-start gap-2.5">
      <Icon className={ok ? "mt-0.5 size-4 text-success" : "mt-0.5 size-4 text-destructive"} aria-label={ok ? "OK" : "Problem"} />
      <span>
        <span className="font-medium">{label}</span> <span className="text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

export default async function SettingsPage() {
  const { user } = await requireAdmin();
  const [org, status] = await Promise.all([getOrg(user.orgId), systemStatus()]);
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Organisation">
        <OrgSettingsForm name={org.name} settings={org.settings} />
      </Section>
      <Section title="System">
        <ul className="grid gap-2 text-sm">
          <Check ok={status.database} label="Database" detail={status.database ? `reachable (${status.latencyMs} ms)` : "not reachable"} />
          <Check
            ok={status.accounts}
            label="Account management"
            detail={status.accounts ? "available" : "unavailable: SUPABASE_SECRET_KEY isn’t set, so people can’t be added or switched off"}
          />
        </ul>
      </Section>
    </>
  );
}
