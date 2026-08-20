/*!
 * BCS Form Tracker — single, reusable snippet.
 * One tracker handles ALL forms on a page. Tracking pixels (Meta / GTM /
 * TikTok / Google Ads) fire ONLY for the form the user actually submitted,
 * based on that form's config (set in the dashboard "Form Settings").
 *
 * Embed once per page:
 *   <script>
 *     window.BCS_CONFIG = {
 *       scriptUrl: 'http://localhost:3000/api/track',
 *       adminWa: '6282225678919'
 *     };
 *   </script>
 *   <script src="http://localhost:3000/tracker/bcs-tracker.js"></script>
 *
 * Each form (or button) gets a data-bcs-form="<formId>" attribute:
 *   <form data-bcs-form="form-short" ...>
 *     <input name="nama"> <input name="nohp"> <select name="workshop"> ...
 *   </form>
 *   <button data-bcs-form="form-direct">Konsultasi</button>
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Defaults + config                                                  *
   * ------------------------------------------------------------------ */
  var DEFAULTS = {
    scriptUrl: 'http://localhost:3000/api/track',
    adminWa: '',
    forms: {},
    promoMap: defaultPromoMap
  };

  function defaultPromoMap(raw) {
    var p = String(raw || '').toLowerCase();
    if (p.indexOf('cabin') > -1) return 'Cabin Air Treatment';
    if (p.indexOf('bundle') > -1) return 'Carwash Bundle';
    if (p.indexOf('wash') > -1) return 'Car Wash';
    if (p.indexOf('engine') > -1) return 'Engine Cleaning';
    if (p.indexOf('pure') > -1) return 'Pure Air Refresh';
    if (p.indexOf('sinopec') > -1) return 'Sinopec Oil';
    if (p.indexOf('sailun') > -1) return 'Sailun Tire';
    if (p.indexOf('tune') > -1) return 'Tune Up';
    if (p.indexOf('essential') > -1 || p.indexOf('performance') > -1) return 'Essential Care & Performance Care';
    if (p.indexOf('ac') > -1 || p.indexOf('recovery') > -1 || p.indexOf('recharge') > -1) return 'AC Recovery and Recharge';
    return raw || '';
  }

  function merge(a, b) {
    a = a || {};
    b = b || {};
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  var cfg = merge(DEFAULTS, global.BCS_CONFIG || {});
  var formsById = {};
  var formsLoaded = false;

  /* ------------------------------------------------------------------ *
   *  UTM / click-ID capture (page-level, stored once per session)       *
   * ------------------------------------------------------------------ */
  var PARAM_MAP = {
    utm_source: ['utm_source'],
    utm_medium: ['utm_medium'],
    utm_campaign: ['utm_campaign'],
    utm_term: ['utm_term'],
    utm_content: ['utm_content'],
    utm_id: ['utm_id'],
    gclid: ['gclid'],
    gbraid: ['gbraid'],
    wbraid: ['wbraid'],
    fbclid: ['fbclid'],
    entity_id: ['entity_id', 'entityid'],
    ttclid: ['ttclid'],
    msclkid: ['msclkid'],
    gc_campaign_id: ['campaign_id', 'campaignid', 'gc_campaign_id'],
    gc_adgroup_id: ['adgroup_id', 'adgroupid', 'gc_adgroup_id'],
    gc_ad_id: ['ad_id', 'adid', 'creative', 'gc_ad_id'],
    fb_campaign_id: ['fb_campaign_id'],
    fb_adset_id: ['fb_adset_id'],
    fb_ad_id: ['fb_ad_id'],
    tt_campaign_id: ['tt_campaign_id'],
    tt_adgroup_id: ['tt_adgroup_id'],
    tt_ad_id: ['tt_ad_id'],
    click_id: ['click_id', 'clickid'],
    keyword: ['keyword', 'q'],
    promo: ['promo', 'utm_promo'],
    site_source_name: ['site_source_name']
  };

  function captureParams() {
    var params = new URLSearchParams(global.location.search);
    var t = {};
    Object.keys(PARAM_MAP).forEach(function (key) {
      var aliases = PARAM_MAP[key];
      for (var i = 0; i < aliases.length; i++) {
        if (params.has(aliases[i])) { t[key] = params.get(aliases[i]); break; }
      }
      if (t[key] === undefined) t[key] = '';
    });
    return t;
  }

  function firstOf() {
    for (var i = 0; i < arguments.length; i++) { if (arguments[i]) return arguments[i]; }
    return '';
  }

  function detectPlatform(t) {
    var src = (t.utm_source || t.site_source_name || '').toLowerCase();
    if (src && (src.indexOf('facebook') > -1 || src.indexOf('instagram') > -1 || src.indexOf('meta') > -1)) return 'Meta Ads';
    if (src && (src.indexOf('tiktok') > -1)) return 'TikTok Ads';
    if (src && (src.indexOf('google') > -1)) return 'Google Ads';
    if (src && (src.indexOf('bing') > -1 || src.indexOf('msn') > -1)) return 'Microsoft Ads';
    if (t.ttclid || t.tt_campaign_id) return 'TikTok Ads';
    if (t.fbclid || t.entity_id || t.fb_campaign_id) return 'Meta Ads';
    if (t.gclid || t.gbraid || t.wbraid || t.gc_campaign_id) return 'Google Ads';
    if (t.msclkid) return 'Microsoft Ads';
    if (src) return src.charAt(0).toUpperCase() + src.slice(1);
    return 'Google (Organic)';
  }

  function buildTracking() {
    var t = captureParams();
    t.platform = detectPlatform(t);
    t.campaignId = firstOf(t.gc_campaign_id, t.fb_campaign_id, t.tt_campaign_id, t.utm_campaign);
    t.adgroupId = firstOf(t.gc_adgroup_id, t.fb_adset_id, t.tt_adgroup_id, t.utm_content);
    t.adId = firstOf(t.gc_ad_id, t.fb_ad_id, t.tt_ad_id, t.utm_term);
    t.clickId = firstOf(t.click_id, t.gclid, t.gbraid, t.wbraid, t.ttclid, t.msclkid);
    t.entityId = firstOf(t.fbclid, t.entity_id, t.clickId);
    t.promoName = cfg.promoMap(t.promo);
    return t;
  }

  function getSessionId() {
    try {
      if (!global.localStorage.getItem('bcs_session')) {
        global.localStorage.setItem('bcs_session', 'ID-' + Date.now().toString(36));
      }
      return global.localStorage.getItem('bcs_session');
    } catch (e) { return 'ID-' + Date.now().toString(36); }
  }

  /* ------------------------------------------------------------------ *
   *  Form config (fetched from backend, merged with inline config)      *
   * ------------------------------------------------------------------ */
  function defaultFormConfig(formId) {
    return {
      id: formId,
      name: formId,
      type: 'short',
      enabled: true,
      adminWa: cfg.adminWa,
      tracking: { metaPixel: false, gtm: false, tiktok: false, googleAds: false },
      pixelIds: { metaPixel: '', gtm: '', tiktok: '', googleAds: '' },
      submitAction: 'whatsapp',
      redirectUrl: ''
    };
  }

  function getFormConfig(formId) {
    var base = defaultFormConfig(formId);
    var inline = (cfg.forms && cfg.forms[formId]) || (cfg.forms && cfg.forms[formId]);
    var server = formsById[formId] || {};
    var merged = merge(merge(base, server), inline);
    merged.tracking = merge(base.tracking, merge(server.tracking, (inline && inline.tracking) || {}));
    merged.pixelIds = merge(base.pixelIds, merge(server.pixelIds, (inline && inline.pixelIds) || {}));
    return merged;
  }

  function loadForms(cb) {
    var scriptUrl = cfg.scriptUrl || '';
    var base;
    if (/^https?:\/\//.test(scriptUrl)) {
      base = scriptUrl.replace(/\/api\/track\/?$/, '');
    } else {
      base = global.location.origin;
    }
    if (!base) { formsLoaded = true; return cb && cb(); }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', base.replace(/\/$/, '') + '/api/forms', true);
      xhr.onload = function () {
        try {
          var json = JSON.parse(xhr.responseText);
          (json.forms || []).forEach(function (f) { formsById[f.id] = f; });
        } catch (e) {}
        formsLoaded = true;
        cb && cb();
      };
      xhr.onerror = function () { formsLoaded = true; cb && cb(); };
      xhr.send();
    } catch (e) { formsLoaded = true; cb && cb(); }
  }

  /* ------------------------------------------------------------------ *
   *  Tracking event fire (per form config)                              *
   * ------------------------------------------------------------------ */
  function fireTracking(form, tracking, lead) {
    var trk = form.tracking || {};
    var ids = form.pixelIds || {};
    var data = {
      form_id: form.id,
      form_name: form.name,
      platform: tracking.platform,
      campaign_id: tracking.campaignId,
      adgroup_id: tracking.adgroupId,
      ad_id: tracking.adId,
      value: lead.total || lead.value || undefined,
      currency: 'IDR'
    };

    if (trk.metaPixel) {
      try {
        if (global.fbq) {
          if (ids.metaPixel) global.fbq('trackSinglePixel', ids.metaPixel, 'Lead', data);
          else global.fbq('track', 'Lead', data);
        }
      } catch (e) {}
    }
    if (trk.tiktok) {
      try {
        if (global.ttq) {
          if (ids.tiktok) global.ttq.instance(ids.tiktok).track('SubmitForm', data);
          else global.ttq.track('SubmitForm', data);
        }
      } catch (e) {}
    }
    if (trk.gtm) {
      try {
        if (ids.gtm) ensureGtm(ids.gtm);
        global.dataLayer = global.dataLayer || [];
        global.dataLayer.push({ event: 'bcs_form_submit', form_id: form.id, form_name: form.name, platform: tracking.platform, value: data.value, currency: data.currency });
      } catch (e) {}
    }
    if (trk.googleAds) {
      try {
        if (global.gtag) global.gtag('event', 'conversion', { send_to: ids.googleAds || undefined, value: data.value || undefined, currency: 'IDR' });
      } catch (e) {}
    }
  }

  function ensureGtm(id) {
    if (!id || global.document.getElementById('bcs-gtm')) return;
    global.dataLayer = global.dataLayer || [];
    global.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = global.document.createElement('script');
    s.id = 'bcs-gtm';
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
    global.document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   *  Field collection + submit                                          *
   * ------------------------------------------------------------------ */
  function collectFields(container) {
    var lead = {};
    if (!container) return lead;
    container.querySelectorAll('[name], [data-field]').forEach(function (el) {
      if (el.type === 'radio' || el.type === 'checkbox') {
        if (el.checked) lead[el.name || el.getAttribute('data-field')] = el.value;
        return;
      }
      lead[el.name || el.getAttribute('data-field')] = el.value || '';
    });
    if (lead.plat) lead.plat = String(lead.plat).toUpperCase();

    var products = [];
    container.querySelectorAll('input[data-product]').forEach(function (el) {
      if (el.type === 'checkbox' && !el.checked) return;
      var id = el.getAttribute('data-product');
      var name = el.getAttribute('data-name') || id;
      var price = Number(el.getAttribute('data-price')) || 0;
      var qtyEl = container.querySelector('[data-qty="' + id + '"]');
      var qty = qtyEl ? (parseInt(qtyEl.value, 10) || 1) : 1;
      products.push({ id: id, name: name, price: price, qty: qty });
    });
    if (products.length) {
      lead.products = products;
      lead.total = products.reduce(function (s, p) { return s + p.price * p.qty; }, 0);
    }
    return lead;
  }

  function isEmpty(v) { return v === undefined || v === null || v === '' || v === '-'; }

  function getRequiredFields(form) {
    if (Array.isArray(form.fields) && form.fields.length) {
      return form.fields.filter(function (f) { return f.required; }).map(function (f) { return f.name; });
    }
    var required = ['nama', 'nohp'];
    if (form.type === 'long') required = ['nama', 'nohp', 'workshop'];
    if (form.type === 'order') required = ['nama', 'nohp'];
    return required;
  }
  function validate(form, lead) {
    var required = getRequiredFields(form);
    for (var i = 0; i < required.length; i++) {
      if (isEmpty(lead[required[i]])) return required[i];
    }
    if (form.type === 'order' && (!lead.products || !lead.products.length)) {
      // only enforce if no dynamic fields override
      if (!Array.isArray(form.fields) || !form.fields.length) return 'produk';
    }
    return null;
  }

  function sendToBackend(payload, cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', cfg.scriptUrl, true);
      xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
      xhr.onloadend = function () { cb && cb(); };
      xhr.onerror = function () { cb && cb(); };
      xhr.send(JSON.stringify(payload));
    } catch (e) { cb && cb(); }
  }

  function buildWaMessage(form, tracking, lead) {
    var greetPlat = 'informasi dari *Google*';
    var sl = (tracking.platform || '').toLowerCase();
    if (sl.indexOf('meta') > -1 || sl.indexOf('fb') > -1 || sl.indexOf('ig') > -1) greetPlat = 'iklan *Meta (Facebook/Instagram)*';
    else if (sl.indexOf('tiktok') > -1) greetPlat = 'iklan *TikTok*';
    else if (sl.indexOf('google') > -1 && sl.indexOf('organic') === -1) greetPlat = 'iklan *Google Ads*';

    var promoMsg = tracking.promoName ? 'mengambil promo *' + tracking.promoName + '*' : 'melakukan *reservasi servis kendaraan*';
    var msg = 'Halo Admin *Bosch Car Service*, saya melihat ' + greetPlat + ' dan ingin ' + promoMsg + '.\n\n';
    if (form.type === 'direct') {
      msg += '\nMohon informasi ketersediaan jadwalnya. Terima kasih.';
    } else {
      // dynamic fields to WA message
      var fields = Array.isArray(form.fields) && form.fields.length ? form.fields : null;
      if (fields) {
        var iconMap = { nama: '👤', nohp: '📞', plat: '🪪', mobil: '🚘', workshop: '📍', cabang: '📍', keluhan: '🛠️' };
        fields.forEach(function (f) {
          var v = lead[f.name] || '-';
          var icon = iconMap[f.name] || '📝';
          var lbl = f.label || f.name;
          msg += icon + ' *' + lbl + ':* ' + v + '\n';
        });
      } else {
        msg += '👤 *Nama:* ' + (lead.nama || '-') + '\n📞 *WhatsApp:* ' + (lead.nohp || '-') + '\n';
        if (form.type === 'long') {
          msg += '🪪 *Plat:* ' + (lead.plat || '-') + '\n🚘 *Mobil:* ' + (lead.mobil || '-') + '\n';
        }
        msg += '📍 *Lokasi:* ' + (lead.workshop || '-') + '\n';
        if (!isEmpty(lead.keluhan)) msg += '🛠️ *Keluhan:* ' + lead.keluhan + '\n';
      }
      if (form.type === 'order' && lead.products && lead.products.length) {
        msg += '\n🛒 *Layanan dipilih:*\n';
        lead.products.forEach(function (p) { msg += '- ' + (p.qty || 1) + 'x ' + p.name + '\n'; });
        msg += '*Total:* Rp ' + Number(lead.total || 0).toLocaleString('id-ID') + '\n';
      }
      msg += '\nMohon informasi ketersediaan jadwalnya. Terima kasih.';
    }
    msg += '\n\n---\n*System Tracking:*\nSource: ' + tracking.platform + '\nCampaign: ' + tracking.campaignId + '\nAdSet/AdGroup: ' + tracking.adgroupId + '\nAd ID: ' + tracking.adId + '\nClick ID: ' + tracking.clickId + '\nEntity ID: ' + tracking.entityId + '\nPromo: ' + (tracking.promoName || '-');
    return msg;
  }

  function submit(formId, container, isSubmit) {
    var form = getFormConfig(formId);
    var lead = collectFields(container);
    var tracking = buildTracking();

    var missing = null;
    if (isSubmit) {
      missing = validate(form, lead);
    } else {
      if (isEmpty(lead.nama) && isEmpty(lead.nohp)) return;
    }

    // Valid + submitted => "Submitted" (sent). Everything else (draft or
    // invalid submit) is still recorded, but as "Draft" (not sent).
    var isSent = isSubmit && !missing;
    var payload = {
      sessionId: getSessionId() + '-' + formId.toUpperCase(),
      formId: form.id,
      formName: form.name,
      status: isSent ? 'Submitted' : 'Draft',
      lead: lead,
      tracking: tracking,
      events: { metaPixel: !!form.tracking.metaPixel, gtm: !!form.tracking.gtm, tiktok: !!form.tracking.tiktok, googleAds: !!form.tracking.googleAds }
    };

    sendToBackend(payload);

    if (!isSubmit) return;

    if (!isSent) {
      global.alert('Mohon lengkapi data wajib (' + missing + ').');
      return;
    }

    // Tracking pixels fire ONLY for a valid, submitted form.
    fireTracking(form, tracking, lead);
    var btn = container.querySelector('button[type="submit"], button, [data-bcs-submit]');
    var original = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = 'Memproses...';
    global.setTimeout(function () {
      if (btn) btn.innerHTML = original;
      var wa = form.adminWa || cfg.adminWa;
      if (form.submitAction === 'whatsapp' && wa) {
        global.open('https://wa.me/' + wa.replace(/\D/g, '') + '?text=' + encodeURIComponent(buildWaMessage(form, tracking, lead)), '_blank');
      } else if (form.submitAction === 'redirect' && form.redirectUrl) {
        global.location.href = form.redirectUrl;
      }
    }, 400);
  }

  function wireAll() {
    var nodes = global.document.querySelectorAll('[data-bcs-form]');
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        var formId = el.getAttribute('data-bcs-form');
        if (el.tagName === 'FORM') {
          el.addEventListener('submit', function (e) { e.preventDefault(); submit(formId, el, true); });
          el.querySelectorAll('input, select, textarea').forEach(function (f) {
            f.addEventListener('blur', function () { submit(formId, el, false); });
            f.addEventListener('change', function () { submit(formId, el, false); });
          });
        } else {
          el.addEventListener('click', function () { submit(formId, el, true); });
        }
      })(nodes[i]);
    }
  }

  function init() {
    loadForms(wireAll);
  }

  global.BcsTracker = {
    init: init,
    submit: submit,
    buildTracking: buildTracking,
    getFormConfig: getFormConfig,
    captureParams: captureParams
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(window);
