# Devpost draft (early eligibility check)

Draft text for the Devpost form, from `docs/DEMO.md` section 5. Every number below was measured in this project on 2026-11-04. Phase 4 features are marked "in progress" until they are built. Rewrite it in your own words before submitting.

---

**Name:** Groundside

**Tagline:** When a flight is cancelled, check the airline's excuse against real weather data, work out what every passenger is owed, and pay them through PayPal before they leave the airport.

## Inspiration

On a disruption night, passengers queue for paper vouchers and are told to fill in a claim form later. Most of them never do.
- **Unclaimed money:** for summer 2024 alone, the claims company Skycop estimated about 2 billion EUR in EU261 compensation was owed, and that only about a third of it is typically claimed ([AeroTime](https://www.aerotime.aero/articles/airlines-owe-eu-passengers-e2-billion-in-compensation-this-summer-alone/amp)).
- **New rules:** the EU has since adopted a reform that, from about mid-2027, requires airlines to tell passengers within days how to claim, and to pay or justify a refusal within 30 days ([Euronews](https://euronews.com/my-europe/2026/07/21/air-passenger-rights-reform-what-the-new-rules-mean-for-you)).

Groundside does both on the night.

## What it does

- **Gathers the evidence:** the airline's ops note and maintenance log, plus real archived weather observations (METAR) for the departure airport, the arrival airport and the aircraft's previous flight. Code turns them into numbered facts.
- **AI cause check:** an AI model checks whether the stated cause is supported by that evidence. It may cite only verified rules and only facts that exist. It recommends, and it never denies.
- **Computed entitlements:** a deterministic EU261 engine computes each passenger's compensation, meals, hotel and transport caps, and refunds. Every amount is traced to the rule and inputs that produced it.
- **One decision:** the duty manager approves once. A denial must be signed with a typed name, a written reason and a rule citation. Meals and hotel are paid either way.
- **Passenger page:** each passenger gets a personal page, chooses PayPal (with explicit consent) or bank transfer, and is paid through the PayPal Payouts API, with live status.
- **In progress:** meal-receipt upload read by a vision model and checked by code; Art 8 refunds back to the original PayPal payment; grounded passenger questions and answers.

## How we built it

- **PayPal:**
  - Payouts API in micro-batches, with an idempotent `sender_batch_id` that adopts the existing batch on a duplicate, priority passengers first, a daily cap, and unclaimed handling
  - Orders v2 with the JS SDK for demo ticket bookings
  - Payments v2 refunds
  - webhooks with signature verification, plus polling reconciliation through the same state machine, so status never moves backwards
- **AI:** OpenAI structured outputs (strict JSON schema) for the cause assessment. Code checks:
  - the schema
  - every citation against the verified rule pack
  - every weather fact ID
  - that quotes are verbatim
  - that no money amount appears

  Code, not the model, maps the result to the recommendation shown. Failures retry once, then fall back to "uncertain, a human decides". A daily spend cap serves a recorded result when reached. Evaluated with 12 cases: 12 of 12 pass on two full runs, including a prompt-injection case.
- **Rule pack:** 46 entries (Regulation 261/2004, CJEU judgments, Commission guidelines), each checked word for word against the official text from the EU Publications Office.
- **Engine:** a pure TypeScript EU261 engine with 64 unit tests, each naming the rule it exercises. The project has 155 tests in all.
- **Data:** real archived METAR from the Iowa Environmental Mesonet (public domain), for Frankfurt on 2026-01-24 and Milan Malpensa freezing fog on 2026-01-22. Passengers and the airline are synthetic and labelled as demo data.
- **Stack:** Next.js, TypeScript, Prisma, Postgres on Neon, AG Grid, Tailwind. Deployed on Render through the Render CLI.

## Challenges

- **Safe retries:** every batch and item is written to the database before PayPal is called. A retry reuses the same `sender_batch_id`, and a duplicate error adopts the existing batch.
- **Grounded AI:** early prompt versions quoted weather text instead of citing fact IDs. The fix was numbered facts with airport labels and code-side checks.
- **Borderline cases:** one case flipped between answers from run to run until the prompt required low confidence when the evidence does not identify the cause.
- **Archive gaps:** archived forecasts (TAF) were not available for the scenario dates, so the demo uses observations only and says so.

## Accomplishments

Measured in the PayPal sandbox on the hosted database, 2026-11-04:
- **Decision to first passenger paid:** 89 s, including the AI assessment.
- **Payout outcome:** 14 of 16 payouts reached SUCCESS within 46 s of sending. The other 2 are unclaimed by design (a passenger without a PayPal account).
- **Webhooks:** all 19 PayPal webhooks delivered to the hosted app passed signature verification.
- **AI cost:** about 0.002 USD per assessment.

## What we learned

Keeping the AI to the parts it is good at (reading evidence, explaining) and leaving money and refusals to code and people made the system easier to trust and to test. Idempotency has to be designed in from the first PayPal call, not added later.

## What's next

- real airline data feeds
- more passenger-rights regimes (UK261 and others)
- bank payout rails
- a pilot with a regional carrier

## Built with

paypal-payouts, paypal-orders, paypal-webhooks, openai, nextjs, typescript, prisma, postgresql, neon, ag-grid, render, tailwindcss

## Try it

- **Hosted demo:** https://groundside.onrender.com. On the free plan, the first request after a quiet spell can take up to a minute.
- **Demo login:** `duty.manager@demo.groundside.test`, with the password you choose to publish.
- **Code:** https://github.com/Nebiyu-6249/groundside
- **Video:** to be added in Phase 5.
