# Architecture

## The three apps

One codebase, three homes. A person's role (stored in `profiles.role`) decides which one they land in. Every page and action re-checks the role from the database.

| Who | Where | What they get |
| --- | --- | --- |
| **Students** | `/` | A sidebar like staff: **Home** (ready for you, this week, courses with their grade, recently graded), **Calendar**, **Grades**, **Your data**, and one entry per course. Each course has Overview · Syllabus · Calendar · Work · Grades. `/assignments/[id]` is where work is handed in. `/attempt/[id]` is the exam screen, with no navigation chrome. |
| **Instructors** | `/teach` | An attention queue: what's live, what needs marking (exam answers and assignment hand-ins), what's ready to release, drafts that fail checks. One exam is one workspace with four tabs: **Build** (autosaves) · **Verify** · **Run** · **Results**. One course is a workspace too: Overview · Homepage · Assignments · Calendar · Grading · Gradebook · People. One assignment: **Edit** · **Hand-ins**. Also: question bank, marking. |
| **Admins** | `/admin` | People (add, CSV import, role, switch off), courses (teachers, enrolment, archive), activity (the audit log) and organisation defaults for new exams. Admins can use every `/teach` page for any course. |

Staff only see the courses they teach. Anything outside their scope is a 404, not a 403.


## Stack and layout

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript | Middleware is `src/proxy.ts`. It only refreshes the session and sends signed-out visitors to `/login`. Roles are checked on every page and action. |
| UI | Tailwind CSS v4, shadcn/ui on Radix | Black and white plus one accent, `--brand`. Shared pieces in `src/components/ui`. Dark mode included. |
| Data | Supabase Postgres + Drizzle ORM | Drizzle (as owner) does every read and write. RLS is on for every table as defense in depth. |
| Auth | Supabase Auth | Role lives in `profiles.role` and is mirrored into the JWT. Deactivated profiles count as signed out. |
| Realtime | Supabase Realtime (`postgres_changes` on `exams`, `attempts`, `assignments`, `submissions`) | Used only as a "something changed" signal; the page then refetches from the server. Falls back to polling. |
| Storage | Supabase Storage, private buckets | `assets` (images, starter workbooks) and `submissions` (uploaded workbooks and assignment hand-ins, up to 10 MB). Hand-ins download through `/submissions/[id]/files/[n]`. Downloads go through `/assets/[id]`, which checks access and redirects to a 5-minute signed URL. |
| Validation | Zod | One set of schemas per question type, shared by editor, renderer and grader |
| Maths and formulas | mathjs (locked down) | Variables, constraints and answer formulas |
| Spreadsheets | HyperFormula | In-browser sheet and the uploaded-workbook checks. ExcelJS reads `.xlsx` uploads on the server. |
| Rich text | react-markdown, remark-gfm/-math/-breaks, rehype-katex, KaTeX | No raw HTML. Images only from the course's own uploads. |
| Drag and drop | dnd-kit | Every drag also works by tap and keyboard |
| Code | QuickJS (WebAssembly) sandbox, CodeMirror 6 editor | Both load lazily |
| Tests | Vitest (with fast-check), Playwright with axe-core | See [Testing](development.md#testing) |

The state of an attempt in progress lives on the server, and components use server actions and local state; there's no client data cache. Motion is a short CSS fade, turned off when the browser asks for reduced motion.

Code layout:

- `src/engine/`: pure logic: selection, generation, grading helpers, pre-flight, simulation, analysis, the adaptive engine, IRT, the sandbox, and explanations
- `src/question-types/<id>/`: one folder per type. Core registry in `registry.ts`; UI registry in `ui-registry.ts` (client only)
- `src/server/`: server-only data access: `authoring`, `attempts`, `run`, `teach`, `admin`, `student` (everything a student sees, per request), `assignments`, `data-export`, `api` (tokens and the v1 route table), `review.ts`, `assets.ts`
- `src/app/`: routes: `(student)`, `attempt`, `teach`, `admin`, `assets`, `submissions`, `export`, `api/v1`, `feeds`, `login`
- `src/db/`: Drizzle schema and the seed (`src/db/seed/`)
- `supabase/migrations/`: Drizzle-generated SQL plus hand-written RLS, triggers and storage buckets
- `public/widgets/`: embeddable widgets (public files: never put anything secret here)
- `e2e/`: Playwright specs


## Data model

Defined in `src/db/schema.ts`. Every top-level table carries `org_id`; it's single-tenant today, but ready for more.

| Table | Holds |
| --- | --- |
| `orgs` | The organisation and its defaults for new exams |
| `profiles` | One per `auth.users` row: name, role, deactivated time |
| `courses`, `enrollments` | Courses, and who teaches or takes each one |
| `topics` | A course's topics, in order |
| `questions` | The editable question: type, definition (JSONB), weight, difficulty, points, tags, variant group, conflicts, status |
| `question_versions` | An immutable copy of every saved version. Exams and attempts only reference these. |
| `exams` | Blueprint and settings (JSONB), state, schedule, and `locked_versions` from publish |
| `exam_codes` | Single-use entry codes (hashed), with who used them and when |
| `attempts` | Seed, deadline, state and score. Plus the sequential cursor, late window and penalty, last-seen time, and the frozen adaptive plan |
| `attempt_items` | The **frozen generated instance** per position. Also the version it was seeded from and the version it's graded against now, the flag, opened and locked times, and the adaptive trace |
| `responses` | The latest answer per item, with a sequence number for ordering |
| `grades` | Score, max and explanation lines. Also who graded it, whether it needs review, and the reason for any hand change |
| `events` | Signals and views (tab switches, pastes, idle, views), never enforced |
| `extensions` | Per-student extra time, for one exam or all of them |
| `audit_log` | Every staff action with before and after values |
| `assets` | Uploaded images and workbooks: storage path, type, size, dimensions, hash |
| `grade_categories` | A course's grade weights; exams and assignments point at one (`category_id`) |
| `course_events` | Classes, holidays and reminders teachers add to a course calendar |
| `assignments` | Instructions, dates, points, settings and rubric (JSONB), state, `released_at` |
| `submissions` | Every hand-in, every version: text, files (storage paths), time, minutes late |
| `submission_grades` | The mark on one hand-in: lines, ticks, feedback, late penalty, excused, override reason |
| `assignment_extensions` | One student's later due date on one assignment |
| `api_tokens` | Personal API tokens and calendar feeds: sha256 only, prefix, last used, expiry, revoked |

Courses also carry their homepage: `description`, `syllabus` (Markdown), `term`, `starts_on`/`ends_on` and `info` (meetings, office hours, contact note, links).

