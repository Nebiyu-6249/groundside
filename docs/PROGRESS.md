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
