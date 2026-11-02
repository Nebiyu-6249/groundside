// The one HTTP helper for PayPal REST calls (docs/SPEC.md 9.1). It logs method, path,
// status, paypal-debug-id and duration. It never logs headers or request bodies.

import { getPaypalConfig } from "./config";
import { getAccessToken, invalidateToken } from "./token";

export type HttpMethod = "GET" | "POST" | "PATCH";

export interface PaypalRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  /** Sent as PayPal-Request-Id for idempotent Orders and Refunds calls. */
  requestId?: string;
  headers?: Record<string, string>;
}

export interface PaypalResponse<T = unknown> {
  ok: boolean;
  status: number;
  debugId: string | null;
  data: T;
  durationMs: number;
}

export class PaypalNetworkError extends Error {
  constructor(
    message: string,
    readonly method: HttpMethod,
    readonly path: string,
  ) {
    super(message);
    this.name = "PaypalNetworkError";
  }
}

async function send<T>(req: PaypalRequest, token: string): Promise<PaypalResponse<T>> {
  const { apiBase } = getPaypalConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...req.headers,
  };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.requestId) headers["PayPal-Request-Id"] = req.requestId;

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${apiBase}${req.path}`, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    throw new PaypalNetworkError(`PayPal request failed: ${reason}`, req.method, req.path);
  }
  const durationMs = Date.now() - started;
  const debugId = res.headers.get("paypal-debug-id");
  console.info(
    JSON.stringify({
      evt: "paypal",
      method: req.method,
      path: req.path,
      status: res.status,
      debugId,
      ms: durationMs,
    }),
  );

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
  }
  return { ok: res.ok, status: res.status, debugId, data: data as T, durationMs };
}

export async function paypalRequest<T = unknown>(req: PaypalRequest): Promise<PaypalResponse<T>> {
  const first = await send<T>(req, await getAccessToken());
  if (first.status !== 401) return first;
  // Expired or revoked token: fetch a fresh one and retry once.
  invalidateToken();
  return send<T>(req, await getAccessToken());
}
