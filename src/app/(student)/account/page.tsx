import type { Metadata } from "next";
import { NameForm, PasswordForm } from "@/components/shell/account-forms";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireRole } from "@/server/auth";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireRole();
  return (
    <>
      <PageHeader title="Account" description={`${user.email} · ${ROLE_LABELS[user.role]}`} />
      <Section title="Profile">
        <NameForm name={user.fullName ?? ""} />
      </Section>
      <Section title="Password" description="If you were given a one-time password, set your own here.">
        <PasswordForm />
      </Section>
    </>
  );
}
