// Orders v2 for demo bookings and Payments v2 refunds (docs/SPEC.md 9.8).
// Every write carries a stored PayPal-Request-Id so a retry cannot charge or refund twice.

import { z } from "zod";
import { paypalRequest, type PaypalResponse } from "./http";
import { centsToAmount } from "./money";

export interface CreateOrderInput {
  requestId: string;
  amountCents: number;
  currency?: string;
  description: string;
  referenceId: string;
}

export const orderSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
});

const captureSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  amount: z.looseObject({ value: z.string(), currency_code: z.string() }).optional(),
});

export const captureResultSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  purchase_units: z
    .array(
      z.looseObject({
        payments: z.looseObject({ captures: z.array(captureSchema).optional() }).optional(),
      }),
    )
    .optional(),
});

export const refundSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  amount: z.looseObject({ value: z.string(), currency_code: z.string() }).optional(),
});

export function createOrder(input: CreateOrderInput): Promise<PaypalResponse> {
  return paypalRequest({
    method: "POST",
    path: "/v2/checkout/orders",
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description,
          amount: {
            currency_code: input.currency ?? "EUR",
            value: centsToAmount(input.amountCents),
          },
        },
      ],
    },
  });
}

export function captureOrder(orderId: string, requestId: string): Promise<PaypalResponse> {
  return paypalRequest({
    method: "POST",
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    requestId,
    body: {},
  });
}

/** Full refund when amountCents is omitted. */
export function refundCapture(
  captureId: string,
  requestId: string,
  amountCents?: number,
  currency = "EUR",
): Promise<PaypalResponse> {
  return paypalRequest({
    method: "POST",
    path: `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    requestId,
    body:
      amountCents === undefined
        ? {}
        : { amount: { value: centsToAmount(amountCents), currency_code: currency } },
  });
}

export function getRefund(refundId: string): Promise<PaypalResponse> {
  return paypalRequest({
    method: "GET",
    path: `/v2/payments/refunds/${encodeURIComponent(refundId)}`,
  });
}

/** First capture in a capture response, if any. */
export function firstCapture(data: z.infer<typeof captureResultSchema>) {
  return data.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}
