// npm run receipts:make
// Generates the sample receipts in fixtures/receipts/ (owner request, 2026-11-06): thermal-printer
// style HTML rendered with Playwright, then made to look photographed with sharp (rotation, skew,
// a plain table background, uneven light, noise, slight blur). Every merchant, address, tax ID,
// phone number and card number is invented, and each receipt prints "Sample receipt - Groundside
// demo". The JSON sidecar beside each JPG holds the values from this source, not from the AI, and
// the expected decision. Output is JPEG with no metadata.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

interface Line { text: string; amount: number; category: string }
interface Receipt {
  key: string;
  label: string;
  lang: string;
  dir?: "rtl";
  header: string[];
  meta: string[];
  date: string;
  time: string;
  dateText: string;
  currency: string;
  lines: Line[];
  /** Printed total when it differs from the sum of the lines (receipt f). */
  printedTotal?: number;
  vatText: string[];
  payment: string;
  faded?: boolean;
  merchant: string;
  scenario: "A" | "B" | null;
  remainingCents: { MEAL: number; HOTEL: number; TRANSPORT: number };
  expectedDecision: "AUTO_APPROVED" | "HUMAN_REVIEW" | "REJECTED";
  expectedApprovedCents: number;
  expectedReason: string;
  typicalPassenger: string;
}

const de = (n: number) => n.toFixed(2).replace(".", ",");
/** Arabic runs in an Arabic font, isolated so mixed lines keep their order. */
const ar = (s: string) => s.replace(/([\u0600-\u06FF\u0660-\u0669](?:[\u0600-\u06FF\u0660-\u0669\s:%-]*[\u0600-\u06FF\u0660-\u0669:%])?)/g, '<bdi class="ar">$1</bdi>');
const en = (n: number) => n.toFixed(2);

// Passenger context for the expected decision: one who chose a refund keeps 45 EUR of meal
// allowance (first allowance 15 of the 60 EUR daily maximum); hotel and transport caps unused.
const WITH_ALLOWANCE = { MEAL: 4500, HOTEL: 16000, TRANSPORT: 8000 };

