'use strict';

/**
 * Form Order System — zero-dependency Node.js backend.
 * Storage: JSON files in ./data (orders.json, forms.json).
 * Run:  node server.js   (then open http://localhost:3000)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

/* Optional: mirror every submission to a NEW Google Sheet (via a NEW Apps
 * Script web app). Set GOOGLE_SHEET_WEBAPP_URL or config.json. */
let CONFIG = { googleSheetWebAppUrl: '', publicBaseUrl: '', adminUser: '', adminPass: '' };
try {
  CONFIG = Object.assign(CONFIG, JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')));
} catch (e) { /* no config.json yet */ }
if (process.env.GOOGLE_SHEET_WEBAPP_URL) CONFIG.googleSheetWebAppUrl = process.env.GOOGLE_SHEET_WEBAPP_URL;
if (process.env.PUBLIC_BASE_URL) CONFIG.publicBaseUrl = process.env.PUBLIC_BASE_URL;
if (process.env.ADMIN_USER) CONFIG.adminUser = process.env.ADMIN_USER;
if (process.env.ADMIN_PASS) CONFIG.adminPass = process.env.ADMIN_PASS;
if (!CONFIG.adminUser) CONFIG.adminUser = 'admin';
if (!CONFIG.adminPass) CONFIG.adminPass = 'admin123';

const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const FORMS_FILE = path.join(DATA_DIR, 'forms.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const PROMOS_FILE = path.join(DATA_DIR, 'promos.json');

/* ------------------------------------------------------------------ *
 *  Canonical column order (used by CSV export so everything sits in  *
 *  ONE spreadsheet, never scattered).                                 *
 * ------------------------------------------------------------------ */
const CSV_COLUMNS = [
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

/* ------------------------------------------------------------------ *
 *  Seed data                                                          *
 * ------------------------------------------------------------------ */
const SEED_FORMS = [
  {
    id: 'form-long',
    name: 'Reservasi Servis Lengkap',
    type: 'long',
    enabled: true,
    adminWa: '6282225678919',
    tracking: { metaPixel: true, gtm: true, tiktok: true, googleAds: true },
    pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' },
    submitAction: 'whatsapp',
    redirectUrl: ''
  },
  {
    id: 'form-short',
    name: 'Reservasi Kilat',
    type: 'short',
    enabled: true,
    adminWa: '6282225678919',
    tracking: { metaPixel: true, gtm: false, tiktok: true, googleAds: true },
    pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' },
    submitAction: 'whatsapp',
    redirectUrl: ''
  },
  {
    id: 'form-direct',
    name: 'Konsultasi via WhatsApp',
    type: 'direct',
    enabled: true,
    adminWa: '6282225678919',
    tracking: { metaPixel: true, gtm: false, tiktok: false, googleAds: false },
    pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' },
    submitAction: 'whatsapp',
    redirectUrl: ''
  },
  {
    id: 'form-order',
    name: 'Order Layanan (Pilih Produk)',
    type: 'order',
    enabled: true,
    adminWa: '6282225678919',
    tracking: { metaPixel: true, gtm: true, tiktok: true, googleAds: true },
    pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' },
    submitAction: 'whatsapp',
    redirectUrl: ''
  }
];

const SEED_ORDERS = [
  {
    id: 'sample-1',
    sessionId: 'ID-sample-meta-LF',
    form: 'Reservasi Servis Lengkap',
    formId: 'form-long',
    status: 'Submitted',
    nama: 'Budi Santoso', nohp: '081234567890', plat: 'B 1234 ABC', mobil: 'Honda HR-V',
    workshop: 'Kelapa Gading', keluhan: 'Ganti oli + tune up',
    platform: 'Meta Ads', utm_source: 'facebook', utm_campaign: 'Hempel Q3', campaignId: 'fb-238499',
    adgroupId: 'fb-adset-77', adId: 'fb-ad-911', clickId: '', entityId: 'fbclid_IwARxyz123',
    gclid: '', gbraid: '', wbraid: '', fbclid: 'IwARxyz123', entity_id: '901234567',
    ttclid: '', msclkid: '',
    gc_campaign_id: '', gc_adgroup_id: '', gc_ad_id: '',
    fb_campaign_id: '238499', fb_adset_id: '77', fb_ad_id: '911',
    tt_campaign_id: '', tt_adgroup_id: '', tt_ad_id: '',
    keyword: '', promo: 'Cabin Air Treatment', site_source_name: '',
    events: { metaPixel: true, gtm: true, tiktok: true, googleAds: true },
    createdAt: '2026-08-19T09:12:00.000Z', updatedAt: '2026-08-19T09:12:00.000Z'
  },
  {
    id: 'sample-2',
    sessionId: 'ID-sample-google-SF',
    form: 'Reservasi Kilat',
    formId: 'form-short',
    status: 'Draft',
    nama: 'Siti Aminah', nohp: '082198765432', plat: '-', mobil: '-',
    workshop: 'PIK2', keluhan: '-',
    platform: 'Google Ads', utm_source: 'google', utm_campaign: 'BCS Search', campaignId: '2099887',
    adgroupId: '772123', adId: '551230', clickId: 'Cj0KCQjwl...', entityId: 'gclid_Cj0KCQjwl',
    gclid: 'Cj0KCQjwl', gbraid: '', wbraid: '', fbclid: '', entity_id: '',
    ttclid: '', msclkid: '',
    gc_campaign_id: '2099887', gc_adgroup_id: '772123', gc_ad_id: '551230',
    fb_campaign_id: '', fb_adset_id: '', fb_ad_id: '',
    tt_campaign_id: '', tt_adgroup_id: '', tt_ad_id: '',
    keyword: 'bengkel bosch terdekat', promo: 'Car Wash', site_source_name: '',
    events: { metaPixel: true, gtm: false, tiktok: true, googleAds: true },
    createdAt: '2026-08-19T08:40:00.000Z', updatedAt: '2026-08-19T08:40:00.000Z'
  },
  {
    id: 'sample-3',
    sessionId: 'ID-sample-tiktok-LF',
    form: 'Reservasi Servis Lengkap',
    formId: 'form-long',
    status: 'Confirmed',
    nama: 'Agus Wijaya', nohp: '081399887766', plat: 'B 7777 XYZ', mobil: 'Toyota Avanza',
    workshop: 'Kelapa Gading', keluhan: 'AC tidak dingin',
    platform: 'TikTok Ads', utm_source: 'tiktok', utm_campaign: 'BCS TikTok Promo', campaignId: 'tt-camp-55',
    adgroupId: 'tt-ag-12', adId: 'tt-ad-99', clickId: '', entityId: 'ttclid_abc',
    gclid: '', gbraid: '', wbraid: '', fbclid: '', entity_id: '',
    ttclid: 'abc', msclkid: '',
    gc_campaign_id: '', gc_adgroup_id: '', gc_ad_id: '',
    fb_campaign_id: '', fb_adset_id: '', fb_ad_id: '',
    tt_campaign_id: '55', tt_adgroup_id: '12', tt_ad_id: '99',
    keyword: '', promo: 'AC Recovery and Recharge', site_source_name: '',
    events: { metaPixel: true, gtm: true, tiktok: true, googleAds: true },
    createdAt: '2026-08-18T15:05:00.000Z', updatedAt: '2026-08-18T15:05:00.000Z'
  }
];

const SEED_PRODUCTS = [
  { id: 'p-cabin', name: 'Cabin Air Treatment', category: 'Service', price: 250000 },
  { id: 'p-bundle', name: 'Carwash Bundle', category: 'Service', price: 150000 },
  { id: 'p-wash', name: 'Car Wash', category: 'Service', price: 80000 },
  { id: 'p-engine', name: 'Engine Cleaning', category: 'Service', price: 300000 },
  { id: 'p-pure', name: 'Pure Air Refresh', category: 'Service', price: 180000 },
  { id: 'p-sinopec', name: 'Sinopec Oil', category: 'Part', price: 450000 },
  { id: 'p-sailun', name: 'Sailun Tire', category: 'Part', price: 750000 },
  { id: 'p-tuneup', name: 'Tune Up', category: 'Service', price: 500000 },
  { id: 'p-essential', name: 'Essential Care & Performance Care', category: 'Service', price: 400000 },
  { id: 'p-ac', name: 'AC Recovery and Recharge', category: 'Service', price: 550000 }
];

const SEED_PROMOS = [
  { id: 'promo-meta-cabin', name: 'Cabin Air Treatment', platform: 'Meta Ads', code: 'CABIN', active: true, adminWa: '' },
  { id: 'promo-google-wash', name: 'Car Wash', platform: 'Google Ads', code: 'WASH', active: true, adminWa: '' },
  { id: 'promo-tiktok-ac', name: 'AC Recovery', platform: 'TikTok Ads', code: 'AC', active: true, adminWa: '' }
];

/* ------------------------------------------------------------------ *
 *  Storage helpers                                                    *
 * ------------------------------------------------------------------ */
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FORMS_FILE)) writeJson(FORMS_FILE, SEED_FORMS);
  if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, SEED_ORDERS);
  if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, SEED_PRODUCTS);
  if (!fs.existsSync(PROMOS_FILE)) writeJson(PROMOS_FILE, SEED_PROMOS);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readForms() { return readJson(FORMS_FILE); }
