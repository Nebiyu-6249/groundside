# Demo, video and submission

Read with `docs/SPEC.md`. Everything here is demo design; real-world claims follow `docs/RESEARCH.md`.

## 1. The story in one breath

A Demo Air flight from Frankfurt to Dubai is cancelled at 20:30. The ops note says "adverse weather". Groundside pulls the real weather reports for Frankfurt, Dubai and Madrid (where the aircraft came from): clear skies everywhere. The maintenance log shows a hydraulic pump failure. The AI flags that the weather claim isn't supported and recommends paying. Code works out 600 euros per eligible passenger, plus meals and a hotel, every number traced to a rule. The duty manager approves once. Meal money is already on phones; compensation follows within minutes through PayPal. In the second scenario the fog is real: the AI agrees, a human signs the denial, and passengers still get their meals and hotel.

The point to land with judges: **the AI audits the airline's excuse before money moves, and it can't deny anyone on its own.**

## 2. Scenarios

All passengers, the airline, aircraft and flight numbers are fictional and labelled "Demo data". Weather is real archived data, labelled with its source.

### 2.1 Choosing real dates (Phase 2)

For each scenario, search the METAR archive for candidate dates and show the user 2 or 3 options with a one-line summary of the conditions at each airport. The user picks. Then save the fixtures (`docs/SPEC.md` 7.1).
- Scenario A: a date when EDDF, OMDB and LEMD all report no fog, thunderstorm, snow or freezing precipitation, visibility 10 km or more (or CAVOK) and no ceiling below 3000 ft across all windows. Avoid dates with widely reported European disruption (for example an ATC strike).
- Scenario B: a date when LIMC reports fog (FG) with visibility at or below 200 m, or RVR below 550 m, for at least three consecutive hours spanning the scheduled departure, while LPPT is normal.
- Scenario C: any date with unremarkable weather at EDDF and LOWW.

Set flight times on the chosen dates as below (local times; store UTC). The times assume winter time in Europe; if a chosen date falls in summer time, keep the departure times and recompute arrivals from the flight durations.

### 2.2 Scenario A: "The weather that wasn't" (main scenario)

| Item | Value |
|---|---|
| Flight | DEMO 412, Frankfurt (FRA/EDDF) to Dubai (DXB/OMDB), cancelled |
| Aircraft | DEMO-01, single-aisle, 180 seats |
| Previous flight | DEMO 409 Madrid (MAD/LEMD) 17:30 to Frankfurt 19:55 |
| Scheduled | Departs 21:50, arrives 06:55 next day (Dubai time) |
| Cancelled | Announced 20:30 the same evening |
| Rerouting | DEMO 414 next day, departs 10:15, arrives 19:20 (Dubai time) |
| Distance | About 4,840 km (engine computes): band B3, 600 EUR |
| Expected outcome | AI: weather claim NOT_SUPPORTED, likely cause TECHNICAL, recommendation PAY_COMPENSATION. Compensation owed: passengers were informed less than 7 days before and the rerouting arrives more than 2 hours late, so the Art 5(1)(c)(iii) exception doesn't apply; it arrives more than 4 hours late, so there is no Art 7(2) reduction. Care: meals, one hotel night, transport |

Ops note (use verbatim):

```
DEMO 412 FRA-DXB CNL. Reason: adverse weather. Pax reprotected on DEMO 414 tomorrow 1015LT.
Hotel FRA airport area, meal allowance to be issued. OCC duty desk.
```

Maintenance log (use verbatim):

```
DEMO-01 tech log 2005LT. On arrival ex MAD, crew report HYD SYS 2 LO PRESS caution.
Engineering: EDP 2 failed on ground check, part ex MAD hub on DEMO 413, est. AOG 14h.
No external damage found. No bird strike, no FOD.
```

### 2.3 Scenario B: "Real fog"