const RECEIPTS: Receipt[] = [
  {
    key: "a-frankfurt-cafe", label: "Frankfurt airport cafe (German)", lang: "de", merchant: "Cafe Gleis Null",
    header: ["CAFE GLEIS NULL", "Flughafen Frankfurt, Terminal 1, Halle B", "Musterweg 0, 00000 Frankfurt am Main", "Tel. +49 00 0000000", "USt-IdNr. DE000000000"],
    meta: ["Beleg-Nr. 0000-0412", "Kasse 0  Bed. 0"], date: "2026-01-24", time: "20:41", dateText: "24.01.2026  20:41", currency: "EUR",
    lines: [{ text: "Laugenbrezel", amount: 3.2, category: "FOOD" }, { text: "Kaesebroetchen", amount: 5.9, category: "FOOD" }, { text: "Cappuccino", amount: 3.8, category: "NON_ALCOHOLIC_DRINK" }, { text: "Mineralwasser 0,5 l", amount: 2.9, category: "NON_ALCOHOLIC_DRINK" }],
    vatText: ["Enth. MwSt. 19%          2,52", "Netto                   13,28"], payment: "Kartenzahlung  **** 0000",
    scenario: "A", remainingCents: WITH_ALLOWANCE, expectedDecision: "AUTO_APPROVED", expectedApprovedCents: 1580, expectedReason: "inside the window, lines add up, food and drinks within the remaining meal allowance",
    typicalPassenger: "REJECTED: a typical scenario A passenger's flat 60 EUR meal allowance already reaches the 60 EUR daily maximum (current rule)",
  },
  {
    key: "b-frankfurt-restaurant-beer", label: "Frankfurt airport restaurant with a beer (German and English)", lang: "de", merchant: "Bistro Vorfeld Sieben",
    header: ["BISTRO VORFELD SIEBEN", "Restaurant / Restaurant", "Flughafen Frankfurt, Terminal 1, Ebene 2", "Beispielallee 0, 00000 Frankfurt am Main", "Tel. +49 00 0000000  USt-IdNr. DE000000000"],
    meta: ["Rechnung / Invoice 0000-7731", "Tisch / Table 0"], date: "2026-01-24", time: "22:18", dateText: "24.01.2026  22:18", currency: "EUR",
    lines: [{ text: "Schnitzel mit Pommes / Schnitzel with fries", amount: 16.9, category: "FOOD" }, { text: "Apfelschorle 0,4 l / Apple spritzer", amount: 3.9, category: "NON_ALCOHOLIC_DRINK" }, { text: "Pils vom Fass 0,4 l / Draught lager", amount: 5.2, category: "ALCOHOL" }],
    vatText: ["Enth. MwSt. / Incl. VAT 19%   4,15", "Netto / Net                  21,85"], payment: "Karte / Card  **** 0000",
    scenario: "A", remainingCents: WITH_ALLOWANCE, expectedDecision: "AUTO_APPROVED", expectedApprovedCents: 2080, expectedReason: "the beer (5.20 EUR) is excluded; food and soft drink (20.80 EUR) reimbursed",
    typicalPassenger: "REJECTED: allowance already used (current rule), after excluding the beer",
  },
  {
    key: "c-frankfurt-hotel-invoice", label: "Frankfurt airport-area hotel invoice, one night (English)", lang: "en", merchant: "Hotel Rollfeld Nord",
    header: ["HOTEL ROLLFELD NORD", "Frankfurt Airport area", "Probestrasse 0, 00000 Frankfurt am Main", "Phone +49 00 0000000", "VAT ID DE000000000"],
    meta: ["INVOICE 0000-0125", "Guest: Demo guest  Room 000", "Arrival 24 Jan 2026  Departure 25 Jan 2026"], date: "2026-01-25", time: "07:32", dateText: "25 Jan 2026  07:32", currency: "EUR",
    lines: [{ text: "Room, 1 night (24-25 Jan 2026)", amount: 179.0, category: "HOTEL" }],
    vatText: ["Incl. VAT 7%              11,71", "Net                      167,29"], payment: "Card payment  **** 0000",
    scenario: "A", remainingCents: WITH_ALLOWANCE, expectedDecision: "AUTO_APPROVED", expectedApprovedCents: 16000, expectedReason: "179.00 EUR room, reimbursed up to the 160.00 EUR hotel cap (Demo Air policy)",
    typicalPassenger: "AUTO_APPROVED 160.00 EUR for any scenario A passenger with a hotel entitlement",
  },
  {
    key: "d-malpensa-bar", label: "Milan Malpensa bar (Italian)", lang: "it", merchant: "Bar Pista Zero",
    header: ["BAR PISTA ZERO", "Aeroporto di Milano Malpensa, Terminal 1", "Via Esempio 0, 00000 Ferno (VA)", "Tel. +39 0000 000000", "P. IVA 00000000000"],
    meta: ["DOCUMENTO COMMERCIALE", "di vendita o prestazione", "Doc. N. 0000-0122"], date: "2026-01-22", time: "06:47", dateText: "22-01-2026  06:47", currency: "EUR",
    lines: [{ text: "Cornetto", amount: 1.5, category: "FOOD" }, { text: "Cappuccino", amount: 1.8, category: "NON_ALCOHOLIC_DRINK" }, { text: "Acqua naturale 0,5 l", amount: 1.2, category: "NON_ALCOHOLIC_DRINK" }],
    vatText: ["di cui IVA 10%              0,41"], payment: "Pagamento elettronico  **** 0000",
    scenario: "B", remainingCents: WITH_ALLOWANCE, expectedDecision: "AUTO_APPROVED", expectedApprovedCents: 450, expectedReason: "inside the scenario B window; care is paid even after the signed denial of compensation",
    typicalPassenger: "REJECTED: allowance already used (current rule)",
  },
  {
    key: "e-frankfurt-faded", label: "Faded, crumpled Frankfurt receipt (German)", lang: "de", merchant: "Kiosk Steig Null", faded: true,
    header: ["KIOSK STEIG NULL", "Flughafen Frankfurt, Terminal 1, Gate A", "Musterplatz 0, 00000 Frankfurt am Main", "USt-IdNr. DE000000000"],
    meta: ["Bon 0000-0099"], date: "2026-01-24", time: "21:05", dateText: "24.01.2026  21:05", currency: "EUR",
    lines: [{ text: "Sandwich Huhn", amount: 6.4, category: "FOOD" }, { text: "Orangensaft 0,33 l", amount: 3.1, category: "NON_ALCOHOLIC_DRINK" }, { text: "Schokoriegel", amount: 1.6, category: "FOOD" }],
    vatText: ["Enth. MwSt. 19%          1,77"], payment: "Kartenzahlung  **** 0000",
    scenario: "A", remainingCents: WITH_ALLOWANCE, expectedDecision: "HUMAN_REVIEW", expectedApprovedCents: 0, expectedReason: "faded print: the total and amounts cannot be read with confidence",
    typicalPassenger: "HUMAN_REVIEW (or REJECTED for the allowance once a person reads it)",
  },
  {
    key: "f-frankfurt-total-mismatch", label: "Frankfurt snack bar, lines do not add up (German)", lang: "de", merchant: "Snackbar Terminal Eins",
    header: ["SNACKBAR TERMINAL EINS", "Flughafen Frankfurt, Terminal 1, Halle A", "Beispielweg 0, 00000 Frankfurt am Main", "USt-IdNr. DE000000000"],
    meta: ["Beleg-Nr. 0000-5520"], date: "2026-01-24", time: "21:34", dateText: "24.01.2026  21:34", currency: "EUR",
    lines: [{ text: "Currywurst", amount: 5.9, category: "FOOD" }, { text: "Pommes klein", amount: 3.6, category: "FOOD" }, { text: "Cola 0,5 l", amount: 2.9, category: "NON_ALCOHOLIC_DRINK" }],
    printedTotal: 14.4, vatText: ["Enth. MwSt. 19%          2,30"], payment: "Kartenzahlung  **** 0000",
    scenario: "A", remainingCents: WITH_ALLOWANCE, expectedDecision: "HUMAN_REVIEW", expectedApprovedCents: 0, expectedReason: "the lines add up to 12.40 EUR but the total says 14.40 EUR",
    typicalPassenger: "HUMAN_REVIEW",
  },
  {
    key: "g-dubai-restaurant-aed", label: "Dubai restaurant in AED, before the disruption (Arabic and English)", lang: "ar", dir: "rtl", merchant: "Quiet Oasis Restaurant",
    header: ["مطعم الواحة الهادئة", "QUIET OASIS RESTAURANT", "دبي - شارع المثال 0", "Dubai, Example Street 0", "TRN 000000000000000", "هاتف / Tel +971 0 000 0000"],
    meta: ["فاتورة ضريبية / Tax invoice 0000-0120"], date: "2026-01-20", time: "13:12", dateText: "20/01/2026  13:12", currency: "AED",
    lines: [{ text: "حمص / Hummus", amount: 28, category: "FOOD" }, { text: "دجاج مشوي / Grilled chicken", amount: 54, category: "FOOD" }, { text: "ليمون بالنعناع / Lemon mint", amount: 18, category: "NON_ALCOHOLIC_DRINK" }],
    vatText: ["شامل ضريبة القيمة المضافة 5%: 4.76", "Incl. VAT 5%                4.76"], payment: "بطاقة / Card  **** 0000",
    scenario: "A", remainingCents: WITH_ALLOWANCE, expectedDecision: "HUMAN_REVIEW", expectedApprovedCents: 0, expectedReason: "dated 20 Jan 2026, four days before the scenario A disruption: outside the disruption window (AED converted at the demo rate)",
    typicalPassenger: "HUMAN_REVIEW: outside disruption window",
  },
];

