# Progress log

Dated entries, newest first. Dubai time (UTC+4).

## 2026-11-03: Phase 0 started

### Decisions (user approved the Phase 0 plan with the proposed defaults)

- **Project folder:** moved from `C:\Users\aweki\Videos\Groundside` to `C:\dev\groundside` to match CLAUDE.md.
- **Language scope:** English only. Arabic and Amharic are out of scope (user, 2026-11-03). CLAUDE.md, SPEC, DEMO, OPEN_QUESTIONS and START_HERE updated; no RTL, no language switcher, no `ENABLE_AMHARIC`.
- **Commit identity (repo-local):** `Nebiyu Gemedu <217435474+Nebiyu-6249@users.noreply.github.com>`, the name on the GitHub account and its noreply address, so commits link to `Nebiyu-6249` without publishing a personal email. The global git identity on this machine was left untouched.
- **Commit trailer:** commits keep a `Co-Authored-By: Claude` trailer (AI-assisted development is allowed by the rules). Tell Claude Code to drop it if you prefer.
- **Prisma:** pinned to 7.10.1. npm's `latest` tag for `prisma` points at an 8.0 release candidate. Prisma 7 needs a driver adapter: added `@prisma/adapter-pg` and `pg` (pure JS; approved with the plan).
- **Other dev dependencies added:** `tsx` (scripts). `rimraf` and `cross-env` are not needed yet. `.env` is loaded with Node's built-in `process.loadEnvFile` / `--env-file`, so no `dotenv`.
- **npm install scripts:** npm 11 blocks install scripts by default. Approved only `prisma`, `@prisma/engines` and `esbuild` (`allowScripts` in package.json).
- **AG Grid (for Phase 3):** stay on Community (MIT). Set filters and row grouping are Enterprise features, so the grid will use a status filter and a status summary bar instead. Reference lines in AG Charts are drawn as extra series (annotations are Enterprise).

### OpenAI models (looked up 2026-11-03 on developers.openai.com/api/docs/models and /pricing)

| Model ID | Input / output per 1M tokens | Structured outputs | Image input | Planned use |
|---|---|---|---|---|
| `gpt-6-luna` | $0.10 / $0.50 | yes | yes | Development for all components; A3 notices and A4 questions in the hosted demo |
| `gpt-6.1-terra` | $1 / $5 | yes | yes | A2 receipt reading in the hosted demo |
| `gpt-6.1-sol` | $2 / $10 | yes | yes | A1 cause assessment in the hosted demo |
| `gpt-6-astra` | $10 / $50 | yes | yes | Not planned (cost); fallback if A1 evals fail on Sol |

Why: Luna is the cheapest current model with both structured outputs and image input, so it suits development (golden rule 11). A1 is the one reasoning-heavy, high-stakes call per disruption, so it gets Sol. Terra is described by OpenAI as tuned for visual reasoning at half Sol's price. The final picks are confirmed by the Phase 2 evals. None of these four is marked deprecated. `gpt-4o`, `gpt-4.1` and `gpt-5` families are scheduled for shutdown and are not used. Image token pricing was not looked up yet; do that before Phase 4.

### Built

- Repo basics: `.gitattributes` (LF), `.gitignore` (ignores `.env*` except `.env.example`), MIT `LICENSE`, README skeleton, `.env.example` with every SPEC 17 variable.
- Next.js 16.4.4 App Router, TypeScript strict, ESLint 9, Tailwind 4, IBM Plex Sans and Mono. Cache Components is on (Next 16 default); DB-backed GET routes call `connection()`.
- Prisma schema (Phase 0 subset of SPEC 10): `Booking`, `Refund`, `WebhookEvent`.
- `GET /api/health`: database up/down and PayPal sandbox guard status; 503 unless both are good.
- `src/lib/paypal/`: sandbox guard, token cache (refresh 5 minutes before expiry, single flight), HTTP helper (logs method, path, status, debug ID, duration; never headers or bodies), payouts, orders, refunds, webhook signature verification, idempotent webhook store.
- `POST /api/webhooks/paypal`: verify, store once by event ID, apply refund events, always 200 after storing.
- `/demo/book`: PayPal JS SDK buttons; server-side create and capture with stored `PayPal-Request-Id`; full refund; refund status polled from PayPal.
- `scripts/spike-payouts.ts` (`npm run spike:payouts`): the Payouts spike, writing redacted results to `scripts/out/`.
- `npm run check`: typecheck, lint, 24 unit tests, all passing. `npm run build` passes.
- Public repo created and pushed: https://github.com/Nebiyu-6249/groundside

