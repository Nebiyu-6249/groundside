// Payouts v1: create a batch, read batch and item status, cancel an unclaimed item
// (docs/SPEC.md 9.2, 9.7).

import { z } from "zod";
import { paypalRequest, type PaypalResponse } from "./http";
import { centsToAmount } from "./money";

export interface PayoutItemInput {
  senderItemId: string;
  receiver: string;
  amountCents: number;
  note: string;
}

export interface CreateBatchInput {
  senderBatchId: string;
  emailSubject: string;
  emailMessage: string;
  items: PayoutItemInput[];
  currency?: string;
}

const link = z.looseObject({ href: z.string(), rel: z.string(), method: z.string().optional() });

export const batchHeaderSchema = z.looseObject({
  payout_batch_id: z.string(),
  batch_status: z.string(),
  sender_batch_header: z.looseObject({ sender_batch_id: z.string() }).optional(),
});

export const payoutItemSchema = z.looseObject({
  payout_item_id: z.string(),
  transaction_id: z.string().optional(),
  transaction_status: z.string().optional(),
  payout_batch_id: z.string().optional(),
  payout_item: z
    .looseObject({
      sender_item_id: z.string().optional(),
      receiver: z.string().optional(),
      amount: z.looseObject({ value: z.string(), currency: z.string() }).optional(),
    })
    .optional(),
  errors: z.unknown().optional(),
  links: z.array(link).optional(),
});

export const createBatchResponseSchema = z.looseObject({
  batch_header: batchHeaderSchema,
  links: z.array(link).optional(),
});

export const batchDetailSchema = z.looseObject({
  batch_header: batchHeaderSchema,
  items: z.array(payoutItemSchema).optional(),
  total_items: z.number().optional(),
  total_page: z.number().optional(),
  links: z.array(link).optional(),
});

/** Final batch statuses (docs/SPEC.md 9.2). */
export const FINAL_BATCH_STATUSES = new Set(["SUCCESS", "DENIED", "CANCELED"]);

/** Item statuses that will not change on their own. UNCLAIMED can still be claimed or cancelled. */
export const SETTLED_ITEM_STATUSES = new Set([
  "SUCCESS",
  "FAILED",
  "UNCLAIMED",
  "RETURNED",
  "BLOCKED",
  "REFUNDED",
  "REVERSED",
  "DENIED",
]);

export function buildBatchBody(input: CreateBatchInput) {
  const currency = input.currency ?? "EUR";
  return {
    sender_batch_header: {
      sender_batch_id: input.senderBatchId,
      email_subject: input.emailSubject,
      email_message: input.emailMessage,
    },
    items: input.items.map((item) => ({
      recipient_type: "EMAIL",
      amount: { value: centsToAmount(item.amountCents), currency },
      receiver: item.receiver,
      note: item.note,
      sender_item_id: item.senderItemId,
    })),
  };
}

export function createPayoutBatch(input: CreateBatchInput): Promise<PaypalResponse> {
  return paypalRequest({ method: "POST", path: "/v1/payments/payouts", body: buildBatchBody(input) });
}

export function getPayoutBatch(payoutBatchId: string, page = 1): Promise<PaypalResponse> {
  const id = encodeURIComponent(payoutBatchId);
  return paypalRequest({
    method: "GET",
    path: `/v1/payments/payouts/${id}?page=${page}&page_size=100&total_required=true`,
  });
}

export function getPayoutItem(payoutItemId: string): Promise<PaypalResponse> {
  return paypalRequest({
    method: "GET",
    path: `/v1/payments/payouts-item/${encodeURIComponent(payoutItemId)}`,
  });
}

export function cancelPayoutItem(payoutItemId: string): Promise<PaypalResponse> {
  return paypalRequest({
    method: "POST",
    path: `/v1/payments/payouts-item/${encodeURIComponent(payoutItemId)}/cancel`,
  });
}
