# Groundside: start here (for Nebiyu)

This kit sets up Claude Code on your friend's Windows machine to build Groundside for the PayPal AI Hackathon. Claude Code on that machine has none of our chat history, so everything it needs is in these files.

| File | Who reads it | What it is |
|---|---|---|
| `START_HERE.md` | You | Setup steps, the first message to paste, and how to run the phases |
| `CLAUDE.md` | Claude Code (loaded automatically) | Rules, stack, Windows environment, phase tracker |
| `docs/SPEC.md` | Claude Code | What to build, in detail |
| `docs/RESEARCH.md` | Claude Code and you | Verified facts with sources, plus what must not be claimed |
| `docs/DEMO.md` | Claude Code and you | Demo scenarios, video script, Devpost text, submission checklist |
| `docs/OPEN_QUESTIONS.md` | You | Decisions only you can make |

Deadline: Thursday Nov 12, 12:00 PM Pacific = midnight going into Friday Nov 13 in Dubai. Our internal deadline is Nov 12, 18:00 Dubai. The early eligibility check is "submit by Thursday Nov 5".

---

## 1. Use your own accounts, not your friend's

The rules require the project to be solely owned by you. Every account below must be yours.

- GitHub: `Nebiyu-6249` (the repo will be public with an MIT license)
- PayPal Developer (sandbox): https://developer.paypal.com
- OpenAI API key with prepaid credits (a ChatGPT subscription is not API access)
- Neon (Postgres): https://neon.tech
- Render (hosting): https://render.com

Using your friend's Claude Code subscription is fine. If your friend writes code, designs or edits the video, add them as a teammate on Devpost instead of leaving them out.

## 2. Install the tools (PowerShell, once)

Open PowerShell (not as Administrator) and run these one at a time:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Cloudflare.cloudflared
```

Close PowerShell, open a new one, then check:

```powershell
git --version
node -v
npm -v
cloudflared --version
claude --version
```

- `node -v` must print v22 or later.
- If `claude` isn't found, install Claude Code: `irm https://claude.ai/install.ps1 | iex`, then open a new PowerShell.
- With Git for Windows installed, Claude Code runs its own shell commands in Git Bash. Your own terminal stays PowerShell. The kit accounts for both.

## 3. Create the project folder

```powershell
mkdir C:\dev\groundside
cd C:\dev\groundside
```

Copy the kit into it so the folder looks like this:

```
C:\dev\groundside\
  CLAUDE.md
  START_HERE.md
  docs\
    SPEC.md
    RESEARCH.md
    DEMO.md
    OPEN_QUESTIONS.md
```

Keep the path short and without spaces. Everything in this folder, including these planning docs, will end up in the public repo. That's fine (nothing in them is secret), but never put keys, passwords or private notes in them.

