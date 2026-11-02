import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, setSandboxEnv, tokenResponse } from "./helpers";

// The token cache is module state, so each test gets fresh modules.
async function load() {
  vi.resetModules();
  const http = await import("@/lib/paypal/http");
  const token = await import("@/lib/paypal/token");
  const payouts = await import("@/lib/paypal/payouts");
  const orders = await import("@/lib/paypal/orders");
  return { ...http, ...token, ...payouts, ...orders };
}

beforeEach(() => {
  setSandboxEnv();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("token cache (SPEC 9.1)", () => {
  it("fetches one token for many requests", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, {}));
    const { paypalRequest } = await load();
    await paypalRequest({ method: "GET", path: "/a" });
    await paypalRequest({ method: "GET", path: "/b" });
    const tokenCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/v1/oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("refreshes a token within 5 minutes of expiry", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/v1/oauth2/token")) return tokenResponse(240); // 4 minutes
      return jsonResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { paypalRequest } = await load();
    await paypalRequest({ method: "GET", path: "/a" });
    await paypalRequest({ method: "GET", path: "/b" });
    const tokenCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/v1/oauth2/token"));
    expect(tokenCalls).toHaveLength(2);
  });

  it("retries once with a new token after a 401", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return calls === 1 ? jsonResponse(401, { error: "invalid_token" }) : jsonResponse(200, { ok: 1 });
    });
    const { paypalRequest } = await load();
    const res = await paypalRequest({ method: "GET", path: "/x" });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });
});

describe("HTTP helper logging", () => {
  it("logs the debug id and never the token, secret or body", async () => {
    mockFetch(() => jsonResponse(201, { id: "X" }, "dbg-abc"));
    const { paypalRequest } = await load();
    const res = await paypalRequest({
      method: "POST",
      path: "/v1/payments/payouts",
      body: { receiver: "someone@example.com" },
    });
    expect(res.debugId).toBe("dbg-abc");
    const logged = vi.mocked(console.info).mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("dbg-abc");
    expect(logged).not.toContain("access-token-value");
    expect(logged).not.toContain("test-client-secret");
    expect(logged).not.toContain("someone@example.com");
  });

  it("sends PayPal-Request-Id when given", async () => {
    const fetchMock = mockFetch(() => jsonResponse(201, { id: "O1", status: "CREATED" }));
    const { createOrder } = await load();
    await createOrder({
      requestId: "req-1",
      amountCents: 18900,
      description: "Demo seat",
      referenceId: "B1",
    });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v2/checkout/orders"))!;
    expect((init?.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("req-1");
    expect(JSON.parse(String(init?.body)).purchase_units[0].amount).toEqual({
      currency_code: "EUR",
      value: "189.00",
    });
  });
});

describe("payout batch body (SPEC 9.2)", () => {
  it("builds EMAIL items with two-decimal EUR amounts and sender ids", async () => {
    const { buildBatchBody } = await load();
    const body = buildBatchBody({
      senderBatchId: "gs-abc-COMP-1",
      emailSubject: "s",
      emailMessage: "m",
      items: [{ senderItemId: "item-1", receiver: "r@example.com", amountCents: 60000, note: "n" }],
    });
    expect(body.sender_batch_header.sender_batch_id).toBe("gs-abc-COMP-1");
    expect(body.items[0]).toEqual({
      recipient_type: "EMAIL",
      amount: { value: "600.00", currency: "EUR" },
      receiver: "r@example.com",
      note: "n",
      sender_item_id: "item-1",
    });
  });

  it("refuses to send fractional cents", async () => {
    const { buildBatchBody } = await load();
    expect(() =>
      buildBatchBody({
        senderBatchId: "b",
        emailSubject: "s",
        emailMessage: "m",
        items: [{ senderItemId: "i", receiver: "r@example.com", amountCents: 10.5, note: "n" }],
      }),
    ).toThrow(RangeError);
  });
});

describe("sandbox guard at request time", () => {
  it("never calls a live host", async () => {
    process.env.PAYPAL_API_BASE = "https://api-m.paypal.com";
    const fetchMock = mockFetch(() => jsonResponse(200, {}));
    const { paypalRequest } = await load();
    await expect(paypalRequest({ method: "GET", path: "/x" })).rejects.toThrow(/sandbox/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
