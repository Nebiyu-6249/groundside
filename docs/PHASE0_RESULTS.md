# Phase 0 results: PayPal sandbox realities

Every item in `docs/SPEC.md` 9.9, run against the PayPal sandbox on 2026-11-03 and 2026-11-04 (Dubai time). Times below are UTC. All money is sandbox money.

Raw, redacted output of the payouts spike: `scripts/out/spike-payouts-20261103-212237.json` (git-ignored; rerun with `npm run spike:payouts`).

## Accounts used

| Role | Account | Notes |
|---|---|---|
| REST app | `APP-55E35906EM8730949` ("Groundside EU") | Linked to the business account below. Replaces the first app, see "Merchant account switch". |
| Business (airline) | `sb-vz8j553542468@business.example.com`, region DE, merchant `PJLLP7LWR2X2W` | PayPal-generated email. |
| Passenger pool | 6 PayPal-generated Personal accounts, DE (`PAYPAL_POOL_RECEIVERS`) | 4 more still to create for the pool of 10. |
| Demo ticket buyer | `sb-rw6g453693446@personal.example.com` (a pool account) | |

## Summary

| # | SPEC 9.9 item | Result |
|---|---|---|
| 1 | Payouts enabled for the app | Yes |
| 2 | Two items to the same receiver in one batch | Works |
| 3 | Unregistered email that yields UNCLAIMED | `pax-0001@example.com` works (first try) |
| 4 | Duplicate `sender_batch_id` error shape | HTTP 400 `USER_BUSINESS_ERROR`, field `SENDER_BATCH_ID` |
| 5 | Cancel an UNCLAIMED item | **Does not work in sandbox**: HTTP 500, three times on two apps |
| 6 | Webhook delivery and verification through the tunnel | Works; 9 event types verified and stored |
| 7 | Order, capture, full refund with a sandbox buyer; refund webhook | Works on the new app. The first merchant account declined every checkout. |
| 8 | Business balance after the spike | API returns 403; reading from the dashboard pending (user) |

## Details

### 1. Payouts enabled

`POST /v1/oauth2/token`: HTTP 200. Scope list includes `https://uri.paypal.com/payments/payouts`.

### 2 and 3. Payout batch

`POST /v1/payments/payouts`: HTTP 201, debug `ca54e6e758d48`. Batch `JMFR29AWPY7T2`, `sender_batch_id` `gs-spike-20261103-212155`, EUR, 4 items.

Polled with `GET /v1/payments/payouts/JMFR29AWPY7T2` every 5 s. PENDING, then PROCESSING at +17 s, then SUCCESS at +33 s (final poll HTTP 200, debug `ca54e6f476e33`).

| Item | Receiver | Amount | Status | Payout item ID | Fee |
|---|---|---|---|---|---|
| 1 | pool A | 1.00 | SUCCESS | `2ANSLAU74S88J` | 0.02 |
| 2 | pool A (same receiver) | 2.00 | SUCCESS | `WHGAUSETZ3R96` | 0.04 |
| 3 | pool B | 3.00 | SUCCESS | `8RCR5Q5D9SGDE` | 0.06 |
| 4 | `pax-0001@example.com` | 4.00 | UNCLAIMED | `UY8AZM4VMTF2U` | 0.08 |

- Batch total 10.00 EUR, fees 0.20 EUR (2 percent per item in sandbox, also charged on the UNCLAIMED item). Funding source BALANCE.
- Item 4 error: `RECEIVER_UNREGISTERED`, "The recipient for this payout does not have an account ... if the recipient does not claim this payout within 30 days, the funds will be returned to your account."
- The same result was seen on the first app on 2026-11-03 07:28 (batch `JZYQH4CKG63TA`, debug `f558450004e81`, SUCCESS in 35 s).
- So the receiver pool design works: several passengers can map to one sandbox account in the same batch, and an `example.com` address is a reliable way to show UNCLAIMED.

### 4. Duplicate `sender_batch_id`

Same body posted again: HTTP 400, debug `ca54e6f49dbd2`.

```json
{
  "name": "USER_BUSINESS_ERROR",
  "message": "User business error.",
  "details": [{
    "field": "SENDER_BATCH_ID",
    "location": "body",
    "issue": "Batch with given sender_batch_id already exists",
    "link": [{ "href": "https://api.sandbox.paypal.com/v1/payments/payouts/JMFR29AWPY7T2", "rel": "self", "method": "GET" }]
  }]
}
```

The error links to the existing batch. The Phase 3 orchestrator can treat this exact shape as "already sent" and follow the link to reconcile, instead of treating it as a failure.

### 5. Cancel an UNCLAIMED item

`POST /v1/payments/payouts-item/UY8AZM4VMTF2U/cancel`: HTTP 500 `INTERNAL_SERVICE_ERROR`, debug `ca54e6f4cda5c`. A read afterwards (`GET /v1/payments/payouts-item/UY8AZM4VMTF2U`, HTTP 200, debug `ca54e6f722ff9`) still shows UNCLAIMED.

The first app gave the same 500 twice, about 5 minutes apart (debug `f7166006f926b` and `f360684381dbc`). The item response carries no `cancel` link.

Consequence for Phase 4 ("cancel unclaimed item"): this can't be shown working in sandbox. Proposed handling, for the user to decide at Gate 0:
- keep the cancel call, and on failure show it honestly as "Cancel not available, funds return automatically after 30 days";
- let the passenger switch to bank transfer only once the item is final (cancelled or returned), so nobody is paid twice;
- optionally ask on the PayPal Discord whether sandbox supports cancel.

