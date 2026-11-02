# Research notes: verified facts, sources, and what not to claim

Compiled Nov 2, 2026. "Verified" means the source page was read on that date. "To verify" means you must read the official source before relying on it. Anything that ends up in the Devpost text, README, video or UI must come from a "Verified" row or be re-verified by you, with the source linked.

## 1. Hackathon rules (verified from the official rules page)

Source: https://paypalaihackathon.devpost.com/rules

| Topic | Fact |
|---|---|
| Submission period | Oct 1, 2026 9:15 AM PT to **Thu Nov 12, 2026 12:00 PM PT** (midnight going into Fri Nov 13, Dubai time) |
| Judging period | Dec 1, 2026 2:00 PM PT to Dec 15, 2026 8:00 AM PT. Winners around Dec 21 |
| What to build | An application that integrates the PayPal developer platform (free sandbox) with an AI tool, model or platform. PayPal must be central |
| Text description | Explain features and functionality, and the tools used |
| Working demo | Judges must be able to run or interact with a working build: complete setup instructions in the repo, or a hosted demo URL. A mockup or static prototype does not qualify |
| Testing access | Free and unrestricted for the sponsor, Devpost and judges **until the judging period ends (Dec 15)**. Include any test credentials or sandbox logins in the repo instructions. Judges may judge only from the text, images and video |
| Repository | Public on GitHub, Bitbucket or GitLab, with all source, assets and instructions. Open source license file detectable and visible in the About section |
| Video | Under 3 minutes (judges need not watch beyond 3), shows the project working on its intended device, public on YouTube, **no third-party trademarks or copyrighted music without permission** |
| Ownership | Original work, solely owned by the entrant; may contract third-party technical help under conditions in the rules |
| Third-party data and APIs | Entrant must be authorized under their terms (applies to weather data sources) |
| Stage One | Pass/fail: fits the theme and reasonably applies the required APIs/SDKs |
| Stage Two criteria (equal weight) | Technological Implementation (how thoroughly and skilfully PayPal and AI are used; genuine, working, non-trivial); Design (complete, coherent product experience, not a proof of concept); Potential Impact (credible, specific case for a real problem and real audience, addressed by what is demonstrated); Innovation/Idea (creative, novel, differs from existing concepts); Presentation (video shows it working end to end; problem, audience and why it matters are clear) |
| Tie-break | Technological Implementation first, then the next criteria in order |
| Judging method | May include expert panels, peer review or **automated AI-driven analysis**. Write the README and description so a machine reader also finds the evidence quickly |
| After the deadline | Submissions can't be changed except for removals the sponsor permits (infringing material, personal data). Treat the code and hosted demo as frozen from Nov 12 apart from keeping it running |
| Grand prizes | 12,000 / 8,000 / 5,000 USD |
| Honorable mentions | 5,000 USD each: Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce |
| AG Grid sponsor prize | 5,000 / 2,000 / 1,000 USD (three 3rd places); "submissions that use any AG Grid tools" |
| Render sponsor prize | 1,000 / 750 / 500 USD in Render credits; "submissions that use any Render tools" |
| Prize limit | At most one Grand Prize plus one Sponsor Prize, or one Honorable Mention plus one Sponsor Prize |
| Early eligibility check | Mentioned in the organiser's emails to the user: submit by Thu Nov 5 to get an eligibility check. Confirm in the latest Devpost update |

**Not read yet (do this in Phase 3):** the AG Grid and Render sponsor detail pages (`/details/aggrid`, `/details/render` on the hackathon site) and the FAQ. Ask the user to open them and paste the requirements, or fetch them yourself if your tools can.

## 2. EU Regulation 261/2004 (law in force today)

Official text: https://eur-lex.europa.eu/eli/reg/2004/261/oj. Every entry the product uses goes into the rule pack and is verified there (`docs/SPEC.md` section 6). Summary for orientation only:

