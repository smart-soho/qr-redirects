# Smart Soho QR

An internal Smart Soho dashboard for creating dynamic QR codes on `smartqr.uk`. Staff create a short scan link, set its destination, customise the QR colours and shapes, and download PNG or SVG artwork. The scan link stays the same when its destination is edited.

## How it works

- `smartqr.uk/admin/` is the staff dashboard.
- A QR code contains `https://smartqr.uk/<scan-link>`.
- A Cloudflare Pages Function looks up the scan link in D1 and returns a `302` redirect to its current destination. Redirect responses use `Cache-Control: no-store` so destination edits take effect on the next scan.
- Cloudflare Access protects the dashboard and management API. The code does no sign-in checking of its own, so Access must cover both `/admin` and `/api`.
- All five scan links from the [current GitHub Pages repository](https://github.com/smart-soho/qr-redirects) are included in `migrations/0002_legacy_links.sql` with their original path casing, including `/by.html`.

## Local preview

```sh
npm install
npm run dev
```

Open the Vite URL followed by `/admin/`. Local preview uses browser-only sample data so you can try the interface without a Cloudflare account. It does **not** create live redirects. To check the production build, run `npm run build`.

## Cloudflare Pages setup

1. Create a **D1 database** named `smartqr`, put its ID in `wrangler.toml`, then run `npm run db:migrate`. Wrangler records which of the `migrations/` files have run, so reruns are safe. (If you already applied migrations by hand, mark them as applied first or skip the ones already run.) Review the five existing destinations against the current GitHub repository just before cutover in case anyone edited them after this migration was prepared.
2. Push this dashboard to a **new GitHub repository** and create a **Cloudflare Pages** project connected to it. Leave the existing `qr-redirects` GitHub Pages repository and its `CNAME` untouched until cutover. Set build command to `npm run build` and output directory to `dist`. Pages will deploy the `functions` directory with the site.
3. In the Pages project, add a **D1 binding** with variable name `DB` pointing to the `smartqr` database. Apply it to production and any preview environment you intend to test; redeploy after adding a binding.
4. In **Cloudflare Zero Trust → Access → Applications**, create **one** self-hosted Access application with public hostname paths `smartqr.uk/admin` and `smartqr.uk/api` (including subpaths). Give only approved staff an Allow policy. **The site does no sign-in checking itself, so anything not covered by Access is open.** That includes the project's `*.pages.dev` address and preview deployments: add those hostnames to the Access application too (or turn on Pages' built-in access policy). Verify that `/admin/` and `/api/links` both prompt for sign-in in a private browser session, on `smartqr.uk` and on `*.pages.dev`, while scan paths remain public.
5. Test all five legacy scan paths, including `/by.html`, nested paths, and mixed-case paths, on the Pages preview URL. Test both trailing-slash and `/index.html` forms for folder links. Confirm each reaches the expected destination. Create a new QR in the protected dashboard, download PNG/SVG, scan it with a phone, change its destination, and scan the *same* code again.
6. Only after those checks, move the `smartqr.uk` custom domain from GitHub Pages to Cloudflare Pages. Keep the D1 data and Pages project in place; these are what make printed codes dynamic.

Do not protect the public scan paths with Access: anyone with a printed code must be able to follow its link. The dashboard and `/api/*` are the restricted paths.

## Commands for D1

```sh
npx wrangler d1 create smartqr
npm run db:migrate
```

`wrangler.toml` is only for the Wrangler CLI; it has no `pages_build_output_dir`, so Pages keeps using the bindings and variables from the dashboard. Migration `0005` adds `updated_by` and a `link_history` table: every create and edit records who made it (from the Access sign-in) and the destination at that time.

## Safety notes

The API accepts only HTTP(S) destinations and rejects invalid links, duplicate paths, reserved app paths, and colour pairs with inadequate contrast. It does not offer deletion because printed codes may already depend on a path. Keep D1 backups before major changes.

## Branding

The dashboard keeps the Smart Soho SVG logo from the [company website](https://smartsoho.co.uk/) and its coral red `#E84740`. The interface uses a clean white and slate palette, with scan link editing and artwork customisation kept out of the main create flow. New QR artwork defaults to dark `#111827` on white for dependable scanning.


## Static files and headers

`public/_routes.json` makes Cloudflare serve the dashboard, assets and logo directly instead of running the redirect function. Add any new file in `public/` to its `exclude` list (a test checks this). `public/_headers` sets a Content-Security-Policy and other security headers; loosen it if you add external scripts or styles.
