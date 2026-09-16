# Deploying Plan2Done (Web + Play Store)

Plan2Done is a PWA (installable web app). Shipping to the Play Store is a 3-step path:

1. Deploy the **API** to a public HTTPS URL.
2. Deploy the **web** app to a public HTTPS URL (it's already a valid PWA — manifest, icons, service worker).
3. Wrap the deployed PWA into an Android app bundle (**TWA**) and submit it to Google Play.

---

## 1. Deploy the API

Any Node host works (Render, Railway, Fly.io, Google Cloud Run). Example with **Render**:

- New **Web Service** → connect the repo.
- Root directory: `apps/api`
- Build command: `npm install --ignore-scripts && npm run prisma:generate && npm run build`
- Start command: `npm run start`
- Environment variables:
  - `DATABASE_URL`, `DIRECT_URL` — your Supabase connection strings
  - `JWT_SECRET` — a long random string
  - `WEB_ORIGIN` — your web app's URL (e.g. `https://plan2done.vercel.app`)
  - `ANTHROPIC_API_KEY` *(optional)* — enables real AI
- Run migrations once against the production DB: `npm run prisma:migrate` (or `prisma migrate deploy`).

## 2. Deploy the web app (Vercel recommended)

- Import the repo in Vercel.
- Root directory: `apps/web`
- Environment variable: `NEXT_PUBLIC_API_URL` = your API URL (e.g. `https://plan2done-api.onrender.com`)
- Deploy. You'll get an HTTPS URL like `https://plan2done.vercel.app`.

> Verify the PWA: open the URL in Chrome → DevTools → **Application → Manifest** (should list the icons) and **Service Workers** (should be activated). Chrome will also show an **Install** option — that confirms it's Play-Store-ready.

## 3. Package for the Play Store (Trusted Web Activity)

A **TWA** runs your PWA full-screen inside a lightweight Android wrapper. Two ways:

### Easiest: PWABuilder (no local tooling)

1. Go to <https://www.pwabuilder.com>, enter your web URL.
2. It scores the PWA and, under **Package for stores → Android**, generates a signed **`.aab`** plus a `assetlinks.json`.
3. Download the package (keep the signing key it gives you — you need the same key for every future update).

### Or: Bubblewrap CLI (more control)

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR_DOMAIN/manifest.webmanifest
bubblewrap build      # produces app-release-bundle.aab + a signing key
```

### Remove the browser address bar (Digital Asset Links)

For the app to run full-screen (no URL bar), verify domain ownership:

1. Take the SHA-256 fingerprint of your signing key (PWABuilder/Bubblewrap prints it).
2. Serve it at `https://YOUR_DOMAIN/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.plan2done.twa",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

For the Next.js app, put a file at `apps/web/public/.well-known/assetlinks.json` so it's served at that path.

### Submit to Google Play

1. Create a **Google Play Developer** account (one-time \$25).
2. **Create app** → fill the store listing (name, description, screenshots — capture the mobile views, use `icon-512.png` for the store icon).
3. Upload the `.aab` to a testing track (Internal testing first), then Production.
4. Complete the content rating, privacy policy URL, and data-safety form, then submit for review.

---

## Notes

- **Same signing key forever** — losing it means you can't push updates. Back it up (or use Play App Signing).
- **Privacy policy** is required by Google because the app collects an email/password. Host a simple page and link it in the listing.
- Updating the app later: because it's a TWA, most changes ship instantly by redeploying the web app — you only rebuild/resubmit the `.aab` when you change the icon, name, or Android wrapper config.