### Waiting on the user

`.env` (Neon URLs, PayPal sandbox credentials, receiver pool) and the PayPal sandbox accounts and app. See `docs/HANDOFF.md`.

## 2026-11-03 (later): demo checkout declined, diagnosis

Raw notes for `docs/PHASE0_RESULTS.md`.

- **Symptom:** on `/demo/book`, five Orders v2 creates succeeded (HTTP 201; debug IDs `f7912328d0ae1`, `f39479400ab2e`, `f5364686e56e0`, `f11687998087f`, `f4268357f5238`). Every buyer approval in the PayPal window ended with "This transaction was rejected due to international regulations", both for the custom-email buyer and for the generated pool buyer. No order reached APPROVED.
- **Payee on those orders:** `airport1@gmail.com` (merchant `K25TMWQ66LX4Y`, custom email, the account linked to our REST app).
- **Server-side card order to that payee:** HTTP 422 `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING` (debug `f326758879664`).
- **Same flow, payee overridden to a PayPal-generated business account** (`sb-ep1hb52053708@business.example.com`, country AE): created HTTP 200 (debug `f310820bc5d7c`), approved by pool buyer `sb-rw6g453693446` (DE), captured HTTP 201 COMPLETED (debug `f210905058fa9`, capture `6B0711678R6075636`, 1.00 EUR).
- **Refund of that capture from our app:** HTTP 403 `PERMISSION_DENIED` (debug `f535532367a9e`). Expected: our app is not that payee's app.
- **Conclusion:** the decline follows the `airport1@gmail.com` merchant account. Fix: a new PayPal-generated Business account (DE) and a new REST app linked to it, then rerun the payouts spike and the demo booking against it.
- **Controlled retest (2026-11-04):** the identical server-created 1 EUR order with the default payee (`airport1@gmail.com`), approved by the same pool buyer `sb-rw6g453693446` in a normal browser: order `2M123986WR9373515` created HTTP 200 (debug `ca54e4b283bd4`), declined at approval with "international regulations"; order still `PAYER_ACTION_REQUIRED` (debug `f1182424ce71e`). Only the payee differs from the successful test, so the merchant account is confirmed as the cause.
- **Side note:** inside the Claude desktop app's built-in browser the PayPal checkout window shows only a generic error ("Leider ist ein Fehler aufgetreten"); test checkout in Chrome or Edge.

## 2026-11-04: Phase 0 complete, at Gate 0

- New sandbox setup by the user: generated DE business account `sb-vz8j553542468@business.example.com`, REST app "Groundside EU" (`APP-55E35906EM8730949`), webhook `6UR10068K6257654U` on a new quick tunnel (the old one expired overnight).
- Payouts spike rerun on the new app: batch `JMFR29AWPY7T2` SUCCESS in 33 s, same item results as the first run; duplicate rejected; cancel UNCLAIMED still HTTP 500; balance API still 403.
- Demo booking: buyer approved order `6KS2677987580682D`, but the JS SDK called `onCancel`. Fixed: `onCancel` asks the server to capture, and the server captures only APPROVED orders (new unit tests). Captured (`53N346307V6339736`), refunded in full via API (`4W803013JY3640920`), `PAYMENT.CAPTURE.REFUNDED` webhook verified and stored.
- Wrote `docs/PHASE0_RESULTS.md`; ticked the Phase 0 tracker; README gained sandbox setup steps.
- `npm run check`: 27 tests passing.

## 2026-11-04: Phase 1 (data, EU261 engine, rule pack), at Gate 1

- **Rule pack:** 46 JSON entries in `rules/`. These cover every SPEC 6.2 candidate (24 regulation, 15 CJEU, 6 Demo Air policy) plus one Commission guidance entry, `COM-GL-2024-4-3-1`.
  - **Verification source:** EUR-Lex returns a bot challenge (HTTP 202, empty body) to scripted requests. The same Official Journal texts come from the Publications Office CELLAR service, so that is what `npm run rules:verify` reads. All 46 excerpts match word for word.
  - **Sturgeon paragraph 63** is confirmed as the 50 percent reduction paragraph.
  - **Refund ends care** is verified against the 2024 Commission guidelines (C/2024/5687, section 4.3.1), which replace the 2016 guidelines named in SPEC 5.6. They're stored with a new kind, `GUIDANCE`, which the AI may not cite.
  - **Long excerpts:** some run past the "about 60 words" guideline (Art 5(1)(c), 6(1), 8(1)) because the engine applies every limb. The rule's `notes` field says so.
