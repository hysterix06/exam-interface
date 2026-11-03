# Exam App: Stack and Plan

Working name: Exam. A showcase of how intelligent a testing app can be. The UI is the product; integrity tooling is a deliberate non-goal (kept in mind, not built).

**Version 1 uses no AI.** Every behavior (selection, randomization, grading) is deterministic, rule-based, and explainable. An educator must be able to understand it, verify it, and reproduce it by hand. Intelligence here means good design and good math, not a model.

## 1. Principles

1. **Question types are plugins.** Every type implements the same interface, so adding a new one never touches the core. This is the single most important architectural decision.
2. **Questions are templates, not fixed text.** A "question" is a recipe that produces a concrete *instance* for a given student seed.
3. **Everything random is reproducible.** One seed per attempt (and per question) means any student's exact exam can be regenerated for grading, regrading, and disputes.
4. **Server is the source of truth.** Timer, state, answers, and grading live server-side. The client is a view.
5. **Grading is pure functions.** `grade(instance, response) -> score + feedback`. Easy to test, easy to regrade.
6. **Design:** minimal, high-contrast, typographically restrained. Exam-taking screen should be nearly empty chrome: question, answer, progress, timer.
7. **No black boxes.** If the app makes a decision (which questions a student got, why an answer scored 2/3), the educator can see the rule and the inputs that produced it, in plain language.
8. **Show, don't ask them to trust.** Every authoring screen has a live preview, a "simulate" button, and a visible answer key. Nothing is published without a pre-flight check.
9. **No AI in v1.** Deterministic logic only. Architecture should not block adding optional AI assistance later, but nothing may depend on it.

## 2. Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | You already use it; one language end to end; server actions for the grading and attempt logic |
| UI | **Tailwind CSS + shadcn/ui (Radix primitives)** | Accessible components you own and restyle; fits the minimal look |
| Motion | **Framer Motion** (sparingly) | Question transitions, drag-and-drop feel |
| Database | **PostgreSQL** (Neon or Supabase) | Relational data (exams, pools, attempts) plus JSONB for flexible question payloads |
| ORM | **Drizzle** | Typed schema, SQL-like, light |
| Validation | **Zod** | One schema per question type, shared by editor, renderer, and grader |
| Auth | **Auth.js** (or Supabase Auth) + custom **exam access code** layer | Accounts for admins and students; codes gate entry to a specific exam |
| Realtime | **Server-Sent Events (SSE) or Supabase Realtime** | Push "exam is now open" to the home screen, live proctor dashboard |
| Rich text | **TipTap** | Question and answer editing, inline blanks as custom nodes |
| Math | **KaTeX** for rendering, **mathjs** for evaluating expressions | Formulas in questions, parameterized numbers, tolerance-based grading |
| Drag and drop | **dnd-kit** | Ordering and matching questions |
| Spreadsheet widget | **Univer** (or Fortune-sheet) + **HyperFormula** | In-browser Excel-like task, gradable by cell value and formula |
| Code widget | **Monaco** editor (+ optional sandboxed runner later) | Coding questions |
| State | **TanStack Query** + **Zustand** | Server cache plus local attempt state with autosave |
| Testing | **Vitest** (graders, generators), **Playwright** (exam flow end to end) | Graders and randomizers deserve heavy unit tests |
| Hosting | **Vercel** + Neon/Supabase | Zero-ops for a showcase |

Alternative if you want a hard split: Vite + React frontend, Hono/Fastify backend. I would not; Next.js removes a whole layer of glue for this project.

## 3. Question Type System

```ts
interface QuestionType<TDef, TInstance, TResponse> {
  id: string;                       // "mcq", "ordering", "cloze", ...
  defSchema: ZodType<TDef>;         // what an author stores (the template)
  generate(def: TDef, rng: Rng): TInstance;   // template + seed -> concrete question
  Editor: React.FC;                 // author UI
  Renderer: React.FC;               // student UI
  grade(inst: TInstance, resp: TResponse): { score: number; max: number; feedback?: string; needsReview?: boolean };
}
```

