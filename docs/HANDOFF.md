# Handoff

Current state for a fresh session. Read CLAUDE.md first, then this, then `docs/PROGRESS.md`.

## Where things stand (2026-11-03)

- **Phase 0 in progress.** Code for every Phase 0 item is written and `npm run check` passes. Nothing has run against Neon or PayPal yet, because `.env` does not exist.
- Repo: https://github.com/Nebiyu-6249/groundside (public, branch `main`).
- Scope: **English only** (no Arabic, no Amharic), by user decision.

## Next steps

1. The user fills `.env` (see below). Check with: `npm run dev`, then open http://localhost:3000/api/health. It should show `"db":"up"` once the migration has run.
2. Run the first migration: `npx prisma migrate dev --name phase0_init` (uses `DIRECT_URL`).
3. Start the dev server and `cloudflared tunnel --url http://localhost:3000` in the background. The user creates a sandbox webhook pointing at `<tunnel>/api/webhooks/paypal` and puts its ID in `.env` as `PAYPAL_WEBHOOK_ID`. Restart the dev server after editing `.env`.
4. `npm run spike:payouts`. If `pax-0001@example.com` is rejected, rerun with `-- --unregistered=<other reserved-domain address>`.
5. The user pays on `/demo/book` with a sandbox buyer account (Claude Code must not type PayPal passwords), then clicks refund. Check the `WebhookEvent` table for payout and refund events.
6. Write `docs/PHASE0_RESULTS.md` (every SPEC 9.9 item: request, HTTP status, debug ID, outcome), tick the tracker, commit, push, then stop at Gate 0.

## How to run

```powershell
cd C:\dev\groundside
npm install
copy .env.example .env
notepad .env
npx prisma migrate dev --name phase0_init
npm run dev
```

- Checks: `npm run check`
- Payouts spike: `npm run spike:payouts`
- Webhook tunnel (separate window): `cloudflared tunnel --url http://localhost:3000`

## `.env` values needed for Phase 0

`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_POOL_RECEIVERS` (at least 2 for the spike, 10 eventually), then `PAYPAL_WEBHOOK_ID` once the webhook exists. `OPENAI_API_KEY` is not needed until Phase 2.

## Open blockers

- `.env` and the PayPal sandbox setup (user).
- Whether Payouts is enabled for the sandbox app: unknown until the spike runs.

## Notes for the next session

- Prisma 7: the client is generated to `src/generated/prisma` (git-ignored); `prisma.config.ts` loads `.env` itself. The app connects through `@prisma/adapter-pg` with the pooled `DATABASE_URL`.
- `AGENTS.md` is written by `next dev`. It points to the Next 16 docs in `node_modules/next/dist/docs/`; read the relevant guide there before using an unfamiliar Next API.
