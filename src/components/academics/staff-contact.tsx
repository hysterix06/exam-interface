import { describeMeeting, type CourseInfo } from "@/engine/course";

/** Who teaches the course and how to reach them. */
export function StaffContact({ teachers, info }: { teachers: { id: string; name: string; email: string }[]; info: CourseInfo }) {
  return (
    <dl className="grid gap-x-10 gap-y-6 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">{teachers.length === 1 ? "Teacher" : "Teachers"}</dt>
        {teachers.length === 0 ? (
          <dd className="mt-1">Not assigned yet</dd>
        ) : (
          teachers.map((t) => (
            <dd key={t.id} className="mt-1">
              <span className="font-medium">{t.name}</span>
              <br />
              <a href={`mailto:${t.email}`} className="text-brand underline-offset-4 hover:underline">
                {t.email}
              </a>
            </dd>
          ))
        )}
      </div>
      {info.officeHours && (
        <div>
          <dt className="text-muted-foreground">Office hours</dt>
          <dd className="mt-1 whitespace-pre-line">{info.officeHours}</dd>
        </div>
      )}
      {info.meetings.length > 0 && (
        <div>
          <dt className="text-muted-foreground">Class meets</dt>
          {info.meetings.map((m, i) => (
            <dd key={i} className="mt-1">
              {describeMeeting(m)}
            </dd>
          ))}
        </div>
      )}
      {info.contactNote && (
        <div>
          <dt className="text-muted-foreground">Getting in touch</dt>
          <dd className="mt-1 whitespace-pre-line">{info.contactNote}</dd>
        </div>
      )}
      {info.links.length > 0 && (
        <div>
          <dt className="text-muted-foreground">Links</dt>
          {info.links.map((l, i) => (
            <dd key={i} className="mt-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-4 hover:underline">
                {l.label}
              </a>
            </dd>
          ))}
        </div>
      )}
    </dl>
  );
}
