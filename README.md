# Exam

An exam app built to show how much a testing tool can do when every decision is deterministic and explainable. Educators build question banks and exams, check them before anyone sits them, run them live and read the results. Students sit exams on a nearly empty screen. Every score, every drawn question and every number on a dashboard can be traced back to a rule and its inputs.

There is **no AI** anywhere in it. Selection, randomisation, grading, adaptive paths and analytics are plain rules and statistics that an educator can follow and check by hand.

- **19 question types**, from multiple choice to sandboxed code, uploaded Excel workbooks, image hotspots and passages with sub-questions
- **Per-student exams** drawn from a blueprint and generated from a seed, so any student's exam can be rebuilt exactly
- **Verification before publishing**: a pre-flight checklist; perfect, blank and all-wrong student runs; a 200-student simulation; a variant explorer
- **Transparency after the exam**: line-by-line grade explanations, Reproduce from seed, a regrade preview, item analysis, an audit log and exports

## Contents

1. [Principles](#principles)
2. [The three apps](#the-three-apps)
3. [Question types](#question-types)
4. [The engine](#the-engine)
5. [Checking an exam](#checking-an-exam)
6. [Running an exam](#running-an-exam)
7. [After the exam](#after-the-exam)
8. [Embedded widgets](#embedded-widgets)
9. [Architecture](#architecture)
10. [Data model](#data-model)
11. [Getting started](#getting-started)
12. [Testing](#testing)
13. [Known limits and licences](#known-limits-and-licences)

## Principles

1. **Question types are plugins.** Every type implements the same interface. Adding one never touches the core.
2. **Questions are templates.** A question is a recipe that generates a concrete *instance* from a seed.
3. **Everything random is reproducible.** There is one seed per attempt, derived per question. Any student's exam can be regenerated exactly.
4. **The server is the source of truth.** Timer, state, answers and grading live on the server. The client is a view.
5. **Grading is a pure function.** `grade(instance, response) → result`, with lines that add up to the score.
6. **Minimal, high-contrast design.** The exam screen is nearly empty chrome: question, answer, progress, timer.
7. **No black boxes.** Every decision (which questions, why a score) is explainable to an educator in plain language.
8. **Show, don't ask for trust.** Live preview, simulation, a visible answer key and pre-flight before publishing.
9. **No AI.** Deterministic logic only.

## The three apps

One codebase, three homes. A person's role (stored in `profiles.role`) decides which one they land in. Every page and action re-checks the role from the database.

| Who | Where | What they get |
| --- | --- | --- |
| **Students** | `/` | What to sit now, what's coming up, and results. Exam info pages list the rules before it opens. `/attempt/[id]` is the exam screen, with no navigation chrome. |
| **Instructors** | `/teach` | An attention queue: what's live, what needs marking, what's ready to release, drafts that fail checks. One exam is one workspace with four tabs: **Build** (autosaves) · **Verify** · **Run** · **Results**. Also: courses, question bank, marking. |
| **Admins** | `/admin` | People (add, CSV import, role, switch off), courses (teachers, enrolment, archive), activity (the audit log) and organisation defaults for new exams. Admins can use every `/teach` page for any course. |

Staff only see the courses they teach. Anything outside their scope is a 404, not a 403.

## Question types

Each type lives in `src/question-types/<id>/`: `core.ts` (pure logic: schemas, generate, grade, key, pre-flight, redact) and `ui.tsx` (editor and renderer). Its fixtures run through a contract suite over 1,000 seeds.

| Type | What the student does | How it's graded |
| --- | --- | --- |
| `mcq` | Picks one or several options | Single: right/wrong with optional negative marking. Multi: all-or-nothing, right-minus-wrong, or per option |
| `true-false` | True or false | Right/wrong, optional penalty |
| `dropdown` | Picks from a dropdown | Right/wrong |
| `short-answer` | Types a word, phrase or number | Accepted list (case and spacing options), regex, or a number with tolerance and units |
| `numeric` | Solves a generated calculation | Variables drawn per student; answer from a formula (mathjs); tolerance, units and optional significant figures (a separate line with its own share) |
| `cloze` | Fills blanks in a sentence: typed text, numbers, dropdowns or drag-in chips | An equal share per blank. Syntax: `{{text:Paris\|paris}}`, `{{num:4±0.1}}`, `{{select:a\|b*}}`, `{{chip:Paris}}` |
| `table-fill` | Fills cells in a table | An equal share per blank cell (same blank syntax) |
| `ordering` | Drags items into order | Share of item pairs in the right order (Kendall tau) |
| `matching` | Drags answers onto items | An equal share per pair; extra wrong answers allowed |
| `categorization` | Sorts items into buckets | An equal share per item; optional penalty |
| `hotspot` | Clicks a place on an image | Rectangle, circle or polygon regions; one or several clicks; optional penalty. Arrow keys work too |
| `label-diagram` | Drags labels onto numbered pins on an image | An equal share per pin; unused labels are distractors |
| `spreadsheet` | Works in an in-browser spreadsheet | Checks on cells: value (with tolerance), "must be a formula", "must use SUM" |
| `file-task` | Downloads a starter `.xlsx`, works in Excel, uploads it | The same cell checks, on the uploaded workbook |
| `widget` | Works in an embedded tool (a till, a hotel front desk) | Checks on paths in the state the widget reports |
| `code` | Writes a JavaScript function | Test cases run in a sandbox; hidden tests stop hard-coding the visible ones |
| `long-answer` | Writes an answer | **By hand**, against a rubric. Keywords are highlighted and words counted to help the marker |
| `whiteboard` | Draws (sketch, graph, annotation) | **By hand**, against a rubric |
| `composite` | Reads a passage, table or figure, then answers parts of any other type | Each part graded by its own type, sharing the points by weight. A written part goes to marking |

Every question can also have **wording variants**: names, places or units that differ per student, written as `[[name]]` anywhere in the question. They're defined once as a table (one row per student) or as lists, and they work for every type. Question text is **Markdown** with **maths** between `$$ … $$`; single `$` signs stay as money. **Templates**: "New question" offers worked examples of each type, and "New exam" offers presets (quick quiz, practice, midterm).

## The engine

All of `src/engine/` is pure TypeScript: no React, no database (lint-enforced). It runs identically on the server, in the browser preview, and in tests.

**Randomness.** The engine has its own PRNG (`sfc32` seeded by `cyrb128`), pinned by golden tests and never changed. Each attempt has one seed, and each question's seed is `hash(attemptSeed : questionVersionId)`. Separate random streams are *forked by label*, so adding a feature never shifts existing draws. A golden digest test (`src/engine/golden/`) proves that today's definitions still generate byte-for-byte what they did.

**Selection** (`src/engine/selection/`). A blueprint is a list of sections: "*N* questions from these topics":
- Draws are weighted sampling without replacement (Efraimidis–Spirakis), seeded per question, so pool order doesn't matter.
- A section can fix its **difficulty mix** ("2 easy, 3 hard").
- A section that spans several topics can set **minimums and maximums per topic**.
- **Variant groups** (at most one per group) and **conflicts** (never together) are respected, and every skip is recorded.
- The selector returns a trace, and the UI turns that trace into sentences: "drawn from Genetics, ranked 1 of 6; its weight is 25% of the candidates."

**Generation.** All generation goes through `generateQuestion()` (`src/engine/generate.ts`), which applies wording variants and then calls the type's own generator. The generated **instance is frozen** in `attempt_items`. It is what the student saw and what is graded, even if the question is edited later.

**Grading.** Grading is pure and returns lines like this one:

```
Blank 2 · expected 4, within ±0.1 · got "4.05" · correct · +1 of 1
```

Line points always add up to the score, and only the total is rounded. Penalties never take a question below zero. Hand-marked lines stay "awaiting a grader" until a person ticks the rubric.

**Adaptive exams** (`src/engine/adaptive-live.ts`). These are optional. The next question is chosen on the server after each answer, by one of two rules:
- **Staircase:** a right answer moves to the next harder level, a wrong one to the next easier level.
- **Rasch:** an ability estimate (EAP over a fixed grid) picks the question whose difficulty is closest. Difficulties come from past results once a question has 30 of them, and from its level until then.

The plan, including each question's difficulty, is frozen when the attempt starts. Each step records the result it was chosen on, so the whole path can be replayed even after a regrade.

**Code sandbox** (`src/engine/sandbox/`). Student JavaScript runs in QuickJS compiled to WebAssembly:
- There's no network, file system or page access.
- Work is capped by a *step count* rather than wall-clock time, so results don't depend on machine speed. Memory and stack are capped too.
- `Date` and `Math.random` are fixed.
- The same engine runs the student's "Run the example tests" button and the grader.

**Explainability as data.** The selector, generator, grader, pre-flight, summary, statistics and item analysis all return structured explanations, and the UI only renders them. Dotted-underlined numbers open their working: the average and median on results, the points and time totals in the builder, difficulty and discrimination in analysis.

## Checking an exam

The **Build** tab rewrites the blueprint as sentences and updates them as you type. For example: "Each student gets 10 questions: 5 from Cell Biology (2 easy, 3 hard)… Total 20 points. Estimated time about 25 min." Below that are:
- **pool health:** a pool too small for its section, variant groups too small, unequal points, near-identical questions;
- each question's chance of appearing ("about 33% of exams", from 1,000 real selector runs);
- the expected Bloom-level mix per student;
- a sample student for any seed, with the reasons each question was drawn.

**Undo and redo** cover the question editor and the blueprint.

Each question has a live preview with a seed and a **Reroll** button. It shows the variable values used, the answer key and a "try answering" grader. A **variant explorer** shows 20 versions side by side.

**Verify** runs the **pre-flight checklist**. Blocking items stop publishing:
- every section can be filled;
- every question is complete and generates 1,000 times without an error;
- points add up;
- the time limit compares sensibly with the estimate;
- access settings are chosen;
- adaptive exams have a pool that can carry every student through;
- answering every question with its own key scores 100%, leaving everything blank scores 0, and answering everything wrong earns nothing (or only the expected negative marking).

Verify also has:
- **Simulate 200 students:** topic balance, how often each question is drawn, and the score spread with random answers;
- **Take it as a student:** a preview attempt, flagged and excluded from results;
- an **adaptive preview** of the path a pretend student would take.

Publishing locks the exam to the question versions current at that moment, so later edits never change a published exam.

## Running an exam

Exam states are `draft → scheduled → open → closed → graded → released`. A schedule opens and closes an exam on time without any background job (`effectiveState()`).

- **Entry** can require a **single-use, per-person code**. The code is hashed, then bound to the student at the moment they redeem it.
- The **exam screen** autosaves every change (with ordering and retries), resumes after a disconnect, and has flag-for-review, a navigator and a server-synced timer. It also announces time for screen readers and moves focus to each new question.
- **One-way** and **per-question time limits** are enforced by the server. It hands out and accepts only the current question, and a timed question locks when its time is up.
- **Late work** follows the exam's policy: either submit automatically at the deadline (the default), or accept work for a set window, taking a percentage of the points earned per minute late, up to a cap. Students see the working.
- **Extensions** are per student, a multiplier (for example ×1.25), extra minutes, or both. They apply to attempts already in progress: the open exam picks up the new deadline straight away.
- The **live board** on Run shows who's in, their progress, which question each is on, time left and signals. It updates through **Supabase Realtime**, with a polling fallback.
- **Signals** are logged but never enforced: tab switches, pastes, idle periods, going offline, and time per question.

## After the exam

- **Results:** stats (each one explains itself), every attempt, and the full audit trail for the exam.
- **Attempt view:** exactly what the student saw, their answer, the key, their variable values, approximate time per question, the grade lines, and (for adaptive exams) why each question was picked. **Reproduce** rebuilds the exam from its seed and confirms it matches.
- **Marking:** one question across every student at a time, anonymous by default. It's rubric-based, with keyboard shortcuts (1–9 to tick, Enter to save, S to skip). It works for every hand-marked type, including written parts of passages.
- **Score changes by hand** keep the grader's lines and add one adjustment line with the reason.
- **Regrade:** edit a question, preview who would gain or lose what, then apply. Hand-marked and hand-changed scores are kept.
- **Item analysis:**
  - difficulty (share of points earned) and discrimination (point-biserial against the rest of the exam);
  - which options or choices students picked, for every type with choices, overall and in the top and bottom 27%;
  - typical time per question;
  - automatic flags: too easy, too hard, low or negative discrimination, dead distractors, small sample.
- **Similarity signals:** pairs of students who shared the same *uncommon wrong* answer on several questions, or whose written answers share most of their five-word phrases. Each comes with its reasons. It's a prompt to look, never a penalty.
- **Release:** students see one of four levels: score only, plus answers, plus feedback, or full explanations. Results also break down by topic and by learning objective (`lo:` tags).
- **Exports:** a summary CSV (scores, extra time, signals, lateness), an answers CSV (one row per answer), and print or PDF for one attempt or the whole class.

## Embedded widgets

Any web tool can be a question if it speaks a three-message `postMessage` protocol (`src/engine/widget.ts`):

```
exam   → widget   { type: "exam:init", version: 1, state, config, readOnly }
widget → exam     { type: "exam:ready", version: 1 }
widget → exam     { type: "exam:response", version: 1, state }
```

The exam stores `state` as the answer, and checks read values out of it (`total`, `order.length`). Widgets are static files in `public/widgets/`, served same-origin in a sandboxed iframe, and chosen from a registry rather than typed as URLs. Two demos are included:
- `pos-demo`, a point-of-sale till;
- `pms-demo`, a hotel front desk: check a guest into a suitable clean room and post charges to the folio.

## Architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript | Middleware is `src/proxy.ts`. It only refreshes the session and sends signed-out visitors to `/login`. Roles are checked on every page and action. |
| UI | Tailwind CSS v4, shadcn/ui on Radix | Black and white plus one accent, `--brand`. Shared pieces in `src/components/ui`. Dark mode included. |
| Data | Supabase Postgres + Drizzle ORM | Drizzle (as owner) does every read and write. RLS is on for every table as defense in depth. |
| Auth | Supabase Auth | Role lives in `profiles.role` and is mirrored into the JWT. Deactivated profiles count as signed out. |
| Realtime | Supabase Realtime (`postgres_changes` on `exams` and `attempts`) | Used only as a "something changed" signal; the page then refetches from the server. Falls back to polling. |
| Storage | Supabase Storage, private buckets | `assets` (images, starter workbooks) and `submissions` (uploaded workbooks). Downloads go through `/assets/[id]`, which checks access and redirects to a 5-minute signed URL. |
| Validation | Zod | One set of schemas per question type, shared by editor, renderer and grader |
| Maths and formulas | mathjs (locked down) | Variables, constraints and answer formulas |
| Spreadsheets | HyperFormula | In-browser sheet and the uploaded-workbook checks. ExcelJS reads `.xlsx` uploads on the server. |
| Rich text | react-markdown, remark-gfm/-math/-breaks, rehype-katex, KaTeX | No raw HTML. Images only from the course's own uploads. |
| Drag and drop | dnd-kit | Every drag also works by tap and keyboard |
| Code | QuickJS (WebAssembly) sandbox, CodeMirror 6 editor | Both load lazily |
| Tests | Vitest (with fast-check), Playwright with axe-core | See [Testing](#testing) |

The state of an attempt in progress lives on the server, and components use server actions and local state; there's no client data cache. Motion is a short CSS fade, turned off when the browser asks for reduced motion.

Code layout:

- `src/engine/`: pure logic: selection, generation, grading helpers, pre-flight, simulation, analysis, the adaptive engine, IRT, the sandbox, and explanations
- `src/question-types/<id>/`: one folder per type. Core registry in `registry.ts`; UI registry in `ui-registry.ts` (client only)
- `src/server/`: server-only data access: `authoring`, `attempts`, `run`, `teach`, `admin`, `review.ts`, `assets.ts`
- `src/app/`: routes: `(student)`, `attempt`, `teach`, `admin`, `assets`, `login`
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

## Getting started

**You need** Node 24 and a Supabase project (or the Supabase CLI with Docker for a local one).

```bash
npm install
cp .env.example .env.local      # fill in the Supabase URL, keys, DATABASE_URL and SEED_PASSWORD
npm run db:push                 # apply supabase/migrations (tables, RLS, triggers, storage buckets)
npm run db:seed                 # demo org, accounts, courses, banks and exams
npm run dev                     # http://localhost:3000
```

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth and Realtime in the browser |
| `SUPABASE_SECRET_KEY` | Server only: account management, storage, the seed |
| `DATABASE_URL` | Drizzle at runtime and the seed (the transaction pooler) |
| `SEED_PASSWORD` | Password for the demo accounts |

**Demo accounts**, all `@example.com` with `SEED_PASSWORD`:
- `admin`
- `instructor`, who teaches BIO 101
- `instructor2`, who teaches CHEM 101
- `student`, enrolled in both

The organisation is "Northfield College". The seed creates:
- a BIO bank of 30 questions over four topics;
- a draft midterm, an open quiz, and a released practice exam with 30 graded students;
- a CHEM bank with a draft exam;
- two showcase banks covering every question type:
  - "Lab Skills Check" and a "Lab Report" with six answers waiting to be marked;
  - "Field Skills Check", for the newer types, with generated images and a starter workbook.

The seed is safe to run again: it only adds what's missing.

**Scripts**

| Command | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | Route types + `tsc`; ESLint (including jsx-a11y and the engine purity rule) |
| `npm test` / `test:coverage` | Vitest; coverage of the engine and question types (kept at 95%+ lines) |
| `npm run test:e2e` | Playwright against `next dev` and a seeded database |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:seed` | Seed or top up the demo data |

**Making a schema change:** edit `src/db/schema.ts`, then run `npm run db:generate`, then `npm run db:push`. For hand-written SQL (RLS, triggers), run `npx drizzle-kit generate --custom --name <name>` instead of `db:generate`.

**Adding a question type:**
1. Write `core.ts` (pure) and `ui.tsx` in `src/question-types/<id>/`.
2. Register the core in `registry.ts` and the UI in `ui-registry.ts`.
3. Add fixtures to `fixtures.ts`.
4. Add an example question to the seed content.

The contract suite then checks it over 1,000 seeds: deterministic, JSON-safe, key earns full marks, blank earns 0, wrong earns nothing, redaction removes the key. Optional hooks cover hand marking (`review`), a wrong-answer run, time estimates, item analysis tokens, async setup, and responses written only by the server.

## Testing

- **Unit (Vitest):**
  - the question-type contract suite, over 1,000 seeds per fixture;
  - golden tests for the PRNG and for generation (proving old exams still generate the same);
  - tests for every grader, the selector, pre-flight, simulation, analysis, IRT, adaptive paths, the sandbox, similarity, late policy, time per question, the file parsers and the seed content;
  - property tests with fast-check.
- **End-to-end (Playwright, with axe accessibility checks on every screen):**
  - the student flow, including resume;
  - every editor and preview;
  - both showcase exams, including an image loading and a workbook upload;
  - one-way timed exams, adaptive exams, Realtime updates, the widgets, admin and live operations, dark mode and phone layout.

  `e2e/global-setup.ts` resets the demo exams' attempts before each run.
- **CI** (`.github/workflows/ci.yml`):
  - every push: typecheck, lint, unit tests and a build;
  - an `e2e` job against a local Supabase on the runner, also nightly. It's non-blocking while it proves itself.

## Known limits and licences

- **HyperFormula is GPL-3.0** unless you buy a commercial licence. That matters for the spreadsheet and file-task types. Decide before distributing.
- **The QuickJS sandbox is pinned** (`quickjs-emscripten` 0.32.0, exact). Step counts are deterministic for one build, so changing the version can change which very slow solutions pass. Code questions are JavaScript only.
- **Drawing has no keyboard path.** The whiteboard needs a pointer, so students who can't draw should be offered another question. Hotspot and every drag interaction do work by keyboard.
- **Some types can't drive adaptive exams.** Hand-marked types (long answer, whiteboard, and passages that contain them) are left out of the adaptive pool, because their result isn't known in time to choose the next question.
- **Integrity is signals only.** Similarity, tab switches, pastes and time on question are prompts to look, never penalties. Per-student randomisation is the main deterrent.
- **Realtime is a nudge, not a feed.** Pages refetch from the server when told something changed, and poll if Realtime can't connect.
- **Single organisation.** `org_id` is everywhere, but there is no UI for several organisations.
- **Licence:** MIT (see `LICENSE`), apart from third-party terms such as HyperFormula's.
