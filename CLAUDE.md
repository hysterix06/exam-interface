@AGENTS.md

# Exam

A showcase exam app: the UI is the product. Full spec in `README.md`; implementation plan by phase in the README §9 build phases.

## Principles (README §1)

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

- **Stack:** Next.js 16 (App Router; middleware is `src/proxy.ts`), TypeScript, Tailwind v4, shadcn/ui (Radix), Supabase (Postgres + Auth + Realtime), Drizzle, Zod, Vitest.
- **Data access split:** Drizzle (`src/db/client.ts`, connects as owner, bypasses RLS) for all server reads/writes; `supabase-js` only for auth, Realtime and storage. RLS is on for every table as defense in depth.
- **Auth:** Supabase Auth. Role lives in `profiles.role`; a trigger mirrors it into the JWT `app_metadata`. `proxy.ts` only refreshes the session and sends signed-out visitors to `/login` (it never gates by role: a JWT role can be an hour stale after an admin changes it, which would bounce between homes). **Every page, layout and server action must call `requireRole()` from `src/server/auth.ts`** (or `requireStaff()` / `requireAdmin()` from `src/server/access.ts`), which reads the role from the DB. Deactivated profiles (`profiles.deactivated_at`) count as signed out.
- **Three apps, one codebase.** Each role has its own home (`homeFor()` in `src/lib/auth/roles.ts`) and shell (`src/components/shell/app-shell.tsx` picks it):
  - **Students** `/` (route group `src/app/(student)/`): top bar, home = what to sit now / coming up / finished, `/results`, `/exams/[id]`. `/attempt/[id]` has no shell.
  - **Instructors** `/teach/*`: sidebar; home is an attention queue (live, to mark, to release, failing drafts). One exam = one workspace at `/teach/exams/[id]` with tabs Build (autosaves) · Verify (pre-flight, preview, publish) · Run (state, window, codes, live board, extensions) · Results (attempts, analysis, regrade, export).
  - **Admins** `/admin/*`: operator console: people (add with one-time password, CSV import, role, switch off), courses (teachers + enrolment, archive), activity (audit log), settings (org defaults new exams start from). Admins can also use every `/teach` page for any course.
  - Old `/author/*`, `/admin/exams/*`, `/admin/review`, `/admin/audit` URLs redirect (`next.config.ts`).
- **Course scope.** `enrollments.role` is `teacher | student`. `scopeFor(user)` (`src/server/access.ts`) gives the course ids a person may teach (`null` = whole org for admins); every staff data function takes that `Scope` and filters with `inScope()`. Anything outside scope is a 404, not a 403. Ids from the browser are validated with `z.guid()` (seed ids aren't RFC v4, so `z.uuid()` rejects them).
- **Server layout:** `src/server/authoring` (questions, topics, exams), `src/server/run` (live board, extensions, regrade, analysis), `src/server/attempts` (student side), `src/server/review.ts` (marking), `src/server/teach` (instructor home + exam workspace loader), `src/server/admin` (people, courses, org). Account management uses `src/lib/supabase/admin.ts` (needs `SUPABASE_SECRET_KEY`, server-only).
- **Design tokens** (`src/app/globals.css`): black and white. The only colour is `--brand` (deep blue), allowed for the focus ring, the current nav item, links in running text, and the one primary action of a screen whose purpose is that action (Start exam, Publish). `success`/`warning`/`destructive` are for text and icons, never fills. Build pages from `src/components/ui` (`PageHeader`, `Section`, `RowList`/`Row`, `Table`, `Stat`, `EmptyState`, `Notice`, `LinkTabs`, `Dialog`, `Menu`, `LocalTime`) rather than hand-rolled markup.
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
  }
  ```
- **Human-graded types** set `manual: true` on the core: `grade()` only flags `needsReview` (score 0); a person marks them in `/admin/review`. The contract suite and the perfect-student check accommodate this.
- **Explainability as data:** selector, generator, grader and pre-flight return structured traces; UI renders them, never re-derives. Grade line points must sum to the score (contract-tested); only the total is rounded.
- **Attempt building:** `buildAttempt(seed, blueprint, pool)` in `src/engine/attempt.ts` = weighted selection (`src/engine/selection/`) + per-question generation. Reproduce = call it again and diff.
- **Own RNG** (`src/engine/rng.ts`: `sfc32` seeded by `cyrb128`), pinned by golden tests in `rng.test.ts`. Never change it. Per-question seed = `hash(attempt.seed + ":" + questionVersionId)`.

## Data model (README §7, see `src/db/schema.ts`)

`orgs`, `profiles` (1:1 `auth.users`), `courses`, `enrollments`, `topics`, `questions` (editable) + `question_versions` (immutable; exams and attempts reference these), `exams` (blueprint/settings JSONB, `locked_versions` at publish), `exam_codes` (hashed, single-use), `attempts` (seed, deadline), `attempt_items` (**frozen generated instance**), `responses`, `grades` (with `lines`), `events` (signals, never enforced), `audit_log`, `extensions`.

Key idea: the generated instance is frozen in `attempt_items`, so attempts stay gradeable even if templates change.

## Workflow

- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:coverage` (engine + question types, keep ≥95% lines)
- `npm run test:e2e` (Playwright; needs `.env.local`, a seeded database and `npx playwright install chromium`; reuses a running `next dev` on :3000 or starts one). Not in CI because it needs Supabase credentials. `e2e/global-setup.ts` resets the demo quiz's attempts and deletes `e2e-*` accounts each run. Shared helpers in `e2e/helpers.ts`.
- Schema change: edit `src/db/schema.ts` → `npm run db:generate` → `npm run db:push` (applies `supabase/migrations` to the linked project). Hand-written SQL (RLS, triggers): `npx drizzle-kit generate --custom --name <name>`.
- `npm run db:seed` creates demo accounts `admin|instructor|student@example.com` (password from `SEED_PASSWORD`).
- Add a dependency only when the phase that needs it starts.
- Graders and generators are built test-first.

## Things to know

- **Licence:** `hyperformula` (spreadsheet type) is GPL-3.0-only unless a commercial licence is bought. Decide before distributing.
- **Widgets** live in `public/widgets/` and speak the `postMessage` protocol in `src/engine/widget.ts`. They are public static files (excluded from `proxy.ts`), so they must never contain anything secret. Register new ones in `WIDGETS`.
- **Postgres jsonb reorders object keys.** Never compare stored JSON with `JSON.stringify`; use `canonical()` from `src/engine/regrade.ts`.
- **Exam lifecycle** is `src/engine/exam-state.ts`; students see `effectiveState()` (schedule windows apply without a background job).
- **Adaptive mode** is a rules preview only (`src/engine/adaptive.ts` + builder panel); live attempts still use the fixed draw.
- **Expiry without a job:** `sweepExpired()` (`src/server/attempts/take.ts`) finalizes attempts whose deadline or exam window passed; staff pages that list attempts call it first, and student lists finalize the student's own.
- Demo data: `npm run db:seed` makes `admin`, `instructor` (teaches BIO 101), `instructor2` (teaches CHEM 101) and `student` (in both) `@example.com`, the org "Northfield College", the BIO bank (30 questions, 4 topics, only seeded into an empty bank), a draft midterm, an open quiz, a released practice exam with 30 graded students, and a CHEM bank with a draft exam.