function readOrders() { return readJson(ORDERS_FILE); }
function readProducts() { return readJson(PRODUCTS_FILE); }
function readPromos() { return readJson(PROMOS_FILE); }
function writeForms(f) { writeJson(FORMS_FILE, f); }
function writeOrders(o) { writeJson(ORDERS_FILE, o); }
function writeProducts(p) { writeJson(PRODUCTS_FILE, p); }
function writePromos(p) { writeJson(PROMOS_FILE, p); }

/* ------------------------------------------------------------------ *
 *  Helpers                                                            *
 * ------------------------------------------------------------------ */
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
    });
  });
}

function now() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'); }

/* Fire-and-forget mirror of a submission to the NEW Google Sheet (via the
 * NEW Apps Script web app). Never touches any existing spreadsheet. */
function forwardToSheets(payload) {
  const url = CONFIG.googleSheetWebAppUrl;
  if (!url) return;
  try {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => { res.resume(); });
    req.on('error', () => {});
    req.write(data);
    req.end();
  } catch (e) { /* ignore forwarding errors */ }
}

/* Flatten an order into the canonical CSV column order. */
function orderToRow(order) {
  return CSV_COLUMNS.map((col) => {
    if (col === 'timestamp') return order.createdAt || '';
    if (col === 'form') return order.form || order.formName || '';
    if (col === 'events') {
      const ev = order.events || {};
      return ['metaPixel', 'gtm', 'tiktok', 'googleAds'].map((k) => (ev[k] ? k : '')).filter(Boolean).join(',');
    }
    if (col === 'products') {
      const p = order.products || [];
      if (!Array.isArray(p)) return String(p);
      return p.map((x) => (x.qty ? x.qty + 'x ' : '') + (x.name || '')).join('; ');
    }
    const v = order[col];
    if (v === undefined || v === null) return '';
    return String(v);
  });
}

