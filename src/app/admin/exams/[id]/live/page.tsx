import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LiveBoard } from "@/components/admin/live-board";
import { requireRole } from "@/server/auth";
import { loadLive } from "@/server/admin/data";

export default async function LivePage({ params }: PageProps<"/admin/exams/[id]/live">) {
  const user = await requireRole("admin", "instructor");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const live = await loadLive(user.orgId, id);
  if (!live) notFound();
  return (
    <>
      <Link href={`/admin/exams/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {live.exam.title}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">Live view</h1>
      <LiveBoard initial={live} />
    </>
  );
}
