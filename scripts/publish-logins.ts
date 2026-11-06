// npm run publish-logins
// Writes the demo logins for judges into README.md and docs/DEVPOST_DRAFT.md, between the
// <!-- logins:start --> and <!-- logins:end --> markers. Sandbox-only accounts, published on
// purpose (the owner asked, 2026-11-06):
//   - the shared demo duty manager: from scripts/out/hosted-credentials.txt (made by deploy:render)
//   - the PayPal sandbox buyer for the booking page: SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD
//     in .env, if set
// Prints only which logins were written, never the values.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const START = "<!-- logins:start -->";
const END = "<!-- logins:end -->";

function demoLogin(): { email: string; password: string } | null {
  const file = path.join(root, "scripts", "out", "hosted-credentials.txt");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const email = /^email: (\S+)$/m.exec(text)?.[1];
  const password = /^password: (\S+)$/m.exec(text)?.[1];
  return email && password ? { email, password } : null;
}

function block(): { text: string; wrote: string[] } {
  const demo = demoLogin();
  const buyerEmail = process.env.SANDBOX_BUYER_EMAIL?.trim();
  const buyerPassword = process.env.SANDBOX_BUYER_PASSWORD?.trim();
  const wrote: string[] = [];
  const lines = ["- **No login needed:** press **Start the judge demo** on https://groundside.onrender.com for your own copy of a scenario (24 hours)."];
  if (demo) {
    lines.push(`- **Shared demo duty manager** (optional, at /login): email \`${demo.email}\`, password \`${demo.password}\`.`);
    wrote.push("demo duty manager");
  } else lines.push("- **Shared demo duty manager:** not published yet.");
  if (buyerEmail && buyerPassword) {
    lines.push(`- **PayPal sandbox buyer** (for the booking page, /demo/book): email \`${buyerEmail}\`, password \`${buyerPassword}\`.`);
    wrote.push("sandbox buyer");
  } else lines.push("- **PayPal sandbox buyer** (for the booking page): to be published.");
  lines.push("- Sandbox only: these accounts hold no real money, and every passenger, booking and the airline are demo data.");
  return { text: `${START}\n${lines.join("\n")}\n${END}`, wrote };
}

function main() {
  const { text, wrote } = block();
  for (const rel of ["README.md", path.join("docs", "DEVPOST_DRAFT.md")]) {
    const file = path.join(root, rel);
    const s = readFileSync(file, "utf8");
    const a = s.indexOf(START);
    const b = s.indexOf(END);
    if (a < 0 || b < a) throw new Error(`${rel} has no ${START} ... ${END} block`);
    writeFileSync(file, s.slice(0, a) + text + s.slice(b + END.length));
  }
  console.log(`Logins written to README.md and docs/DEVPOST_DRAFT.md: ${wrote.join(", ") || "none"}.`);
  if (!wrote.includes("sandbox buyer")) console.log("Sandbox buyer not written: add SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD to .env, then run this again.");
}

main();