### Types to ship
- **Choice:** multiple choice (single and multi-select), true/false, dropdown
- **Text:** short answer (exact, regex, accepted-list, numeric with tolerance and units), long answer (manual or rubric/LLM-assisted)
- **Structured:** ordering, matching (drag lines or drag items), categorization (bucket sort), hotspot (click region on an image), label-the-diagram
- **Cloze / "adlib":** sentence with embedded blanks, each blank can be text, number, dropdown, or drag-in chip. Authoring syntax like `The capital of France is {{text:Paris|paris}} and 2+2 is {{num:4±0}}`
- **Numeric / formula:** parameterized (see section 4), graded against a computed answer
- **Table fill:** a grid where the student fills cells; graded per cell
- **Spreadsheet task:** embedded sheet with starting data, graded by cell values and/or formulas
- **Code:** editor plus test cases (later)
- **Composite / passage-based:** one stimulus (reading, data set, image) with several sub-questions

## 4. The "Intelligent" Part

### 4.1 Pools and blueprints
- Questions belong to **topics**; an exam has a **blueprint**: "5 from Topic A, 3 from Topic B, 2 from Topic C."
- Each question has **weight** (selection likelihood), **difficulty**, **points**, and optional **tags** (Bloom level, learning objective).
- Selection = weighted sampling **without replacement**, with constraints (min/max per topic, difficulty mix, no near-duplicate questions via a `conflictsWith` or `group` field).
- Blueprint can also hold **variant groups**: several different questions that test the same concept, only one drawn.

### 4.2 Parameterized questions
- Variables with generators: `a = int(2,9)`, `price = round(uniform(10,50),2)`, `name = pick(names)`.
- Constraints: `b != a`, `a*b < 100`, "answer must be an integer." The generator retries until constraints hold.
- Computed answer: `answer = a*price*(1+tax)` evaluated with mathjs; grader accepts within tolerance and optionally checks units/sig figs.
- Text variants: swap names, contexts, wording.
- Seeded PRNG (pseudorandom number generator, e.g. `seedrandom` or a small PCG implementation): `seed = hash(attemptId, questionId)`.

### 4.3 Grading
- Auto: exact, set-based, partial credit (per blank, per correct pair, Kendall-tau-style for ordering), numeric tolerance, spreadsheet cell/formula checks.
- Negative marking and "select all" penalty rules configurable per question.
- Manual review queue for long answers: rubric as a checklist of criteria with point values, one-click scoring, keyboard shortcuts, anonymous mode (student names hidden), grade one question across all students at a time.
- Optional rule-based aids for long answers (never auto-final): required-keyword highlighting in the answer text, word count, so the grader works faster. The human always assigns the score.
- Regrade tool: change an answer key, re-run all attempts, see score diffs before applying.

### 4.4 Stretch: adaptive and analytics
- **Item analysis:** difficulty (percent correct), discrimination (point-biserial correlation), distractor analysis. Flags bad questions automatically.
- **Adaptive mode:** pick the next question based on running performance. Starts as simple, explainable difficulty stepping ("answered correctly, so next is one level harder"); item response theory (IRT) based computerized adaptive testing (CAT) is the research-grade version. This is statistics, not AI, but keep the simple version first so it stays explainable.
- **Per-student feedback:** topic-level mastery breakdown after submission.

## 4.5 Educator Clarity and Verification

The audience is a teacher who is not a developer. Goal: they can build an exam, see exactly what it will do, and prove it is correct before a single student touches it.

