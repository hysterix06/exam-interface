# Question types

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


## Adding a question type

1. Write `core.ts` (pure) and `ui.tsx` in `src/question-types/<id>/`.
2. Register the core in `registry.ts` and the UI in `ui-registry.ts`.
3. Add fixtures to `fixtures.ts`.
4. Add an example question to the seed content.

The contract suite then checks it over 1,000 seeds: deterministic, JSON-safe, key earns full marks, blank earns 0, wrong earns nothing, redaction removes the key. Optional hooks cover hand marking (`review`), a wrong-answer run, time estimates, item analysis tokens, async setup, and responses written only by the server.