| Rule | Content | Status |
|---|---|---|
| Art 7(1) | 250 EUR up to 1500 km; 400 EUR intra-Community over 1500 km and other flights 1500 to 3500 km; 600 EUR all others | To verify in rule pack |
| Art 7(2) | Carrier **may** reduce by 50% if rerouted arrival is within 2, 3 or 4 hours (by band) of the original scheduled arrival | Verified (legislation.gov.uk copy of Art 7, read Nov 2); re-verify on EUR-Lex |
| Art 7(3) | Paid "in cash, by electronic bank transfer, bank orders or bank cheques or, with the signed agreement of the passenger, in travel vouchers and/or other services". PayPal is not named | Verified (same source); re-verify on EUR-Lex |
| Art 7(4) | Distances by the great-circle route method | To verify |
| Art 5, 6, 8, 9, 14, 15 | Cancellation, delay, refund and rerouting, care, written notice, no waiver | To verify |
| Case law | Sturgeon, Nelson, Folkerts, Bossen, Henning, McDonagh, Wallentin-Hermann, van der Lans, Peskova, TAP C-74/19, Airhelp v SAS, Krusemann, TAP C-156/22, Eglitis | To verify on CURIA (`docs/SPEC.md` 6.2) |

**Why the PayPal consent screen exists:** Art 7(3) lists the payment methods and PayPal is not among them, so Groundside lets the passenger choose PayPal explicitly, records that choice, and always offers bank transfer. This is a design decision, not legal advice. Say "we ask for the passenger's explicit choice" rather than "PayPal is a legally approved method".

## 3. The 2026 EU reform (adopted; applies from about mid-2027)

| Fact | Source | Status |
|---|---|---|
| European Parliament approved it on 7 July 2026, 646 votes to 12 | Euronews, 21 Jul 2026: https://euronews.com/my-europe/2026/07/21/air-passenger-rights-reform-what-the-new-rules-mean-for-you | Verified |
| Council adopted it on 13 July 2026 after the political deal of 15 June | Same | Verified |
| Applies from mid-2027; the current rules govern until then | Same | Verified |
| Compensation amounts unchanged (250 / 400 / 600 EUR); 3-hour delay threshold unchanged | Same; also The Points Guy, 17 Jun 2026: https://thepointsguy.com/news/eu261-compensation-passenger-protection-changes/ | Verified |
| Airlines must inform passengers electronically within four days of how to request compensation | Euronews | Verified (wording as reported by the press, not the legal text) |
| Airlines have 30 days to pay, justify a rejection or invoke extraordinary circumstances; passengers have a 9-month window to claim | Euronews | Verified (press report) |
| New care schedule (refreshments every 2 hours, meal after 3 hours, overnight stay up to three nights) | Euronews | Verified (press report). Do not implement; it is not in force |
| "Care expenses must be reimbursed within 14 days" | Claimed by another AI tool | **Not found in any source read. Do not cite** |

How to use this in the pitch: "Airlines will soon have to tell every eligible passenger how to claim within days and pay or justify a refusal within 30 days. Groundside does both on the night." Link the Euronews article. Do not quote article numbers of the new regulation unless you have read the adopted text in the Official Journal.

## 4. Market and prior art

