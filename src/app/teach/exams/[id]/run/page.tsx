import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveBoard } from "@/components/run/live-board";
import { ExtensionList } from "@/components/run/extension-list";
import { ScheduleForm } from "@/components/run/schedule-form";
import { CodeGenerator, PreviewButton, StateControls } from "@/components/teach/exam-actions";
import { LocalTime } from "@/components/ui/local-time";
import { Section } from "@/components/ui/section";
import { plural } from "@/lib/format";
import { listExtensions, loadLive } from "@/server/run/data";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Run exam" };

export default async function RunPage({ params }: PageProps<"/teach/exams/[id]/run">) {
  const { id } = await params;
  const { user, scope, exam, effective, settings } = await workspaceExam(id);
  if (exam.state === "draft") redirect(`/teach/exams/${id}/verify`);
  const [live, extensions] = await Promise.all([loadLive(scope, id), listExtensions(scope, id)]);
  const inProgress = live?.attempts.filter((a) => a.state === "in_progress").length ?? 0;
  const finished = (live?.attempts.length ?? 0) - inProgress;

  const status =
    effective === "open" ? (
      <>
        Open to students.
        {exam.closesAt && (
          <>
            {" "}Closes <LocalTime iso={exam.closesAt.toISOString()} />.
          </>
        )}
      </>
    ) : effective === "scheduled" ? (
      exam.opensAt ? (
        <>
          Published. Opens by itself <LocalTime iso={exam.opensAt.toISOString()} />.
        </>
      ) : (
        "Published, but not open. Open it now or set a window below."
      )
    ) : effective === "closed" ? (
      `Closed. ${plural(finished, "attempt")} finished. Release results when marking is done.`
    ) : effective === "graded" ? (
      "Graded. Students can’t see results until you release them."
    ) : (
      "Results are released to students."
    );

  return (
    <>
      <Section title="Status" description={status}>
        <div className="flex flex-wrap items-center gap-2">
          <StateControls examId={exam.id} state={exam.state} />
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
          <PreviewButton examId={exam.id} variant="outline" />
        </div>
      </Section>

      <Section title="Window" description="Optional. A published exam opens and closes by itself at these times.">
        <ScheduleForm examId={exam.id} opensAt={exam.opensAt?.toISOString() ?? null} closesAt={exam.closesAt?.toISOString() ?? null} />
      </Section>

      {settings.requireCode && (
        <Section title="Access codes" description="Each code works once and is tied to the first student who uses it.">
          <CodeGenerator examId={exam.id} />
        </Section>
      )}

      <Section
        title="Who’s in"
        description={live && live.attempts.length > 0 ? `${inProgress} in progress · ${finished} finished · updates every 5 seconds` : undefined}
      >
        {live && <LiveBoard initial={live} />}
      </Section>

      {extensions.length > 0 && (
        <Section title="Extra time granted">
          <ExtensionList examId={exam.id} extensions={extensions} canRemoveStanding={user.role === "admin"} />
        </Section>
      )}
    </>
  );
}
