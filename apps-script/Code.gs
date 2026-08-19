/**
 * Form Order System — NEW Apps Script backend.
 *
 * IMPORTANT: this script creates and writes to its OWN brand-new Google
 * Spreadsheet. It never touches any existing spreadsheet.
 *
 * The new spreadsheet is created automatically the first time doPost runs
 * (or on first doGet). Its ID is saved in Script Properties, so it is reused
 * on every call — it is created only once.
 *
 * Deploy steps (do once):
 *   1. Extensions > Apps Script (paste this file).
 *   2. Deploy > New deployment > type "Web app".
 *   3. Execute as: Me.  Who has access: Anyone.
 *   4. Copy the /exec URL into the Node config (config.json → googleSheetWebAppUrl).
 */

var HEADERS = [
  'id', 'sessionId', 'timestamp', 'form', 'status',
  'nama', 'nohp', 'plat', 'mobil', 'workshop', 'keluhan',
  'platform',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'campaignId', 'adgroupId', 'adId',
  'clickId', 'entityId',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'entity_id', 'ttclid', 'msclkid',
  'gc_campaign_id', 'gc_adgroup_id', 'gc_ad_id',
  'fb_campaign_id', 'fb_adset_id', 'fb_ad_id',
  'tt_campaign_id', 'tt_adgroup_id', 'tt_ad_id',
  'keyword', 'promo', 'site_source_name',
  'events', 'products', 'total', 'notes'
];

var SHEET_NAME = 'Leads';
var SPREADSHEET_NAME = 'Form Order System - Leads';

/* ------------------------------------------------------------------ *
 *  Helpers                                                             *
 * ------------------------------------------------------------------ */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Returns (or creates) the destination sheet on a NEW spreadsheet. */
function getOrCreateSheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss = null;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
    var sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  }

  var target = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var headerRange = target.getRange(1, 1, 1, HEADERS.length);
  var existing = headerRange.getValues()[0];
  var headerOk = HEADERS.every(function (h, i) { return String(existing[i]) === h; });
  if (!headerOk) {
    target.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    target.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3f3f3');
    target.setFrozenRows(1);
  }

  return target;
}

/** Parse JSON body (primary) or form-urlencoded (fallback). */
function parsePayload(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { /* fall through */ }
  }
  if (e && e.parameter && Object.keys(e.parameter).length) {
    var p = e.parameter;
    return {
      sessionId: p.sessionId || '', formName: p.form || '', formId: p.formId || '', status: p.status || 'Draft',
      lead: { nama: p.nama, nohp: p.nohp, plat: p.plat, mobil: p.mobil, workshop: p.workshop, keluhan: p.keluhan },
      tracking: {
        platform: p.platform, utm_source: p.utm_source, utm_medium: p.utm_medium, utm_campaign: p.utm_campaign,
        utm_term: p.utm_term, utm_content: p.utm_content, utm_id: p.utm_id,
        campaignId: p.campaignId, adgroupId: p.adgroupId, adId: p.adId, clickId: p.clickId, entityId: p.entityId,
        gclid: p.gclid, gbraid: p.gbraid, wbraid: p.wbraid, fbclid: p.fbclid, entity_id: p.entity_id, ttclid: p.ttclid, msclkid: p.msclkid,
        gc_campaign_id: p.gc_campaign_id, gc_adgroup_id: p.gc_adgroup_id, gc_ad_id: p.gc_ad_id,
        fb_campaign_id: p.fb_campaign_id, fb_adset_id: p.fb_adset_id, fb_ad_id: p.fb_ad_id,
        tt_campaign_id: p.tt_campaign_id, tt_adgroup_id: p.tt_adgroup_id, tt_ad_id: p.tt_ad_id,
        keyword: p.keyword, promo: p.promo, site_source_name: p.site_source_name
      },
      events: {
        metaPixel: p.metaPixel === 'true', gtm: p.gtm === 'true',
        tiktok: p.tiktok === 'true', googleAds: p.googleAds === 'true'
      },
      products: p.products, total: p.total, notes: p.notes
    };
  }
  return {};
}

/** Flatten payload into a HEADERS-aligned row object. */
function flatten(payload) {
  var lead = payload.lead || {};
  var trk = payload.tracking || {};
  var ev = payload.events || {};

  var products = Array.isArray(lead.products) ? lead.products : (Array.isArray(payload.products) ? payload.products : []);
  var productsStr = products.map(function (x) {
    return (x.qty ? x.qty + 'x ' : '') + (x.name || '');
  }).join('; ');

  return {
    id: payload.id || '',
    sessionId: payload.sessionId || '',
    timestamp: payload.timestamp || new Date().toISOString(),
    form: payload.formName || payload.formId || '',
    status: payload.status || 'Draft',
    nama: lead.nama || '-', nohp: lead.nohp || '-', plat: lead.plat || '-',
    mobil: lead.mobil || '-', workshop: lead.workshop || '-', keluhan: lead.keluhan || '-',
    platform: trk.platform || '',
    utm_source: trk.utm_source || '', utm_medium: trk.utm_medium || '', utm_campaign: trk.utm_campaign || '',
    utm_term: trk.utm_term || '', utm_content: trk.utm_content || '', utm_id: trk.utm_id || '',
    campaignId: trk.campaignId || '', adgroupId: trk.adgroupId || '', adId: trk.adId || '',
    clickId: trk.clickId || '', entityId: trk.entityId || '',
    gclid: trk.gclid || '', gbraid: trk.gbraid || '', wbraid: trk.wbraid || '',
    fbclid: trk.fbclid || '', entity_id: trk.entity_id || '', ttclid: trk.ttclid || '', msclkid: trk.msclkid || '',
    gc_campaign_id: trk.gc_campaign_id || '', gc_adgroup_id: trk.gc_adgroup_id || '', gc_ad_id: trk.gc_ad_id || '',
    fb_campaign_id: trk.fb_campaign_id || '', fb_adset_id: trk.fb_adset_id || '', fb_ad_id: trk.fb_ad_id || '',
    tt_campaign_id: trk.tt_campaign_id || '', tt_adgroup_id: trk.tt_adgroup_id || '', tt_ad_id: trk.tt_ad_id || '',
    keyword: trk.keyword || '', promo: trk.promo || '', site_source_name: trk.site_source_name || '',
    events: ['metaPixel', 'gtm', 'tiktok', 'googleAds'].filter(function (k) { return ev[k]; }).join(','),
    products: productsStr,
    total: lead.total !== undefined ? lead.total : (payload.total !== undefined ? payload.total : ''),
    notes: lead.notes !== undefined ? lead.notes : (payload.notes !== undefined ? payload.notes : '')
  };
}

/* ------------------------------------------------------------------ *
 *  Web app entry points                                                *
 * ------------------------------------------------------------------ */
function doPost(e) {
  try {
    var payload = parsePayload(e);
    var sheet = getOrCreateSheet();
    var row = flatten(payload);
    var values = HEADERS.map(function (h) {
      var v = row[h];
      return (v === undefined || v === null) ? '' : v;
    });

    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    if (payload.sessionId && data.length > 1) {
      for (var i = data.length - 1; i >= 1; i--) {
        if (String(data[i][1]) === String(payload.sessionId)) { rowIndex = i + 1; break; }
      }
    }

    if (rowIndex > -1) {
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return json({ ok: true, sessionId: payload.sessionId, rows: sheet.getLastRow() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet(e) {
  try {
    var sheet = getOrCreateSheet();
    return json({ ok: true, sheetUrl: sheet.getParent().getUrl() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
