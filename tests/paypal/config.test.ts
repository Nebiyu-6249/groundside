import { describe, expect, it } from "vitest";
import { getPaypalConfig, PaypalConfigError, sandboxStatus } from "@/lib/paypal/config";
import { amountToCents, centsToAmount } from "@/lib/paypal/money";
import { redactEmail, redactEmailsInText } from "@/lib/paypal/redact";

const creds = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };

describe("sandbox guard (SPEC 9.1)", () => {
  it("accepts the sandbox host, with or without a trailing slash", () => {
    expect(getPaypalConfig({ ...creds, PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com" }).apiBase).toBe(
      "https://api-m.sandbox.paypal.com",
    );
    expect(sandboxStatus({ PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com/" })).toBe("sandbox");
  });

  it("refuses the live host", () => {
    expect(() => getPaypalConfig({ ...creds, PAYPAL_API_BASE: "https://api-m.paypal.com" })).toThrow(
      PaypalConfigError,
    );
    expect(sandboxStatus({ PAYPAL_API_BASE: "https://api-m.paypal.com" })).toBe("refused");
  });

  it("refuses a lookalike host", () => {
    expect(sandboxStatus({ PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com.example.net" })).toBe(
      "refused",
    );
  });

  it("requires credentials", () => {
    expect(() => getPaypalConfig({ PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com" })).toThrow(
      /PAYPAL_CLIENT_ID/,
    );
  });
});

describe("money formatting", () => {
  it("formats integer cents as two-decimal strings", () => {
    expect(centsToAmount(0)).toBe("0.00");
    expect(centsToAmount(5)).toBe("0.05");
    expect(centsToAmount(60000)).toBe("600.00");
    expect(centsToAmount(1234)).toBe("12.34");
  });

  it("rejects fractional or negative cents", () => {
    expect(() => centsToAmount(1.5)).toThrow(RangeError);
    expect(() => centsToAmount(-1)).toThrow(RangeError);
  });

  it("parses PayPal amounts back to cents", () => {
    expect(amountToCents("600.00")).toBe(60000);
    expect(amountToCents("12.3")).toBe(1230);
    expect(amountToCents("7")).toBe(700);
    expect(() => amountToCents("1,00")).toThrow(RangeError);
  });
});

describe("log redaction", () => {
  it("masks emails", () => {
    expect(redactEmail("alice.smith@example.com")).toBe("a***@example.com");
    expect(redactEmailsInText("to bob@x.io and carol@y.org")).toBe("to b***@x.io and c***@y.org");
  });
});
