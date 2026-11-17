@AGENTS.md

# Modus

Modus is a showcase exam app: the UI is the product. `README.md` is the overview; details live in `docs/` (architecture, question-types, engine, exam-lifecycle, widgets, development).

## Principles

1. **Question types are plugins.** Every type implements the same interface; adding one never touches the core.
2. **Questions are templates.** A question is a recipe that generates a concrete *instance* from a seed.
3. **Everything random is reproducible.** One seed per attempt, derived per question. Any student's exam can be regenerated exactly.
4. **Server is the source of truth.** Timer, state, answers and grading live server-side. The client is a view.
5. **Grading is pure functions.** `grade(instance, response) -> result`.
6. **Design:** minimal, high-contrast, typographically restrained. The exam screen is nearly empty chrome.
7. **No black boxes.** Every decision (selection, score) is explainable to an educator in plain language.
8. **Show, don't ask them to trust.** Live preview, simulate, visible answer key, pre-flight before publish.
9. **No AI in v1.** Deterministic logic only.

## Architecture

- **Stack:** Next.js 16 (App Router; middleware is `src/proxy.ts`), TypeScript, Tailwind v4, shadcn/ui (Radix), Supabase (Postgres + Auth + Realtime + Storage), Drizzle, Zod, Vitest, Playwright. Question text renders through `Prose` (`src/components/ui/prose.tsx`: Markdown + KaTeX, `$$…$$` maths, no raw HTML, images only `asset:<id>`).
- **Data access split:** Drizzle (`src/db/client.ts`, connects as owner, bypasses RLS) for all server reads/writes; `supabase-js` only for auth, Realtime and storage. RLS is on for every table as defense in depth.
- **Auth:** Supabase Auth. Role lives in `profiles.role`; a trigger mirrors it into the JWT `app_metadata`. `proxy.ts` only refreshes the session and sends signed-out visitors to `/login` (it never gates by role: a JWT role can be an hour stale after an admin changes it, which would bounce between homes). **Every page, layout and server action must call `requireRole()` from `src/server/auth.ts`** (or `requireStaff()` / `requireAdmin()` from `src/server/access.ts`), which reads the role from the DB. Deactivated profiles (`profiles.deactivated_at`) count as signed out.
- **Three apps, one codebase.** Each role has its own home (`homeFor()` in `src/lib/auth/roles.ts`) and shell (`src/components/shell/app-shell.tsx` picks it):
  - **Students** `/` (route group `src/app/(student)/`): top bar, home = what to sit now / coming up / finished, `/results`, `/exams/[id]`. `/attempt/[id]` has no shell.
  - **Instructors** `/teach/*`: sidebar; home is an attention queue (live, to mark, to release, failing drafts). One exam = one workspace at `/teach/exams/[id]` with tabs Build (autosaves) · Verify (pre-flight, preview, publish) · Run (state, window, codes, live board, extensions) · Results (attempts, analysis, regrade, export).
  - **Admins** `/admin/*`: operator console: people (add with one-time password, CSV import, role, switch off), courses (teachers + enrolment, archive), activity (audit log), settings (org defaults new exams start from). Admins can also use every `/teach` page for any course.
  - **Course scope.** `enrollments.role` is `teacher | student`. `scopeFor(user)` (`src/server/access.ts`) gives the course ids a person may teach (`null` = whole org for admins); every staff data function takes that `Scope` and filters with `inScope()`. Anything outside scope is a 404, not a 403. Ids from the browser are validated with `z.guid()` (seed ids aren't RFC v4, so `z.uuid()` rejects them).
- **Server layout:** `src/server/authoring` (questions, topics, exams), `src/server/run` (live board, extensions, regrade, analysis, similarity `signals.ts`), `src/server/attempts` (student side: start, take/advance, save, `upload.ts`, `adaptive.ts`), `src/server/review.ts` (marking), `src/server/assets.ts` (uploads), `src/server/teach` (instructor home + exam workspace loader), `src/server/admin` (people, courses, org). Account management and storage use `src/lib/supabase/admin.ts` (needs `SUPABASE_SECRET_KEY`, server-only).
- **Brand:** the name is Modus; the mark is ∴ (`LogoMark` / `Wordmark` in `src/components/shell/logo.tsx`, favicon `src/app/icon.svg`). Page titles and the wordmark use `font-serif` (IBM Plex Serif); everything else Plex Sans. The attempt screen stays sans and chrome-free.
- **Design tokens** (`src/app/globals.css`): black and white. Hierarchy comes from size and space, not boxes: stats sit under a hairline, not in cards. The only colour is `--brand` (deep blue), allowed for the focus ring, the current nav item, links in running text, and the one primary action of a screen whose purpose is that action (Start exam, Publish). `success`/`warning`/`destructive` are for text and icons, never fills. Build pages from `src/components/ui` (`PageHeader`, `Section`, `RowList`/`Row`, `Table`, `Stat`, `EmptyState`, `Notice`, `LinkTabs`, `Dialog`, `Menu`, `LocalTime`) rather than hand-rolled markup.
- **Purity rule (lint-enforced):** `src/engine/**` and `src/question-types/*/core.ts` must not import React, Next, or anything DB-related.
- **Question type plugin** = `src/question-types/<id>/core.ts` (pure) + `ui.tsx` (Editor, Renderer, `newDef`; client-only). Register the core in `src/question-types/registry.ts`, the UI in `ui-registry.ts` (server components must never import the UI registry) and add fixtures to `src/question-types/fixtures.ts`; `contract.test.ts` then runs it over 1,000 seeds. Contract (`src/engine/question-type.ts`):
  ```ts
  interface QuestionTypeCore<TDef, TInst, TResp> {
    id: string;
    defSchema; instanceSchema; responseSchema;          // Zod
    generate(def, rng): { instance; vars };             // template + seed -> instance
    grade(inst, resp | null, opts): { score; max; needsReview?; lines: GradeLine[] };
    keyResponse(inst): TResp;                            // perfect-student run
    randomResponse(inst, rng): TResp;                    // simulation
    validateDef(def): PreflightIssue[];
    redact(inst): unknown;                               // instance minus answer key: the only thing sent to students
    // Optional hooks (existing plugins keep compiling without them):
    wrongResponse?(inst): TResp | null;                  // pre-flight's all-wrong run (must earn nothing)
    estimateSeconds?(def): number;                       // blueprint "estimated time"
    review?: { criteria; mark; aids? };                  // hand marking; the queue is built only from this
    analysisTokens?(inst, resp); tokenUniverse?(inst);   // item analysis "what students chose"
    init?(): Promise<void>;                              // async setup (code sandbox); see ensureTypesReady()
    manual?: boolean; serverResponse?: boolean;          // always hand-marked; answers written by the server only
  }
  ```
  19 types are registered (see the README table). `composite` (passages) is built by `makeComposite(lookup)` / `makeCompositeUi(lookup)` so it never imports the registry that registers it; it delegates every hook to its parts and prefixes their lines ("Part b · …").
- **Human-graded types** set `manual: true` and implement `review`: `grade()` only returns "review" lines (score 0); a person marks them in `/teach/marking`. The key is expected to earn every point not on a "review" line (`expectedKeyScore()`, `src/engine/grading/expect.ts`), which is how passages with a written part pass the contract suite.
- **Generation goes through `generateQuestion()`** (`src/engine/generate.ts`), never `type.generate` directly (a test enforces it). It applies *wording variants*: an optional `textVars` key stored in the definition (`[[name]]` placeholders; table rows drawn together, lists drawn alone), drawn from `rng.fork("text-vars")`. Validate stored definitions with `validateQuestion()`.
- **Never change what existing definitions generate.** New randomness comes from a new `rng.fork(label)` (forks don't consume the parent stream), and new instance fields are **omitted when unused** (Reproduce compares with `canonical()`). `src/engine/golden/generation-golden.test.ts` pins today's output: never regenerate its digests to make it pass.
- **Async setup:** grading stays synchronous; anything that grades or validates code questions awaits `ensureTypesReady()` (`src/question-types/registry.ts`) first: finalize, advance, regrade, pre-flight/publish, saving an active question, the seed, and the client preview/Verify panel (`useTypesReady()`). Vitest loads it in `src/test-setup.ts`.
- **Explainability as data:** selector, generator, grader and pre-flight return structured traces; UI renders them, never re-derives. Grade line points must sum to the score (contract-tested); only the total is rounded.
- **Attempt building:** `buildAttempt(seed, blueprint, pool)` in `src/engine/attempt.ts` = weighted selection (`src/engine/selection/`) + per-question generation. Reproduce = call it again and diff. Sections may span topics (`extraTopicIds`, per-topic `limits`); always read a section's topics through `sectionTopics()` / `blueprintTopics()`, never `section.topicId` alone.
- **Sequential attempts** (one-way, per-question time limits, adaptive): `attempts.cursor` is the current position; the server only sends items up to it and `save.ts` (`sequentialLock()`) only accepts the current, unlocked, in-time item. `advanceAttempt()` (`take.ts`) locks the current item and opens the next; it is idempotent on `fromPosition`.
- **Adaptive** (`settings.adaptive`): the plan (pool + Rasch difficulties) is frozen in `attempts.plan` at start; items are created one step at a time (`src/server/attempts/adaptive.ts`), each storing its trace and the previous result it used in `attempt_items.selection`. Finalize fills unreached steps as unanswered. Reproduce replays with `replayAdaptive()`. Hand-marked types are excluded from adaptive pools.
- **Own RNG** (`src/engine/rng.ts`: `sfc32` seeded by `cyrb128`), pinned by golden tests in `rng.test.ts`. Never change it. Per-question seed = `hash(attempt.seed + ":" + questionVersionId)`.

## Data model (see `docs/architecture.md` and `src/db/schema.ts`)

`orgs`, `profiles` (1:1 `auth.users`), `courses`, `enrollments`, `topics`, `questions` (editable) + `question_versions` (immutable; exams and attempts reference these), `exams` (blueprint/settings JSONB, `locked_versions` at publish), `exam_codes` (hashed, single-use), `attempts` (seed, deadline, `cursor`, `late_window_minutes`/`late_penalty`, `last_seen_at`, adaptive `plan`), `attempt_items` (**frozen generated instance**, `opened_at`/`locked_at`, adaptive `selection`), `responses`, `grades` (with `lines`), `events` (signals and `view`s, never enforced), `audit_log`, `extensions`, `assets` (uploads; bytes in Storage).

Key idea: the generated instance is frozen in `attempt_items`, so attempts stay gradeable even if templates change.

## Workflow

- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:coverage` (engine + question types, keep ≥95% lines)
- `npm run test:e2e` (Playwright; needs `.env.local`, a seeded database and `npx playwright install chromium`; reuses a running `next dev` on :3000 or starts one). In CI it runs as a separate, non-blocking `e2e` job against a local `supabase start` (also nightly). `e2e/global-setup.ts` resets the demo quiz's and the field-skills exam's attempts and deletes `e2e-*` accounts each run; specs that change the quiz's settings put them back. Shared helpers in `e2e/helpers.ts`.
- Schema change: edit `src/db/schema.ts` → `npm run db:generate` → `npm run db:push` (applies `supabase/migrations` to the linked project). Hand-written SQL (RLS, triggers): `npx drizzle-kit generate --custom --name <name>`.
- `npm run db:seed` creates demo accounts `admin|instructor|student@example.com` (password from `SEED_PASSWORD`). Seed scripts can't import `server-only` modules (use the script's own Supabase client).
- Add a dependency only when the work that needs it starts.
- Graders and generators are built test-first.

## Things to know

- **Licence:** `hyperformula` (spreadsheet type) is GPL-3.0-only unless a commercial licence is bought. Decide before distributing.
- **Widgets** live in `public/widgets/` and speak the `postMessage` protocol in `src/engine/widget.ts`. They are public static files (excluded from `proxy.ts`), so they must never contain anything secret. Register new ones in `WIDGETS`.
- **Postgres jsonb reorders object keys.** Never compare stored JSON with `JSON.stringify`; use `canonical()` from `src/engine/regrade.ts`.
- **Exam lifecycle** is `src/engine/exam-state.ts`; students see `effectiveState()` (schedule windows apply without a background job).
- **Expiry without a job:** `sweepExpired()` (`src/server/attempts/take.ts`) finalizes attempts whose deadline (plus any late window: use `attemptExpired()` / `hardDeadline()`) or exam window passed; staff pages that list attempts call it first, and student lists finalize the student's own.
- **Late work:** `settings.late` (`src/engine/attempts/late.ts`). Under "accept", the penalty is attempt-level (stored in `attempts.late_penalty`, a share of points earned) and `recomputeAttempt()` re-applies it, so item lines still sum.
- **Storage:** private buckets `assets` and `submissions` (no `storage.objects` policies; the server uses the secret key). Questions store an `AssetRef` (`src/engine/asset.ts`: id, size, alt), **never a URL**; the browser loads `/assets/[id]`, which checks access and redirects to a 5-minute signed URL. Uploads are typed by their bytes (`sniffFile()`), never SVG. Editors reach the course through `AssetCourseProvider`.
- **Realtime is a signal, not data:** `useTableSignal()` (`src/lib/realtime/`) subscribes to `postgres_changes` (RLS-filtered; it sets the user's token on the Realtime client) and the caller refetches through the server, with a polling fallback. Used by the live board, the student home and the attempt runner.
- **Uploaded workbooks** (`file-task`) are parsed by ExcelJS in `src/lib/xlsx.ts` (server code only) into the spreadsheet cell model, and graded with the shared `gradeSheetChecks()` (`src/engine/sheet-checks.ts`). Its responses are written only by `uploadSubmission()`; the runner passes attempt context through `ServerAnswerProvider`.
- **Code sandbox:** QuickJS (`@jitl/quickjs-singlefile-browser-release-sync`, pinned exactly, works in Node too; the `mjs` variant breaks the browser bundle). Limits are step counts, so a version bump can change results: treat it like the RNG.
- Demo data: `npm run db:seed` makes `admin`, `instructor` (teaches BIO 101), `instructor2` (teaches CHEM 101) and `student` (in both) `@example.com`, the org "Northfield College", the BIO bank (30 questions, 4 topics, only seeded into an empty bank), a draft midterm, an open quiz, a released practice exam with 30 graded students, and a CHEM bank with a draft exam. `src/db/seed/showcase.ts` adds (once, keyed on the "Lab Skills" topic, so it also runs on older databases) one question of every other type, an open "Lab Skills Check" exam drawing all of them, and a closed "Lab Report" exam with six long answers waiting to be marked. `src/db/seed/field.ts` adds the "Field Skills" bank (the newer types, generated images from `images.ts`, a starter workbook) and an open "Field Skills Check"; on an existing database it tops up missing types. Content is checked by `showcase-content.test.ts` and `field-content.test.ts` (which also asserts the demo covers every registered type). Images referenced as `seed:<name>` are swapped for uploaded asset ids.
- **Seed version vs current version.** `attempt_items.seed_version_id` is the version an item was drawn and seeded from and never changes; `question_version_id` is what it is graded against now (a regrade moves it). Seed instances from `seed_version_id`.
- **Changing grades.** Anything that writes a grade (regrade, marking, `overrideGrade()` in `src/server/review.ts`) must call `recomputeAttempt()` (`src/server/run/totals.ts`). A hand-changed score keeps the grader's lines plus one adjustment line (`overrideLines()`, `src/engine/override.ts`) so lines still sum to the score; regrade leaves overridden answers alone.
- **Error boundaries** take Next 16's `retry()` (re-fetches), not `reset()`, and `error: unknown`; use `ErrorState` / `errorDigest()` from `src/components/shell/error-state.tsx`.