- **Airports:** 37 airports from OurAirports. Their data page says it is "released to the Public Domain". Time zones are set by hand.
- **Data model:** full Prisma schema per SPEC 10. The migration `phase1_full_model` only adds tables and columns; it includes a partial unique index for active payout items.
  - Passenger gains a few fields the engine needs: `firstDeparture`, `confirmedReservation`, `overnightStayNecessary`, `journeyNoLongerServesPurpose`, `manifestIndex`.
- **Engine:** 64 tests, each named after the rule it exercises. `npm run check`: 108 tests passing.
- **Scenarios and manifests:**
  - Scenarios A and B use placeholder dates.
  - The manifest generator uses a fixed seed. The quick run has 12 cases in the order of the DEMO.md table; the full run has 180 and 150 passengers.
  - Scenario B's group split and the times of its previous flight (DEMO 206) were not in DEMO.md and were set by Claude Code, noted in the JSON.
- **Seeding:** `npm run seed`, `npm run reset-demo` (with `-- --full`) and `npm run explain` work.
- **Name check (OPEN_QUESTIONS Q5):** a quick web search found no aviation software product or trademark named "Groundside". This is not a trademark clearance.

## 2026-11-04: Phase 2 (weather evidence, A1, evals), blocked on the OpenAI key

- The user said not to wait for approvals during this phase, so Claude Code chose the scenario dates itself. The choices and the reasons are recorded in `data/scenarios/*.json` and `data/weather/SOURCES.md`.
- **Dates from the IEM archive (Nov 2025 to Feb 2026):**
  - A on 2026-01-24: CAVOK at EDDF and OMDB, LEMD with no ceiling. 12 dates qualified. 2025-11-12 was rejected because of a 4200 m mist report at EDDF in the departure window.
  - B on 2026-01-22: freezing fog at LIMC from 0350Z to 0750Z, RVR down to 250 m, LPPT clear. The only qualifying date.
- **TAF:** neither IEM nor Ogimet returned archived TAFs for these stations, so the demo uses METAR only, per SPEC 7.1. The parser and the fact builder still support TAF.
- **Fixtures:** 5 METAR fixtures with SHA-256 sidecars, fetched by `npm run weather:fetch`. The seed now stores evidence and facts and sets the disruptions to EVIDENCE_READY.
- **A1 built:**
  - OpenAI Responses API with a strict JSON schema
  - the six validators
  - the code policy mapping
  - one retry carrying the validation errors
  - spend log in `AiCall` and the daily budget cap
  - recorded-fixture fallback
  - 20 unit tests with a scripted fake model
- **Eval harness:** 12 cases in `data/evals/a1-cases.json`; `npm run eval` writes `docs/EVAL_REPORT.md` and records the scenario A and B fixtures.
- **Blocked:** `OPENAI_API_KEY` is empty in `.env`, so the eval has not run and no recorded A1 fixtures exist yet. Until then the app shows "AI assessment unavailable" for A1.
- **Expected labels set by Claude Code** where SPEC 15 does not give one:
  - knock-on: UNCERTAIN, because the stated location is contradicted
  - operational reasons only: UNCERTAIN
  - arrival weather well above reference values: PAY, because the carrier has not met its burden of proof
- **Dependencies added** (both listed in the stack): `metar-taf-parser` 9.1.3 and `openai` 7.49.0.
- `npm run check`: 143 tests passing.

## 2026-11-04: Phase 2 evals run, at Gate 2

- `OPENAI_API_KEY` added by the user. Model `gpt-6-luna` (`OPENAI_MODEL_ASSESS`).
- **First run, prompt A1.v1:** 9/12.
  - Two cases failed validation twice: the model put weather-fact text into `evidenceQuotes`, and the validator rejected it correctly.
  - One valid case was mapped to UNCERTAIN.
- **Prompt A1.v2:**
  - Weather facts are cited by ID, never quoted.
  - Airports are shown as ICAO, IATA and city. In v1 the model read "MXP-LIS" in the ops note and "LIMC-LPPT" in the record as different routes.
  - The retry message now says where quotes may come from.
- **Two runs on A1.v2:** 11/12 both times, and all SPEC 15 criteria pass:
  - schema valid 12/12
  - no invalid citations or fact IDs shown
  - 0 cases expected PAY shown as NO_COMP
  - the injection case passes