| Fact | Source | Status |
|---|---|---|
| Swiipr: digital disruption payments for airlines (prepaid compensation and welfare cards, mobile app); used by 26 airlines in 70 countries **as of May 2024**; raised GBP 6M Series A led by Octopus Ventures; launched 2020 | tech.eu, 29 May 2024: https://tech.eu/2024/05/29/swiipr-raises-ps6m-to-disrupt/ | Verified |
| Same article: paper vouchers are slow, fraud-prone and unpopular; bank transfers "can take months"; over 500 million passengers a year are estimated to be affected by disruption worldwide | Same | Verified (the 500 million figure is the article's estimate) |
| Swiipr added a digital payout card that passengers add to Google Wallet from the browser, "instantly provisioned"; used by passengers on 150 airlines worldwide. The article does not mention AI | Crowdfund Insider, Dec 2025: https://www.crowdfundinsider.com/2025/12/256442-swiipr-taps-google-for-digital-compensation-payout-card/ | Verified |
| About 2 billion EUR in EU261 compensation owed for summer 2024 (June to August), from over 60,000 qualifying flights, assuming 130 passengers per flight and the 250 EUR minimum; only about one third is typically claimed | AeroTime, data from claims company Skycop: https://www.aerotime.aero/articles/airlines-owe-eu-passengers-e2-billion-in-compensation-this-summer-alone/amp | Verified. Always attribute to Skycop, a claims company, and say "estimate" |
| US DOT automatic refund rule in effect from 28 Oct 2024 (cash refunds; 7 business days for card purchases, 20 days otherwise) | ABC7, 29 Oct 2024: https://abc7news.com/post/us-airlines-required-automatically-refund-significantly-changed-canceled-flight/15483534/ | Verified. Context only; Groundside does not implement US rules |

**Positioning that is safe to state:** "Instant disruption payouts already exist. We did not find a public product that checks the airline's stated cause against independent weather evidence before paying, and keeps every denial behind a human signature." Keep "we did not find" wording; never say "no one does this".

## 5. PayPal developer platform

| Fact | Source | Status |
|---|---|---|
| Create batch payout: `POST /v1/payments/payouts` with `sender_batch_header` and `items`; item `recipient_type` EMAIL, PHONE, PAYPAL_ID or USER_HANDLE; `recipient_wallet` defaults to PAYPAL; up to 15,000 items per request | https://docs.paypal.ai/reference/api/rest/payouts/create-batch-payout.md | Verified |
| A `sender_batch_id` used in the last 30 days is rejected, and the error includes a link to the original payout; retrying with the same ID after a 5xx error is safe | Same | Verified |
| Response 201 with `payout_batch_id` and `batch_status` (PENDING if validation passes; others PROCESSING, SUCCESS, DENIED, CANCELED) | Same | Verified |
| Unclaimed payouts expire in 30 days and the money returns automatically | https://developer.paypal.com/payouts/use-payouts/handle-unclaimed-payouts.md | Verified |
| Cancel unclaimed item `POST /v1/payments/payouts-item/{id}/cancel`; webhook verification `POST /v1/notifications/verify-webhook-signature`; Orders v2 create and capture; refund `POST /v2/payments/captures/{id}/refund`; `PayPal-Request-Id` idempotency header | PayPal REST reference | To verify in docs during Phase 0 |
| Payouts may need to be enabled for the app even in sandbox | Developer experience; not confirmed in docs | To verify in Phase 0; escalate on the PayPal Discord if blocked |
| Hackathon resources and support | https://paypalaihackathon.devpost.com/resources; Discord https://discord.gg/sJ2G6DyvSK | Verified links |

## 6. Data sources

| Source | Use | Status |
|---|---|---|
| Iowa Environmental Mesonet (IEM) METAR archive, `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py` | Archived METARs for scenario dates | To verify: the help page couldn't be fetched from the research environment. Confirm parameters, international coverage and terms |
| aviationweather.gov Data API | Live METAR/TAF for the optional "check now" button | To verify |
| Ogimet or IEM TAF archive | Archived TAFs | To verify; fall back to METAR only |
| OurAirports data | Airport names, coordinates | To verify license (believed public domain) and record it |

Record every data source's terms in `data/weather/SOURCES.md` and in the README.

## 7. Competitor landscape for this hackathon (snapshot)

From a GitHub search on Nov 2, 2026 (public repos only; many entrants keep repos private until submission, so this is a floor):
- About 610 public repos matched "paypal hackathon" created since Oct 1, 2026.
- Crowded themes: AI agent spending firewalls and guardrails (40+), freelancer escrow and milestones (about 15), dispute and chargeback assistants (about 12), scope-creep detection (about 8), agent storefronts and agentic checkout (about 10), rotating savings groups (about 6), rental deposits with AI photo checks (3).
- No visible entries about airline disruption, passenger compensation or EU261.

Use this only to guide choices; don't mention competitors in the submission.

## 8. Do not claim

- That Groundside is the first or only product to pay disrupted passengers instantly.
- That Swiipr or anyone else lacks AI. Say only "we did not find".
- That PayPal is a payment method approved by Regulation 261/2004.
- Any "14-day care reimbursement" rule.
- Article numbers of the 2026 reform, unless read in the Official Journal text.
- Measured time or cost savings, accuracy figures or adoption that were not measured in this project. Measured demo numbers (for example "first passenger paid 41 seconds after approval in our sandbox run") are fine when labelled as such.
- That the AI makes legal decisions. It recommends; a person decides.
- That weather "made the flight impossible". The app shows observed conditions; operating minima need human confirmation.
- Real airline names, logos or flight numbers in the UI, video or screenshots.
- That synthetic passengers are real, or that sandbox payouts are real money.
