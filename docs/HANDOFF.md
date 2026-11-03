# Handoff

Current state for a fresh session. Read CLAUDE.md first, then this, then `docs/PROGRESS.md`.

## Where things stand (2026-11-04)

- **Phase 0 is at Gate 0**, waiting for the user's review of `docs/PHASE0_RESULTS.md`. Don't start Phase 1 until the user approves.
- Every Phase 0 item works in sandbox except cancelling an UNCLAIMED payout item (HTTP 500 every time; see PHASE0_RESULTS item 5).
- **PayPal app:** "Groundside EU" (`APP-55E35906EM8730949`), linked to the generated business account `sb-vz8j553542468@business.example.com` (DE). It replaced the first app, whose custom-email business account declined every checkout. `.env` holds the new client ID, secret and webhook ID `6UR10068K6257654U`.
- **Port:** the dev server runs on **3001** (`npm run dev -- --port 3001`); another local app sometimes holds 3000.
- **Tunnel:** cloudflared quick tunnels expire. After starting a new one, update the webhook URL for `6UR10068K6257654U` in the dashboard (or via `PATCH /v1/notifications/webhooks/{id}`, with the user's OK).
- Repo: https://github.com/Nebiyu-6249/groundside (public, branch `main`). Scope: **English only**.

## Next steps

1. The user reviews PHASE0_RESULTS and answers the Gate 0 decisions:
   - unclaimed-cancel handling in Phase 4;
   - whether to ask on the PayPal Discord;
   - creating the 4 remaining pool accounts;
   - the business balance reading from the dashboard.
2. After approval: Phase 1 (airports subset, full Prisma schema, scenarios, rule pack, EU261 engine with at least 40 tests). Post the Phase 1 plan first.

## How to run

```powershell
cd C:\dev\groundside
npm install
copy .env.example .env
notepad .env
npx prisma migrate deploy
npm run dev -- --port 3001
```

- Checks: `npm run check` (27 tests passing at Gate 0)
- Payouts spike: `npm run spike:payouts` (writes redacted JSON to `scripts/out/`)
- Webhook tunnel (separate window): `cloudflared tunnel --url http://localhost:3001`
- Demo booking: http://localhost:3001/demo/book in Chrome or Edge, not the desktop app's built-in browser.

## Open blockers

- None for Phase 1.
- Secrets to rotate before deploying to Render: the Neon password, and the old and new PayPal app secrets (all appeared in chat).

## Notes for the next session

- Prisma 7: the client is generated to `src/generated/prisma` (git-ignored); `prisma.config.ts` loads `.env` itself. The app connects through `@prisma/adapter-pg` with the pooled `DATABASE_URL`.
- `AGENTS.md` is written by `next dev`. It points to the Next 16 docs in `node_modules/next/dist/docs/`; read the relevant guide there before using an unfamiliar Next API.
- Stopping the background `npm run dev` task can leave the Next process running; `next dev` then reports "Another next dev server is already running" with its PID.
- The PayPal JS SDK may call `onCancel` after the buyer approved. The demo page captures on cancel too; the server captures only APPROVED orders.
