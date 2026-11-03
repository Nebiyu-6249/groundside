// Synthetic passenger manifests (docs/DEMO.md 2.5). Deterministic for a given seed.
// Every person here is fictional; names are drawn from mixed lists, never real passengers.

import type { FareType, PriorityReason } from "@/lib/engine";
import type { Scenario } from "./scenarios";

export type ReceiverKind = "POOL" | "UNREGISTERED" | "NONE";
/** What the passenger does in the scripted demo; used by the Phase 3 demo controls. */
export type DemoScript = "PAYPAL" | "PAYPAL_MOBILE" | "BANK_TRANSFER" | "REFUND" | "NO_RESPONSE";

export interface ManifestEntry {
  index: number;
  displayName: string;
  displayEmail: string | null;
  receiverKind: ReceiverKind;
  fareType: FareType;
  /** ICAO of the final destination; equals the flight destination unless connecting. */
  finalDestination: string;
  priorityReason: PriorityReason | null;
  choice: "UNDECIDED" | "REFUND";
  paymentMethod: "CARD" | "PAYPAL";
  demoScript: DemoScript;
  /** Case number in the quick-run table, if any. */
  quickCase: number | null;
}

/** mulberry32: small, fast, deterministic. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Amara", "Lukas", "Sofia", "Mateo", "Yuki", "Noah", "Leila", "Jonas", "Priya", "Elias", "Ines", "Omar",
  "Hana", "Felix", "Nadia", "Tomas", "Zara", "Karim", "Elena", "Samuel", "Mei", "Ravi", "Freya", "Diego",
  "Aisha", "Marek", "Lina", "Teo", "Selin", "Arjun", "Clara", "Emeka", "Ingrid", "Yusuf", "Marta", "Kenji",
  "Rosa", "Bilal", "Astrid", "Tariq", "Nora", "Pablo", "Saanvi", "Henrik", "Lucia", "Kwame", "Mira", "Anton",
];
const LAST = [
  "Okafor", "Lindqvist", "Moreau", "Haddad", "Kowalski", "Tanaka", "Ferreira", "Novak", "Mensah", "Rossi",
  "Kaya", "Schneider", "Patel", "Dimitrov", "Nakamura", "Oliveira", "Jansen", "Abebe", "Larsen", "Costa",
  "Varga", "Chen", "Mwangi", "Fischer", "Rahman", "Silva", "Petrov", "Nguyen", "Bauer", "Alvarez",
  "Horvat", "Kimura", "Osei", "Berg", "Aziz", "Duarte", "Weber", "Sato", "Nkosi", "Lehmann",
];

function names(count: number, random: () => number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  while (out.length < count) {
    const n = `${FIRST[Math.floor(random() * FIRST.length)]} ${LAST[Math.floor(random() * LAST.length)]}`;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

const emailFor = (name: string, index: number) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${index}@example.com`;

function base(index: number, name: string, scenario: Scenario): ManifestEntry {
  return {
    index,
    displayName: name,
    displayEmail: emailFor(name, index),
    receiverKind: "POOL",
    fareType: "PUBLIC",
    finalDestination: scenario.flight.destination,
    priorityReason: null,
    choice: "UNDECIDED",
    paymentMethod: "CARD",
    demoScript: "PAYPAL",
    quickCase: null,
  };
}

/** The 12-passenger quick run (docs/DEMO.md 2.5): one passenger per case, in table order. */
export function quickManifest(scenario: Scenario, seed = 412): ManifestEntry[] {
  const random = seededRandom(seed);
  const n = names(12, random);
  const connecting = scenario.onward[0]?.destination ?? scenario.flight.destination;
  const cases: Partial<ManifestEntry>[] = [
    { demoScript: "PAYPAL" },
    { demoScript: "PAYPAL_MOBILE" },
    { demoScript: "PAYPAL" },
    { finalDestination: connecting, demoScript: "PAYPAL" },
    { fareType: "FREQUENT_FLYER_AWARD", demoScript: "PAYPAL" },
    { fareType: "STAFF_REDUCED_NOT_PUBLIC", demoScript: "NO_RESPONSE" },
    { priorityReason: "REDUCED_MOBILITY", demoScript: "PAYPAL" },
    { receiverKind: "UNREGISTERED", demoScript: "PAYPAL" },
    { demoScript: "BANK_TRANSFER" },
    { choice: "REFUND", paymentMethod: "CARD", demoScript: "REFUND" },
    { displayEmail: null, receiverKind: "NONE", demoScript: "NO_RESPONSE" },
    { demoScript: "NO_RESPONSE" },
  ];
  return cases.map((c, i) => ({ ...base(i, n[i], scenario), ...c, quickCase: i + 1 }));
}

/** The full run: groups from the scenario, with overlays spread deterministically across public fares. */
export function fullManifest(scenario: Scenario, seed = 2004): ManifestEntry[] {
  const random = seededRandom(seed);
  const { groups, overlays } = scenario.fullRun;
  const total = groups.public + groups.connecting + groups.award + groups.staff;
  const n = names(total, random);
  const entries: ManifestEntry[] = [];
  let i = 0;
  for (let k = 0; k < groups.public; k++, i++) entries.push(base(i, n[i], scenario));
  for (let k = 0; k < groups.connecting; k++, i++) {
    const onward = scenario.onward[k % Math.max(1, scenario.onward.length)];
    entries.push({ ...base(i, n[i], scenario), finalDestination: onward?.destination ?? scenario.flight.destination });
  }
  for (let k = 0; k < groups.award; k++, i++) entries.push({ ...base(i, n[i], scenario), fareType: "FREQUENT_FLYER_AWARD" });
  for (let k = 0; k < groups.staff; k++, i++) entries.push({ ...base(i, n[i], scenario), fareType: "STAFF_REDUCED_NOT_PUBLIC", demoScript: "NO_RESPONSE" });

  // Overlays go on distinct public-fare passengers, picked by a seeded shuffle.
  const pool = entries.filter((e) => e.fareType === "PUBLIC" && e.finalDestination === scenario.flight.destination).map((e) => e.index);
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  const take = (count: number) => pool.splice(0, count).map((idx) => entries[idx]);
  for (const e of take(overlays.reducedMobility)) e.priorityReason = "REDUCED_MOBILITY";
  for (const e of take(overlays.unaccompaniedMinor)) e.priorityReason = "UNACCOMPANIED_MINOR";
  for (const e of take(overlays.unregistered)) e.receiverKind = "UNREGISTERED";
  for (const e of take(overlays.noEmail)) Object.assign(e, { displayEmail: null, receiverKind: "NONE", demoScript: "NO_RESPONSE" });
  for (const e of take(overlays.refundCardPaid)) Object.assign(e, { choice: "REFUND", paymentMethod: "CARD", demoScript: "REFUND" });
  return entries;
}

/** Payout receiver for an entry: a sandbox pool account (round-robin), an unregistered address, or none. */
export function payoutReceiver(e: ManifestEntry, pool: readonly string[], unregisteredPattern: string): string | null {
  if (e.receiverKind === "NONE") return null;
  if (e.receiverKind === "UNREGISTERED") return unregisteredPattern.replace("{n}", String(e.index + 1).padStart(4, "0"));
  if (pool.length === 0) throw new Error("PAYPAL_POOL_RECEIVERS is empty");
  return pool[e.index % pool.length];
}