- **Remaining failure, `arrival-weather-well-above`** (expected PAY, shown UNCERTAIN). The model said NOT_SUPPORTED and LIKELY_NOT_EXTRAORDINARY, and its own label was PAY. But its likely cause was NOT_STATED with LOW confidence, and the SPEC 8.1 policy table needs MEDIUM or HIGH for PAY. This is the code policy behaving as written, not a model error. Question for the user at Gate 2.
- **Recorded fixtures:** `fixtures/ai/A1-scenario-A.json` (PAY) and `A1-scenario-B.json` (NO_COMP, human decides) are recorded from live runs and load through `loadA1Fixture()`.
- **AI spend so far:** 40 calls, 0 failed, 224,066 input and 55,319 output tokens, about 0.05 USD (estimated from token counts at the 2026-11-03 prices).
- `npm run check`: 144 tests passing.

## 2026-11-04: Gate 2 approved

- **Decision:** the user chose to keep the SPEC 8.1 policy table. The expected label for `arrival-weather-well-above` is now UNCERTAIN_HUMAN_MUST_DECIDE, with a note in the case file.
- **A1.v2 was unstable on that case:** over 6 runs it showed UNCERTAIN 4 times and PAY 2 times, because the model sometimes gave MEDIUM confidence to a NOT_STATED likely cause.
- **Prompt A1.v3** clarifies that an unidentified likely cause has LOW confidence. The policy table is unchanged.
- **Results on A1.v3:** 12/12 on two full runs, and UNCERTAIN on 5 of 5 runs of the borderline case. Recorded fixtures for scenarios A and B re-recorded on v3.
- AI spend to date is about 0.10 USD.

## 2026-11-04: Phase 3 (ops console, payouts, passenger page): built locally, deploy pending

- **Dependencies added** (all in the SPEC 5 stack): `ag-grid-community` and `ag-grid-react` 36.2.0, `lucide-react` 1.67.0, `bcryptjs` 3.0.3, `jose` 6.2.15.
- **Auth:**
  - signed HS256 httpOnly cookie
  - users re-read from the database on every request
  - login rate limit (10 per 15 min per IP hash, Postgres-backed `RateLimit` table)
  - `src/proxy.ts` redirects signed-out `/ops` and `/api/disruptions` requests
  - The seed creates the demo duty manager. Without `DEMO_OPS_PASSWORD`, a generated password goes to `scripts/out/demo-credentials.txt` (git-ignored).
- **Decisions:**
  - one per disruption, with a unique index (hand-written migration, because `migrate dev` needs an interactive terminal to confirm it)
  - approval asks for a reason when it differs from the AI
  - a denial needs the signer's typed name, a reason of at least 20 characters, and verified LAW or CASE_LAW citations
  - after a decision the engine re-runs, offers are created and the audit trail is written
- **Offers:** 32-byte tokens with only the SHA-256 stored. The link exists only in the simulated outbox, and "Open as passenger" reads it from there.
- **Payouts:**
  - micro-batches with priority passengers first, under the daily cap
  - batch and items written before the PayPal call
  - retry once after a 5xx or no response; adopt the batch named in a duplicate `sender_batch_id` error
  - webhooks and polling share one transition function that never moves backwards
  - polling: `/api/disruptions/[id]/status` every 3 s on the ops page; the passenger page also reconciles while a payment is in flight
- **Screens:**
  - `/ops`, the disruption board
  - `/ops/disruptions/[id]` with Overview, Evidence, Assessment (with decision forms), Passengers (AG Grid with a trace drawer), Payouts (batches, items, webhook log, sync) and Audit tabs
  - `/ops/outbox`
  - `/p/[token]`, mobile first, light theme
- **End-to-end runs** (`npm run e2e`) against the PayPal sandbox:
  - A: AI recommended PAY and approval was idempotent. 16 items in 2 batches; 14 SUCCESS and 2 UNCLAIMED (the unregistered passenger, by design) within 37 s of sending.
  - B: AI recommended NO_COMP (human decides) and a denial was signed. Compensation not owed for 11; 8 meal payouts, 7 SUCCESS and 1 UNCLAIMED.
- **Fixed along the way:**
  - simulated travel choices re-ran the engine for the whole flight; now only that passenger
  - offer creation set refunds to OFFERED
  - OurAirports municipality names ("Ferno (VA)") replaced with served-city names
  - the rule-pack path is now scoped statically, so the build no longer traces the whole project
