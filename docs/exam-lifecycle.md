# Exam lifecycle

From building and checking an exam, through running it, to results.

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

