import { describe, expect, it } from "vitest";
import { appBaseUrl } from "@/lib/app-url";
import { resolveWebhookId } from "@/lib/paypal/webhooks";

describe("appBaseUrl", () => {
  it("prefers APP_BASE_URL and drops a trailing slash", () => {
    expect(appBaseUrl({ APP_BASE_URL: "http://localhost:3001/", RENDER_EXTERNAL_URL: "https://x.onrender.com" })).toBe("http://localhost:3001");
  });
  it("falls back to the URL Render sets on the service", () => {
    expect(appBaseUrl({ RENDER_EXTERNAL_URL: "https://groundside.onrender.com" })).toBe("https://groundside.onrender.com");
  });
  it("defaults to the local dev server", () => {
    expect(appBaseUrl({})).toBe("http://localhost:3000");
  });
});

describe("resolveWebhookId", () => {
  it("uses PAYPAL_WEBHOOK_ID without calling PayPal when it is set", async () => {
    await expect(resolveWebhookId({ PAYPAL_WEBHOOK_ID: "WH-1" })).resolves.toBe("WH-1");
  });
});
