import { vi } from "vitest";

export const SANDBOX = "https://api-m.sandbox.paypal.com";

export function setSandboxEnv(): void {
  process.env.PAYPAL_API_BASE = SANDBOX;
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
}

export function jsonResponse(status: number, body: unknown, debugId = "dbg-123"): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "paypal-debug-id": debugId },
  });
}

export function tokenResponse(expiresIn = 32400): Response {
  return jsonResponse(200, {
    access_token: "access-token-value",
    expires_in: expiresIn,
    scope: "https://uri.paypal.com/services/payments/payouts",
    app_id: "APP-TEST",
  });
}

/** Routes fetch calls by URL path; the token endpoint always answers. */
export function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/oauth2/token")) return tokenResponse();
    return handler(url, init ?? {});
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
