import Link from "next/link";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { scopeFor } from "@/server/access";
import type { CurrentUser } from "@/server/auth";
import { listCourses } from "@/server/authoring/data";
import { listAssignmentsToMark } from "@/server/assignments/authoring";
import { listReviewExams } from "@/server/review";
import { studentAcademics } from "@/server/student/academics";
import { AccountMenu } from "./account-menu";
import { Wordmark } from "./logo";
import { MobileNav, type NavGroup, SidebarNav } from "./sidebar-nav";

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
  const [review, handIns, courses] = await Promise.all([listReviewExams(scope), listAssignmentsToMark(scope), user.role === "instructor" ? listCourses(scope) : []]);
  const toMark = review.reduce((s, r) => s + r.pending, 0) + handIns.reduce((s, r) => s + r.pending, 0);
  const teaching = [
    { href: "/teach/exams", label: "Exams" },
    { href: "/teach/assignments", label: "Assignments" },
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function studentNav(user: CurrentUser): Promise<NavGroup[]> {
  const all = await studentAcademics(user);
  const until = Date.now() + WEEK_MS;
  // Per course: open work due within a week (or already overdue but still accepted).
  const due = (courseId: string) =>
    all.assignments.filter((a) => a.courseId === courseId && (a.status === "overdue" || (a.status === "to-do" && a.dueAt && Date.parse(a.dueAt) <= until))).length +
    all.exams.filter((e) => e.courseId === courseId && (e.inProgressId || (e.state === "open" && e.attemptsLeft > 0))).length;
  return [
    {
      items: [
        { href: "/", label: "Home", exact: true },
        { href: "/calendar", label: "Calendar" },
        { href: "/grades", label: "Grades" },
      ],
    },
    {
      label: "Your courses",
      items: all.courses.length
        ? all.courses.map((c) => ({ href: `/courses/${c.id}`, label: c.label, count: due(c.id) }))
        : [{ href: "/courses", label: "No courses yet" }],
    },
  ];
}

/** The app frame for every role: a sidebar on wide screens, a menu button on narrow ones. */
function SidebarShell({ user, groups, area, home, children }: { user: CurrentUser; groups: NavGroup[]; area?: string; home: string; children: React.ReactNode }) {
  const name = user.fullName ?? user.email;
  const wordmark = (
    <Link href={home} className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Wordmark area={area} />
    </Link>
  );
  return (
    <div className="flex min-h-dvh flex-1">
      <SkipLink />
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-muted/30 print:hidden lg:flex">
        <div className="flex h-16 items-center px-6">{wordmark}</div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav groups={groups} />
        </div>
        <div className="border-t p-3">
          <AccountMenu name={name} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b px-4 print:hidden sm:px-6 lg:hidden">
          <MobileNav groups={groups} title={area ? `Modus ${area}` : "Modus"} />
          {wordmark}
          <div className="ml-auto">
            <AccountMenu compact name={name} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-10 lg:pt-14">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Each role gets its own app, in the same frame: its own home, nav and name. */
export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  if (user.role === "student") {
    return (
      <SidebarShell user={user} groups={await studentNav(user)} home="/">
        {children}
      </SidebarShell>
    );
  }
  return (
    <SidebarShell user={user} groups={await staffNav(user)} area={user.role === "admin" ? "Admin" : "Teaching"} home={user.role === "admin" ? "/admin" : "/teach"}>
      {children}
    </SidebarShell>
  );
}
