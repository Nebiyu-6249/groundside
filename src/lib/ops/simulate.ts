// Demo control (SPEC 14): scripted passenger responses from the manifest (docs/DEMO.md 2.5).

import type { PrismaClient } from "@/generated/prisma/client";
import { fullManifest, quickManifest } from "@/lib/demo/manifest";
import { loadScenario, type ScenarioKey } from "@/lib/demo/scenarios";
import { recordPaymentChoice, recordTravelChoice } from "./passenger-choice";

export async function simulatePassengerResponses(db: PrismaClient, disruptionId: string): Promise<number> {
  const d = await db.disruption.findUniqueOrThrow({ where: { id: disruptionId }, select: { scenarioKey: true, type: true } });
  const passengers = await db.passenger.findMany({ where: { disruptionId, offers: { some: { paymentChoice: "NONE" } } }, orderBy: { manifestIndex: "asc" } });
  const total = await db.passenger.count({ where: { disruptionId } });
  const scenario = loadScenario(d.scenarioKey as ScenarioKey);
  const manifest = total === 12 ? quickManifest(scenario) : fullManifest(scenario);
  let n = 0;
  for (const p of passengers) {
    const script = manifest[p.manifestIndex]?.demoScript ?? "NO_RESPONSE";
    if (script === "NO_RESPONSE") continue;
    if (d.type === "CANCELLATION" && p.choice === "UNDECIDED") await recordTravelChoice(db, p.id, script === "REFUND" ? "REFUND" : "REROUTING", "SYSTEM");
    if (script === "BANK_TRANSFER") await recordPaymentChoice(db, p.id, { method: "BANK_TRANSFER", ibanLast4: "4321" }, "SYSTEM");
    else await recordPaymentChoice(db, p.id, { method: "PAYPAL", paypalEmail: p.displayEmail ?? "passenger@example.com", consent: true }, "SYSTEM");
    n++;
  }
  return n;
}