function csvEscape(v) {
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildCsv(orders) {
  const header = CSV_COLUMNS.map(csvEscape).join(',');
  const rows = orders.map((o) => orderToRow(o).map(csvEscape).join(','));
  return [header].concat(rows).join('\n');
}

function matchesFilter(order, q) {
  const search = String(q.q || '').toLowerCase();
  const platform = String(q.platform || '');
  const campaign = String(q.campaign || '').toLowerCase();
  const formId = String(q.formId || '');
  const status = String(q.status || '');
  const from = q.from ? new Date(q.from).getTime() : null;
  const to = q.to ? new Date(q.to).getTime() : null;
  const ts = new Date(order.createdAt).getTime();

  if (platform && order.platform !== platform) return false;
  if (campaign && String(order.utm_campaign || '').toLowerCase().indexOf(campaign) === -1) return false;
  if (formId && order.formId !== formId) return false;
  if (status && order.status !== status) return false;
  if (from && (isNaN(ts) || ts < from)) return false;
  if (to && (isNaN(ts) || ts > to)) return false;
  if (search) {
    const hay = [
      order.nama, order.nohp, order.plat, order.mobil, order.workshop,
      order.keluhan, order.promo, order.keyword, order.sessionId,
      order.campaignId, order.adgroupId, order.adId, order.clickId, order.entityId
    ].join(' ').toLowerCase();
    if (hay.indexOf(search) === -1) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 *  API handlers                                                       *
 * ------------------------------------------------------------------ */
function apiTrack(body) {
  const orders = readOrders();
  const sessionId = body.sessionId || newId('SESS');

  const lead = body.lead || {};
  const tracking = body.tracking || {};
  const events = body.events || {};

  const existing = orders.find((o) => o.sessionId === sessionId);

  const flat = {
    sessionId,
    formId: body.formId || '',
    form: body.formName || body.formId || '',
    nama: lead.nama || '-', nohp: lead.nohp || '-', plat: lead.plat || '-',
    mobil: lead.mobil || '-', workshop: lead.workshop || '-', keluhan: lead.keluhan || '-',
    status: body.status || 'Draft',
    products: Array.isArray(lead.products) ? lead.products : (body.products || ''),
    total: lead.total !== undefined ? lead.total : (body.total !== undefined ? body.total : ''),
    notes: lead.notes !== undefined ? lead.notes : (body.notes !== undefined ? body.notes : '')
  };

  const trackingFlat = {};
  CSV_COLUMNS.forEach((col) => {
    if (['id', 'sessionId', 'timestamp', 'form', 'status', 'nama', 'nohp', 'plat', 'mobil', 'workshop', 'keluhan', 'events', 'products', 'total', 'notes'].indexOf(col) !== -1) return;
    trackingFlat[col] = tracking[col] !== undefined ? tracking[col] : (flat[col] !== undefined ? flat[col] : '');
  });

  const eventsFlat = { metaPixel: !!events.metaPixel, gtm: !!events.gtm, tiktok: !!events.tiktok, googleAds: !!events.googleAds };

  if (existing) {
    Object.assign(existing, flat, trackingFlat, { events: eventsFlat, updatedAt: now() });
    writeOrders(orders);
    forwardToSheets(body);
    return { ok: true, id: existing.id, updated: true };
  }

  const order = Object.assign({ id: newId('ORD'), createdAt: now(), updatedAt: now() }, flat, trackingFlat, { events: eventsFlat });
  orders.push(order);
  writeOrders(orders);
  forwardToSheets(body);
  return { ok: true, id: order.id, updated: false };
}

function apiListOrders(q) {
  const orders = readOrders().filter((o) => matchesFilter(o, q));
  orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { orders, total: orders.length };
}

function apiStats() {
  const orders = readOrders();
  const byStatus = {};
  const byPlatform = {};
  const byForm = {};
  orders.forEach((o) => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    byPlatform[o.platform] = (byPlatform[o.platform] || 0) + 1;
    byForm[o.form] = (byForm[o.form] || 0) + 1;
  });
  return { total: orders.length, byStatus, byPlatform, byForm };
}

function apiSaveForm(body, id) {
  const forms = readForms();
  let form;
  if (id) {
    form = forms.find((f) => f.id === id);
    if (!form) return { error: 'form not found' };
    Object.assign(form, body, { id });
  } else {
    form = Object.assign({
      id: newId('form'),
      name: 'Untitled Form', type: 'short', enabled: true,
      adminWa: '', tracking: { metaPixel: false, gtm: false, tiktok: false, googleAds: false },
      pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' }, submitAction: 'whatsapp', redirectUrl: ''
    }, body);
    forms.push(form);
  }
  writeForms(forms);
  return { ok: true, form };
}

function apiDeleteForm(id) {
  let forms = readForms();
  forms = forms.filter((f) => f.id !== id);
  writeForms(forms);
  return { ok: true };
}

function apiDeleteOrder(id) {
  let orders = readOrders();
  orders = orders.filter((o) => o.id !== id);
  writeOrders(orders);
  return { ok: true };
}

function apiUpdateOrder(id, body) {
  const orders = readOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) return { error: 'order not found' };
  delete body.id; delete body.sessionId; delete body.createdAt;
  Object.assign(order, body, { updatedAt: now() });
  writeOrders(orders);
  return { ok: true, order };
}

/* Manual order creation (admin selects form + products/services). */
function apiCreateOrder(body) {
  const orders = readOrders();
  const lead = body.lead || {};
  const products = Array.isArray(body.products) ? body.products : [];
  const total = products.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.qty) || 0), 0);
  const tracking = body.tracking || { platform: 'Manual', utm_source: '', utm_campaign: '', utm_medium: '', utm_term: '', utm_content: '', utm_id: '' };
  const trackingFlat = {};
  CSV_COLUMNS.forEach((col) => {
    if (['id', 'sessionId', 'timestamp', 'form', 'status', 'nama', 'nohp', 'plat', 'mobil', 'workshop', 'keluhan', 'events', 'products', 'total', 'notes'].indexOf(col) !== -1) return;
    trackingFlat[col] = tracking[col] !== undefined ? tracking[col] : '';
  });
  const order = Object.assign({
    id: newId('ORD'), createdAt: now(), updatedAt: now(),
    sessionId: newId('SESS'), formId: body.formId || '', form: body.formName || body.formId || 'Manual',
    nama: lead.nama || '-', nohp: lead.nohp || '-', plat: lead.plat || '-',
    mobil: lead.mobil || '-', workshop: lead.workshop || '-', keluhan: lead.keluhan || '-',
    status: body.status || 'Confirmed',
    products, total, notes: body.notes || '',
    events: { metaPixel: false, gtm: false, tiktok: false, googleAds: false }
  }, trackingFlat);
  orders.push(order);
  writeOrders(orders);
  forwardToSheets({ sessionId: order.sessionId, formId: order.formId, formName: order.form, status: order.status, lead: lead, products: products, total: total, notes: order.notes, tracking: trackingFlat });
  return { ok: true, order };
}

