# Form Order System

Order form + order management, rebuilt so that:

1. **Multiple forms don't cross-trigger.** Tracking pixels (Meta Pixel / GTM / TikTok /
   Google Ads) fire **only** for the form the user actually submitted, based on each form's
   own toggle (set in *Form Settings*).
2. **All UTM + click IDs land in ONE place**, not scattered. Every submission stores the full
   set of campaign/adgroup/ads IDs plus each platform's built-in click/entity IDs.
3. You get a full **order management** dashboard: list, search, filter, detail, status,
   delete, manual order creation with product selection, and CSV export.

Zero dependencies — just Node.js.

---

## Quick start

```bash
cd form-order-system
node server.js
```

Then open:

| URL | What it is |
| --- | --- |
| http://localhost:3000/ | Dashboard (Order Management, Form Settings, Products) |
| http://localhost:3000/demo.html | Customer-facing order form demo |
| http://localhost:3000/tracker/bcs-tracker.js | The reusable tracking snippet |

> Node.js is **not currently installed** on this machine (`node --version` → not found).
> Install it (e.g. `brew install node`) then run `node server.js`.

Data is stored as JSON files under `data/` (`orders.json`, `forms.json`, `products.json`).
Delete a file to reset it to seed data on next boot.

## Mirror to a NEW Google Sheet (optional)

Your existing spreadsheet/Apps Script is left **completely untouched**. This project
ships its **own** new Apps Script (`apps-script/Code.gs`) that creates a **brand-new**
spreadsheet called *"Form Order System - Leads"* on first run.

To enable mirroring:

1. Create a new Google Apps Script project, paste `apps-script/Code.gs`, save.
2. Deploy > New deployment > type **Web app** → Execute as **Me**, access **Anyone**.
3. Copy the `/exec` URL.
4. Paste it into `config.json`:
   ```json
   { "googleSheetWebAppUrl": "https://script.google.com/macros/s/XXXX/exec" }
   ```
   (or set the env var `GOOGLE_SHEET_WEBAPP_URL`)
5. Restart `node server.js`.

Now every order is written to both `data/orders.json` **and** the new spreadsheet,
using the exact same consolidated columns (one place, never scattered). The new sheet
is created automatically — it never references or modifies any existing spreadsheet.

---

## Architecture

```
form-order-system/
├── server.js                 # zero-dependency Node HTTP server + JSON storage + REST API
├── config.json.example       # copy to config.json and set googleSheetWebAppUrl
├── package.json
├── apps-script/
│   └── Code.gs               # NEW Apps Script → creates its own NEW spreadsheet
├── data/                     # created at runtime (orders.json, forms.json, products.json)
└── public/
    ├── index.html            # dashboard (single page)
    ├── app.js                # dashboard logic
    ├── styles.css
    ├── demo.html             # sample order form (incl. product selection)
    └── tracker/
        └── bcs-tracker.js    # the snippet you embed on landing pages
```

### REST API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/track` | Receive a form submission (lead + tracking + events). Upserts by `sessionId`. |
| GET | `/api/orders` | List orders (filters: `q`, `platform`, `campaign`, `formId`, `status`, `from`, `to`). |
| POST | `/api/orders` | Create a manual order (admin, with `products[]`). |
| PATCH | `/api/orders/:id` | Update an order (e.g. status). |
| DELETE | `/api/orders/:id` | Delete an order. |
| GET | `/api/export?format=csv` | Export filtered orders as CSV (BOM included for Excel/Sheets). |
| GET | `/api/stats` | Summary counts by status/platform/form. |
| GET / POST / DELETE | `/api/forms` | List / create+update (`?id=`) / delete form configs. |
| GET / POST / DELETE | `/api/products` | List / create+update (`?id=`) / delete products (services). |

---

## Embedding the form on a landing page

Include the snippet **once** per page, then mark each form with `data-bcs-form="<formId>"`.

