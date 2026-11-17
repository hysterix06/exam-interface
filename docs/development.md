# Development

## Getting started

**You need** Node 24 and a Supabase project (or the Supabase CLI with Docker for a local one).

```bash
npm install
cp .env.example .env.local      # fill in the Supabase URL, keys, DATABASE_URL and SEED_PASSWORD
npm run db:push                 # apply supabase/migrations (tables, RLS, triggers, storage buckets)
npm run db:seed                 # demo org, accounts, courses (homepages, calendars, assignments), banks and exams
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


Adding a question type: see [question-types.md](question-types.md#adding-a-question-type).
