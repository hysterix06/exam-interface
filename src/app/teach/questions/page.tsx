import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { plural } from "@/lib/format";
import { questionLabel } from "@/lib/question-label";
import { questionTypes } from "@/question-types/registry";
import { requireStaff } from "@/server/access";
import { listCourses, listQuestions, listTopics, type QuestionFilters } from "@/server/authoring/data";

export const metadata: Metadata = { title: "Question bank" };

const STATUS_TONE = { draft: "neutral", active: "success", archived: "neutral" } as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function QuestionsPage({ searchParams }: PageProps<"/teach/questions">) {
  const { scope } = await requireStaff();
  const sp = await searchParams;
  const status = first(sp.status);
  const filters: QuestionFilters = {
    courseId: first(sp.course) || undefined,
    topicId: first(sp.topic) || undefined,
    type: first(sp.type) || undefined,
    status: status === "draft" || status === "active" || status === "archived" ? status : undefined,
    search: first(sp.q) || undefined,
  };
  const [rows, topics, courses] = await Promise.all([listQuestions(scope, filters), listTopics(scope), listCourses(scope)]);
  const filtered = Object.values(filters).some(Boolean);
  const manyCourses = courses.length > 1;
  const visibleTopics = filters.courseId ? topics.filter((t) => t.courseId === filters.courseId) : topics;

  return (
    <>
      <PageHeader
        title="Question bank"
        description={filtered ? `${plural(rows.length, "question")} match.` : `${plural(rows.length, "question")} across ${plural(topics.length, "topic")}.`}
        actions={
          topics.length > 0 ? (
            <Button asChild>
              <Link href={`/teach/questions/new${filters.topicId ? `?topic=${filters.topicId}` : ""}`}>New question</Link>
            </Button>
          ) : null
        }
      />

      <form className="mb-6 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={filters.search} placeholder="Search question text" aria-label="Search question text" className="min-w-48 flex-1" />
        {manyCourses && (
          <Select name="course" defaultValue={filters.courseId ?? ""} aria-label="Course" className="w-auto">
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ?? c.title}
              </option>
            ))}
          </Select>
        )}
        <Select name="topic" defaultValue={filters.topicId ?? ""} aria-label="Topic" className="w-auto">
          <option value="">All topics</option>
          {visibleTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {manyCourses ? `${t.courseTitle}: ${t.name}` : t.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={filters.type ?? ""} aria-label="Type" className="w-auto">
          <option value="">All types</option>
          {[...questionTypes.values()].map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className="w-auto">
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {filtered && (
          <Button asChild variant="ghost">
            <Link href="/teach/questions">Clear</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState action={<Button asChild variant="outline"><Link href="/teach/questions">Clear filters</Link></Button>}>No questions match those filters.</EmptyState>
        ) : topics.length === 0 ? (
          <EmptyState
            action={
              courses[0] ? (
                <Button asChild variant="outline">
                  <Link href={`/teach/courses/${courses[0].id}`}>Add topics</Link>
                </Button>
              ) : undefined
            }
          >
            Questions live in topics. Add a topic to one of your courses first.
          </EmptyState>
        ) : (
          <EmptyState action={<Button asChild><Link href="/teach/questions/new">Write the first question</Link></Button>}>Your question bank is empty.</EmptyState>
        )
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Question</TH>
              <TH>Type</TH>
              <TH>Topic</TH>
              <TH className="text-right">Points</TH>
              <TH>Status</TH>
              <TH>Edited</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((q) => (
              <TR key={q.id}>
                <TD className="max-w-md">
                  <Link href={`/teach/questions/${q.id}`} className="line-clamp-2 font-medium hover:underline">
                    {questionLabel(q.def)}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-muted-foreground">{questionTypes.get(q.type)?.label ?? q.type}</TD>
                <TD className="text-muted-foreground">
                  {q.topicName}
                  {manyCourses && <span className="block text-xs">{q.courseTitle}</span>}
                </TD>
                <TD className="text-right tabular-nums">{q.points}</TD>
                <TD className="whitespace-nowrap">
                  <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">v{q.version}</span>
                </TD>
                <TD className="whitespace-nowrap text-muted-foreground">
                  <LocalTime iso={q.updatedAt.toISOString()} format="date" />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