function apiSaveProduct(body, id) {
  const products = readProducts();
  let p;
  if (id) {
    p = products.find((x) => x.id === id);
    if (!p) return { error: 'product not found' };
    Object.assign(p, body, { id });
  } else {
    p = Object.assign({ id: newId('p'), name: 'Untitled', category: 'Service', price: 0 }, body);
    products.push(p);
  }
  writeProducts(products);
  return { ok: true, product: p };
}

function apiDeleteProduct(id) {
  let products = readProducts();
  products = products.filter((x) => x.id !== id);
  writeProducts(products);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 *  Promos + form generation                                            *
 * ------------------------------------------------------------------ */
function platformDefaults(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.indexOf('meta') > -1 || p.indexOf('fb') > -1 || p.indexOf('facebook') > -1 || p.indexOf('instagram') > -1) {
    return { metaPixel: true, gtm: false, tiktok: false, googleAds: false };
  }
  if (p.indexOf('tiktok') > -1) return { metaPixel: false, gtm: false, tiktok: true, googleAds: false };
  if (p.indexOf('google') > -1) return { metaPixel: false, gtm: false, tiktok: false, googleAds: true };
  if (p.indexOf('microsoft') > -1 || p.indexOf('bing') > -1) return { metaPixel: false, gtm: true, tiktok: false, googleAds: false };
  return { metaPixel: false, gtm: true, tiktok: false, googleAds: false };
}