### 6. Webhooks through the cloudflared tunnel

Webhook `6UR10068K6257654U` (All events) at `https://<quick-tunnel>.trycloudflare.com/api/webhooks/paypal`. Each delivery is checked with `POST /v1/notifications/verify-webhook-signature` (HTTP 200, `SUCCESS`), then stored once by event ID.

Events received for this run, all verified and processed:

| Received | Event type | Resource |
|---|---|---|
| 21:22:40 | PAYMENT.PAYOUTSBATCH.PROCESSING | `JMFR29AWPY7T2` |
| 21:22:48 | PAYMENT.PAYOUTS-ITEM.SUCCEEDED | `2ANSLAU74S88J` |
| 21:22:48 | PAYMENT.PAYOUTS-ITEM.SUCCEEDED | `WHGAUSETZ3R96` |
| 21:22:49 | PAYMENT.PAYOUTSBATCH.SUCCESS | `JMFR29AWPY7T2` |
| 21:22:49 | PAYMENT.PAYOUTS-ITEM.UNCLAIMED | `UY8AZM4VMTF2U` |
| 21:22:52 | PAYMENT.PAYOUTS-ITEM.SUCCEEDED | `8RCR5Q5D9SGDE` |
| 21:29:04 | CHECKOUT.ORDER.APPROVED | `6KS2677987580682D` |
| 21:32:25 | PAYMENT.CAPTURE.COMPLETED | `53N346307V6339736` |
| 21:32:48 | PAYMENT.CAPTURE.REFUNDED | `4W803013JY3640920` |

Notes:
- Payout events arrive 3 to 25 s after the poll sees the final state; there's no PAYMENT.PAYOUTSBATCH.PENDING event.
- Payout item events carry their ID in `resource.payout_item_id`, batch events in `resource.batch_header.payout_batch_id` (handled by `eventResourceId`).
- Quick-tunnel URLs expire (the first one died overnight). After each new tunnel, the webhook URL in the dashboard must be updated. Polling reconciliation in Phase 3 covers the gap.

### 7. Order, capture and refund

| Step | Request | HTTP | Debug ID | Result |
|---|---|---|---|---|
| Create | `POST /v2/checkout/orders` (189.00 EUR, DEMO 412) | 201 | `f830115aa3499` | Order `6KS2677987580682D` |
| Buyer approves in the PayPal window | | | | Order APPROVED (webhook at 21:29:04) |
| Read order | `GET /v2/checkout/orders/6KS2677987580682D` | 200 | | APPROVED |
| Capture | `POST /v2/checkout/orders/6KS2677987580682D/capture` | 201 | `f6255057200d4` | Capture `53N346307V6339736`, COMPLETED |
| Full refund | `POST /v2/payments/captures/53N346307V6339736/refund` | 201 | `ca54e7dc28f9f` | Refund `4W803013JY3640920`, COMPLETED; webhook 23 s later |

**Checkout window reported cancel after approval.** The buyer approved in Chrome, but the JS SDK called `onCancel` instead of `onApprove`. The page showed "Payment cancelled", although PayPal had the order as APPROVED.

Fix (commit `2abcaf7`):
- `onCancel` now also asks the server to capture.
- The server reads the order first and captures only if it is APPROVED, so an unapproved order spends no capture request ID.
- The capture above went through this path.

**Merchant account switch.** The first REST app was linked to a custom-email business account. With that account, every buyer approval was declined in the PayPal window with "This transaction was rejected due to international regulations": 6 orders, with both a custom-email buyer and a generated pool buyer. Server calls were fine; order creates were HTTP 201, e.g. debug `f7912328d0ae1`.

Controlled test, same flow and same buyer, changing only the payee:

| Payee | Order | Created (debug) | Outcome |
|---|---|---|---|
| Generated business account (AE) | `86L23790LK736615K` | `f310820bc5d7c` | Approved and captured (capture `6B0711678R6075636`, debug `f210905058fa9`) |
| The custom-email business account | `2M123986WR9373515` | `ca54e4b283bd4` | Declined, "international regulations" |

Refunding the cross-merchant test capture from our app gave HTTP 403 `PERMISSION_DENIED` (debug `f535532367a9e`), as expected for another app's capture.

The same account also returned `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING` (HTTP 422, debug `f326758879664`) for a card order.

What we can say:
- The decline followed that merchant account.
- PayPal does not say which rule it applied.
- A new PayPal-generated DE business account with a new app works.

Sandbox setup advice for the README: use generated sandbox emails, not custom ones.

Also: in the Claude desktop app's built-in browser, the PayPal checkout window only shows a generic error, so test checkout in Chrome or Edge.

### 8. Business balance

`GET /v1/reporting/balances?currency_code=EUR`: HTTP 403 `NOT_AUTHORIZED`, debug `ca54e6f74fddc`. The app lacks the reporting permission in sandbox.

Pending: the user reads the EUR balance of `sb-vz8j553542468@business.example.com` from the sandbox dashboard. Movements on this account so far:
- payouts: minus 10.20
- demo ticket: plus 189.00, then refunded in full

Sizing for judge runs, from the observed fee: a payout of X EUR costs X plus 2 percent from the balance.
