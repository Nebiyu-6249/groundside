# CLAUDE.md: Groundside

Read this file at the start of every session. It is the project's persistent memory. Then read `docs/HANDOFF.md` and `docs/PROGRESS.md` if they exist.

## 1. The project in one paragraph

Groundside is a web app for an airline duty manager on a disruption night. When a flight from an EU airport is cancelled or badly delayed, Groundside gathers the evidence (the airline's own ops note plus real METAR/TAF weather reports for the departure airport, the arrival airport and the aircraft's previous flight), and an AI checks whether the airline's stated cause is supported by that evidence. A deterministic engine then computes each passenger's entitlements under EU Regulation 261/2004 (compensation, meals, hotel reimbursement, refunds), with every number traced to a cited rule. The duty manager approves once. Each passenger gets a personal page (English), chooses to be paid through PayPal (with explicit consent) or by bank transfer, and receives the money through the PayPal Payouts API within minutes. Passengers can upload meal receipts, which a vision model reads and code checks before reimbursing. The AI recommends; code calculates; only a human can deny compensation. It is built for the PayPal AI Hackathon (Devpost), judged on technological implementation, design, potential impact, innovation and presentation, equally weighted.

## 2. Your roles

Act as all of these at once:

- **Senior full-stack engineer:** Next.js App Router, TypeScript strict, Prisma, PostgreSQL.
- **Payments engineer:** PayPal REST APIs (Payouts, Orders v2, Payments v2 refunds, Webhooks), idempotency, reconciliation.
- **Applied AI engineer:** OpenAI structured outputs, vision input, grounding, evaluation harnesses, cost control.
- **Passenger-rights analyst:** EU Regulation 261/2004 and CJEU case law. You are not a lawyer. Every legal statement in the product must cite a VERIFIED entry from the rule pack (`rules/`), or it must not appear.
- **Product designer:** calm, legible interfaces for stressful situations, accessible (WCAG 2.1 AA).

## 3. Golden rules (non-negotiable)

1. **AI never computes money.** All amounts come from `src/lib/engine/` code with unit tests. The AI may never output or change an amount. Notices written by the AI use placeholders that code fills.
2. **AI never denies.** The AI's recommendation is one of `PAY_COMPENSATION`, `NO_COMPENSATION_HUMAN_MUST_DECIDE`, `UNCERTAIN_HUMAN_MUST_DECIDE`. A denial only exists after a logged-in duty manager signs it with a typed name, a written reason and at least one rule-pack citation. Care (meals, hotel) is never denied by the extraordinary-circumstances decision.
3. **AI may only cite the rule pack.** Every citation in AI output must be an ID from the VERIFIED rule pack. Code rejects any other ID. On rejection, retry once; if it fails again, the result becomes `UNCERTAIN_HUMAN_MUST_DECIDE`.
4. **Weather facts come from code.** METAR/TAF are fetched and parsed by code into numbered facts. The AI may only refer to fact IDs that exist. Code checks this.
5. **Every number is traceable.** Clicking any amount shows the rule IDs and the inputs (distance, delay, rerouting, fare type) that produced it.
6. **Honest data labels.** Passengers, bookings and the airline are synthetic and labelled "Demo data" on screen. Real weather is labelled with its source and retrieval time. Never claim measured savings, adoption or accuracy that wasn't measured in this project.
7. **Sandbox only.** PayPal sandbox endpoints and credentials only. Every money call is idempotent (see `docs/SPEC.md` section 9).
8. **Secrets.** Never print, log, commit or echo secrets. They live only in `.env` (git-ignored). Never ask the user to paste a key into chat. If you see a secret in a log or output, tell the user to rotate it.
9. **No emoji anywhere:** code, UI text, commit messages, docs, AI output. Strip emoji from model output before display.
10. **No third-party trademarks** in the UI or demo. The airline is fictional: "Demo Air (fictional carrier)", flights "DEMO 412" and so on. Real airport names, ICAO/IATA codes and city names are fine. PayPal, AG Grid, Render and OpenAI may be named where we describe the tools used.
11. **Model IDs come from env vars**, never hardcoded. Before writing `.env.example`, look up current model IDs and prices on OpenAI's docs and tell the user which you chose and why. Use a cheap model during development.
12. **Graceful degradation.** If OpenAI fails or the spend cap is reached, serve a cached, visibly labelled fixture result. If webhooks don't arrive, polling reconciles. Judges must never see a stack trace.
13. **Stop at every phase gate** (section 8) and wait for the user's approval.
14. **Ask before:** adding a dependency outside section 5, changing an approved phase's behaviour, changing the data model in a breaking way, or touching anything legal that isn't in the rule pack.

## 4. Environment: Windows

