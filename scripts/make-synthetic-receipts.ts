// npm run receipts:synthetic
// Draws synthetic receipt images for tests and the A2 eval (fixtures/receipts-synthetic/). Each
// image says "SYNTHETIC TEST RECEIPT" and has a sidecar with the fields it shows, so the eval can
// compare the vision model's reading with the truth. Real photos supplied by the owner go in
// fixtures/receipts/ instead (SPEC 8.2).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

interface Line { description: string; amount: number; category: string }
interface Spec {
  key: string;
  merchant: string;
  location: string;
  date: string;
  time: string;
  currency: string;
  lines: Line[];
  /** Printed total; differs from the sum of lines only for the mismatch case. */
  total?: number;
  note: string;
}

const SPECS: Spec[] = [
  { key: "airport-cafe", merchant: "Gate Cafe", location: "Frankfurt Airport, Terminal 1, Gate B44", date: "2026-01-24", time: "20:41", currency: "EUR", lines: [{ description: "Chicken sandwich", amount: 8.5, category: "FOOD" }, { description: "Cappuccino", amount: 3.9, category: "NON_ALCOHOLIC_DRINK" }, { description: "Still water 0.5 l", amount: 2.6, category: "NON_ALCOHOLIC_DRINK" }], note: "Within the window, sums correctly" },
  { key: "dinner-with-beer", merchant: "Runway Bistro", location: "Frankfurt Airport, Terminal 1, Level 2", date: "2026-01-24", time: "22:12", currency: "EUR", lines: [{ description: "Pasta arrabbiata", amount: 14.5, category: "FOOD" }, { description: "Draught beer 0.4 l", amount: 6.2, category: "ALCOHOL" }, { description: "Cola 0.33 l", amount: 3.8, category: "NON_ALCOHOLIC_DRINK" }], note: "Alcohol must be excluded" },
  { key: "outside-window", merchant: "Main Street Deli", location: "Frankfurt am Main, Kaiserstrasse 12", date: "2026-01-20", time: "12:05", currency: "EUR", lines: [{ description: "Soup of the day", amount: 6.9, category: "FOOD" }, { description: "Orange juice", amount: 3.4, category: "NON_ALCOHOLIC_DRINK" }], note: "Four days before the flight" },
  { key: "sum-mismatch", merchant: "Sky Snacks", location: "Frankfurt Airport, Terminal 1, Gate A12", date: "2026-01-24", time: "21:30", currency: "EUR", lines: [{ description: "Pretzel", amount: 3.5, category: "FOOD" }, { description: "Tea", amount: 2.5, category: "NON_ALCOHOLIC_DRINK" }, { description: "Fruit cup", amount: 6.0, category: "FOOD" }], total: 14.0, note: "Lines sum to 12.00, total says 14.00" },
  { key: "airport-hotel", merchant: "Airport Rest Hotel", location: "Frankfurt Airport, Hugo-Eckener-Ring", date: "2026-01-25", time: "07:15", currency: "EUR", lines: [{ description: "Room, 1 night, 24-25 Jan", amount: 129.0, category: "HOTEL" }], note: "Hotel night, under the cap" },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const money = (n: number) => n.toFixed(2);

function svg(s: Spec): string {
  const total = s.total ?? s.lines.reduce((a, l) => a + l.amount, 0);
  const rows = s.lines.map((l, i) => `<text x="40" y="${300 + i * 44}">${esc(l.description)}</text><text x="560" y="${300 + i * 44}" text-anchor="end">${money(l.amount)}</text>`).join("");
  const yTotal = 300 + s.lines.length * 44 + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${yTotal + 200}" font-family="Courier New, monospace" font-size="26" fill="#111">
<rect width="100%" height="100%" fill="#fbfaf6"/>
<text x="300" y="60" text-anchor="middle" font-size="22" fill="#a00">SYNTHETIC TEST RECEIPT</text>
<text x="300" y="120" text-anchor="middle" font-size="34" font-weight="bold">${esc(s.merchant)}</text>
<text x="300" y="160" text-anchor="middle" font-size="20">${esc(s.location)}</text>
<text x="40" y="230">${s.date}  ${s.time}</text>
${rows}
<line x1="40" y1="${yTotal - 30}" x2="560" y2="${yTotal - 30}" stroke="#111" stroke-width="2"/>
<text x="40" y="${yTotal}" font-weight="bold">TOTAL ${s.currency}</text><text x="560" y="${yTotal}" text-anchor="end" font-weight="bold">${money(total)}</text>
<text x="300" y="${yTotal + 80}" text-anchor="middle" font-size="18">Thank you. Not a real receipt.</text>
</svg>`;
}

async function main() {
  const dir = path.join(process.cwd(), "fixtures", "receipts-synthetic");
  mkdirSync(dir, { recursive: true });
  for (const s of SPECS) {
    await sharp(Buffer.from(svg(s))).png().toFile(path.join(dir, `${s.key}.png`));
    const total = s.total ?? Math.round(s.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    writeFileSync(
      path.join(dir, `${s.key}.json`),
      JSON.stringify({ synthetic: true, note: s.note, expected: { merchantName: s.merchant, merchantLocation: s.location, date: s.date, time: s.time, currency: s.currency, total, lineItems: s.lines } }, null, 2) + "\n",
    );
  }
  console.log(`${SPECS.length} synthetic receipts written to ${path.relative(process.cwd(), dir)}`);
}

main();
