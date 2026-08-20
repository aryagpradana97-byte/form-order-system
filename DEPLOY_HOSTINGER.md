# Deploying Form Order System on Hostinger Shared / Business Hosting

This app is **zero-dependency** (no `npm install`, no `node_modules`), which makes it very
simple to run on Hostinger shared hosting.

> **Before you start:** change the dashboard login password.
> Edit `config.json`:
> ```json
> {
>   "googleSheetWebAppUrl": "https://script.google.com/macros/s/XXXX/exec",
>   "publicBaseUrl": "https://form.yourdomain.com",
>   "adminUser": "admin",
>   "adminPass": "YOUR_STRONG_PASSWORD"
> }
> ```
> - `publicBaseUrl` = the public URL of your app (so embedded forms use the right domain).
> - `adminUser` / `adminPass` = the login for the dashboard (Basic auth).

---

## Step 1 — Enable Node.js in hPanel
1. Log in to **hPanel** (hpanel.hostinger.com).
2. Go to **Advanced → Node.js** (search "Node.js" if you can't find it).
3. Click **Create application** / **Add**.
4. Set:
   - **Node.js version**: 18 or 20 (LTS) — 18+ recommended.
   - **Application root**: a folder, e.g. `/public_html/forms` (this is where the code goes).
   - **Application startup file**: `server.js`
   - **Application URL**: your domain/subdomain (e.g. `https://form.yourdomain.com`).
5. Create it. Hostinger will assign an **application port** (e.g. `3000`) and show it.

## Step 2 — Upload the code
Use either:
- **hPanel File Manager**: navigate to the application root and upload/extract the
  project files (from the repo or a zip), **or**
- **hPanel → Advanced → Git** / terminal: clone the repo.

Files you MUST upload (from the `form-order-system/` folder):
```
server.js
package.json
config.json          (with your values)
public/              (whole folder: index.html, app.js, styles.css, demo.html, tracker/)
data/                (let the app create this, or upload an empty data/ folder)
apps-script/         (optional — only needed if you want to re-edit the sheet script)
```
You do **NOT** need `node_modules` (there are none) and you do **NOT** need to run `npm install`.

## Step 3 — Make sure the app uses the right port
The app already listens on `process.env.PORT`. Hostinger injects the assigned port via the
`PORT` environment variable when it starts the app, so no change is needed. If your
Hostinger Node.js panel shows a specific port, that's what `PORT` will be.

## Step 4 — Start / point the app
In the Node.js panel, make sure the application is **running** (Hostinger auto-starts it).
The startup file is `server.js`. After it starts, open your **Application URL**.

---

## Verify
- **Dashboard** → `https://form.yourdomain.com/` → enter your `adminUser`/`adminPass`.
- **Public form** → `https://form.yourdomain.com/demo.html` (no login, for testing).
- Submitting a form should appear in the dashboard.

## Important notes
- **Login:** the dashboard is protected by Basic auth. The public form endpoint
  (`/api/track`) and the tracker (`/tracker/bcs-tracker.js`) and `GET /api/forms` &
  `GET /api/products` are intentionally **public** so your embeds work.
- **Google Sheet mirror:** if you deployed `apps-script/Code.gs` as a Web app, keep
  `googleSheetWebAppUrl` set and every submission also writes to your new spreadsheet.
- **SSL:** enable free SSL for your domain in hPanel so the Basic auth password is sent
  over HTTPS.
- **Permissions:** if the app can't write `data/*.json`, give the application folder write
  permission (e.g. `chmod -R 755 data` / ensure the Node process can write).
- **Backups:** `data/orders.json` holds your orders — back it up (or rely on the sheet).
