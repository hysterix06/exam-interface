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
- **Auth:** Supabase Auth. Role lives in `profiles.role`; a trigger mirrors it into the JWT `app_metadata`. `proxy.ts` does optimistic redirects from the JWT; **every page, layout and server action must call `requireRole()` from `src/server/auth.ts`**, which reads the role from the DB.
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
- **Explainability as data:** selector, generator, grader and pre-flight return structured traces; UI renders them, never re-derives. Grade line points must sum to the score (contract-tested); only the total is rounded.
- **Attempt building:** `buildAttempt(seed, blueprint, pool)` in `src/engine/attempt.ts` = weighted selection (`src/engine/selection/`) + per-question generation. Reproduce = call it again and diff.
- **Own RNG** (`src/engine/rng.ts`: `sfc32` seeded by `cyrb128`), pinned by golden tests in `rng.test.ts`. Never change it. Per-question seed = `hash(attempt.seed + ":" + questionVersionId)`.

## Data model (README §7, see `src/db/schema.ts`)

`orgs`, `profiles` (1:1 `auth.users`), `courses`, `enrollments`, `topics`, `questions` (editable) + `question_versions` (immutable; exams and attempts reference these), `exams` (blueprint/settings JSONB, `locked_versions` at publish), `exam_codes` (hashed, single-use), `attempts` (seed, deadline), `attempt_items` (**frozen generated instance**), `responses`, `grades` (with `lines`), `events` (signals, never enforced), `audit_log`, `extensions`.

Key idea: the generated instance is frozen in `attempt_items`, so attempts stay gradeable even if templates change.

## Workflow

- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:coverage` (engine + question types, keep ≥95% lines)
- Schema change: edit `src/db/schema.ts` → `npm run db:generate` → `npm run db:push` (applies `supabase/migrations` to the linked project). Hand-written SQL (RLS, triggers): `npx drizzle-kit generate --custom --name <name>`.
- `npm run db:seed` creates demo accounts `admin|instructor|student@example.com` (password from `SEED_PASSWORD`).
- Add a dependency only when the phase that needs it starts.
- Graders and generators are built test-first.
