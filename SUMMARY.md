# Form Order System — Project Summary

A complete **order form + order management** system for multi-platform ad tracking
(Meta / Google / TikTok / etc.), rebuilt so that tracking only fires for the form that
is actually submitted, and all UTM + click IDs land in **one place**.

**Repo:** https://github.com/aryagpradana97-byte/form-order-system
**Stack:** Node.js (zero dependencies) + JSON storage + static dashboard + reusable
tracker snippet + a NEW Google Apps Script that creates its own spreadsheet.

---

## What it does

### 1. Order forms
- 4 form types: **Short**, **Full (long)**, **Direct (WhatsApp button)**, **Order (select products + qty)**.
- One reusable tracker snippet (`data-bcs-form`) handles all forms on a page.
- Each form is embeddable separately with **Copy Embed** — generates a complete HTML
  block (form + tracking) ready to paste into Elementor / WordPress / any landing page.

### 2. Per-form tracking (fixes "all forms trigger at once")
- Each form has its **own** toggle for: **Meta Pixel, Google Tag Manager (GTM), TikTok Pixel, Google Ads (gtag)**.
- **Pixel events only fire when the form is valid AND submitted.**
- Draft / incomplete / invalid submits are still recorded, but as **Draft** (not sent).
- Pixel IDs (Meta/TikTok/GTM/Google Ads conversion) are configurable per form and used when firing.

### 3. Consolidated tracking (one place, not scattered)
Every order stores the full set:
- UTM: `utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id`
- Generic: `campaignId, adgroupId, adId, clickId, entityId`
- Google: `gclid, gbraid, wbraid, gc_campaign_id, gc_adgroup_id, gc_ad_id`
- Meta: `fbclid, entity_id, fb_campaign_id, fb_adset_id, fb_ad_id`
- TikTok: `ttclid, tt_campaign_id, tt_adgroup_id, tt_ad_id`
- Microsoft: `msclkid`
- Other: `keyword, promo, site_source_name` + `products, total, notes`

### 4. Promos & scale (platform × promo × form)
- **Promos** tab: create promos per platform, then **Generate Short + Full** forms with
  tracking defaults matching the platform (Meta → Meta Pixel, Google → Google Ads, TikTok → TikTok).
- Supports hundreds of combos (10 promos × 5 platforms × 2 forms = 100) without duplicate code.

### 5. Order Management dashboard
- List all orders with **search + filters** (platform, form, status, date).
- **Statuses** (editable + notes/reason): `Draft → Submitted → Valid → Connected → Not Connected → Deal`.
- **Detail modal** shows full lead + tracking + products/total + events, editable status & notes.
- **Columns** button → popup to choose which detail columns to show (Save / Cancel).
- **Add Order** (manual, with product selection), **Delete**, **Export CSV** (all columns in one row).
- English UI.

### 6. Google Sheet mirror (optional, does NOT touch your existing sheets)
- Ships its own Apps Script (`apps-script/Code.gs`) that creates a **brand-new** spreadsheet
  ("Form Order System - Leads") automatically.
- Set `googleSheetWebAppUrl` in `config.json` → every submission is written to **both**
  the dashboard (JSON) and the new spreadsheet.

---

## Statuses
`Draft` (not sent) → `Submitted` (sent) → `Valid` → `Connected` → `Not Connected` → `Deal`
Each can be edited with a **Notes / Reason** explaining the CS follow-up.

---

## Files
```
form-order-system/
├── server.js                 # zero-dependency Node HTTP server + JSON storage + REST API
├── config.json               # googleSheetWebAppUrl + publicBaseUrl (gitignored)
├── config.json.example
├── package.json
├── apps-script/
│   └── Code.gs               # NEW Apps Script → creates its OWN new spreadsheet
├── data/                     # runtime JSON (orders.json, forms.json, products.json, promos.json) — gitignored
└── public/
    ├── index.html            # dashboard (Orders, Promos, Form Settings, Products)
    ├── app.js                # dashboard logic
    ├── styles.css
    ├── demo.html             # sample order form (incl. product selection)
    └── tracker/bcs-tracker.js# reusable embeddable tracking snippet
```

## REST API
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/track` | Receive form submission (lead + tracking + events); upsert by sessionId |
| GET/POST/PATCH/DELETE | `/api/orders` | List (filtered) / create manual / update status+notes / delete |
| GET | `/api/export?format=csv` | Export filtered orders as CSV |
| GET | `/api/stats` | Summary counts |
| GET/POST/DELETE | `/api/forms` | Form configs (tracking toggles + pixel IDs) |
| GET/POST/DELETE | `/api/promos` | Promo management |
| POST | `/api/promos/generate` | Generate short+full forms for a promo |
| GET/POST/DELETE | `/api/products` | Products / services |
| GET | `/api/config` | Returns publicBaseUrl + sheet status |

---

## Run locally
```bash
cd form-order-system && node server.js
# Dashboard: http://localhost:3000  |  Demo form: http://localhost:3000/demo.html
```

## Deploy notes
- Set `config.json` → `"publicBaseUrl": "https://your-domain.com"` so embeds use your public URL.
- To mirror to Google Sheets: deploy `apps-script/Code.gs` as a Web app (Execute as: Me, Access: Anyone)
  and put its `/exec` URL in `config.json` → `googleSheetWebAppUrl`.
