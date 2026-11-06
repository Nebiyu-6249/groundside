# Handoff

Current state for a fresh session. Read CLAUDE.md first, then this, then `docs/PROGRESS.md`.

## Deadlines

- **Official (Devpost rules, confirmed by the user 2026-11-06):** Thu Nov 12, 2026, 12:00 PM PT, which is 20:00 UTC and Fri Nov 13, 00:00 Dubai.
- **Internal:** Thu Nov 12, 18:00 Dubai (14:00 UTC), six hours before the official cut-off.
- **Judging:** Dec 1 to 15; the hosted demo and the sandbox must keep working through it.

## Arabic

- The product is English only (user decision 2026-11-03). There is no Arabic passenger page, notice or Q&A answer.
- The only Arabic in the project is printed on sample receipt g (`fixtures/receipts/g-dubai-restaurant-aed.jpg`), a synthetic Dubai restaurant receipt.
- **Reviewed by AI, not by a human reader** (2026-11-06): a fresh subagent checked wording, amounts and right-to-left layout.
  - Wording and amounts were fine.
  - It found two ordering bugs in mixed Arabic and number lines (the address number and the VAT value). Both are fixed in `scripts/make-receipts.ts`, along with an Arabic comma, an Arabic TRN label and the Arabic total label on the TOTAL line.

## Where things stand (2026-11-06)

- **Gate 4 approved (2026-11-06)** under the user's standing instruction ("if all of Parts 1 to 3 pass, treat Gate 4 as approved").
  - `npm run walkthrough` drove every step of `docs/DEMO.md` section 3 on https://groundside.onrender.com in a fresh browser: 13 PASS, 1 NEEDS HUMAN (step 11), 0 FAIL. Report: `docs/GATE4_WALKTHROUGH.md`; screenshots in `docs/walkthrough/`; videos in `docs/walkthrough/video/` (git-ignored).
  - Step 11 (demo booking refund) was done by hand by the owner on 2026-11-06 and passed, so the walkthrough is 14 of 14.
  - Approval to first passenger paid: 0.7 min on the Overview (44 s from the Approve click to a Paid compensation row).
  - Money proven through PayPal's API: payout item SUCCESS with a transaction ID (in the report).
  - In this run the sandbox accepted the cancel of an UNCLAIMED item (RETURNED); in Phase 0 it refused every cancel (HTTP 500). Both paths are handled.
  - The run did not measure a cold wake: the instance was still awake from the run before.
  - `npm run walkthrough:report` regenerates the report from `docs/walkthrough/results.json`. One judge walkthrough uses 2 judge runs (of 5 per hour per IP) and about 5,830 sandbox EUR (measured 2026-11-06).