function total(r: Receipt) {
  return r.printedTotal ?? Math.round(r.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}

function html(r: Receipt): string {
  const fmt = r.lang === "en" || r.lang === "ar" ? en : de;
  const rows = r.lines.map((l) => `<div class="row"><span>${ar(l.text)}</span><span>${fmt(l.amount)}</span></div>`).join("");
  return `<!doctype html><html lang="${r.lang}"><head><meta charset="utf-8"><style>
    body { margin: 0; background: transparent; }
    .r { position: relative; width: 420px; padding: 28px 26px 34px; background: #fbfaf5; color: ${r.faded ? "#b3afa6" : "#1b1b1b"}; font: 17px/1.45 "Courier New", monospace; }
    .ar { font-family: "Segoe UI", Tahoma, Arial, sans-serif; direction: rtl; unicode-bidi: isolate; }
    .fade::after { content: ""; position: absolute; left: 0; right: 0; top: 22%; bottom: 0; background: linear-gradient(to bottom, rgba(251,250,245,0.35), rgba(251,250,245,0.85)); }
    .c { text-align: center; } .b { font-weight: bold; font-size: 21px; letter-spacing: 1px; }
    .row { display: flex; justify-content: space-between; gap: 12px; } .row span:first-child { flex: 1; }
    .sep { border-top: 2px dashed currentColor; margin: 12px 0; opacity: .7; }
    .tot { font-weight: bold; font-size: 20px; }
    .small { font-size: 13px; } .foot { font-size: 12px; margin-top: 18px; text-align: center; }
    [dir=rtl] .row { flex-direction: row-reverse; }
  </style></head><body><div class="r${r.faded ? " fade" : ""}">
    ${r.header.map((h, i) => `<div class="c ${i === 0 ? "b" : "small"}">${ar(h)}</div>`).join("")}
    <div class="sep"></div>
    ${r.meta.map((m) => `<div class="small">${ar(m)}</div>`).join("")}
    <div class="small">${r.dateText}</div>
    <div class="sep"></div>
    ${rows}
    <div class="sep"></div>
    ${r.lang === "ar" ? `<div class="row tot"><span>${ar("الإجمالي")}</span><span></span></div>` : ""}
    <div class="row tot"><span>${r.lang === "de" ? "SUMME EUR" : r.lang === "it" ? "TOTALE EURO" : `TOTAL ${r.currency}`}</span><span>${fmt(total(r))}</span></div>
    ${r.vatText.map((v) => `<div class="small">${ar(v)}</div>`).join("")}
    <div class="sep"></div>
    <div class="small">${ar(r.payment)}</div>
    <div class="foot">Sample receipt - Groundside demo</div>
  </div></body></html>`;
}

/** Plain table, receipt slightly rotated and skewed, soft shadow, uneven light, noise, blur. */
async function photograph(png: Buffer, r: Receipt, seed: number): Promise<Buffer> {
  const W = 1400, H = 1900;
  let paper = sharp(png).ensureAlpha();
  if (r.faded) paper = paper.linear(0.55, 95).modulate({ brightness: 1.08 });
  const tilt = ((seed % 5) - 2) * 1.3 + 1.1;
  const skewed = await paper.affine([[1, 0.035], [-0.012, 1]], { background: { r: 0, g: 0, b: 0, alpha: 0 } }).rotate(tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(skewed).metadata();
  const scale = Math.min((W * 0.72) / meta.width!, (H * 0.86) / meta.height!);
  const rw = Math.round(meta.width! * scale), rh = Math.round(meta.height! * scale);
  const receipt = await sharp(skewed).resize(rw, rh).png().toBuffer();
  const shadow = await sharp(receipt).ensureAlpha().linear([0, 0, 0, 0.45], [20, 20, 20, 0]).blur(18).png().toBuffer();
  const left = Math.round((W - rw) / 2), top = Math.round((H - rh) / 2);
  const table = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b7ab97"/><stop offset="1" stop-color="#8f8472"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const light = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="l" cx="${30 + (seed % 3) * 15}%" cy="25%" r="85%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#000000" stop-opacity="0.32"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#l)"/></svg>`);
  const creases = r.faded
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s"><feGaussianBlur stdDeviation="2.5"/></filter></defs><g stroke="#3a342a" stroke-opacity="0.22" stroke-width="3" fill="none" filter="url(#s)"><path d="M${left} ${top + rh * 0.3} Q${left + rw * 0.5} ${top + rh * 0.36} ${left + rw} ${top + rh * 0.33}"/><path d="M${left} ${top + rh * 0.63} Q${left + rw * 0.45} ${top + rh * 0.57} ${left + rw} ${top + rh * 0.6}"/><path d="M${left + rw * 0.42} ${top} Q${left + rw * 0.47} ${top + rh * 0.5} ${left + rw * 0.44} ${top + rh}"/><path d="M${left + rw * 0.72} ${top + rh * 0.45} Q${left + rw * 0.8} ${top + rh * 0.7} ${left + rw * 0.76} ${top + rh}"/></g></svg>`)
    : null;
  // Deterministic noise: a small grey speckle tile, scaled up.
  const nW = 350, nH = 475, noise = Buffer.alloc(nW * nH);
  let x = seed * 9301 + 49297;
  for (let i = 0; i < noise.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = 128 + ((x >> 16) % 40) - 20;
  }
  const noiseTile = await sharp(noise, { raw: { width: nW, height: nH, channels: 1 } }).resize(W, H).png().toBuffer();
  const layers = [
    { input: shadow, left: left + 14, top: top + 18 },
    { input: receipt, left, top },
    ...(creases ? [{ input: creases, blend: "multiply" as const }] : []),
    { input: light, blend: "soft-light" as const },
    { input: noiseTile, blend: "overlay" as const },
  ];
  return sharp(table).composite(layers).blur(r.faded ? 1.4 : 0.7).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

async function main() {
  const dir = path.join(process.cwd(), "fixtures", "receipts");
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();
  let seed = 1;
  for (const r of RECEIPTS) {
    await page.setContent(html(r));
    await page.waitForTimeout(100);
    const png = await page.locator(".r").screenshot({ omitBackground: true });
    const jpg = await photograph(png, r, seed++);
    writeFileSync(path.join(dir, `${r.key}.jpg`), jpg);
    const sidecar = {
      synthetic: true,
      label: `Sample receipt: ${r.label}`,
      note: "Synthetic sample receipt generated by scripts/make-receipts.ts. Merchant, address, tax ID, phone and card are invented.",
      expected: { merchantName: r.merchant, date: r.date, time: r.time, currency: r.currency, total: total(r), lineItems: r.lines.map((l) => ({ description: l.text, amount: l.amount, category: l.category })) },
      decision: { scenario: r.scenario, remainingCents: r.remainingCents, expected: r.expectedDecision, approvedCents: r.expectedApprovedCents, why: r.expectedReason, typicalPassenger: r.typicalPassenger },
      readingMayBeUncertain: r.faded === true,
    };
    writeFileSync(path.join(dir, `${r.key}.json`), JSON.stringify(sidecar, null, 2) + "\n");
    console.log(`${r.key}.jpg ${(jpg.length / 1024).toFixed(0)} KB`);
  }
  await browser.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