```html
<script>
  window.BCS_CONFIG = {
    scriptUrl: 'https://YOUR_HOST/api/track',  // or '/api/track' if same origin
    adminWa: '6282225678919'                   // fallback WA number
  };
</script>
<script src="https://YOUR_HOST/tracker/bcs-tracker.js"></script>

<form data-bcs-form="form-long">
  <input name="nama" ... />
  <input name="nohp" ... />
  <input name="plat" ... />
  <input name="mobil" ... />
  <select name="workshop">...</select>
  <input name="keluhan" ... />
  <button type="submit">Kirim via WhatsApp</button>
</form>

<button data-bcs-form="form-direct">Konsultasi</button>
```

- Field keys are read from the `name` attribute: `nama, nohp, plat, mobil, workshop, keluhan`
  (anything else with a `name` is collected too).
- **Draft** records fire on input blur/change; **Submitted** records fire on submit and also
  fire the enabled tracking events.
- The snippet fetches `/api/forms` at load so each form's tracking toggles + WA number are
  controlled centrally from the dashboard (no code changes needed on the landing page).

### Order form with product selection + quantities

Use form type `order` and add product checkboxes with `data-product` + a qty input:

```html
<form data-bcs-form="form-order">
  <input name="nama" ... />
  <input name="nohp" ... />
  <select name="workshop">...</select>

  <!-- one row per product (generated from /api/products) -->
  <input type="checkbox" data-product="p-cabin" data-name="Cabin Air Treatment" data-price="250000" />
  <input type="number" data-qty="p-cabin" value="1" min="1" />
  <input type="checkbox" data-product="p-bundle" data-name="Carwash Bundle" data-price="150000" />
  <input type="number" data-qty="p-bundle" value="1" min="1" />

  <button type="submit">Order via WhatsApp</button>
</form>
```

The selected products (with `qty`) and the computed `total` are stored on the order and
sent to both the JSON store and the Google Sheet. See `public/demo.html` for a working
example that fetches products from `/api/products`.

---

## How the "all forms trigger" bug was fixed

The old code embedded a full script (with duplicate UTM mapping, shared `localStorage` keys,
and **global** blur/change listeners) on every page, so any form event could fire other
forms' tracking. The new approach:

- One shared snippet, forms identified by `data-bcs-form`.
- Tracking toggles stored per form (`forms.json`) and read at runtime.
- `fireTracking()` checks `form.tracking.{metaPixel,gtm,tiktok,googleAds}` before firing
  anything, and only for the form the event originated from.

---

## Consolidated tracking fields (one spreadsheet)

Each order stores, in a single flat record (and single CSV row on export):

- Lead: `nama, nohp, plat, mobil, workshop, keluhan, status`
- UTM: `utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id`
- Generic IDs: `campaignId, adgroupId, adId, clickId, entityId`
- Google: `gclid, gbraid, wbraid, gc_campaign_id, gc_adgroup_id, gc_ad_id`
- Meta: `fbclid, entity_id, fb_campaign_id, fb_adset_id, fb_ad_id`
- TikTok: `ttclid, tt_campaign_id, tt_adgroup_id, tt_ad_id`
- Microsoft: `msclkid`
- Other: `keyword, promo, site_source_name`
- `events` (which pixels fired), `products`, `total`, `notes`

Export CSV from the dashboard ("⬇ Export CSV" respects the current filters) and import it
into Google Sheets — all columns sit in one place.

---

## Migrating your existing Apps Script

Your current `doPost(e)` writes 16 columns to a Google Sheet. The new backend writes the same
data (plus the full click-ID set) to `data/orders.json`, and `/api/export` produces the CSV
you can paste into Sheets. To keep using Sheets instead of JSON, either:

- import the CSV export periodically, or
- wire `server.js` to also call your Apps Script `exec` URL (append the same `FormData`
  payload) — see the `sendToBackend` hook in `bcs-tracker.js`.
