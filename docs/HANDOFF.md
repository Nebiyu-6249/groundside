# Handoff

Current state for a fresh session. Read CLAUDE.md first, then this, then `docs/PROGRESS.md`.

## Where things stand (2026-11-04)

- **Phase 1 is at Gate 1**, waiting for the user's review. Don't start Phase 2 until the user approves.
- Phase 0 is done (Gate 0 approved 2026-11-04). Results in `docs/PHASE0_RESULTS.md`.
- **Rule pack:** 46 entries in `rules/` (JSON, one file each), all VERIFIED. `npm run rules:verify` re-fetches the official texts from the Publications Office CELLAR service and checks every excerpt word for word. EUR-Lex itself answers scripted requests with a bot challenge, so CELLAR is the verification source.
- **Engine:** `src/lib/engine/`, pure functions, 64 tests. Entry point `computePassenger(disruption, passenger, { rules, policy })`; `reconcile()` for idempotent re-runs.
- **Data:**
  - `data/airports.json` (37 airports, OurAirports, public domain, time zones added by hand)
  - `data/policy/demo-air.json`
  - `data/scenarios/A.json`, `data/scenarios/B.json`: **dates are placeholders** until Phase 2
- **Database:** migration `phase1_full_model` applied on Neon. The quick-run demo is seeded (`npm run reset-demo`).
- **PayPal app:** "Groundside EU" (`APP-55E35906EM8730949`), business account `sb-vz8j553542468@business.example.com` (DE), webhook `6UR10068K6257654U`.
- **Port:** dev server on **3001** (`npm run dev -- --port 3001`).
- **Tunnel:** cloudflared quick tunnels expire; update the webhook URL after each new tunnel.
- Repo: https://github.com/Nebiyu-6249/groundside (public, branch `main`). Scope: **English only**.

## Next steps

1. The user reviews Gate 1:
   - `docs/GATE1_TEST_OUTPUT.txt`
   - `docs/RULE_PACK_STATUS.md`
   - `docs/GATE1_WORKED_EXAMPLE.md`
   - the open decisions in the Gate 1 report: policy amounts (Q8), the name check (Q5), the B2 exactly-180-minute delay edge, and the `GUIDANCE` rule kind
2. After approval, Phase 2 (weather evidence, A1 assessment, evals). The first step is showing the user 2 or 3 candidate real dates per scenario (`docs/DEMO.md` 2.1); then update `dateLocal` and `dateIsPlaceholder` in `data/scenarios/*.json` and reseed.

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

- Checks: `npm run check` (108 tests at Gate 1)
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
  - Choosing a refund ends care (Commission guidelines 2024, 4.3.1): first meal allowance only, no hotel or transport.
- `AGENTS.md` is written by `next dev`; it points to the Next 16 docs in `node_modules/next/dist/docs/`.
- Stopping the background `npm run dev` task can leave the Next process running; `next dev` then reports the PID.
- The PayPal JS SDK may call `onCancel` after the buyer approved; the demo page captures on cancel too, and the server captures only APPROVED orders.