### Authoring that explains itself
- **Plain-language blueprint summary** at the top of the exam builder, rewritten live: "Each student gets 10 questions: 5 from Cell Biology (easy 2, medium 3), 3 from Genetics, 2 from Ecology. Total 20 points. Estimated time 25 min."
- **Pool health indicators:** warn when a pool is too small for the blueprint ("Genetics has 4 questions but 5 are requested"), when too many questions are near-identical, or when points do not add up.
- **Probability view:** for any question, show "appears on about 33% of student exams." Weights are shown as percentages, not abstract numbers.
- **Live preview with a seed:** see the question exactly as a student would, press "Reroll" to see other versions. Shows the variable values used and the computed answer.
- **Variant explorer:** for a parameterized question, show a table of 20 generated variants with their answers side by side, so the educator can spot-check the math and any weird edge cases (negative numbers, divide by zero).

### Verify before publishing
- **Pre-flight checklist** (blocking and non-blocking items): every question has an answer key, every parameterized question generates successfully 1,000 times, points total matches, time limit set, access settings set, no empty pools.
- **"Take it as a student" mode:** run the whole exam in a sandboxed attempt that is flagged as a preview and excluded from results.
- **"Take it as a perfect student" auto-run:** the app answers every question with its own key and must score 100%. Failure means a broken key. A wrong-answer run should score 0 (or the expected penalty).
- **Simulation:** generate N fake attempts (e.g. 200) with random answers and show the score distribution, how often each question is drawn, and how balanced topics are across students.

### Verify after the exam (grading transparency)
- **Per-question score explanation:** "Blank 2: expected 4.0 (tolerance ±0.1), student wrote 4.05, correct, +1 point." Shown for every graded item.
- **Answer-key view per student:** exact instance the student saw (with variable values) next to their response and the key.
- **Reproduce button:** regenerate any student's exam from its seed and confirm it matches what was stored.
- **Audit log** for every educator action: who changed a key, regraded, granted extra time, overrode a score, and when, with before/after values.
- **Regrade preview:** show which students' scores would change, by how much, before confirming.
- **Export everything:** CSV for scores, plus a full per-student PDF/print view for records and disputes.

### UX conventions
- Inline help text and examples in every editor, short and concrete, no jargon.
- Templates and a sample course so the first exam takes minutes.
- Undo and version history on questions; publishing an exam locks the questions it uses by version.
- Every number the educator sees is clickable to show how it was calculated.

## 5. Exam Lifecycle and Access

States: `draft -> scheduled -> open -> closed -> graded -> released`

- **Student home:** list of exams with info (title, topics, length, rules, window, attempts allowed, status). Info visible before open.
- **Entry:** when `open` (manually by admin or by schedule), student clicks Enter. If the exam requires a code, they enter a **single-use, per-person code**; it is verified and bound to their account at entry, so it cannot be reused by anyone else.
- **Attempt:** server creates the attempt, generates all instances from the seed, starts the server-side timer.
- **In-exam:** autosave on every change, resume after disconnect, flag-for-review, question navigator, optional one-way navigation, per-question and per-exam time limits.
- **Close:** auto-submit at time-out, late-submission rules, admin extensions (per-student accommodations like +25% time).
- **Results:** configurable release (score only, with answers, with feedback, with explanations).

## 6. Embedded Apps and External Tasks

Realistic options, easiest to hardest:

1. **Native widgets (do this first).** Spreadsheet (Univer), table, code editor, whiteboard/diagram canvas, all rendered in-app, so grading is trivial because you own the state.
2. **Sandboxed iframe + `postMessage` protocol.** Any web tool can be embedded if it speaks a small protocol: exam sends `init(state)`, widget sends `response(state)` and `ready`. Lets third parties (or you) build simulators, e.g. a circuit sim, a POS system mock, a booking-engine mock.
3. **Hosted third-party tools** (Google Sheets, Excel Online): possible via embed, but you cannot reliably read the student's work back without OAuth plus their APIs. Treat as a later experiment; native widgets give you 90% of the value.
4. **Desktop-app tasks** (real Excel, etc.): file upload and server-side parsing (e.g. SheetJS/ExcelJS to inspect formulas and values). Works, but is a different UX: download, work, upload.

For a hospitality/finance flavor, a mock **point-of-sale (POS) or property management system (PMS) simulator** as an iframe widget would be a strong demo of this idea.

