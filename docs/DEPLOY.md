# Deploy to Render

The hosted demo is one Render web service (`render.yaml`, free plan, Frankfurt) and a Neon Postgres database. The account steps are done by the owner in the Render, Neon and PayPal dashboards. Secrets are typed only into those dashboards and into `.env.hosted` in Notepad, never into chat.

## 1. Before you start

1. Rotate the secrets that appeared in chat during development:
   - Neon: reset the database role password.
   - PayPal sandbox: create a new secret for the "Groundside EU" app. Then delete the old one.
   - Put the new values in `.env` (Notepad) and check the app locally with `npm run dev -- --port 3001`.
2. Create a separate Neon branch for the hosted demo:
   - In Neon, go to Branches, then New branch, and name it `hosted`.
   - Copy its pooled and direct connection strings.
   - A separate branch means `npm run reset-demo` on your machine never wipes the hosted demo.
3. Choose the hosted duty-manager password. It will be published in the README for judges. The data is sandbox-only, so this is acceptable, but do not reuse a real password.

## 2. Create the service

1. In Render, choose **New**, then **Blueprint**, then connect the GitHub repo `Nebiyu-6249/groundside`.
2. Render reads `render.yaml` and asks for every value marked `sync: false`. Fill them in from this table:

   | Variable | Value |
   |---|---|
   | `APP_BASE_URL` | Leave as `https://groundside.onrender.com` for now. Correct it after the first deploy if Render picks another name. |
   | `DATABASE_URL` | Pooled string from the `hosted` Neon branch, ending `sslmode=verify-full` |
   | `DIRECT_URL` | Direct string from the `hosted` branch |
   | `PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Sandbox app client ID (the same value in both) |
   | `PAYPAL_CLIENT_SECRET` | The new sandbox secret |
   | `PAYPAL_WEBHOOK_ID` | Enter `pending` for now (step 3) |
   | `PAYPAL_POOL_RECEIVERS` | Same as your local `.env` |
   | `OPENAI_API_KEY` | Your key. The daily budget is capped by `AI_DAILY_BUDGET_USD` (3 USD) |
   | `OPENAI_MODEL_ASSESS`, `OPENAI_MODEL_VISION`, `OPENAI_MODEL_TEXT` | Same as your local `.env` |
   | `DEMO_OPS_EMAIL` | `duty.manager@demo.groundside.test` |
   | `DEMO_OPS_PASSWORD` | The hosted password from step 1.3 |
   | `OWNER_EMAIL`, `OWNER_PASSWORD` | Your own login. It is not published |

   Render generates `SESSION_SECRET` itself.
3. Click **Apply**. The build:
   1. installs the packages
   2. runs `prisma migrate deploy` against `DIRECT_URL`
   3. builds Next.js

   It takes a few minutes. The service is live when `https://<service>.onrender.com/api/health` reports the database as up.

## 3. After the first deploy

1. **Base URL:** if the service URL differs from `APP_BASE_URL`, edit the variable in Render (Environment), then save and deploy.
2. **Webhook:**
   1. In the PayPal developer dashboard, open the sandbox app and add a webhook at `https://<service>.onrender.com/api/webhooks/paypal` for all events.
   2. Copy its ID into `PAYPAL_WEBHOOK_ID` in Render, then save and deploy.
   3. Keep the local tunnel webhook; each environment verifies against its own ID.
3. **Seed the hosted database** from your machine:
   1. In Notepad, create `C:\dev\groundside\.env.hosted`. It is git-ignored. Put these lines in it, copying the values from Render:
      ```
      DATABASE_URL=
      DIRECT_URL=
      DEMO_OPS_EMAIL=
      DEMO_OPS_PASSWORD=
      OWNER_EMAIL=
      OWNER_PASSWORD=
      ```
   2. Run:
      ```powershell
      npm run seed:hosted
      ```
      Values in `.env.hosted` override `.env`. The script prints the target database host (no credentials) and refuses to run without `DEMO_OPS_PASSWORD`. Use `npm run reset-demo:hosted` to restore the hosted demo later.
4. **Gate 3 check:** sign in at `https://<service>.onrender.com/login` and run the Quick run on DEMO 412:
   1. Run the assessment.
   2. Approve.
   3. Simulate passenger responses.
   4. Watch payouts reach SUCCESS.
   5. Open a passenger page.

## Notes

- The free plan sleeps after about 15 minutes idle. The first request afterwards takes up to a minute while it wakes. Switch `plan` to `starter` in `render.yaml` for always-on during judging (`docs/OPEN_QUESTIONS.md` Q3).
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is baked into the build, so changing it needs a redeploy. Render's "Save and deploy" does that.
- Migrations run in the build command because the free plan has no pre-deploy command. A failed migration fails the build, and the previous deploy keeps serving.

Sources: [Render: Deploy a Next.js app](https://docs.render.com/deploy-nextjs-app), [Render Blueprint YAML reference](https://render.com/docs/blueprint-spec), [Prisma: Deploy to Render](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/traditional/deploy-to-render).
