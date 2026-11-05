// npm run secret-scan
// Scans every commit's content (git log -p) and the working tree for secret-shaped strings:
// database URLs with passwords, OpenAI keys, PayPal-style client secrets, private keys, bearer
// tokens and generic "secret=" assignments with long values. Prints only where a match is
// (commit, file, pattern name), never the matched text. Exits 1 if anything is found.

import { execFileSync } from "node:child_process";

const PATTERNS: [string, RegExp][] = [
  ["database URL with password", /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["PayPal client secret", /\bE[A-Za-z0-9_-]{78,}\b/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Render API key", /\brnd_[A-Za-z0-9]{20,}/],
  ["bearer token", /Bearer\s+[A-Za-z0-9._-]{30,}/],
  ["secret assignment", /(?:SECRET|PASSWORD|API_KEY)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{24,}/],
];

// Lines that look like a pattern but are documentation or test fixtures.
const ALLOW = [/example\.com/, /API_KEY_GOES_HERE/, /\$\{/, /process\.env/, /test-key/];

function scan(text: string, where: (lineNo: number) => string, hits: string[]) {
  text.split("\n").forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line))) return;
    for (const [name, re] of PATTERNS) if (re.test(line)) hits.push(`${where(i)}: ${name}`);
  });
}

function main() {
  const hits: string[] = [];
  const log = execFileSync("git", ["log", "-p", "--all", "--no-color", "--format=commit %H"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  let commit = "";
  let file = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 15);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    // The lock file holds base64 integrity hashes that look like secrets.
    else if (line.startsWith("+") && !line.startsWith("+++") && file !== "package-lock.json") scan(line.slice(1), () => `${commit} ${file}`, hits);
  }
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of tracked) {
    if (/\.(png|jpe?g|webp|ico|woff2?)$/i.test(f) || f === "package-lock.json") continue;
    const text = execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    scan(text, (n) => `HEAD ${f}:${n + 1}`, hits);
  }
  const unique = [...new Set(hits)];
  if (unique.length) {
    console.log(`${unique.length} possible secret(s):`);
    for (const h of unique) console.log(`  ${h}`);
    process.exitCode = 1;
  } else {
    console.log(`No secrets found in ${tracked.length} tracked files or in git history.`);
  }
}

main();
