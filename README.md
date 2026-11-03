# Groundside

When a flight from an EU airport is cancelled or badly delayed, Groundside checks the airline's stated cause against real archived weather reports, works out what every passenger is owed under EU Regulation 261/2004, and pays them through PayPal once a duty manager approves.

Built for the PayPal AI Hackathon. **Status: in development (Phase 0: scaffold and PayPal sandbox spike).**

- Live demo: not deployed yet
- Demo credentials: published here once the hosted demo is up (sandbox only)

## What it does

1. Gathers the evidence: the airline's ops note, the maintenance log, and real METAR/TAF weather for the departure airport, the arrival airport and the aircraft's previous flight.
2. An AI model checks whether the stated cause is supported by that evidence. It may cite only verified rules and only weather facts that code extracted. It recommends; it never denies.
3. A deterministic engine computes each passenger's entitlements (compensation, meals, hotel, refund), with every amount traced to a cited rule.
4. A duty manager approves once, or signs a denial with reasons. Meals and hotel are paid either way.
5. Each passenger chooses PayPal (with explicit consent) or bank transfer, and is paid through the PayPal Payouts API.

## How PayPal is used

- Payouts API: micro-batches with idempotent `sender_batch_id`, unclaimed handling and cancellation
- Orders v2 and the PayPal JS SDK: demo ticket bookings
- Payments v2: refunds to the original capture
- Webhooks with signature verification, plus polling reconciliation

All PayPal calls use the **sandbox** only. No real money moves.

## How AI is used

Described here as each AI component lands (Phase 2 onwards). Model IDs come from environment variables.

## Data labels

- Passengers, bookings, the airline ("Demo Air (fictional carrier)") and flight numbers are synthetic and labelled "Demo data" on screen.
- Weather reports are real archived observations, labelled with their source and retrieval time.

## Local setup

Requirements: Node 22 or later, npm, a Neon Postgres database, a PayPal sandbox app.

Windows (PowerShell):

```powershell
git clone https://github.com/Nebiyu-6249/groundside.git
cd groundside
npm install
copy .env.example .env
notepad .env
npx prisma migrate deploy
npm run dev
```

macOS / Linux:

```bash
git clone https://github.com/Nebiyu-6249/groundside.git
cd groundside
npm install
cp .env.example .env   # then edit .env
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000. `GET /api/health` reports database status.

Every variable is documented in [`.env.example`](.env.example).

### PayPal sandbox setup

In the PayPal developer dashboard (sandbox):

1. Create a **Business** account in Germany and keep the email PayPal generates (`sb-...@business.example.com`). Give it a EUR balance. A business account created with a custom email declined every checkout in our tests ("rejected due to international regulations"); see [`docs/PHASE0_RESULTS.md`](docs/PHASE0_RESULTS.md).
2. Create a REST app linked to that business account, with Payouts enabled. Put its client ID and secret in `.env`.
3. Create Personal accounts in Germany with generated emails for the passenger pool and the ticket buyer. List the pool in `PAYPAL_POOL_RECEIVERS`.
4. For webhooks, expose the dev server (for example `cloudflared tunnel --url http://localhost:3000`), add a webhook for all events at `<public URL>/api/webhooks/paypal`, and put its ID in `PAYPAL_WEBHOOK_ID`.

Test the checkout in a regular browser (Chrome, Edge, Firefox); embedded browser panes can break the PayPal window.

## Checks

```bash
npm run check   # typecheck, lint, unit tests
```

## License

[MIT](LICENSE)
