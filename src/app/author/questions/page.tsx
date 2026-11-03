import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { questionLabel } from "@/lib/question-label";
import { questionTypes } from "@/question-types/registry";
import { requireRole } from "@/server/auth";
import { listQuestions, listTopics, type QuestionFilters } from "@/server/authoring/data";

const STATUS_TONE = { draft: "neutral", active: "success", archived: "warning" } as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function QuestionsPage({ searchParams }: PageProps<"/author/questions">) {
  const user = await requireRole("admin", "instructor");
  const sp = await searchParams;
  const status = first(sp.status);
  const filters: QuestionFilters = {
    topicId: first(sp.topic) || undefined,
    type: first(sp.type) || undefined,
    status: status === "draft" || status === "active" || status === "archived" ? status : undefined,
    search: first(sp.q) || undefined,
  };
  const [rows, topics] = await Promise.all([listQuestions(user.orgId, filters), listTopics(user.orgId)]);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Questions</h1>
        <Button asChild>
          <Link href="/author/questions/new">New question</Link>
        </Button>
      </div>

      <form className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
        <Input name="q" defaultValue={filters.search} placeholder="Search question text" aria-label="Search question text" />
        <Select name="topic" defaultValue={filters.topicId ?? ""} aria-label="Topic" className="sm:w-44">
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={filters.type ?? ""} aria-label="Type" className="sm:w-40">
          <option value="">All types</option>
          {[...questionTypes.values()].map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className="sm:w-32">
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {filtered ? (
            <>
              No questions match.{" "}
              <Link href="/author/questions" className="underline">
                Clear filters
              </Link>
            </>
          ) : topics.length === 0 ? (
            <>
              Create a <Link href="/author/topics" className="underline">topic</Link> first, then write your first question.
            </>
          ) : (
            <>
              No questions yet.{" "}
              <Link href="/author/questions/new" className="underline">
                Write the first one
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Question</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Topic</th>
                <th className="px-4 py-2 text-right font-medium">Pts</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t hover:bg-muted/30">
                  <td className="max-w-md px-4 py-2">
                    <Link href={`/author/questions/${q.id}`} className="font-medium hover:underline">
                      {questionLabel(q.def)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{questionTypes.get(q.type)?.label ?? q.type}</td>
                  <td className="px-4 py-2 text-muted-foreground">{q.topicName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{q.points}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">v{q.version}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