## 7. Data Model (sketch)

```
users(id, role[admin|instructor|student], ...)
courses(id, ...) / enrollments(user_id, course_id)
topics(id, course_id, name)
questions(id, topic_id, type, def_json, weight, difficulty, points, tags[], version, status)
question_versions(...)                       -- immutable history; attempts reference a version
exams(id, course_id, title, settings_json, blueprint_json, state, opens_at, closes_at)
exam_codes(id, exam_id, code_hash, assigned_user_id?, used_at?)
attempts(id, exam_id, user_id, seed, started_at, deadline_at, submitted_at, state)
attempt_items(id, attempt_id, question_version_id, position, instance_json)  -- frozen generated instance
responses(id, attempt_item_id, response_json, updated_at)
grades(id, attempt_item_id, score, max, feedback, graded_by[auto|user|llm], needs_review)
events(id, attempt_id, type, payload, ts)    -- focus loss, paste, reconnects (logged, not enforced)
```

Key idea: **freeze the generated instance** in `attempt_items`. Even if the template changes later, the attempt remains gradeable.

## 8. Integrity (kept in mind, not built)

Cheap and honest measures only:
- Per-student randomization (already the best deterrent: no two students see the same numbers or order)
- Shuffled option order, question order
- Event log (tab blur, paste, long idle, reconnects) surfaced as *signals* for the instructor, never auto-penalties
- Optional: time-per-question analytics, answer-similarity detection after the fact
- Architecture leaves room for stronger tooling later because the server already owns state

## 9. Build Phases

**Phase 0: Foundation**
Next.js, Tailwind, shadcn, Drizzle, Postgres, auth, role-based access control (RBAC) for admin/instructor/student, design tokens, CI (continuous integration) with Vitest + Playwright.

**Phase 1: Core engine (no UI polish yet)**
Question type interface, Zod schemas, seeded RNG, generators, MCQ/TF/short-answer types, graders with unit tests, blueprint selector with unit tests. *This is the heart; test it hard.*

**Phase 2: Author experience**
Question bank UI, topic management, editor per type with live preview ("preview with seed X"), exam builder with blueprint and settings, plus the educator-clarity features from section 4.5 (plain-language blueprint summary, pool health, variant explorer, pre-flight checklist, perfect-student auto-run, simulation). Build these alongside the editors, not afterward.

**Phase 3: Student experience**
Home, exam info, entry flow with codes, exam-taking screen (autosave, timer, navigator), submission, results.

**Phase 4: More question types**
Ordering, matching, cloze, numeric/parameterized, long answer plus review queue, table fill.

**Phase 5: Admin ops**
Open/close controls, live dashboard (who is in, progress), time extensions, regrade tool with preview, audit log, reproduce-from-seed, CSV and print export.

**Phase 6: Showpieces**
Spreadsheet widget, iframe widget protocol plus a demo simulator, item analysis, adaptive mode (explainable version first). No AI features in this phase or earlier.

**Phase 7: Polish**
Accessibility pass (keyboard, screen reader, contrast), mobile layout, empty/error states, dark mode, demo seed data.

## 10. Kickoff Notes for Claude Code

- Put sections 1, 3, and 7 into `CLAUDE.md` so every session shares the architecture.
- Build Phase 1 test-first; each question type is one folder: `types/<id>/{schema,generate,grade,Editor,Renderer,tests}`.
- Keep graders and generators free of React and database imports so they run anywhere (browser preview, server, tests).
- Seed the database with one demo course and about 40 questions across 4 topics so every feature has something to show.
- Decide naming and visual identity early (typeface, one accent color or none), then enforce it through design tokens.

## 11. Open Decisions

- Name and brand
- Supabase (auth + realtime + DB in one) vs. Neon + Auth.js (more modular)
- AI is out of scope for v1 (decided); revisit only as an optional, clearly labeled assist after the deterministic core is solid
- Single-tenant demo vs. multi-organization from day one (recommend single-tenant, with an `org_id` column kept for later)