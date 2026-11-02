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