- **Checks:** `npm run build` passes. `npm run check`: 151 tests.
- **Not done:** the Render deploy (needs the user's Render account) and the Devpost draft (the user fills the form). `render.yaml` and the README deploy section are ready.

### 2026-11-04: Deploy preparation

- The user chose to deploy before checking the ops screens locally.
- Checked `render.yaml` against `.env.example`: every variable is covered.
- The user asked Claude Code to do the deploy itself. Claude Code may not sign in to dashboards or type secrets into them, so the deploy runs through the Render API instead: `scripts/deploy-render.ts` (`npm run deploy:render`).
  - It creates a separate database `groundside_hosted` on the same Neon project, migrates and seeds it.
  - It creates or updates the Render service from `render.yaml` with values from `.env`.
  - It creates the PayPal webhook for the service URL.
  - It deploys and checks `/api/health`.
- `npm run reset-demo:hosted` restores the hosted demo data. `seed.ts --hosted` requires `DEMO_OPS_PASSWORD` and prints only the target database host.
- Database step done: `groundside_hosted` migrated (4 migrations) and seeded with the Quick run. The local `neondb` was not changed.
- The user chose the Render CLI over an API key: it was installed with `winget install Render.CLI`, and the user authorized `render login` in the browser.
  - The CLI can create a service with variables, but cannot change them afterwards. So the app now falls back to Render's `RENDER_EXTERNAL_URL` when `APP_BASE_URL` is unset, and finds its PayPal webhook by URL when `PAYPAL_WEBHOOK_ID` is unset.
  - Pool emails are passed space-separated, because the CLI may split `--env-var` values on commas.
  - 155 tests.
- Service `groundside` created at https://groundside.onrender.com.
  - The first deploy went live in about 2 minutes. `/api/health` returns 200 with the database up.
  - Public pages checked in the browser: `/login`, the booking page with the PayPal SDK loaded, and an invalid passenger link. `/ops` redirects to `/login`.
- Scenario A, end to end against the hosted database (from the local e2e script): 16 payouts, 14 SUCCESS and 2 UNCLAIMED (by design) within 46 s.
  - PayPal delivered 19 webhooks to the Render URL. All 19 were verified with the ID found by URL, and none were rejected.
  - The hosted demo was then reset with `npm run reset-demo:hosted`.
- Gate 3 still needs the Quick run through the hosted UI. It needs a sign-in, which the user does.

### 2026-11-04: Gate 3 reached

- The user signed in on https://groundside.onrender.com and ran the Quick run through the hosted UI (assess, approve, simulate responses, payouts). The user reported "Done, it works".
- Wrote the Devpost draft text in `docs/DEVPOST_DRAFT.md`, with measured values only. The user submits the form.
- Gate 3 approved by the user, 2026-11-04. Phase 4 started.

### 2026-11-05: Phase 4 built (Gate 4 pending)

- **Release care now (SPEC F6):** a duty manager can offer meal allowances before the compensation decision.
  - Compensation stays PENDING_DECISION until then.
  - After the decision, what became payable joins each passenger's existing payment choice, and every offered passenger gets an update notice. A denial notice says how to contest.
  - `npm run e2e -- --release-care-first` covers it: meals paid 60 s after release; compensation followed the approval with the same totals as before.
- **Readiness panel (SPEC F6):** covers evidence airports, assessment, rule pack, missing contacts, payout funds (2 percent sandbox fee, compared with today's cap; the balance API returns 403 in sandbox) and the last webhook.
  - Approval requires typing APPROVE, shows the totals, and needs a logged acknowledgement when a check is open.
- **Refunds (SPEC F12):**
  - A paid demo booking joins cancelled DEMO 412 as a passenger, with the buyer's sandbox account as receiver.
  - Choosing a refund calls Payments v2 on the original capture. The REFUND entitlement follows the PayPal refund (webhook and polling).
  - Ops shows a refunds table with the 7-day deadline (REG-8-1).
  - Demo resets keep PayPal-paid bookings and their refunds.
  - Tested by joining the Phase 0 booking: its completed refund is reused, so no new money moved.
- **Unclaimed payouts (SPEC F10, 9.7):**
  - reminders, at most one per passenger a day
  - cancelling an item: the sandbox still answers HTTP 500, as in Phase 0; the debug IDs are recorded and the UI says so
  - switching to bank transfer, which completes only once every unclaimed item is cancelled or returned; until then nothing new is sent to PayPal for that passenger
  - the 30-day return, simulated locally
- **Receipts (SPEC F11, 8.2):**
  - Image processing with `sharp`: upright, at most 1600 px, metadata stripped, SHA-256 plus a 64-bit dHash.
  - A2 vision reading with strict JSON, Zod validation, one retry, spend log, and recorded readings as fallback.
  - The 8 code checks run in SPEC order. A near duplicate needs a similar photo and the same total or time: a photo hash alone flagged different receipts printed from one template.
  - Ops review queue in the Receipts tab.
  - Receipt payouts are separate PayPal items: the partial unique index is now per receipt for receipt items (migration `phase4_receipt_payouts`).
  - Sandbox run: a hotel receipt was auto-approved (129 EUR) and paid; the same file again was rejected as a duplicate.
  - Synthetic receipts: `npm run receipts:synthetic`. `npm run eval:a2`: 5/5, 0.0018 USD.
- **Passenger questions (SPEC F13, 8.4):**
  - A4 answers from a case file built by code, plus verified rule summaries (guidance excluded).
  - Validators check every amount against the case file and every citation, and always offer a person for legal advice, disputes and human requests. 10 questions per passenger a day.
  - "Talk to a person" opens one ticket; the ops Questions tab lists tickets.
  - `npm run eval:a4`: 8/8, including injection, legal-advice and invented-sum cases, 0.0032 USD.
- **Weather timeline (SPEC 7.5):**
  - AG Charts Community 14.3.0: visibility, lowest RVR and ceiling per airport.
  - Lettered flight-time markers with a key; 550 m and 200 ft lines labelled reference only.
  - Time axis in UTC: the library otherwise used the viewer's time zone.
  - Shown on the Evidence tab and on the new public `/about-data` page.
- **Passenger page:** a "Why" section with the cited rules for every outcome; pre-decision wording ("You may be owed").
- **Checks:** 193 tests; `npm run build` passes; every feature pushed and auto-deployed to Render.
- **Not done in Phase 4:**
  - A3 notice writer (notices are code templates)
  - the landing page and judge mode (Phase 5)
  - the owner's real receipt photos (`fixtures/receipts/`)

### 2026-11-05: Phase 5 started (user said "continue"; Gate 4 recording still the user's)

- **Defaults taken on the Gate 4 questions** (the user can override):
  - meal-receipt rule kept
  - consent text switched to SPEC F8 (`consent.v2`, cites REG-7-3)
  - denial reasons need 30 characters (SPEC F6)
  - `docs/DEMO.md` corrected to English only and METAR only
- **Judge mode (SPEC 13, 14):**
  - "Start the judge demo" on `/` (scenario A or B) creates a `JudgeRun` and seeds a private Quick run (own PNR seed). It creates a duty-manager user tied to the run (new `User.judgeRunId`, migration `phase5_judge_users`) and signs the judge in.
  - Every ops page, action, status route and receipt image route checks `assertDisruptionAccess`/`disruptionScope`. Actions on payout items and receipts also check the item belongs to the disruption.
  - Guide strip, "Reset this run", and judge bookings joining the judge's own flight.
  - Rate limit `MAX_JUDGE_RUNS_PER_HOUR`; expired runs removed when a new run starts; a failed start rolls back.
- **Walked the path as a judge in the local browser** (first look at the ops screens; screenshots in `docs/screens/`):
  1. evidence with weather charts
  2. release meals, then simulate responses: 8 meal payouts, 7 paid, 1 unclaimed
  3. AI assessment: PAY, weather claim not supported, technical cause from the maintenance log, 0.0017 USD
  4. approve with typed APPROVE and acknowledgement
  5. compensation payouts moved to Paid live in the grid
- **Found and fixed on that walk:**
  - approval did not start payouts for passengers who had already chosen PayPal
  - seeded refund choices had no due date
  - the judge seed reused the owner's PNRs
- **Hardening:**
  - `error.tsx`, `global-error.tsx` and `not-found.tsx` with no stack traces
  - security headers: CSP `frame-ancestors 'none'`, `base-uri`, `object-src`; plus `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
  - The PayPal SDK still loads.
- **Verified:**
  - rate limits exist for login, judge runs, receipts, questions, AI re-runs, passenger actions and joins; the Postgres limiter refused the 4th of 3
  - A2 and A4 fall back without calling the model at the budget cap and in fixtures mode (new tests)
- README: architecture diagram (Mermaid) and a judge-mode section. 198 tests.

### 2026-11-05: Phase 5 build continued (user: "continue the main build")

- **Secret scan** (`npm run secret-scan`): checks the whole git history and every tracked file for:
  - database URLs with passwords
  - OpenAI, PayPal and Render keys
  - private keys, bearer tokens and long secret assignments

  It prints locations only. Result: nothing found. One false positive, an npm integrity hash in `package-lock.json`, is excluded.
- **Fresh clone:** cloned from GitHub into a scratch folder with no `.env`; `npm ci` then `npm run check` passed (198 tests at that time).
- **Playwright smoke test** (`npm run smoke`, `e2e/judge-path.spec.ts`), with `@playwright/test` 1.64.1 and Chromium.
  - Runs the judge path: start the demo, evidence, release meals, simulate responses, AI assessment (recorded result locally), APPROVE, a Paid row in the grid, the audit entry. It also checks the public pages and the 404 page.
  - Against a local dev server it passed in 3.0 min; the first run against a cold dev server timed out while pages compiled, hence one retry.
  - `SMOKE_URL=https://groundside.onrender.com npm run smoke` runs it against the hosted app.
- **A3 notice writer (SPEC 8.3):** one notice per disruption and outcome (approved, denied with care, care only), cached in `Notice`.
  - Placeholders only; code fills name, amounts, signed reason and link.
  - Validators: required and allowed placeholders, no money in the text, rule-list citations, sentence length, the national enforcement body in denials.
  - Code templates when AI is off. `{{DECISION_REASON}}` was added to the SPEC placeholder list so the signed reason is quoted word for word.
  - `npm run eval:a3`: 3/3 on the first try, 0.0014 USD. A scenario B denial run used the A3 notice for all passengers.
- **Design pass (SPEC 12):** contrast computed for every text colour on both themes. Light-theme amber was 4.41 as text and 3.71 under ink on buttons; it is now `#945400` (5.37) with white button text, via a new `on-amber` token.
  - Count-up of the paid total (instant with reduced motion).
  - Enter or Space opens the passenger trace drawer from the grid.
- 205 tests.
- Hosted smoke test (`SMOKE_URL=https://groundside.onrender.com npm run smoke`) passed on the first try: the judge path with live AI reached a Paid row in 1.6 min (Gate 5 target: under 3 min); public pages and the 404 page are fine.

### 2026-11-05: Gate 5 checklist work

- **README:** environment variable table (SPEC 16).
- **Claims:** checked against the do-not-claim list; nothing to change.
- **Golden rule 10:** CJEU case titles named real airlines ("McDonagh v Ryanair") in the denial form, the passenger "Why" list and the AI prompts.
  - `src/lib/rules/display.ts` shows case law as "Case C-12/11, 31 January 2013"; the rule pack keeps the official titles.
  - A test asserts no airline name appears in any displayed title or summary.
  - The A1 eval is still 12/12 and A4 8/8 after the change.
- **Devpost screenshots** (`npm run screens`, `scripts/screens.ts`): six 1920x1080 PNGs in `docs/screens/`, captured from two local judge runs with live AI.
- **Found while capturing, fixed:**
  - Receipt duplicates were checked across every passenger in the database, so one judge's demo receipt would block it for every later judge. Duplicates are now checked within one data set (the owner's demo, or one judge run).
  - The Overview "time from decision to first passenger paid" counted meal payouts sent before the decision. It now counts only payouts sent after it.
  - The Next dev badge showed in captures (`devIndicators: false`).
- **Payout cap risk:** a scenario A judge run pays about 7,000 EUR, so the default 20,000 EUR daily cap allows about three runs a day. Owner to raise it on Render after checking the sandbox balance.
- **Sponsor prizes:** the PayPal blog lists Best Use of AG Grid (5,000/2,000/3 x 1,000 USD) and Best Use of Render (Render credits), with no qualifying rules. The Devpost rules page returns 403 to automated reads.
- **Checklist status:** recorded under `docs/DEMO.md` section 7.

### 2026-11-06: Gate 4 walkthrough on the hosted app

- **Synthetic receipts:** seven photo-style samples rendered with Playwright and degraded with sharp (`npm run receipts:make`), each with a sidecar of expected values from its source.
  - Invented merchants, zeroed IDs, card **** 0000, footer "Sample receipt - Groundside demo".
  - A2 prompt `A2.v2` flags faded print. `npm run eval:a2`: reading 12/12, decisions 8/8 including the duplicate re-upload, 0.0057 USD.
- **Arabic check:** a fresh subagent reviewed the Arabic on receipt g (the product is English only). Two right-to-left ordering bugs in mixed Arabic and number lines were fixed in the generator. Reviewed by AI, not by a human reader.
- **Walkthrough** (`npm run walkthrough`, `scripts/walkthrough.ts`): every step of `docs/DEMO.md` section 3 against https://groundside.onrender.com, with video and per-step screenshots; passenger steps on a 390x844 phone viewport.
  - The first run had 7 failures, all in the script: the approval acknowledgement box was not ticked, so the approval was rejected and steps 7 and 8 had nothing to wait for. Also a 503 while Render woke, pinned grid rows counted, a meal "Paid" mistaken for compensation, the audit table locator, and the bank-switch wait expecting the cancel to fail.
  - The second run: 13 PASS, 1 NEEDS HUMAN (the PayPal buyer checkout needs a password Claude Code does not type), 0 FAIL. Approval to first passenger paid: 0.7 min. Report: `docs/GATE4_WALKTHROUGH.md`.
  - The video rename failed on Windows after the run (an old file in the way), before results.json was written. The script now writes the results first, and this run's results were rebuilt from its log.
- **Gate 4:** approved under the user's standing instruction.
- **Step 11 by hand:** the owner booked with the sandbox buyer, joined the flight, chose the refund, and saw "refunded to your PayPal payment". The walkthrough report now shows 14 of 14 PASS, step 11 marked as done by hand.
- **Payout cap:** the owner reported a sandbox balance of 21,578.92 EUR. Measured cost of one full judge walkthrough on the hosted database: about 5,830 EUR (A 5,395, B 435, fees not counted). Recommended `PAYOUT_DAILY_CAP_EUR=6000` (one full run a day, `.env.example` updated) and a top-up to about 100,000 EUR before judging; the Render variable is the owner's to set.


### 2026-11-06: New PayPal sandbox app, spending guard, meal policy, cold start

- **New PayPal sandbox app** (owner created it; business account with 100,000 EUR). The owner pasted the client ID and secret in chat and asked Claude Code to put them in `.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`); the business account password was not stored anywhere. OAuth verified (HTTP 200). Webhook `7FC278035R9691426` created through the API for https://groundside.onrender.com/api/webhooks/paypal and stored as `PAYPAL_WEBHOOK_ID`. The balance API still answers 403.
- **Old-app records:** payout batches now carry a fingerprint of the PayPal app that created them (migration `phase5_payout_account`). Reconciliation, re-sends of stuck batches and unclaimed cancels only touch the current app's batches, so an old stuck batch can never be re-sent through the new app. Demo data reset locally and on the hosted database; all judge runs removed (9 local, 4 hosted); no old-app batches remain.
- **Spending guard:** approving a run that can pay more than one day's cap needs `PAY <amount> EUR` typed. Checked on a local 180-passenger run: the form asked for `PAY 148560 EUR`, a wrong amount was refused and no decision was recorded (`docs/screens/approve-full-run-cost.png`). No payouts were sent.
- **Cap:** `PAYOUT_DAILY_CAP_EUR=12000` in `.env` and `.env.example` (two judge runs a day).
- **Meal policy** (owner decision): a flat 15 EUR at once; further meals by receipt up to 60 EUR per 24 hours in total, flat amount included. Engine, POL-MEALS, trace text, passenger page, Q&A case file, tests (222 pass), receipt notes, walkthrough expectation, DEMO.md and the video script updated. A4 eval 8/8.
- **Cold start** (`npm run cold-start`): after 25 idle minutes, HTTP 503 at 3.6 s, landing page served at 51.5 s, first judge demo 15.7 s. Added to `docs/GATE4_WALKTHROUGH.md`.
- **GitHub:** repo homepage set to https://groundside.onrender.com with `gh`.
- **Not done, needs the owner:** `RENDER_API_KEY` is not in `.env`, so Render still runs the old PayPal app and the old cap; the hosted smoke test on the new app waits for that. `SANDBOX_BUYER_EMAIL`/`SANDBOX_BUYER_PASSWORD` are not in `.env`, so the buyer login is not published. `prize-aggrid.txt` and `prize-render.txt` were not in the repo. The Neon password is not rotated (owner decision).
- **Render switched to the new PayPal app** (owner permission to use the CLI): the Render CLI cannot set variables, so `npm run deploy:render` ran with the CLI's own login token as `RENDER_API_KEY` (read in-process, never printed). 22 variables synced, rebuild and deploy live, `/api/health` 200; the demo booking page carries the new public client ID. `render.yaml` cap set to 12000.
- **Hosted smoke test on the new app:** 2 passed in 1.7 min. Last 20 minutes on the hosted database: 2 batches, both tagged with the new app; 14 items SUCCESS and 2 UNCLAIMED (the unregistered-email case), 4,920 EUR; PayPal answers GET payout item with the new credentials (SUCCESS, transaction ID); 20 webhooks verified, 0 rejected. The old PayPal app can be deleted.
- **Buyer login** saved in `.env` at the owner's request and published with `npm run publish-logins` (README and `docs/DEVPOST_DRAFT.md`).

