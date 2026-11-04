# Deploy to Render

The hosted demo is one Render web service (`render.yaml`, free plan, Frankfurt) and a separate database, `groundside_hosted`, on the same Neon project as local development. Local `npm run reset-demo` runs never touch it.

`npm run deploy:render` does the whole deploy with the [Render CLI](https://render.com/docs/cli) and the values already in `.env`, so nobody types secrets into a dashboard. It sends them only to Neon, Render and PayPal and prints none of them.

## One-time setup

```powershell
winget install Render.CLI
render login
```

`render login` opens the Render dashboard in your browser. Click Authorize CLI there. The CLI keeps its own token; nothing goes into `.env`.

If you have more than one workspace, set the one to deploy into:

```powershell
render workspace set <id>
```

`render workspaces` lists the IDs.

## What the script does

```powershell
npm run deploy:render
```

1. **Database:** creates `groundside_hosted` if it is missing, applies the migrations and seeds the Quick run. It skips the seed if demo data already exists.
2. **Hosted login:** the duty manager's password is generated once and kept in `scripts/out/hosted-credentials.txt` (git-ignored). This is the login published for judges.
3. **Service:** creates the Render web service with `render services create`. It uses the settings in `render.yaml`, the secrets from `.env`, and the hosted database URLs. If the service already exists, it redeploys it with `render deploys create`.
   - `APP_BASE_URL` is not needed on Render. The app falls back to `RENDER_EXTERNAL_URL`, which Render sets itself (`src/lib/app-url.ts`).
4. **Webhook:** creates the PayPal sandbox webhook for `<service URL>/api/webhooks/paypal`, or reuses it.
   - `PAYPAL_WEBHOOK_ID` is not needed on Render. The app finds its webhook by URL on the first event (`resolveWebhookId` in `src/lib/paypal/webhooks.ts`).
   - The local tunnel webhook stays as it is, because `.env` sets `PAYPAL_WEBHOOK_ID` locally.
5. **Deploy check:** waits until the deploy is live (up to 30 minutes), then calls `/api/health`.

Other commands:
- `npm run deploy:render -- --db-only` runs step 1 only.
- `npm run reset-demo:hosted` replaces the hosted demo data with a fresh Quick run.
- `render logs -r <service id>` shows the service logs.

## Rotating a secret

1. Change it at the source: the Neon role password, the PayPal app secret, or the OpenAI key.
2. Put the new value in `.env`.
3. Change the same variable on the service. The CLI can create a service with variables but cannot change them later, so either:
   - edit the variable in the Render dashboard (Environment) and save, or
   - add `RENDER_API_KEY` (Account Settings, API Keys) to `.env` and run `npm run deploy:render` again. It then updates every variable through Render's REST API and redeploys.

## Notes

- **Sleeping:** the free plan sleeps after about 15 minutes idle. The first request afterwards can take up to a minute while it wakes. Switch `plan` to `starter` in `render.yaml` for always-on during judging (`docs/OPEN_QUESTIONS.md` Q3).
- **Migrations:** the build runs `prisma migrate deploy` because the free plan has no pre-deploy command. A failed migration fails the build, and the previous deploy keeps serving.
- **Auto-deploy:** every push to `main` deploys again.

Sources:
- [Render CLI](https://render.com/docs/cli)
- [Render CLI reference](https://render.com/docs/cli-reference)
- [Render API reference](https://api-docs.render.com/reference/create-service)
- [Render: Deploy a Next.js app](https://docs.render.com/deploy-nextjs-app)
- [Prisma: Deploy to Render](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/traditional/deploy-to-render)
