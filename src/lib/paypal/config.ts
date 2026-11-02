// PayPal configuration with a hard sandbox guard (docs/SPEC.md 9.1, golden rule 7).

export const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";

export class PaypalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaypalConfigError";
  }
}

type EnvSource = Record<string, string | undefined>;

export interface PaypalConfig {
  apiBase: string;
  clientId: string;
  clientSecret: string;
}

function normaliseBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** "sandbox" when the base URL is the sandbox host, "refused" for any other host. */
export function sandboxStatus(
  env: EnvSource = process.env,
): "sandbox" | "refused" | "not_configured" {
  const base = env.PAYPAL_API_BASE;
  if (!base) return "not_configured";
  return normaliseBase(base) === SANDBOX_API_BASE ? "sandbox" : "refused";
}

/** Reads PayPal settings, refusing anything that is not the sandbox host. */
export function getPaypalConfig(env: EnvSource = process.env): PaypalConfig {
  const status = sandboxStatus(env);
  if (status === "not_configured") {
    throw new PaypalConfigError("PAYPAL_API_BASE is not set");
  }
  if (status === "refused") {
    throw new PaypalConfigError(
      `PAYPAL_API_BASE must be ${SANDBOX_API_BASE}; Groundside runs against the PayPal sandbox only`,
    );
  }
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new PaypalConfigError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  }
  return { apiBase: SANDBOX_API_BASE, clientId, clientSecret };
}
