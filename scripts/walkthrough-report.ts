// npm run walkthrough:report
// Turns docs/walkthrough/results.json (from npm run walkthrough) into docs/GATE4_WALKTHROUGH.md.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface StepResult { n: number; title: string; status: string; seconds: number; shots: string[]; notes: string[]; byHand?: boolean }
const data = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "walkthrough", "results.json"), "utf8")) as { base: string; at: string; measured: Record<string, string>; results: StepResult[]; note?: string };

const steps = data.results.sort((a, b) => a.n - b.n);
const coldFile = path.join(process.cwd(), "docs", "walkthrough", "cold-start.json");
const cold = existsSync(coldFile) ? (JSON.parse(readFileSync(coldFile, "utf8")) as { at: string; idleMinutesBefore: number; firstResponse: { status: number; seconds: number }; landingServedSeconds: number; firstJudgeStartSeconds: number }) : null;
const count = (s: string) => steps.filter((x) => x.status === s).length;
const lines = [
  "# Gate 4 walkthrough",
  "",
  `Automated run of every step in \`docs/DEMO.md\` section 3 against ${data.base} on ${data.at.replace("T", " ").slice(0, 16)} UTC, by \`npm run walkthrough\` (\`scripts/walkthrough.ts\`):`,
  "- a fresh browser with no cookies, as a new judge",
  "- the ops console at 1920x1080 and passenger pages at 390x844",
  "- a short slowMo",
  "",
  "Videos are in `docs/walkthrough/video/` (not committed). Screenshots are below.",
  ...(data.note ? ["", `Note: ${data.note}`] : []),
  "",
  `**Result: ${count("PASS")} PASS, ${count("NEEDS HUMAN")} NEEDS HUMAN, ${count("FAIL")} FAIL** out of ${steps.length} steps${steps.some((x) => x.byHand) ? ` (step${steps.filter((x) => x.byHand).length > 1 ? "s" : ""} ${steps.filter((x) => x.byHand).map((x) => x.n).join(", ")} done by hand by the owner)` : ""}.`,
  "",
  "## Measured",
  "",
  `- **Start-up in the walkthrough run:** ${data.measured.coldStart ?? "not measured"}.${/HTTP 200/.test(data.measured.coldStart ?? "") ? " The instance was already awake from an earlier run, so this run did not measure a cold wake. An earlier run hit a sleeping instance, which first answered HTTP 503 while Render woke it." : ""}`,
  ...(cold ? [`- **Cold start, measured separately** (\`npm run cold-start -- --wait-minutes=${cold.idleMinutesBefore}\`, ${cold.at.replace("T", " ").slice(0, 16)} UTC, after ${cold.idleMinutesBefore} minutes with no requests on Render's free plan): the first response was HTTP ${cold.firstResponse.status} after ${cold.firstResponse.seconds} s while Render woke the instance; the landing page was served after ${cold.landingServedSeconds} s; the first "Start the judge demo" then took ${cold.firstJudgeStartSeconds} s to show the Evidence tab.`] : []),
  `- **Approval to first passenger paid:** ${data.measured.overview ?? "not measured"} on the Overview tab (from the decision to the first PayPal SUCCESS after it). That was ${data.measured.clickToPaid ?? "not measured"}.`,
  `- **Money arrived:** ${data.measured.paypalProof ?? "not proven"}. This replaces logging in to the receiver account: PayPal's own API reports the payout item as SUCCESS with a transaction ID.`,
  "",
  "## Steps",
  "",
  "| Step | Result | Time | Screenshots | Notes |",
  "|---|---|---|---|---|",
  ...steps.map((s) => `| ${s.n}. ${s.title} | ${s.status}${s.byHand ? " (by hand)" : ""} | ${s.byHand ? "-" : `${s.seconds} s`} | ${s.shots.map((f) => `[${f.replace(/^\d+-/, "").replace(".png", "")}](walkthrough/${f})`).join(", ")} | ${s.notes.join("<br>").replaceAll("|", "/")} |`),
  "",
];
if (steps.some((s) => s.status === "NEEDS HUMAN" || s.byHand)) {
  lines.push(
    "## Step 11 for the owner (about 2 minutes)",
    "",
    "PayPal's sandbox checkout asks for the buyer's password, which Claude Code does not type. In a normal browser window (Chrome, Edge or Firefox):",
    "",
    "1. Open https://groundside.onrender.com/demo/book.",
    "2. Click the yellow **PayPal** button. A PayPal sandbox window opens.",
    "3. Log in with the sandbox buyer account (its email and password are in the PayPal developer dashboard under Sandbox, Accounts, then the personal account, then View/edit account).",
    "4. Click **Complete Purchase** (or **Pay Now**). The window closes, and the page shows the booking with Order status COMPLETED and a Capture ID.",
    "5. Click **Join the cancelled flight**. Your passenger page opens.",
    "6. Under Your journey, choose **Do not travel; refund my ticket within 7 days**, then click **Save my choice**.",
    "7. Check that the page shows **Refund status: refunded to your PayPal payment**. It can take a few seconds; reload once if needed.",
    "",
    "Optional: in the ops console (Payouts tab of DEMO 412), the Refunds table shows the PayPal refund ID with status COMPLETED.",
    "",
  );
}
writeFileSync(path.join(process.cwd(), "docs", "GATE4_WALKTHROUGH.md"), lines.join("\n"));
console.log(`docs/GATE4_WALKTHROUGH.md written: ${count("PASS")} PASS, ${count("NEEDS HUMAN")} NEEDS HUMAN, ${count("FAIL")} FAIL`);
