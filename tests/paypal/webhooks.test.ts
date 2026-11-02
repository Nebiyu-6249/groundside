import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, setSandboxEnv } from "./helpers";

const headers = () =>
  new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
    "paypal-transmission-id": "tid",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-11-03T10:00:00Z",
  });

const event = { id: "WH-1", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { id: "B1" } };

async function load() {
  vi.resetModules();
  return import("@/lib/paypal/webhooks");
}

beforeEach(() => {
  setSandboxEnv();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("webhook signature verification (SPEC 9.4)", () => {
  it("accepts only verification_status SUCCESS", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { verification_status: "SUCCESS" }));
    const { verifyWebhookSignature } = await load();
    await expect(verifyWebhookSignature(headers(), event, "WH-ID")).resolves.toEqual({ verified: true });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes("verify-webhook-signature"))!;
    const sent = JSON.parse(String(init?.body));
    expect(sent.webhook_id).toBe("WH-ID");
    expect(sent.transmission_id).toBe("tid");
    expect(sent.webhook_event).toEqual(event);
  });

  it("rejects FAILURE", async () => {
    mockFetch(() => jsonResponse(200, { verification_status: "FAILURE" }));
    const { verifyWebhookSignature } = await load();
    const result = await verifyWebhookSignature(headers(), event, "WH-ID");
    expect(result.verified).toBe(false);
  });

  it("rejects without calling PayPal when a transmission header is missing", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { verification_status: "SUCCESS" }));
    const { verifyWebhookSignature } = await load();
    const h = headers();
    h.delete("paypal-transmission-sig");
    const result = await verifyWebhookSignature(h, event, "WH-ID");
    expect(result).toMatchObject({ verified: false, reason: "missing header paypal-transmission-sig" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when no webhook id is configured", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { verification_status: "SUCCESS" }));
    const { verifyWebhookSignature } = await load();
    const result = await verifyWebhookSignature(headers(), event, undefined);
    expect(result.verified).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses event bodies and rejects ones without id or type", async () => {
    const { webhookEventSchema } = await load();
    expect(webhookEventSchema.safeParse(event).success).toBe(true);
    expect(webhookEventSchema.safeParse({ event_type: "X" }).success).toBe(false);
  });
});
