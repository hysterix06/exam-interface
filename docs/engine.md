# The engine

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

