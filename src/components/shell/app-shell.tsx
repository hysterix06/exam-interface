import Link from "next/link";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { listCourses } from "@/server/authoring/data";
import { listReviewExams } from "@/server/review";
import { AccountMenu } from "./account-menu";
import { MobileNav, type NavGroup, SidebarNav } from "./sidebar-nav";
import { TopNav } from "./top-nav";

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
    >
      Skip to content
    </a>
  );
}

async function staffNav(user: CurrentUser): Promise<NavGroup[]> {
  const scope = await scopeFor(user);
  const [review, courses] = await Promise.all([listReviewExams(scope), user.role === "instructor" ? listCourses(scope) : []]);
  const toMark = review.reduce((s, r) => s + r.pending, 0);
  const teaching = [
    { href: "/teach/exams", label: "Exams" },
    { href: "/teach/questions", label: "Question bank" },
    { href: "/teach/marking", label: "Marking", count: toMark },
  ];
  if (user.role === "admin") {
    return [
      {
        items: [
          { href: "/admin", label: "Overview", exact: true },
          { href: "/admin/people", label: "People" },
          { href: "/admin/courses", label: "Courses" },
          { href: "/admin/activity", label: "Activity" },
          { href: "/admin/settings", label: "Settings" },
        ],
      },
      { label: "Teaching", items: teaching },
    ];
  }
  return [
    { items: [{ href: "/teach", label: "Home", exact: true }, ...teaching] },
    {
      label: "Your courses",
      items: courses.length
        ? courses.map((c) => ({ href: `/teach/courses/${c.id}`, label: c.code ? `${c.code} · ${c.title}` : c.title }))
        : [{ href: "/teach/courses", label: "No courses yet" }],
    },
  ];
}

function StaffShell({ user, groups, children }: { user: CurrentUser; groups: NavGroup[]; children: React.ReactNode }) {
  const name = user.fullName ?? user.email;
  const area = user.role === "admin" ? "Admin" : "Teaching";
  const home = user.role === "admin" ? "/admin" : "/teach";
  const wordmark = (
    <Link href={home} className="flex items-baseline gap-2 font-semibold tracking-tight">
      Exam <span className="text-sm font-normal text-muted-foreground">{area}</span>
    </Link>
  );
  return (
    <div className="flex min-h-dvh flex-1">
      <SkipLink />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-muted/20 print:hidden lg:flex">
        <div className="flex h-14 items-center px-5">{wordmark}</div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav groups={groups} />
        </div>
        <div className="border-t p-2">
          <AccountMenu name={name} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 print:hidden lg:hidden">
          <MobileNav groups={groups} title={`Exam ${area}`} />
          {wordmark}
          <div className="ml-auto">
            <AccountMenu compact name={name} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function StudentShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <SkipLink />
      <header className="border-b print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Exam
          </Link>
          <TopNav
            items={[
              { href: "/", label: "Exams", also: "/exams" },
              { href: "/results", label: "Results" },
            ]}
          />
          <div className="ml-auto">
            <AccountMenu compact name={user.fullName ?? user.email} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}

/** Each role gets its own app: a sidebar for staff, a quiet top bar for students. */
export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  if (user.role === "student") return <StudentShell user={user}>{children}</StudentShell>;
  return (
    <StaffShell user={user} groups={await staffNav(user)}>
      {children}
    </StaffShell>
  );
}