| Item | Value |
|---|---|
| Flight | DEMO 207, Milan Malpensa (MXP/LIMC) to Lisbon (LIS/LPPT), cancelled |
| Aircraft | DEMO-02, night-stopped at MXP after DEMO 206 from Lisbon the previous evening |
| Scheduled | Departs 07:10, arrives 09:05 (Lisbon time) |
| Cancelled | Announced 06:20 |
| Rerouting | DEMO 207 next day, same times |
| Distance | About 1,650 km, intra-Community: band B2, 400 EUR if owed |
| Expected outcome | AI: claim SUPPORTED, LIKELY_EXTRAORDINARY, recommendation NO_COMPENSATION_HUMAN_MUST_DECIDE with questions about minima and reasonable measures. Duty manager signs the denial citing REG-5-3 and REG-REC-14. Care still paid: meals, one hotel night, transport. Refund or rerouting choice stays open |

Ops note:

```
DEMO 207 MXP-LIS CNL. Dense fog since 0430LT, LVP in force, RVR below company minima,
departure flow restricted by ATC. Pax reprotected DEMO 207 tomorrow 0710LT. Hotels and meals arranged.
```

Maintenance log:

```
DEMO-02 serviceable. Night stop MXP. No open defects.
```

### 2.4 Scenario C (optional): "Three hours, give or take"

| Item | Value |
|---|---|
| Flight | DEMO 118, Frankfurt (FRA/EDDF) to Vienna (VIE/LOWW), delayed |
| Cause | Technical: bleed air valve failure found at pre-flight, replaced |
| Arrival | On blocks 2 h 57 min late; first door opened 3 h 04 min late |
| Passengers | Most end in Vienna: band B1, 250 EUR, owed because the door-open time is what counts (C-452/13). 8 passengers continue in the same booking to Larnaca (LCA), miss the connection and arrive 5 h 20 min late: distance measured FRA to LCA (about 2,640 km, intra-Community, band B2, 400 EUR) |
| Expected outcome | AI: technical, LIKELY_NOT_EXTRAORDINARY, PAY_COMPENSATION. Grid shows 250 and 400 EUR rows with traces citing C-452/13, C-11-11 and C-559-16 |

Build only if Phases 0 to 4 are done by Sun Nov 8.

### 2.5 Manifests

**Full run (owner only, not used for the video): 180 passengers on scenario A, 150 on scenario B.** It pays over 100,000 EUR of sandbox money, so approving it requires typing the cost (`PAY <amount> EUR`) whenever it is above one day's payout cap (owner decision 2026-11-06). The video uses the 12-passenger quick run.

| Group | Count (A) | Notes |
|---|---|---|
| Public fare, Frankfurt to Dubai only | 160 | |
| Public fare, connecting in the same booking beyond Dubai (Addis Ababa, Nairobi, Mumbai) | 10 | Distance to final destination in the trace |
| Frequent-flyer award tickets | 6 | Covered (Art 3(3)) |
| Staff travel, reduced fare not available to the public | 4 | Out of scope (Art 3(3)), shown with reason |

Flags overlaid on those groups: 4 reduced mobility and 2 unaccompanied minors (priority); 12 unregistered emails (UNCLAIMED path); 3 with no email on file (Readiness panel); 8 who choose a refund instead of rerouting (card-paid bookings, recorded as "refund to original card, outside this demo"). All passenger pages are in English. Names: generate plausible, diverse synthetic names from a fixed seed; never use real people's names.

**Quick run (judges): 12 passengers covering every case.**

| # | Case | Expected |
|---|---|---|
| 1 | Public fare, English, chooses PayPal | Meals then 600 EUR paid |
| 2 | Public fare, chooses PayPal, opened on a phone | Paid; mobile passenger page |
| 3 | Public fare, chooses PayPal | Paid |
| 4 | Connecting to Addis Ababa, chooses PayPal | 600 EUR, trace shows FRA to ADD distance |
| 5 | Frequent-flyer award ticket, chooses PayPal | 600 EUR |
| 6 | Staff travel | Out of scope, 0, reason shown |
| 7 | Reduced mobility, chooses PayPal | Priority, paid in the first batch |
| 8 | Unregistered email, chooses PayPal | UNCLAIMED, then switch to bank transfer |
| 9 | Chooses bank transfer | Recorded, "handled outside this demo" |
| 10 | Chooses refund, card-paid | Refund recorded, outside demo |
| 11 | No email on file | Readiness flag; ops can add one |
| 12 | No response yet | Pending |
| + | The judge's own demo booking, paid with PayPal | Joins the flight; chooses refund; real sandbox refund |

