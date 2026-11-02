// OAuth2 client-credentials token, cached in memory until 5 minutes before expiry
// (docs/SPEC.md 9.1). Restarts simply fetch a new token.

import { getPaypalConfig } from "./config";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface TokenInfo {
  accessToken: string;
  expiresAt: number;
  scope: string;
  appId: string | null;
}

export class PaypalAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId: string | null,
  ) {
    super(message);
    this.name = "PaypalAuthError";
  }
}

let cached: TokenInfo | null = null;
let inFlight: Promise<TokenInfo> | null = null;

export async function fetchToken(): Promise<TokenInfo> {
  const { apiBase, clientId, clientSecret } = getPaypalConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const started = Date.now();
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const debugId = res.headers.get("paypal-debug-id");
  console.info(
    JSON.stringify({
      evt: "paypal",
      method: "POST",
      path: "/v1/oauth2/token",
      status: res.status,
      debugId,
      ms: Date.now() - started,
    }),
  );
  if (!res.ok) {
    throw new PaypalAuthError(`PayPal token request failed with ${res.status}`, res.status, debugId);
  }
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    app_id?: string;
  };
  if (!body.access_token || typeof body.expires_in !== "number") {
    throw new PaypalAuthError("PayPal token response was missing fields", res.status, debugId);
  }
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    scope: body.scope ?? "",
    appId: body.app_id ?? null,
  };
}

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }
  inFlight ??= fetchToken().finally(() => {
    inFlight = null;
  });
  cached = await inFlight;
  return cached.accessToken;
}

export function invalidateToken(): void {
  cached = null;
}
