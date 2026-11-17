# Modus

*Modus* (from *modus ponens*, the basic rule of inference) is an exam app built to show how much a testing tool can do when every decision is deterministic and explainable. Educators build question banks and exams, check them before anyone sits them, run them live and read the results. Students sit exams on a nearly empty screen. Every score, every drawn question and every number on a dashboard can be traced back to a rule and its inputs.

There is **no AI** anywhere in it. Selection, randomisation, grading, adaptive paths and analytics are plain rules and statistics that an educator can follow and check by hand.

- **19 question types**, from multiple choice to sandboxed code, uploaded Excel workbooks, image hotspots and passages with sub-questions
- **Per-student exams** drawn from a blueprint and generated from a seed, so any student's exam can be rebuilt exactly
- **Verification before publishing**: a pre-flight checklist; perfect, blank and all-wrong student runs; a 200-student simulation; a variant explorer
- **Transparency after the exam**: line-by-line grade explanations, Reproduce from seed, a regrade preview, item analysis, an audit log and exports
- **The rest of the course**: course homepages (syllabus, weights, contact), a calendar across courses, assignments handed in as text or files and marked against a rubric, and a weighted course grade that shows its working
- **Your data is yours**: every role can download everything they can see as a ZIP, read it through a token-based API, or subscribe to a calendar feed

## Quick start

You need Node 24 and a Supabase project (or the Supabase CLI with Docker).

```bash
npm install
cp .env.example .env.local      # Supabase URL, keys, DATABASE_URL, SEED_PASSWORD
npm run db:push                 # apply supabase/migrations
npm run db:seed                 # demo org, accounts, banks and exams
npm run dev                     # http://localhost:3000
```

## Documentation

| Doc | Covers |
| --- | --- |
| [Architecture](docs/architecture.md) | The three apps, stack, code layout, data model |
| [Question types](docs/question-types.md) | All 19 types, wording variants, adding a type |
| [The engine](docs/engine.md) | Randomness, selection, generation, grading, adaptive, sandbox |
| [Exam lifecycle](docs/exam-lifecycle.md) | Checking, running and reviewing an exam |
| [Courses and grades](docs/academics.md) | Course homepages, calendar, assignments, the course grade |
| [Data access](docs/data-access.md) | ZIP export, the read-only API and tokens, the calendar feed |
| [Embedded widgets](docs/widgets.md) | The `postMessage` protocol and demo widgets |
| [Development](docs/development.md) | Setup, env vars, demo data, scripts, schema changes, testing and CI |

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


## Known limits and licences

- **HyperFormula is GPL-3.0** unless you buy a commercial licence. That matters for the spreadsheet and file-task types. Decide before distributing.
- **The QuickJS sandbox is pinned** (`quickjs-emscripten` 0.32.0, exact). Step counts are deterministic for one build, so changing the version can change which very slow solutions pass. Code questions are JavaScript only.
- **Drawing has no keyboard path.** The whiteboard needs a pointer, so students who can't draw should be offered another question. Hotspot and every drag interaction do work by keyboard.
- **Some types can't drive adaptive exams.** Hand-marked types (long answer, whiteboard, and passages that contain them) are left out of the adaptive pool, because their result isn't known in time to choose the next question.
- **Integrity is signals only.** Similarity, tab switches, pastes and time on question are prompts to look, never penalties. Per-student randomisation is the main deterrent.
- **Realtime is a nudge, not a feed.** Pages refetch from the server when told something changed, and poll if Realtime can't connect.
- **Single organisation.** `org_id` is everywhere, but there is no UI for several organisations.
- **Licence:** MIT (see `LICENSE`), apart from third-party terms such as HyperFormula's.