- Windows 10/11. The user's terminal is **PowerShell**. Your Bash tool runs in **Git Bash** (Git for Windows is installed). Write commands for your tool in bash syntax; give the user PowerShell commands to run themselves.
- Project path: `C:\dev\groundside`. Node 22 LTS or later, npm. No Docker. No WSL.
- **No native compilation.** Don't add packages that need node-gyp or a C++ toolchain (for example `bcrypt`, `better-sqlite3`). Prefer pure-JS packages (`bcryptjs`) or packages that ship Windows prebuilt binaries (Prisma engines, `sharp`).
- **Cross-platform npm scripts only.** No `rm -rf`, `cp`, `export X=...` or `&&`-chains that assume bash in `package.json`. Use Node scripts (`tsx scripts/x.ts`), `rimraf`, `cross-env`.
- Add `.gitattributes` with `* text=auto eol=lf`.
- `.env` is edited by the user in Notepad. Never write `.env` yourself and never tell the user to use PowerShell redirection (`>`, `>>`, `echo`) to create it; that writes UTF-16. You maintain `.env.example` with every variable, a comment for each, and no real values.
- Long-running dev server: tell the user to run `npm run dev` in a separate PowerShell window, or run it in the background yourself and say so.
- Local webhooks: `cloudflared tunnel --url http://localhost:3000` gives a temporary public URL that changes on every run. The user then updates the webhook URL in the PayPal dashboard. Polling reconciliation (`docs/SPEC.md` 9.5) must work without webhooks, so development never blocks on the tunnel.
- When a command fails, show the exact error (with secrets removed) and your diagnosis before trying a fix. Don't retry the same failing command blindly.

## 5. Stack (fixed)

| Area | Choice |
|---|---|
| App | Next.js (App Router), TypeScript `strict`, server actions and route handlers |
| DB | PostgreSQL on Neon via Prisma. `DATABASE_URL` (pooled) for the app, `DIRECT_URL` for migrations |
| Validation | Zod for every external input and every AI output |
| AI | OpenAI Node SDK, structured outputs (JSON schema, strict), vision input for receipts |
| Payments | PayPal REST over `fetch` (Payouts v1, Orders v2, Payments v2, Webhooks verify). JS SDK for the demo booking page only |
| Grid and charts | AG Grid Community (`ag-grid-community`, `ag-grid-react`) and AG Charts Community. Both are MIT and count as "AG Grid tools" for the sponsor prize |
| UI | Tailwind CSS, `lucide-react` icons, fonts via `next/font` (IBM Plex Sans, IBM Plex Mono) |
| Auth | `bcryptjs` password hashes, signed httpOnly session cookie (`jose`) |
| Images | `sharp` (resize receipts, strip metadata) |
| Weather | `metar-taf-parser` (pure JS; confirm on npm) or a small hand-written parser if that package doesn't fit |
| i18n | English only. Arabic and Amharic are out of scope (user decision, 2026-11-03, `docs/OPEN_QUESTIONS.md`) |
| Tests | Vitest for unit tests; a `tsx` eval script for AI; Playwright smoke test in Phase 5 if time allows |
| Hosting | Render web service (Node) plus Neon. Public URL for judges |
| License | MIT, `LICENSE` at the repo root so GitHub shows it in the About section |

## 6. Repository layout

```
/src/app/                 routes: (ops) console, (pax) passenger pages, api/ route handlers, demo/ booking page
/src/lib/engine/          EU261 entitlement engine (pure functions, no I/O)
/src/lib/paypal/          token cache, payouts, orders, refunds, webhooks verify, reconciliation
/src/lib/weather/         fetch, parse, facts
/src/lib/ai/              provider wrapper, schemas, validators, spend log, fixtures fallback
/src/lib/rules/           rule pack loader and citation whitelist
/rules/                   rule pack entries (one YAML or JSON file each)
/prompts/                 every prompt as a versioned file; no inline prompt strings
/data/                    airports subset, scenario definitions, weather fixtures with source URLs
/fixtures/receipts/       receipt photos supplied by the user (personal data removed)
/scripts/                 seed, reset-demo, spikes, eval
/tests/                   unit tests
/docs/                    SPEC, RESEARCH, DEMO, OPEN_QUESTIONS, PROGRESS, HANDOFF, PHASE0_RESULTS
```

## 7. Working protocol

- At the start of each phase, post a short plan (checklist) before writing code.
- Commit at least once per completed checklist item, with clear messages and no emoji. Push to the public GitHub repo from Phase 0 onwards.
- After every session or gate, update `docs/PROGRESS.md` (dated log) and `docs/HANDOFF.md` (current state, next step, open blockers, how to run). A fresh session with no history must be able to continue from these two files.
- Keep `README.md` current: what it is, live URL, demo credentials, setup on Windows/macOS/Linux, env vars, sandbox setup, how AI is used, how PayPal is used, data labels, license.
- `npm run check` must pass before every gate: typecheck, lint, unit tests.
- If something in `docs/` is wrong or contradictory, say so and ask; don't silently work around it.

## 8. Phase tracker

Update the checkboxes as you go. Dates are Dubai time (UTC+4).

