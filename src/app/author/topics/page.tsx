import { TopicsManager } from "@/components/authoring/topics-manager";
import { requireRole } from "@/server/auth";
import { listCourses, listTopics } from "@/server/authoring/data";

export default async function TopicsPage() {
  const user = await requireRole("admin", "instructor");
  const [courses, topics] = await Promise.all([listCourses(user.orgId), listTopics(user.orgId)]);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
      <p className="mt-2 mb-8 max-w-prose text-sm text-muted-foreground">
        Exams draw questions by topic, so each topic is a pool. Rename a topic by editing it in place.
      </p>
      <TopicsManager courses={courses} topics={topics} />
    </>
  );
}
