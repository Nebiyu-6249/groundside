# Deploy to Render

The hosted demo is one Render web service (`render.yaml`, free plan, Frankfurt) and a separate database, `groundside_hosted`, on the same Neon project as local development. Local `npm run reset-demo` runs never touch it.

`npm run deploy:render` does the whole deploy from the values already in `.env`, so nobody types secrets into a dashboard. It sends them only to Neon, Render and PayPal and prints none of them.

## What the owner does once

1. Create a Render account if you don't have one.
2. Create an API key under Account Settings, then API Keys.
3. In Notepad, add it to `.env` as `RENDER_API_KEY=...`.

## What the script does

```powershell
npm run deploy:render
```

1. **Database:** creates `groundside_hosted` if it is missing, applies the migrations and seeds the Quick run. It skips the seed if demo data already exists.
2. **Hosted login:** the duty manager's password is generated once and kept in `scripts/out/hosted-credentials.txt` (git-ignored). It is the login published for judges.
3. **Service:** creates the Render web service from `render.yaml`, or finds it by name. Values come from:
   - `render.yaml` for the fixed ones
   - `.env` for the secrets
   - the hosted database for `DATABASE_URL` and `DIRECT_URL`

   Render generates `SESSION_SECRET` itself.
4. **Webhook:** creates the PayPal sandbox webhook for `<service URL>/api/webhooks/paypal`, or reuses it, and sets `APP_BASE_URL` and `PAYPAL_WEBHOOK_ID` on the service. The local tunnel webhook stays as it is.
5. **Deploy:** triggers a deploy, waits until it is live (up to 30 minutes), then calls `/api/health`.

`npm run deploy:render -- --db-only` runs step 1 only. `npm run reset-demo:hosted` replaces the hosted demo data with a fresh Quick run.

## Rotating a secret

1. Change it at the source: Neon role password, PayPal app secret, or OpenAI key.
2. Put the new value in `.env`.
3. Run `npm run deploy:render` again. It updates every variable on the service and redeploys.

## Notes

- The free plan sleeps after about 15 minutes idle. The first request afterwards can take up to a minute while it wakes. Switch `plan` to `starter` in `render.yaml` for always-on during judging (`docs/OPEN_QUESTIONS.md` Q3).
- The build runs `prisma migrate deploy` because the free plan has no pre-deploy command. A failed migration fails the build, and the previous deploy keeps serving.
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is baked into the build, so a change needs a redeploy. The script always redeploys.

Sources: [Render API reference](https://api-docs.render.com/reference/create-service), [Render: Deploy a Next.js app](https://docs.render.com/deploy-nextjs-app), [Render Blueprint YAML reference](https://render.com/docs/blueprint-spec), [Prisma: Deploy to Render](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/traditional/deploy-to-render).
