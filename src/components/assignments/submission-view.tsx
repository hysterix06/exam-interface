import { Download, FileText } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** A hand-in: when, the typed answer, and its files (PDFs and images shown in place when asked). */
export function SubmissionView({
  submission,
  preview = false,
}: {
  submission: { id: string; version: number; submittedAt: string; lateMinutes: number; text: string | null; files: { name: string; bytes: number; mime: string }[] };
  preview?: boolean;
}) {
  const late = submission.lateMinutes;
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {submission.version > 1 ? `Version ${submission.version}, handed in ` : "Handed in "}
        <LocalTime iso={submission.submittedAt} />
        {late > 0 && <span className="text-warning"> · {late >= 1440 ? `${Math.ceil(late / 1440)} day(s)` : late >= 60 ? `${Math.ceil(late / 60)} hour(s)` : `${late} min`} late</span>}
      </p>
      {submission.text && <div className="rounded-md border p-4 text-sm leading-relaxed whitespace-pre-wrap">{submission.text}</div>}
      {submission.files.length > 0 && (
        <ul className="grid gap-4">
          {submission.files.map((f, i) => {
            const href = `/submissions/${submission.id}/files/${i}`;
            const inline = preview && (f.mime === "application/pdf" || f.mime.startsWith("image/"));
            return (
              <li key={i} className="grid gap-2">
                <div className="flex items-center gap-3 text-sm">
                  <FileText aria-hidden className="size-4 text-muted-foreground" />
                  <a href={href} target="_blank" rel="noopener" className="min-w-0 truncate font-medium hover:underline">
                    {f.name}
                  </a>
                  <span className="text-muted-foreground">{size(f.bytes)}</span>
                  <a href={`${href}?download`} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <Download aria-hidden className="size-3.5" /> Download
                  </a>
                </div>
                {inline &&
                  (f.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- access-checked redirect to a signed URL
                    <img src={href} alt={f.name} className="max-h-[70vh] rounded-md border object-contain" />
                  ) : (
                    <iframe src={href} title={f.name} className="h-[70vh] w-full rounded-md border" />
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