Sandbox cost of one quick run is roughly 5,000 EUR. Size `PAYOUT_DAILY_CAP_EUR` from the balance recorded in Phase 0.

## 3. Full demo path (the Gate 4 walkthrough)

1. Landing page: one sentence, "Start the judge demo".
2. Scenario A opens on the Evidence tab: ops note says weather; three weather timelines show clear conditions; maintenance log shows the pump failure.
3. Click "Release care now", then "Simulate passenger responses": passengers choose PayPal or bank transfer on their pages, meal allowances go out, and the first rows turn to Sent, then Paid.
4. Assessment tab: claim versus evidence card, fact chips, rule chips, "AI recommendation. A duty manager decides." Recommendation: pay.
5. Passengers tab: grid with 12 rows; open passenger 4's trace drawer (distance to Addis Ababa, band, rule IDs).
6. Approve. Readiness panel green except the flagged missing email. Type APPROVE.
7. Compensation payouts start for every passenger who already chose PayPal. Grid cells flash as statuses move to Paid; the header shows time from approval to first passenger paid.
8. Open passenger 2's page on a phone-sized view: what happened, 600 EUR, PayPal consent, status Paid. Log in to the sandbox receiver account in another tab to show the money arrived.
9. Passenger 8: UNCLAIMED, switch to bank transfer, unclaimed item cancelled.
10. Receipts: upload the cafe receipt (`a-frankfurt-cafe.jpg`): the fields and checks show, and it is approved within the meal allowance left and paid. The passenger got a flat 15 EUR at once; further meals are reimbursed up to 60 EUR per 24 hours in total (Demo Air policy, owner decision 2026-11-06). Upload the hotel invoice (capped at 160 EUR), then the cafe receipt again: flagged as a duplicate.
11. Demo booking: book a seat with the sandbox buyer account, it joins the flight, choose refund, refund completes.
12. Passenger question: "Why 600 and not more?" answered with the citation; "I want to talk to a person" creates a ticket.
13. Switch to scenario B: AI says fog supported; sign the denial with reason and citations; passengers' notices say no compensation, meals and hotel provided, how to contest. Meal payouts still go out.
14. Audit tab shows every step with actor (AI, user, PayPal, passenger).

## 4. Video script (target 2:45, hard limit under 3:00)

Record the hosted app at 1920x1080, browser zoom 110%, no personal bookmarks or other tabs visible. Use the phone emulator view or a real phone for passenger shots. No music, or royalty-free music with a licence you keep. No third-party logos: the PayPal sandbox and PayPal buttons are fine; don't show other brands. Voice: the user's own voice, or an AI voiceover the user is allowed to use commercially.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00-0:12 | Board at night, DEMO 412 turns to Cancelled (12-passenger quick run) | "Twenty-thirty in Frankfurt. The flight to Dubai is cancelled. Under EU law most passengers are owed six hundred euros each, plus meals and a hotel. Usually they get a paper voucher and a claim form. We follow twelve of them." |
| 0:12-0:22 | Title card: Groundside | "Groundside is the disruption desk for that night. AI checks the cause, code works out what's owed, a person approves, and PayPal pays." |
| 0:22-0:50 | Evidence tab, then Assessment card | "The ops note says weather. Groundside pulled the real weather reports for Frankfurt, Dubai and Madrid, where the aircraft came from. Clear skies at all three. The maintenance log shows a failed hydraulic pump. So the AI flags it: weather claim not supported. Every finding points to a weather observation or a line in the log, and it can only cite rules from a verified list." |
| 0:50-1:05 | "Release care now", rows turn Paid | "Meals are owed whatever the cause, so they go out first, before anyone decides on compensation." |
| 1:05-1:20 | Grid, trace drawer | "Every amount is computed by code, not by the AI. This passenger connects to Addis Ababa, so distance runs to her final destination. Six hundred euros, and here's every rule behind it." |
| 1:20-1:40 | Approve, cells flash, counter | "One approval. Each passenger chooses PayPal on their own page, and payouts start. Webhooks and polling keep every row honest, and a retried batch can never pay twice." |
| 1:40-1:58 | Phone: passenger page; sandbox account balance | "The passenger sees what happened in plain words, chooses PayPal with clear consent or a bank transfer, and the money lands in minutes." |
| 1:58-2:12 | Cafe receipt upload: fields, checks, approved and paid; same receipt again flagged as duplicate | "Fifteen euros for a meal went out at once. Bought more? Snap the receipt. Vision AI reads it, code checks the time, the daily meal limit and duplicates, and reimburses it." |
| 2:12-2:30 | Scenario B: fog supported, signed denial, meals still paid | "When the excuse is real, like this fog in Milan, the AI agrees, but it still can't deny anyone. A duty manager signs the denial with reasons, and the meals and hotel are paid anyway." |
| 2:30-2:45 | Refund, then closing card with URL and repo | "Refunds go straight back to the original PayPal payment. New EU rules will soon require airlines to tell passengers how to claim within days and pay within thirty. Groundside does it on the night. Try it at the link below." |

