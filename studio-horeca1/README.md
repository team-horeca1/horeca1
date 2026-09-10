# Horeca1 Voices Studio

Sanity Studio for project `t7n5swxf` / dataset `production`.

From the repo root:

```bash
npm run sanity
```

Or:

```bash
cd studio-horeca1
npm install
npm run dev
```

Opens at http://localhost:3333. Log in with a Sanity account invited on the project.

Manage: https://www.sanity.io/manage/project/t7n5swxf

## Console steps (once)

1. Invite editors on project `t7n5swxf`.
2. CORS origins (Allow credentials): `http://localhost:3000` and `https://freshville.store`.
3. API tokens (never commit them — put in `.env.local` / droplet `.env.production`):
   - Viewer/read token → `SANITY_API_READ_TOKEN` (optional; published GROQ works without it)
   - Editor/write token → `SANITY_API_WRITE_TOKEN` (nominations + patching share-image URLs)
4. Webhook (document publish on `voiceStory`):
   - URL: `https://freshville.store/api/v1/voices/webhooks/sanity`
   - Secret: same value as `SANITY_WEBHOOK_SECRET` (HMAC `sanity-webhook-signature`)
   - Filter: `_type == "voiceStory"`
   - Local test: `http://localhost:3000/api/v1/voices/webhooks/sanity` only works if Sanity can reach your machine (tunnel).