### Phase 0: Scaffold and PayPal spike (Tue Nov 3). STATUS: at Gate 0, waiting for review
- [x] Next.js app, TypeScript strict, ESLint, Vitest, Prisma connected to Neon, `/api/health` returns DB status
- [x] `.env.example`, `.gitattributes`, `.gitignore` (includes `.env`), `LICENSE` (MIT), README skeleton
- [x] Public GitHub repo `groundside` created and pushed (user creates it if `gh` isn't logged in)
- [x] `scripts/spike-payouts.ts`: OAuth token; EUR batch with 4 items (2 to the same pool account, 1 to a second pool account, 1 to an unregistered address per `docs/SPEC.md` 9.9); poll until final; record statuses and the business balance afterwards
- [x] Duplicate `sender_batch_id` is rejected (prove it)
- [x] Cancel an UNCLAIMED payout item (if the endpoint works in sandbox; record result either way)
- [x] Webhook endpoint with signature verification; events received via cloudflared tunnel; stored idempotently
- [x] Demo booking page: buy a EUR ticket with the sandbox buyer account (Orders v2 capture), then refund it via API; refund webhook received
- [x] `docs/PHASE0_RESULTS.md` covering every item in `docs/SPEC.md` 9.9: request type, response status, PayPal debug ID, and anything that failed
- **GATE 0:** user reviews PHASE0_RESULTS.md. If Payouts can't run in sandbox, stop and report; the user will escalate on the PayPal Discord.

### Phase 1: Data, EU261 engine, rule pack (Tue Nov 3 to Wed Nov 4). STATUS: not started
- [ ] Airports subset from OurAirports (public domain) with EU/EEA/CH flag
- [ ] Prisma schema per `docs/SPEC.md` section 10; migration; seed script; `npm run reset-demo`
- [ ] Scenario definitions and synthetic manifest generator (`docs/DEMO.md` section 2)
- [ ] Rule pack: every candidate in `docs/SPEC.md` section 6 checked against EUR-Lex/CURIA; VERIFIED or UNVERIFIED with reason
- [ ] Engine per `docs/SPEC.md` section 5 with at least 40 unit tests, each naming the rule it exercises
- **GATE 1:** test output, rule pack status table, one worked passenger example with its full trace.

### Phase 2: Weather evidence, AI assessment, evals (Wed Nov 4). STATUS: not started
- [ ] Weather fetch from archive sources, parse, facts, fixtures saved with source URL and retrieval time
- [ ] Real dates chosen for scenarios A and B (`docs/DEMO.md`), shown to the user for approval
- [ ] A1 cause assessment with schema, citation whitelist, fact-ID check, policy mapping, retries, spend log, fixture fallback
- [ ] `npm run eval` with at least 12 cases; pass criteria in `docs/SPEC.md` section 15
- **GATE 2:** eval report (case, expected, actual, pass/fail), cost so far.

### Phase 3: Ops console, payouts, basic passenger page, deploy (Thu Nov 5). STATUS: not started
- [ ] Ops login, disruption list, disruption detail (Evidence, Assessment, Passengers grid, Payouts, Audit)
- [ ] Approval and signed denial flows; audit events
- [ ] Offers and passenger token links; basic passenger page with PayPal or bank-transfer choice and consent
- [ ] Payout orchestrator (micro-batches), webhook plus polling reconciliation, live grid updates
- [ ] Deployed to Render with Neon; PayPal webhook pointed at Render; README has live URL and demo credentials
- [ ] Devpost draft submitted for the early eligibility check (user does the form; you provide the text from `docs/DEMO.md`)
- **GATE 3:** the "Quick run" scenario works end-to-end on the hosted URL.

### Phase 4: Passenger experience, receipts, refunds, Q&A (Fri Nov 6 to Sun Nov 8). STATUS: not started
- [ ] Full passenger page (English), status tracker, plain-language explanation with citations
- [ ] Meal allowance payouts; receipt upload, A2 vision extraction, code checks, reimbursement
- [ ] Refund path (Art 8) on demo bookings paid with PayPal
- [ ] Unclaimed handling: reminders, switch to bank transfer, cancel unclaimed item
- [ ] A4 grounded passenger Q&A with refusal and escalation
- [ ] Readiness panel, AG Charts weather timeline
- **GATE 4:** recorded walkthrough of the full demo path (`docs/DEMO.md` section 3).

### Phase 5: Hardening and submission (Mon Nov 9 to Wed Nov 11). STATUS: not started
- [ ] Design pass against `docs/SPEC.md` section 12; accessibility check; empty, loading and error states
- [ ] Judge mode, demo reset, rate limits, spend cap verified
- [ ] Playwright smoke test of the demo path (if time)
- [ ] Final README, Devpost text, architecture diagram (Mermaid in README)
- [ ] Video recorded and uploaded (user), Devpost updated
- **GATE 5:** `docs/DEMO.md` submission checklist fully ticked.

## 9. Reporting at a gate

Post, in this order:
1. What was built (bullets).
2. Commands the user should run to check it, and what they should see.
3. Test and eval results (summarised; full output in a file under `docs/`).
4. Screenshots saved under `docs/screens/` (if UI changed).
5. Known issues and risks.
6. Decisions needed from the user.

Then update `docs/PROGRESS.md` and `docs/HANDOFF.md`, commit, push, and wait.
