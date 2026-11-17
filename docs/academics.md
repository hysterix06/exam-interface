# Courses, calendar, assignments and grades

Exams are one part of a course. This page covers the rest: the course homepage, the calendar, assignments (homework handed in as text or files and marked against a rubric), and the course grade.

## Course homepages

Every course has a homepage for students (`/courses/[id]`) with five tabs:

| Tab | What's on it |
| --- | --- |
| **Overview** | The course grade so far, what to do now, what's coming up, and how to reach the teachers (name, email, office hours, class times, links). |
| **Syllabus** | The syllabus (Markdown with maths) and the grade weights. |
| **Calendar** | The course's own calendar. |
| **Work** | Exams and assignments in one list: to do now, coming up, done. |
| **Grades** | The course grade with its working, then every item by category. |

Teachers edit all of it in their course workspace (`/teach/courses/[id]`): **Homepage** (description, syllabus with preview, term and dates, contact details, stored as `courses.info` and validated by `courseInfoSchema` in `src/engine/course.ts`), **Calendar**, **Grading** (weights) and **Gradebook**. Students' view is loaded once per request by `studentAcademics()` (`src/server/student/academics.ts`), which the sidebar, home page, calendar and every course tab share.

## Calendar

The calendar is data first (`src/engine/calendar.ts`): `agenda()` lists what overlaps a range, `monthGrid()` lays a month out in whole weeks, and `groupByDay()` buckets items into days. Days belong to the viewer's own time zone, which only the browser knows, so `CalendarView` (`src/components/calendar/`) is a client component that renders UTC on the server and switches to local time on hydration, like `LocalTime`.

Items come from three places:

- **Exams**: their opening and closing times.
- **Assignments**: their due date (a student's extended date if they have one).
- **Course events** (`course_events`): classes, holidays, deadlines and reminders that teachers add. A weekly class is expanded into one row per meeting in the teacher's browser, so "10:00 every Monday" stays at 10:00 across a clock change.

Everyone can subscribe to the same items from their own calendar app (see [Data access](data-access.md)).

## Assignments

An assignment is not an exam. It has no questions, seeds or attempts: just instructions, a due date, points, a rubric, and hand-ins.

**Settings** (`assignmentSettingsSchema`, `src/engine/assignments/settings.ts`): typed text and/or files; how many files (up to 10) and which kinds (PDF, Word, image, plain text, Excel); whether students may hand in again; and the late policy.

**State** is worked out on every read, like `effectiveState()` for exams: `assignmentState()` gives `draft`, `scheduled`, `open`, `late` (past due, still taking penalised work) or `closed`, for one student, taking their extension into account. No background job.

**Late work** (`src/engine/assignments/late.ts`) counts in days, not the exam's minutes: "reject" closes at the due date; "accept" stays open for a number of days and takes a percentage of the points earned per day (or part of one), up to a cap. The rule is shown to students in words (`describeDueLatePolicy()`).

**Handing in** (`src/server/assignments/submit.ts`): each file uploads on its own as soon as it's chosen (at most 10 MB). It is typed by its bytes, not its name: `sniffSubmission()` (`src/engine/assignments/files.ts`) recognises PDFs, images, plain UTF-8 text (never SVG or HTML) and tells Word files from workbooks by the names inside the zip. Files are stored content-addressed in the private `submissions` bucket under the student's own folder. "Hand in" then writes a new `submissions` row (a new version each time). The server confirms every file is really in that folder and takes its size from storage. Once grades are released, the marked version stands and can't be replaced.

**Marking** (`/teach/assignments/[id]/handins/[student]`): the hand-in is on the left (PDFs and images open in place), the rubric on the right. Keys 1–9 tick criteria; "Save & next" moves to the next unmarked student. `gradeSubmission()` (`src/engine/assignments/grade.ts`) scales rubric weights to the points (reusing `markRubric()`), adds the late deduction as its own line, and the client shows the same calculation live. A hand-set total becomes one adjustment line (`overrideLines()`), so lines always add up to the score. Every mark is audited.

**Release**: students see nothing of their mark until the teacher releases grades (`assignments.released_at`). Hand-ins waiting for a mark appear in the Marking page, the sidebar count and the teacher's home, next to exam answers.

Files are downloaded through `/submissions/[id]/files/[n]`, which allows only the student who handed it in and the course's teachers, and then redirects to a 5-minute signed URL.

## The course grade

`courseGrade()` (`src/engine/gradebook/course-grade.ts`) works the grade out the way a syllabus describes it, and writes every step down:

1. Inside a category, **points earned ÷ points available**, after dropping the lowest N items by percentage (always keeping at least one).
2. Categories combine by their **weights**.
3. Categories with nothing graded yet are **left out**, and the other weights are scaled up to 100%. A grade "so far" therefore always means something.
4. Items in no category, and excused work, don't count. With no categories at all, everything counts by its points.

Students' grades only ever use what they can see: released exam scores (the best attempt) and released assignment marks. Work that is missing after hand-ins close counts as zero once grades are released. The teacher's gradebook (`/teach/courses/[id]/gradebook`, `src/server/teach/gradebook.ts`) shows everything marked so far, released or not, flags unreleased columns, and downloads as CSV.

Every course grade is clickable and shows its working (`courseGradeExplanation()`).