- **Receipts:** seven synthetic photo-style samples in `fixtures/receipts/` (`npm run receipts:make`), labelled as samples everywhere. `npm run eval:a2`: reading 12/12, decisions 8/8 (`docs/EVAL_A2.md`).
- **Phase 5 in progress.** Next for Claude Code: the Gate 5 checklist (`docs/DEMO.md` section 7): final README, Devpost text, architecture diagram.
- **Owner to-do:**
  - **Done 2026-11-06:** Render runs the new PayPal app with `PAYOUT_DAILY_CAP_EUR=12000` (synced by `npm run deploy:render` with the Render CLI's login token, owner permission; `render.yaml` now says 12000). The hosted smoke test passed on the new app. The buyer login is published.
  1. Delete the old PayPal sandbox app in the developer dashboard: safe now (no payout record from it remains, and every webhook since the switch verified against the new app's webhook).
  - Secrets (owner decision 2026-11-06): the new PayPal app replaces the leaked PayPal secret. Its own client secret and the sandbox buyer password were pasted in chat, and the owner accepted that. The Neon password is not rotated, by owner decision.
  2. Decide the Render plan for judging (free sleeps when idle; starter is always on).
  3. Submit the Devpost draft (`docs/DEVPOST_DRAFT.md`), record and upload the video (under 3:00), and tick the prizes.
  4. Put `prize-aggrid.txt` and `prize-render.txt` in the repo root (they were not there on 2026-11-06); Claude Code checks them and deletes them without committing.
  5. Optional: real receipt photos (personal data covered) in `fixtures/receipts/`, then `npm run eval:a2`.
- **Phase 4 is built (2026-11-05)** (`docs/DEMO.md` section 3). Phases 0 to 3 are approved; the Quick run works on https://groundside.onrender.com.
  - **Phase 4 features:**
    - release care before the decision
    - readiness panel with typed APPROVE
    - refunds on PayPal demo bookings
    - unclaimed handling
    - receipts (A2 plus code checks plus review queue)
    - passenger questions (A4 plus tickets)
    - AG Charts weather timeline, and `/about-data`
  - See `docs/PROGRESS.md` (2026-11-05).
  - Phases 0 to 2 are done (Gates 0, 1 and 2 approved 2026-11-04). A1 is on prompt `A1.v3`: 12/12 evals.
  - **Ops console** (`src/app/(ops)/ops/`):
    - login at `/login`
    - board at `/ops`
    - disruption detail with Overview, Evidence, Assessment (decision forms), Passengers (AG Grid), Payouts and Audit tabs
    - simulated outbox at `/ops/outbox`
  - **Passenger page:** `src/app/(pax)/p/[token]/`.
  - **Back end:**
    - auth: `src/lib/auth/`
    - decisions, offers, engine re-run, simulated responses: `src/lib/ops/`
    - orchestrator, transitions, reconciliation: `src/lib/payouts/`
  - **End to end:** `npm run e2e -- --scenario=A|B` against the sandbox. Both scenarios work: A pays, B is a signed denial with care paid. Run `npm run reset-demo` before each.
  - **Local demo login:** `duty.manager@demo.groundside.test`; the password is in `scripts/out/demo-credentials.txt` (generated by the seed, git-ignored). The user signs in themselves; Claude Code must not read that file.
- **Rule pack:** 46 entries in `rules/` (JSON, one file each), all VERIFIED. `npm run rules:verify` re-fetches the official texts from the Publications Office CELLAR service and checks every excerpt word for word. EUR-Lex itself answers scripted requests with a bot challenge, so CELLAR is the verification source.
- **Engine:** `src/lib/engine/`, pure functions, 64 tests. Entry point `computePassenger(disruption, passenger, { rules, policy })`; `reconcile()` for idempotent re-runs.
- **Data:**
  - `data/airports.json` (37 airports, OurAirports, public domain, time zones added by hand)
  - `data/policy/demo-air.json`
  - `data/scenarios/A.json`, `data/scenarios/B.json`: real dates, chosen in Phase 2
- **Database:** migration `phase1_full_model` applied on Neon. The quick-run demo is seeded (`npm run reset-demo`).
- **PayPal app:** "Groundside EU" (`APP-55E35906EM8730949`), business account `sb-vz8j553542468@business.example.com` (DE), webhook `6UR10068K6257654U`.
- **Port:** dev server on **3001** (`npm run dev -- --port 3001`).
- **Tunnel:** cloudflared quick tunnels expire; update the webhook URL after each new tunnel.
- Repo: https://github.com/Nebiyu-6249/groundside (public, branch `main`). Scope: **English only**.

## Next steps

1. **Hosted demo:** https://groundside.onrender.com (Render service `srv-dblo5b1srm7s73f7rntg`, free plan, Frankfurt, auto-deploys on push to `main`).
   - Deployed with `npm run deploy:render` through the Render CLI (installed with winget; the user ran `render login`). See `docs/DEPLOY.md`.
   - The database is `groundside_hosted` on the same Neon project.
   - The hosted login is in `scripts/out/hosted-credentials.txt` (git-ignored; Claude Code does not read it).
   - The user ran the Quick run on the hosted URL (2026-11-04): it works.
2. **Devpost draft:** the text is ready in `docs/DEVPOST_DRAFT.md`; the user fills in the form for the early eligibility check.
3. **Phase 3 items still open from SPEC** (they could move to Phase 4 or 5): the landing page (`/` is still a placeholder), the judge-mode "Start the judge demo" flow (SPEC 14, Phase 5), and the questions and receipts tabs (Phase 4).

## How to run

```powershell
cd C:\dev\groundside
npm install
copy .env.example .env
notepad .env
npx prisma migrate deploy
npm run reset-demo
npm run dev -- --port 3001
```

- Checks: `npm run check` (151 tests); production build: `npm run build`
- End-to-end sandbox run: `npm run reset-demo` then `npm run e2e -- --scenario=A`
- A1 evals: `npm run eval` (live model; needs `OPENAI_API_KEY`)
- Weather fixtures: `npm run weather:fetch -- --scenario=A` (skips existing files; `--force` replaces them)
- Rule pack check: `npm run rules:verify` (add `-- --refresh` to re-download the texts)
- One passenger's trace: `npm run explain -- --scenario=A --case=4`
- Airports rebuild: `npm run airports:build -- <path to OurAirports airports.csv>`
- Payouts spike: `npm run spike:payouts`

## Open blockers

- None for Phase 2 beyond the user's choice of weather dates.
- Secrets to rotate before deploying to Render: the Neon password, and the old and new PayPal app secrets (all appeared in chat).

## Notes for the next session

- Prisma 7: the client is generated to `src/generated/prisma` (git-ignored); run `npx prisma generate` after schema changes. `prisma.config.ts` loads `.env` itself. The app connects through `@prisma/adapter-pg` with the pooled `DATABASE_URL`.
- The partial unique index "one active payout item per entitlement" is raw SQL at the end of the `phase1_full_model` migration.
- Payout rows do not cascade from entitlements; `resetDemo()` deletes them explicitly.
- Engine decisions worth knowing:
  - The Article 6 care thresholds use the delayed flight's own distance; compensation uses first departure to final destination.
  - The Art 7(2) reduction for cancellations needs an accepted re-routing.
  - The Sturgeon long-haul 50 percent reduction applies to B3 delays of 180 to 239 minutes, and also needs the Demo Air policy flag.
  - Choosing a refund ends care (Commission guidelines 2024, 4.3.1): the flat meal allowance only, no meal receipts, hotel or transport.
- `AGENTS.md` is written by `next dev`; it points to the Next 16 docs in `node_modules/next/dist/docs/`.
- Stopping the background `npm run dev` task can leave the Next process running; `next dev` then reports the PID.
- The PayPal JS SDK may call `onCancel` after the buyer approved; the demo page captures on cancel too, and the server captures only APPROVED orders.
