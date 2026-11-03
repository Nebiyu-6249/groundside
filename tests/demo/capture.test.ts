import { beforeEach, describe, expect, it, vi } from "vitest";

// The checkout window can report a cancel after the buyer approved, so the page asks the
// server to capture on cancel too. These tests pin down that only APPROVED orders are captured.

const booking = {
  id: "b1",
  paypalOrderId: "ORDER-1",
  paypalCaptureId: null as string | null,
  captureRequestId: null as string | null,
  orderStatus: "CREATED",
};

const db = {
  booking: {
    findUnique: vi.fn(async () => ({ ...booking })),
    update: vi.fn(async ({ data }: { data: Partial<typeof booking> }) => ({ ...booking, ...data })),
  },
};

vi.mock("@/lib/db", () => ({ getDb: () => db }));

const getOrder = vi.fn();
const captureOrder = vi.fn();
vi.mock("@/lib/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paypal/orders")>()),
  getOrder: (...args: unknown[]) => getOrder(...args),
  captureOrder: (...args: unknown[]) => captureOrder(...args),
}));

const { captureDemoOrder } = await import("@/lib/demo/booking");

function ok(data: unknown) {
  return { ok: true, status: 200, debugId: "d", data, durationMs: 1 };
}

describe("captureDemoOrder (SPEC 9.8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to capture an order the buyer did not approve, without spending a request id", async () => {
    getOrder.mockResolvedValue(ok({ id: "ORDER-1", status: "PAYER_ACTION_REQUIRED" }));
    await expect(captureDemoOrder("ORDER-1")).rejects.toMatchObject({ httpStatus: 409 });
    expect(captureOrder).not.toHaveBeenCalled();
    const writes = db.booking.update.mock.calls.map(([arg]) => arg.data);
    expect(writes).toEqual([{ orderStatus: "PAYER_ACTION_REQUIRED" }]);
  });

  it("captures an approved order and stores the capture id", async () => {
    getOrder.mockResolvedValue(ok({ id: "ORDER-1", status: "APPROVED" }));
    captureOrder.mockResolvedValue(
      ok({
        id: "ORDER-1",
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: "CAP-1", status: "COMPLETED" }] } }],
      }),
    );
    await expect(captureDemoOrder("ORDER-1")).resolves.toMatchObject({ captureId: "CAP-1" });
    expect(captureOrder).toHaveBeenCalledTimes(1);
  });
});
