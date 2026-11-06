# Gate 4 walkthrough

Automated run of every step in `docs/DEMO.md` section 3 against https://groundside.onrender.com on 2026-11-06 16:20 UTC, by `npm run walkthrough` (`scripts/walkthrough.ts`):
- a fresh browser with no cookies, as a new judge
- the ops console at 1920x1080 and passenger pages at 390x844
- a short slowMo

Videos are in `docs/walkthrough/video/` (not committed). Screenshots are below.

Note: Rebuilt from the run log (scripts/out/walkthrough-hosted.log) because the video rename failed before results.json was written; fixed in the script.

**Result: 13 PASS, 1 NEEDS HUMAN, 0 FAIL** out of 14 steps.

## Measured

- **Cold start:** first response HTTP 200; landing page served after 4.5 s. The instance was already awake from an earlier run, so this run did not measure a cold wake. An earlier run hit a sleeping instance, which first answered HTTP 503 while Render woke it.
- **Approval to first passenger paid:** 0.7 min on the Overview tab (from the decision to the first PayPal SUCCESS after it). That was 44 s from the Approve click to the first compensation row showing Paid in the grid.
- **Money arrived:** PayPal payout item FZKMFRH28ADPJ: SUCCESS, transaction ID 9KT11695KH672561B, 600.00 EUR (GET /v1/payments/payouts-item, debug f104120c2e792). This replaces logging in to the receiver account: PayPal's own API reports the payout item as SUCCESS with a transaction ID.

## Steps

| Step | Result | Time | Screenshots | Notes |
|---|---|---|---|---|
| 1. Landing page: one sentence and Start the judge demo | PASS | 5.4 s | [landing](walkthrough/01-landing.png) | Cold start: first response HTTP 200; landing page served after 4.5 s |
| 2. Scenario A opens on the Evidence tab: ops note says weather, three timelines, maintenance log shows the pump failure | PASS | 11.1 s | [evidence-notes](walkthrough/02-evidence-notes.png), [weather-timelines](walkthrough/02-weather-timelines.png) | 3 weather timelines |
| 3. Release care now, then Simulate passenger responses: meal allowances go out and turn Paid | PASS | 39.5 s | [meal-payouts-paid](walkthrough/03-meal-payouts-paid.png) |  |
| 4. Assessment tab: claim versus evidence, fact chips, rule chips, recommendation pay | PASS | 18.8 s | [assessment](walkthrough/04-assessment.png) | Recommendation: Pay compensation |
| 5. Passengers tab: 12 rows; passenger 4's trace drawer (distance to Addis Ababa, band, rule IDs) | PASS | 3.6 s | [trace-addis-ababa](walkthrough/05-trace-addis-ababa.png) |  |
| 6. Approve: readiness green except the flagged missing email; type APPROVE | PASS | 12.1 s | [approve-confirm](walkthrough/06-approve-confirm.png), [approved](walkthrough/06-approved.png) | Open readiness checks: Passenger contact |
| 7. Compensation payouts start; statuses move to Paid; time from approval to first passenger paid | PASS | 40 s | [grid-paid](walkthrough/07-grid-paid.png), [overview-metric](walkthrough/07-overview-metric.png) | Overview shows 0.7 min; 44 s from the Approve click to the first compensation row showing Paid in the grid |
| 8. Passenger 2 on a phone: what happened, 600 EUR, PayPal, status Paid; money proven through the PayPal API | PASS | 12.5 s | [passenger-paid](walkthrough/08-passenger-paid.png), [passenger-top](walkthrough/08-passenger-top.png) | PayPal payout item FZKMFRH28ADPJ: SUCCESS, transaction ID 9KT11695KH672561B, 600.00 EUR (GET /v1/payments/payouts-item, debug f104120c2e792) |
| 9. Passenger 8: UNCLAIMED, switch to bank transfer, unclaimed item cancelled | PASS | 12.2 s | [switch-requested](walkthrough/09-switch-requested.png), [unclaimed](walkthrough/09-unclaimed.png) | Switch to bank transfer done: PayPal accepted the cancel of the UNCLAIMED item (status RETURNED), so the page now shows the bank transfer. In Phase 0 the sandbox refused every cancel (HTTP 500); both paths are handled. |
| 10. Receipts: upload sample receipts, see fields and checks, approved and paid; same receipt again flagged as duplicate | PASS | 46 s | [ops-receipt-checks](walkthrough/10-ops-receipt-checks.png), [ops-receipt-paid](walkthrough/10-ops-receipt-paid.png), [passenger-receipts](walkthrough/10-passenger-receipts.png) | Hotel invoice: AUTO_APPROVED - Approved 160.00 EUR of 179.00 EUR: the rest is above the remaining allowance.<br>Cafe receipt: REJECTED - Your allowance for this kind of expense is already used.<br>Cafe receipt again: REJECTED - This receipt was already submitted. |
| 11. Demo booking: book with the sandbox buyer, join the flight, choose refund, refund completes | NEEDS HUMAN | 5.1 s | [booking-page](walkthrough/11-booking-page.png) | NEEDS HUMAN: the PayPal sandbox checkout asks for the buyer's password, which Claude Code does not type. The exact clicks are in docs/GATE4_WALKTHROUGH.md. |
| 12. Passenger question: Why 600 and not more? answered with the citation; Talk to a person creates a ticket | PASS | 10.9 s | [answer](walkthrough/12-answer.png), [ops-ticket](walkthrough/12-ops-ticket.png), [talk-to-person](walkthrough/12-talk-to-person.png) | Answer: Your flight’s great-circle distance from Frankfurt to Dubai is 4,844 km. The compensation band for this distance is 600.00 EUR, which is the applicable amount rather than a starting amount that increases with distance. It has been paid to your PayPal account. Rules: REG-7-1, REG-7-4 |
| 13. Scenario B: AI says fog supported; signed denial; notices say no compensation, care provided, how to contest; meal payouts still go out | PASS | 51.4 s | [care-paid](walkthrough/13-care-paid.png), [denial-notices](walkthrough/13-denial-notices.png), [denial-signed](walkthrough/13-denial-signed.png) | Claim support: supported |
| 14. Audit tab shows every step with its actor (AI, user, PayPal, passenger, system) | PASS | 2 s | [audit](walkthrough/14-audit.png) | Actors in the audit trail: AI, USER, PAYPAL, PASSENGER, SYSTEM |

## Step 11 for the owner (about 2 minutes)

PayPal's sandbox checkout asks for the buyer's password, which Claude Code does not type. In a normal browser window (Chrome, Edge or Firefox):

1. Open https://groundside.onrender.com/demo/book.
2. Click the yellow **PayPal** button. A PayPal sandbox window opens.
3. Log in with the sandbox buyer account (its email and password are in the PayPal developer dashboard under Sandbox, Accounts, then the personal account, then View/edit account).
4. Click **Complete Purchase** (or **Pay Now**). The window closes, and the page shows the booking with Order status COMPLETED and a Capture ID.
5. Click **Join the cancelled flight**. Your passenger page opens.
6. Under Your journey, choose **Do not travel; refund my ticket within 7 days**, then click **Save my choice**.
7. Check that the page shows **Refund status: refunded to your PayPal payment**. It can take a few seconds; reload once if needed.

Optional: in the ops console (Payouts tab of DEMO 412), the Refunds table shows the PayPal refund ID with status COMPLETED.
