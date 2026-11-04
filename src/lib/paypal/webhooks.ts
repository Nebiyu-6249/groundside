// Webhook signature verification through PayPal's verify endpoint (docs/SPEC.md 9.4).

import { z } from "zod";
import { appBaseUrl } from "@/lib/app-url";
import { paypalRequest } from "./http";

export const TRANSMISSION_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export const webhookEventSchema = z.looseObject({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource_type: z.string().optional(),
  resource: z.looseObject({ id: z.string().optional(), status: z.string().optional() }).optional(),
});

export type WebhookEventBody = z.infer<typeof webhookEventSchema>;

export type VerifyResult =
  | { verified: true }
  | { verified: false; reason: string; debugId?: string | null };

let resolvedId: string | null = null;

/**
 * PAYPAL_WEBHOOK_ID when set. Otherwise the ID of the sandbox webhook whose URL is this app's
 * /api/webhooks/paypal, looked up once per process. The hosted service is created before its
 * webhook exists, so it finds the ID this way instead of needing a second configuration step.
 */
export async function resolveWebhookId(env: Record<string, string | undefined> = process.env): Promise<string | undefined> {
  if (env.PAYPAL_WEBHOOK_ID) return env.PAYPAL_WEBHOOK_ID;
  if (resolvedId) return resolvedId;
  const url = `${appBaseUrl(env)}/api/webhooks/paypal`;
  const res = await paypalRequest<{ webhooks?: { id: string; url: string }[] }>({ method: "GET", path: "/v1/notifications/webhooks" });
  resolvedId = (res.ok && res.data.webhooks?.find((w) => w.url === url)?.id) || null;
  return resolvedId ?? undefined;
}

export async function verifyWebhookSignature(
  headers: Headers,
  event: unknown,
  webhookId: string | undefined,
): Promise<VerifyResult> {
  if (!webhookId) return { verified: false, reason: "no webhook ID: PAYPAL_WEBHOOK_ID is not set and no sandbox webhook points at this app" };

  const values: Record<string, string> = {};
  for (const name of TRANSMISSION_HEADERS) {
    const value = headers.get(name);
    if (!value) return { verified: false, reason: `missing header ${name}` };
    values[name] = value;
  }

  const res = await paypalRequest<{ verification_status?: string } | null>({
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      auth_algo: values["paypal-auth-algo"],
      cert_url: values["paypal-cert-url"],
      transmission_id: values["paypal-transmission-id"],
      transmission_sig: values["paypal-transmission-sig"],
      transmission_time: values["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  const status = res.data?.verification_status;
  if (res.ok && status === "SUCCESS") return { verified: true };
  return {
    verified: false,
    reason: `verification_status=${status ?? "none"} (HTTP ${res.status})`,
    debugId: res.debugId,
  };
}
