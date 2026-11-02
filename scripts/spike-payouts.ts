// Phase 0 Payouts spike (docs/SPEC.md 9.9, items 1 to 5 and 8).
//
//   npm run spike:payouts
//   npm run spike:payouts -- --unregistered=pax-0002@example.org
//
// Sends one EUR batch of 4 small items (2 to pool receiver A, 1 to pool receiver B,
// 1 to an unregistered address), polls it to a final state, proves a duplicate
// sender_batch_id is rejected, cancels the UNCLAIMED item, and tries the balance API.
// Results are written to scripts/out/ (git-ignored) with emails redacted.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchToken } from "../src/lib/paypal/token";
import { paypalRequest, type PaypalResponse } from "../src/lib/paypal/http";
import {
  FINAL_BATCH_STATUSES,
  SETTLED_ITEM_STATUSES,
  batchDetailSchema,
  cancelPayoutItem,
  createBatchResponseSchema,
  createPayoutBatch,
  getPayoutBatch,
  getPayoutItem,
  type CreateBatchInput,
} from "../src/lib/paypal/payouts";
import { redactEmailsInText } from "../src/lib/paypal/redact";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 180_000;

type Step = {
  step: string;
  request: string;
  httpStatus?: number;
  debugId?: string | null;
  outcome: string;
  data?: unknown;
};

const steps: Step[] = [];

function record(step: Step): void {
  steps.push(step);
  const status = step.httpStatus ? ` HTTP ${step.httpStatus}` : "";
  const debug = step.debugId ? ` debug ${step.debugId}` : "";
  console.log(`[${step.step}]${status}${debug}: ${redactEmailsInText(step.outcome)}`);
}