Record a rough cut at Gate 3 and the final at Gate 5. Measure the real "approval to first payout" time and say it only if measured.

## 5. Devpost text (draft; fill the measured values, keep the voice plain)

**Name:** Groundside

**Tagline:** When a flight is cancelled, check the airline's excuse against real weather data, work out what every passenger is owed, and pay them through PayPal before they leave the airport.

**Inspiration.** A short paragraph: disruption nights, paper vouchers, claim forms; claims firms estimate most EU261 money goes unclaimed (cite Skycop via AeroTime as an estimate); the EU has just adopted rules that will require faster notification and payment from mid-2027 (cite Euronews).

**What it does.** Five bullets matching section 1 of the spec: evidence, AI assessment, computed entitlements, one approval with signed denials, passenger page with PayPal payouts, receipts and refunds.

**How we built it.**
- PayPal: Payouts API (micro-batches, idempotent `sender_batch_id`, unclaimed handling and cancellation), Orders v2 with the JS SDK for demo bookings, Payments v2 refunds, webhooks with signature verification, plus polling reconciliation.
- AI: {{model names}} for structured cause assessment with a citation whitelist and fact-ID checks; vision receipt reading with code-side checks; grounded passenger Q&A with escalation (English only, user decision 2026-11-03; notices are code templates). Evaluated with {{N}} test cases ({{score}}).
- Engine: TypeScript EU261 rules engine with {{N}} unit tests, each tied to a cited article or judgment.
- Data: real archived METAR weather ({{source}}; archived TAF was not available for the scenario dates); synthetic passengers, clearly labelled.
- Stack: Next.js, TypeScript, Prisma, Postgres on Neon, AG Grid and AG Charts, deployed on Render.

**Challenges.** Honest notes from the build (for example, making payouts safe to retry; getting the AI to cite only what it was given).

**Accomplishments.** Measured items only: time from approval to first payout in sandbox, test and eval counts.

**What we learned.** Two or three sentences.

**What's next.** Real airline data feeds, more regulations (UK261, other passenger rights regimes), bank payout rails, pilot with a regional carrier.

**Built with:** paypal-payouts, paypal-orders, paypal-webhooks, openai, nextjs, typescript, prisma, postgresql, neon, ag-grid, ag-charts, render, tailwindcss.

**Try it:** hosted URL, demo login, sandbox buyer login for the booking demo, GitHub link, YouTube link.

The user rewrites this in their own words before submitting.

## 6. Screenshots for Devpost (1920x1080 PNG, no personal data)

1. Assessment card on scenario A (claim versus evidence).
2. Weather timelines for three airports.
3. Passenger grid mid-payout with a trace drawer open.
4. Passenger page on a phone frame (plain frame, no device brand).
5. Receipt check view.
6. Scenario B signed denial with care still paid.

