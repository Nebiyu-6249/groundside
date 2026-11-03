# Open questions for Nebiyu

Claude Code: these are decisions only the user can make. Use the default until the user answers, and list any still-open question in your gate report. When the user answers, record the answer here with the date.

| # | Question | Default until answered | Needed by |
|---|---|---|---|
| 1 | Include Amharic on the passenger page? It needs an Amharic receipt photo for evals and you (or someone you trust) to read the notices for accuracy. | Off (`ENABLE_AMHARIC=false`); English and Arabic only | Gate 3 |
| 2 | Will your friend contribute code, design or the video? If yes, add them as a Devpost teammate. | Solo entry | Before submitting |
| 3 | Render plan during judging (Dec 1 to 15): the free plan sleeps when idle, so the first judge waits while it wakes. Pay for the smallest always-on plan for those two weeks, or accept the wait and show a "waking up" notice? Check Render's current pricing. | Free plan plus a clear loading notice | Gate 5 |
| 4 | Video voice: your own voice, or an AI voiceover you are licensed to use commercially? | Your own voice | Gate 4 |
| 5 | The name "Groundside": do a quick search for existing products or trademarks in aviation software with that name. Rename now if there's a conflict. | Keep "Groundside" | Gate 1 |
| 6 | The sandbox business balance the PayPal form allowed (recorded in Phase 0). This decides how many judge runs fit. | Size caps from the recorded balance | Gate 0 |
| 7 | Sponsor prize: AG Grid, Render, or both on the form? Only one sponsor prize can be won. Read both requirement pages first. | Build to qualify for both; pick on the form if forced | Gate 3 |
| 8 | Demo Air policy amounts (`docs/SPEC.md` 5.7): meal allowance 15 EUR plus 15 per further 4 hours, max 60 per day; hotel cap 160 EUR per night; transport 40 EUR each way; apply the Art 7(2) reduction. Keep or change? | Keep | Gate 1 |
| 9 | Name Swiipr in the Devpost text as proof that airlines pay for this kind of tool? Never in the video. | Name it once in the text, with the source link and "as of 2024" | Gate 5 |
| 10 | OpenAI budget: `AI_DAILY_BUDGET_USD` and total spend you're willing to put in during the build and judging. | 3 USD per day; stop and ask if total build spend passes 15 USD | Gate 0 |
| 11 | Publish the demo duty-manager login and the sandbox buyer login in the README for judges? They only access sandbox data. | Yes, with a note that they are sandbox-only | Gate 3 |
| 12 | Receipts: you'll supply 3 to 5 photos of real meal or cafe receipts with card numbers and names covered. When can you add them to `fixtures/receipts/`? | Phase 4 starts without them, using one synthetic test image for code checks only | Gate 4 |
| 13 | Build scenario C (`docs/DEMO.md` 2.4)? | Only if Phases 0 to 4 are done by Sun Nov 8 | Sun Nov 8 |
| 14 | Weather dates for scenarios A and B: pick from the options Claude Code shows you in Phase 2. | None; Claude Code waits for your pick | Gate 2 |

## Answers

(Record answers here: date, question number, answer.)

- 2026-11-03, Q1 (and scope): No Arabic and no Amharic. The product is English only; no RTL, no language switcher, no `ENABLE_AMHARIC`. Receipts may still be in any language as input data, but no Arabic or Amharic features are built.
- 2026-11-03, Q6: The sandbox business account (airline) was created with a balance of 100,000 EUR. Size `PAYOUT_DAILY_CAP_EUR` from this and the spike reading.
