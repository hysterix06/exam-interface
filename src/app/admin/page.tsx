import Link from "next/link";

const SECTIONS = [
  { href: "/admin/exams", label: "Run exams", hint: "Open and close exams, watch them live, grant extra time, regrade, and export results." },
  { href: "/admin/review", label: "Marking queue", hint: "Mark written answers against a rubric, one question at a time, anonymously." },
  { href: "/admin/audit", label: "Audit log", hint: "Who changed what, and when, with before and after values." },
];

export default function AdminPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <ul className="mt-6 grid gap-3">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block rounded-lg border p-4 hover:bg-muted/40">
              <span className="block font-medium">{s.label}</span>
              <span className="text-sm text-muted-foreground">{s.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