## 7. Submission checklist (Gate 5)

- [ ] Hosted URL works in a private browser window, cold start included; "Start the judge demo" reaches a paid row in under 3 minutes.
- [ ] Demo login and sandbox buyer login in the README and Devpost "Try it" text; both work.
- [ ] Repo public, MIT license shown in the About section, README complete (`docs/SPEC.md` section 16), no secrets in git history (run a secret scan).
- [ ] `npm run check` and `npm run eval` pass on a fresh clone with the README steps (test on Windows; note macOS/Linux steps).
- [ ] Video under 3:00, public on YouTube, no third-party trademarks or unlicensed music, shows the hosted app working end to end.
- [ ] Devpost text, screenshots, "Built with" tags, YouTube link, repo link, hosted URL.
- [ ] Sponsor prizes: AG Grid and Render requirements read and met; selected on the submission form if the form asks.
- [ ] All claims in the text and video match `docs/RESEARCH.md` (do-not-claim list checked).
- [ ] Sandbox business balance checked; `PAYOUT_DAILY_CAP_EUR` set for 2 weeks of judging.
- [ ] AI budget cap set; fixtures recorded for every scenario so the demo works with AI off.
- [ ] Render service plan decided for Dec 1 to 15 (`docs/OPEN_QUESTIONS.md`).
- [ ] Submitted by Thu Nov 12, 18:00 Dubai time (internal deadline; official cut-off Thu Nov 12, 12:00 PM PT, which is Fri Nov 13, 00:00 Dubai).

### Checklist status (2026-11-05, Claude Code)

- **Hosted URL and judge demo:** the Playwright smoke test against https://groundside.onrender.com reached a Paid row in 1.6 min, on a warm server. A cold start (free plan) has not been measured yet.
- **Demo and sandbox buyer logins in the README:** owner decision (not published yet). Judges can use "Start the judge demo" without a login.
- **Repo:** public, and GitHub detects the MIT license. `npm run secret-scan` finds nothing in history or the tree. The README covers SPEC 16 except the credentials above. The repo's homepage link is still empty (owner).
- **Fresh clone:** `npm ci` then `npm run check` passed with no `.env`. `npm run eval` needs a `.env` with an OpenAI key, so it was run in the working copy only (12/12).
- **Video:** owner.
- **Screenshots:** `docs/screens/1-...` to `6-...` (1920x1080 PNG, synthetic data, no airline names) via `npm run screens`. The Devpost text is in `docs/DEVPOST_DRAFT.md`.
- **Sponsor prizes:** the PayPal blog lists Best Use of AG Grid and Best Use of Render, but not how to qualify. The Devpost rules page refuses automated reads (HTTP 403), so the owner should read it. AG Grid Community (passengers grid) and AG Charts Community (weather timelines) are used; the app is deployed on Render with a Blueprint (`render.yaml`).
- **Claims:** README, Devpost draft, landing page and `/about-data` were checked against `docs/RESEARCH.md` section 8; no conflicts.
- **Payout cap: risk.** Measured on the hosted app on 2026-11-06: one full judge walkthrough sent about 5,830 EUR (scenario A 5,395 EUR, scenario B 435 EUR; PayPal adds a 2 percent sandbox fee). The old sandbox account was down to 21,578.92 EUR that day, so the owner replaced it with a new sandbox business account and app holding 100,000 EUR. The cap for judging is 12,000 EUR a day, two full runs (owner decision 2026-11-06); at that rate the balance covers about 8 busy days, and most judging days will see fewer runs. The meal policy change lowers the cost of a run (flat 15 EUR instead of up to 60 EUR per passenger). When the balance runs out, judges see the "payouts paused" message and the rest of the demo keeps working.
- **AI off:** the A1 fixtures for both scenarios are recorded. The local smoke test runs with `AI_MODE=fixtures` and passes. A2 has recorded readings for the synthetic receipts; A3 falls back to templates and A4 to a safe answer.
- **Render plan and the Devpost submission:** owner.
