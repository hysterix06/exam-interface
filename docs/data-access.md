# Data access

Everything a person can see in Modus is theirs to take: as a ZIP, through a read-only API, or as a calendar feed. All three live on **Account → Your data** (`/account/data`) for every role.

What each person gets is exactly what they see in the app, because every path reuses the same scoped loaders as the pages:

| Role | Scope |
| --- | --- |
| Student | Their own data. Exam questions as they saw them (redacted, never the answer key), their answers, and scores and feedback only once released. |
| Instructor | Every course they teach: homepage, roster, question bank (every version), exams, every attempt, generated item, answer and mark, assignments and hand-ins (with files), and a gradebook per course. |
| Admin | All of the above for the whole organisation, plus people, the audit log and organisation settings. |

## Download everything

`/export` (`src/app/export/route.ts`) returns a ZIP built by `collectData()` (`src/server/data-export/collect.ts`) and `exportZip()` (`zip.ts`, using fflate):

```
README.md           what every file is, in words
manifest.json       who, when, scope, row counts, files left out
json/<table>.json   every table, nested values intact
csv/<table>.csv     the same table for spreadsheets (nested values as JSON text)
csv/gradebook-*.csv staff: one row per student per course
files/submissions/<submission id>/<n>-<name>   handed-in files
```

`?files=0` leaves the files out. Above 200 MB, the remaining files are listed in `manifest.json` instead of bundled. Every export is written to the audit log (`data.export`).

## The API

Read-only JSON at `/api/v1`, described by `/api/v1/openapi.json` (OpenAPI 3.1, no token needed for the description).

```
curl -H "Authorization: Bearer modus_pat_…" https://<host>/api/v1/me
```

| Endpoint | Returns |
| --- | --- |
| `/me` | Who the token belongs to |
| `/courses`, `/courses/{id}` | Courses; one course's homepage, weights (and events for staff) |
| `/courses/{id}/calendar`, `/calendar` | Dated items for one course, or all of them |
| `/courses/{id}/grades` | Students: course grade with working and items. Staff: the gradebook |
| `/assignments`, `/assignments/{id}`, `/assignments/{id}/submissions` | Assignments and hand-ins |
| `/exams`, `/exams/{id}/attempts` | Exams and attempts |
| `/export` | Every table as JSON (the ZIP without files) |

Lists are paginated: `?limit=` (default 100, at most 500) and `?cursor=` (the `next` value from the previous page); each page is `{ data, next, total }`. Single objects are `{ data }`. A missing or revoked token is 401; anything outside the token owner's scope is 404.

The routes are one table (`ROUTES` in `src/server/api/v1.ts`) served by a catch-all handler (`src/app/api/v1/[...path]/route.ts`). Each handler calls the same loaders as the pages (`studentAcademics()`, `getCourse(scope, …)`, `listSubmissionsForStaff()` and so on). **The API never has queries of its own**: add an endpoint by pointing a route at an existing scoped function.

### Tokens

`src/server/api/tokens.ts`. A token is `modus_pat_` plus 32 random characters. Only its sha256 is stored, and the secret is shown once. Tokens can expire (30, 90 or 365 days, or never), show when they were last used, and are revoked by their owner. Each request re-reads the owner's profile, so a role change applies at once and a switched-off account's tokens stop working. The API authenticates **only** with the bearer token, never the session cookie, so another site can't use a signed-in browser. `src/proxy.ts` skips `api/` and `feeds/` for the same reason.

There is no rate limiting yet.

## Calendar feed

`/feeds/<token>.ics` (`src/app/feeds/[token]/route.ts`) serves iCalendar built by `toIcs()` (`src/engine/ics.ts`: escaping, 75-octet line folding, stable UIDs, UTC times). Calendar apps can't send headers, so the secret (`modus_cal_…`) is in the URL. There is one feed per person, and making a new address turns the old one off. Students get their courses' exam windows, due dates (with their own extensions) and events; staff get the same for every course they teach.