function fromResponse(step: string, request: string, res: PaypalResponse, outcome: string): Step {
  return { step, request, httpStatus: res.status, debugId: res.debugId, outcome, data: res.data };
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

async function main(): Promise<void> {
  const pool = (process.env.PAYPAL_POOL_RECEIVERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (pool.length < 2) {
    throw new Error("PAYPAL_POOL_RECEIVERS needs at least 2 sandbox personal account emails");
  }
  const unregistered = arg("unregistered") ?? "pax-0001@example.com";

  // 1. Token, and whether the app's scope includes Payouts.
  const token = await fetchToken();
  const hasPayoutsScope = token.scope.includes("/payments/payouts");
  record({
    step: "1-token",
    request: "POST /v1/oauth2/token",
    httpStatus: 200,
    outcome: `token ok; app ${token.appId ?? "unknown"}; payouts scope ${hasPayoutsScope ? "present" : "ABSENT"}`,
    data: { scopes: token.scope.split(" ").filter((s) => s.includes("payouts") || s.includes("payments")) },
  });

  // 2. Create the batch.
  const senderBatchId = `gs-spike-${timestamp()}`;
  const input: CreateBatchInput = {
    senderBatchId,
    emailSubject: "Groundside sandbox spike",
    emailMessage: "Sandbox test payout from Groundside (Demo Air, fictional carrier).",
    items: [
      { senderItemId: `${senderBatchId}-1`, receiver: pool[0], amountCents: 100, note: "Spike item 1 (pool A)" },
      { senderItemId: `${senderBatchId}-2`, receiver: pool[0], amountCents: 200, note: "Spike item 2 (pool A again)" },
      { senderItemId: `${senderBatchId}-3`, receiver: pool[1], amountCents: 300, note: "Spike item 3 (pool B)" },
      { senderItemId: `${senderBatchId}-4`, receiver: unregistered, amountCents: 400, note: "Spike item 4 (unregistered)" },
    ],
  };
  const created = await createPayoutBatch(input);
  const createdBody = createBatchResponseSchema.safeParse(created.data);
  if (!created.ok || !createdBody.success) {
    record(fromResponse("2-create-batch", "POST /v1/payments/payouts", created, "batch creation FAILED; stopping"));
    return;
  }
  const payoutBatchId = createdBody.data.batch_header.payout_batch_id;
  record(
    fromResponse(
      "2-create-batch",
      "POST /v1/payments/payouts",
      created,
      `batch ${payoutBatchId} (${senderBatchId}) status ${createdBody.data.batch_header.batch_status}`,
    ),
  );

  // 3. Poll until the batch is final and every item has settled.
  const started = Date.now();
  let detail = batchDetailSchema.safeParse(null);
  let last: PaypalResponse | null = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    last = await getPayoutBatch(payoutBatchId);
    detail = batchDetailSchema.safeParse(last.data);
    if (!detail.success) continue;
    const batchStatus = detail.data.batch_header.batch_status;
    const items = detail.data.items ?? [];
    const statuses = items.map((i) => i.transaction_status ?? "?");
    console.log(`  poll +${Math.round((Date.now() - started) / 1000)}s: batch ${batchStatus}; items ${statuses.join(", ")}`);
    if (FINAL_BATCH_STATUSES.has(batchStatus) && items.length > 0 && statuses.every((s) => SETTLED_ITEM_STATUSES.has(s))) {
      break;
    }
  }
  const items = detail.success ? (detail.data.items ?? []) : [];
  record({
    step: "3-poll-batch",
    request: `GET /v1/payments/payouts/${payoutBatchId}`,
    httpStatus: last?.status,
    debugId: last?.debugId,
    outcome: detail.success
      ? `after ${Math.round((Date.now() - started) / 1000)}s batch ${detail.data.batch_header.batch_status}; ` +
        items
          .map((i) => `${i.payout_item?.sender_item_id?.split("-").pop()}=${i.transaction_status} (${i.payout_item?.receiver})`)
          .join("; ")
      : "could not read batch detail",
    data: last?.data,
  });

  // 4. Duplicate sender_batch_id must be rejected; record the exact error shape.
  const duplicate = await createPayoutBatch(input);
  const dupBody = duplicate.data as { name?: string; message?: string } | null;
  record(
    fromResponse(
      "4-duplicate-batch",
      "POST /v1/payments/payouts (same sender_batch_id)",
      duplicate,
      duplicate.ok
        ? "NOT rejected: PayPal accepted a duplicate sender_batch_id"
        : `rejected: ${dupBody?.name ?? "?"}: ${dupBody?.message ?? "?"}`,
    ),
  );

  // 5. Cancel the UNCLAIMED item, then read it back.
  const unclaimed = items.find((i) => i.transaction_status === "UNCLAIMED");
  if (!unclaimed) {
    record({
      step: "5-cancel-unclaimed",
      request: "POST /v1/payments/payouts-item/{id}/cancel",
      outcome: `skipped: no UNCLAIMED item (address ${unregistered} gave ${
        items.find((i) => i.payout_item?.receiver === unregistered)?.transaction_status ?? "no item"
      })`,
    });
  } else {
    const cancel = await cancelPayoutItem(unclaimed.payout_item_id);
    const cancelBody = cancel.data as { transaction_status?: string; name?: string; message?: string } | null;
    record(
      fromResponse(
        "5-cancel-unclaimed",
        `POST /v1/payments/payouts-item/${unclaimed.payout_item_id}/cancel`,
        cancel,
        cancel.ok
          ? `cancel accepted; item status ${cancelBody?.transaction_status ?? "?"}`
          : `cancel failed: ${cancelBody?.name ?? "?"}: ${cancelBody?.message ?? "?"}`,
      ),
    );
    await sleep(POLL_INTERVAL_MS);
    const after = await getPayoutItem(unclaimed.payout_item_id);
    const afterBody = after.data as { transaction_status?: string } | null;
    record(
      fromResponse(
        "5b-item-after-cancel",
        `GET /v1/payments/payouts-item/${unclaimed.payout_item_id}`,
        after,
        `item status ${afterBody?.transaction_status ?? "?"}`,
      ),
    );
  }

  // 8. Business balance, if the sandbox app may read it.
  const balance = await paypalRequest({ method: "GET", path: "/v1/reporting/balances?currency_code=EUR" });
  const balanceBody = balance.data as {
    balances?: { currency: string; total_balance?: { value: string }; available_balance?: { value: string } }[];
    name?: string;
    message?: string;
  } | null;
  const eur = balanceBody?.balances?.find((b) => b.currency === "EUR");
  record(
    fromResponse(
      "8-balance",
      "GET /v1/reporting/balances?currency_code=EUR",
      balance,
      eur
        ? `EUR total ${eur.total_balance?.value ?? "?"}, available ${eur.available_balance?.value ?? "?"}`
        : `balance not readable: ${balanceBody?.name ?? ""} ${balanceBody?.message ?? ""}`.trim(),
    ),
  );
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    record({ step: "error", request: "-", outcome: message });
    process.exitCode = 1;
  })
  .finally(() => {
    const dir = join(process.cwd(), "scripts", "out");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `spike-payouts-${timestamp()}.json`);
    writeFileSync(file, redactEmailsInText(JSON.stringify({ ranAt: new Date().toISOString(), steps }, null, 2)));
    console.log(`\nResults written to ${file}`);
  });