function apiSavePromo(body, id) {
  const promos = readPromos();
  let p;
  if (id) {
    p = promos.find((x) => x.id === id);
    if (!p) return { error: 'promo not found' };
    Object.assign(p, body, { id });
  } else {
    p = Object.assign({ id: newId('promo'), name: 'Promo Baru', platform: 'Meta Ads', code: '', active: true, adminWa: '' }, body);
    promos.push(p);
  }
  writePromos(promos);
  return { ok: true, promo: p };
}

function apiDeletePromo(id) {
  let promos = readPromos();
  promos = promos.filter((x) => x.id !== id);
  writePromos(promos);
  return { ok: true };
}

/* Generate short + full forms for a promo (each with independent tracking). */
function apiGenerateForms(promoId) {
  const promos = readPromos();
  const promo = promos.find((p) => p.id === promoId);
  if (!promo) return { error: 'promo not found' };

  const forms = readForms();
  const defaults = platformDefaults(promo.platform);
  const results = [];

  [['short', 'Short'], ['long', 'Full']].forEach((pair) => {
    const type = pair[0];
    const label = pair[1];
    const fid = promo.id + '-' + type;
    const existing = forms.find((f) => f.id === fid);
    if (existing) {
      existing.name = promo.name + ' — ' + label;
      existing.enabled = true;
      existing.tracking = Object.assign({}, existing.tracking, defaults);
      if (promo.adminWa) existing.adminWa = promo.adminWa;
      existing.promoId = promo.id;
      existing.platform = promo.platform;
      results.push(existing);
    } else {
      const form = {
        id: fid, name: promo.name + ' — ' + label, type: type, enabled: true,
        adminWa: promo.adminWa || '',
        tracking: Object.assign({}, defaults),
        pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' },
        submitAction: 'whatsapp', redirectUrl: '',
        promoId: promo.id, platform: promo.platform
      };
      forms.push(form);
      results.push(form);
    }
  });

  writeForms(forms);
  return { ok: true, forms: results };
}

/* ------------------------------------------------------------------ *
 *  Static file server                                                 *
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serveStatic(res, urlPath) {
  let filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (urlPath === '/' || urlPath === '') filePath = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(filePath)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ *
 *  Basic auth (protect the dashboard + admin API)                     *
 * ------------------------------------------------------------------ */