Set your own name on the commits in this folder only (your friend's global Git settings stay untouched):

```powershell
git init
git config user.name "Nebiyu Gemedu"
git config user.email "<the email on your GitHub account>"
```

The first `git push` opens a browser window to sign in to GitHub: sign in as `Nebiyu-6249`, not as your friend. If your friend is already signed in to GitHub on this PC, Git will silently push as them: first open Credential Manager > Windows Credentials and remove `git:https://github.com` (your friend can sign back in later). Optional but useful: `winget install GitHub.cli`, then `gh auth login` (as `Nebiyu-6249`) so Claude Code can create the repo for you.

## 4. PayPal sandbox setup (click-through, 15 minutes)

In https://developer.paypal.com, go to **Testing Tools > Sandbox Accounts**:

1. **Create a business account** with "Create custom account": type Business, country **Germany**, currency **EUR**, and the largest PayPal balance the form allows (try 1,000,000 EUR; if it refuses, use its maximum and note it). This is the "airline".
2. **Create 10 personal accounts**, country Germany. These are the demo passenger pool. Their sandbox emails go into `PAYPAL_POOL_RECEIVERS` in `.env` later (comma-separated). Keep a note of them in a text file, not in chat.
3. **Create 1 more personal account** as the ticket buyer for the refund demo. Judges will log in to it, so give it a password you use nowhere else.

Then go to **Apps & Credentials** (Sandbox):

4. Create an app, type Merchant, linked to the German business account.
5. Copy the Client ID and Secret into the `.env` file later (step 6). Never paste them into Claude Code's chat.
6. In the app's features list, make sure **Payouts** is ticked if it appears. If the Payouts test in Phase 0 fails with a permissions error, ask in the PayPal Discord (https://discord.gg/sJ2G6DyvSK) the same day.

Webhooks are set up in Phase 0, when there's a URL to point them at.

## 5. Neon and OpenAI

- Neon: create a project in an EU region and copy two connection strings, the pooled one (`DATABASE_URL`) and the direct one (`DIRECT_URL`).
- OpenAI: create an API key and add about $10 of credits. Claude Code will look up current model names before filling them in.

## 6. Secrets go in `.env`, edited in Notepad

Claude Code will create `.env.example`. Copy it and open it in Notepad:

```powershell
copy .env.example .env
notepad .env
```

- Fill the values in Notepad and save. Notepad on Windows 11 saves UTF-8, which is correct.
- Don't write `.env` with PowerShell `echo` or `>>`. That saves UTF-16 and breaks the app.
- Never paste keys into Claude Code, into our chat, or into screenshots. If a key leaks, revoke it and make a new one.

## 7. Start Claude Code and paste the first message

```powershell
cd C:\dev\groundside
claude
```

Paste this as your first message:

```
You are building Groundside for the PayPal AI Hackathon. Read CLAUDE.md fully, then docs/SPEC.md, docs/RESEARCH.md, docs/DEMO.md and docs/OPEN_QUESTIONS.md. Do not write code yet.

Reply with:
1. A 10-line summary of what you are building and the three golden rules you consider most important.
2. The Phase 0 plan as a checklist.
3. Any contradictions, gaps or risks you found in the docs.
4. The exact manual steps you need me to do (PayPal dashboard, Neon, Render, .env), in order.

Then wait for my approval.
```

Claude Code asks permission before running commands or editing files. Read each request and approve it; don't start it with flags that skip permissions. If your friend's plan hits its usage limit mid-phase, stop there: `docs/HANDOFF.md` lets you continue later or from another account (section 9).

## 8. How to run the phases

Claude Code stops at the end of every phase and reports. At each stop:

1. Read the report. Run the check commands it lists in your own PowerShell window.
2. Open the app in the browser and look at what it says it built.
3. Reply briefly in your own words, for example: `Approved. Continue to Phase 1.` or `Fix X first: <what you saw>.` Short typed replies work better than pasting long blocks.
4. If anything looks wrong or you're unsure, bring the report to our chat. Remove any keys from it first.

| Phase | Target (Dubai time) | Gate |
|---|---|---|
| 0. Scaffold + PayPal spike | Tue Nov 3 | Payouts, webhooks and refunds proven in sandbox |
| 1. Data + EU261 engine + rule pack | Tue Nov 3 to Wed Nov 4 | Engine tests pass; rule pack verified |
| 2. Weather evidence + AI assessment + evals | Wed Nov 4 | Eval report passes |
| 3. Ops console + payouts + basic passenger page + deploy | Thu Nov 5 | Hosted URL works; early Devpost submission |
| 4. Full passenger page, receipts, refunds, Q&A | Fri Nov 6 to Sun Nov 8 | End-to-end demo path works |
| 5. Hardening, design pass, README, video | Mon Nov 9 to Wed Nov 11 | Submission checklist complete |
| Final submit | Thu Nov 12, by 18:00 | Devpost submitted |

## 9. If the Claude Code session or account changes

Start the new session in the same folder and paste:

```
Read CLAUDE.md, then docs/HANDOFF.md and docs/PROGRESS.md. Summarize where the project stands and what the next step is, then wait for my approval.
```

## 10. Before you leave your friend's machine

```powershell
cd C:\dev\groundside
git status
git push
del .env
```

Then sign out of GitHub on that machine (Windows Credential Manager: remove `git:https://github.com`), and sign out of the PayPal, Neon, Render and OpenAI dashboards in the browser.

## 11. Things to prepare for later phases

- 3 to 5 photos of real meal or cafe receipts. Cover any card numbers or names first.
- A quiet place to record a 3-minute video, or an AI voiceover tool.
- Your answers to `docs/OPEN_QUESTIONS.md`.