function isPublicPath(pathname, method) {
  if (pathname === '/api/track') return true;
  if (pathname === '/api/health') return true;
  if (method === 'GET' && (pathname === '/api/forms' || pathname === '/api/products')) return true;
  if (pathname.indexOf('/tracker/') === 0) return true;
  if (pathname === '/demo.html') return true;
  if (pathname === '/' || pathname === '/favicon.ico') return false;
  return false;
}

function checkAuth(req) {
  const h = req.headers['authorization'] || '';
  if (h.indexOf('Basic ') !== 0) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  return u === CONFIG.adminUser && p === CONFIG.adminPass;
}

function sendUnauthorized(res) {
  res.writeHead(401, {
    'Content-Type': 'application/json; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="Form Order System"',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

/* ------------------------------------------------------------------ *
 *  Router                                                             *
 * ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(reqUrl.pathname);
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Require login for dashboard + admin API (public form/tracker paths are allowed)
  if (!isPublicPath(pathname, method) && !checkAuth(req)) {
    return sendUnauthorized(res);
  }

  try {
    if (pathname === '/api/health') return send(res, 200, { ok: true, time: now() });

    if (pathname === '/api/track' && method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, apiTrack(body));
    }

    if (pathname === '/api/orders' && method === 'GET') {
      return send(res, 200, apiListOrders(Object.fromEntries(reqUrl.searchParams)));
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, apiCreateOrder(body));
    }

    if (pathname === '/api/stats' && method === 'GET') {
      return send(res, 200, apiStats());
    }

    if (pathname === '/api/export') {
      const q = Object.fromEntries(reqUrl.searchParams);
      const orders = readOrders().filter((o) => matchesFilter(o, q));
      const format = q.format || 'csv';
      if (format === 'json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.json"', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify(orders, null, 2));
      }
      const csv = '\uFEFF' + buildCsv(orders);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.csv"', 'Access-Control-Allow-Origin': '*' });
      return res.end(csv);
    }

    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch) {
      const id = orderMatch[1];
      if (method === 'PATCH') { const body = await readBody(req); return send(res, 200, apiUpdateOrder(id, body)); }
      if (method === 'DELETE') return send(res, 200, apiDeleteOrder(id));
    }

    if (pathname === '/api/forms' && method === 'GET') {
      return send(res, 200, { forms: readForms() });
    }
    if (pathname === '/api/forms' && method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, apiSaveForm(body, reqUrl.searchParams.get('id') || null));
    }
    if (pathname === '/api/forms' && method === 'DELETE') {
      return send(res, 200, apiDeleteForm(reqUrl.searchParams.get('id') || ''));
    }

    if (pathname === '/api/products' && method === 'GET') {
      return send(res, 200, { products: readProducts() });
    }
    if (pathname === '/api/products' && method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, apiSaveProduct(body, reqUrl.searchParams.get('id') || null));
    }
    if (pathname === '/api/products' && method === 'DELETE') {
      return send(res, 200, apiDeleteProduct(reqUrl.searchParams.get('id') || ''));
    }

    if (pathname === '/api/promos' && method === 'GET') {
      return send(res, 200, { promos: readPromos() });
    }
    if (pathname === '/api/promos/generate' && method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, apiGenerateForms(body.promoId || ''));
    }
    if (pathname === '/api/promos' && method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, apiSavePromo(body, reqUrl.searchParams.get('id') || null));
    }
    if (pathname === '/api/promos' && method === 'DELETE') {
      return send(res, 200, apiDeletePromo(reqUrl.searchParams.get('id') || ''));
    }

    if (pathname === '/api/config' && method === 'GET') {
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const publicBaseUrl = CONFIG.publicBaseUrl || (proto + '://' + req.headers.host);
      return send(res, 200, { publicBaseUrl: publicBaseUrl.replace(/\/$/, ''), googleSheetConfigured: !!CONFIG.googleSheetWebAppUrl });
    }

    return serveStatic(res, pathname);
  } catch (err) {
    return send(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

ensureDataFiles();
server.listen(PORT, () => {
  console.log('Form Order System running at http://localhost:' + PORT);
  console.log('  Dashboard : http://localhost:' + PORT + '/');
  console.log('  Tracker   : http://localhost:' + PORT + '/tracker/bcs-tracker.js');
  console.log('  API base  : http://localhost:' + PORT + '/api');
});
