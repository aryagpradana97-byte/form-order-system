(function () {
  'use strict';

  var state = { orders: [], forms: [], products: [], promos: [], filters: {}, publicBaseUrl: '', columns: {} };
  var STATUS_OPTIONS = ['Draft', 'Submitted', 'Valid', 'Connected', 'Not Connected', 'Deal'];
  var COLUMN_OPTIONS = [
    { key: 'campaignId', label: 'Campaign ID' },
    { key: 'adgroupId', label: 'AdGroup / AdSet ID' },
    { key: 'adId', label: 'Ad ID' },
    { key: 'clickId', label: 'Click ID' },
    { key: 'entityId', label: 'Entity ID' },
    { key: 'utm_source', label: 'UTM Source' },
    { key: 'utm_medium', label: 'UTM Medium' },
    { key: 'utm_campaign', label: 'UTM Campaign' },
    { key: 'utm_term', label: 'UTM Term' },
    { key: 'utm_content', label: 'UTM Content' },
    { key: 'utm_id', label: 'UTM ID' },
    { key: 'total', label: 'Total' },
    { key: 'notes', label: 'Notes' },
    { key: 'events', label: 'Events' }
  ];
  try { state.columns = JSON.parse(localStorage.getItem('fo_columns')) || {}; } catch (e) { state.columns = {}; }
  var debounceTimer = null;

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) { return r.json(); });
  }

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function statusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s.indexOf('draft') > -1) return 'draft';
    if (s.indexOf('submit') > -1) return 'submitted';
    if (s.indexOf('not') > -1 && s.indexOf('connect') > -1) return 'notconnected';
    if (s.indexOf('connect') > -1) return 'connected';
    if (s.indexOf('valid') > -1) return 'valid';
    if (s.indexOf('deal') > -1) return 'deal';
    if (s.indexOf('confirm') > -1) return 'confirmed';
    if (s.indexOf('paid') > -1) return 'paid';
    if (s.indexOf('cancel') > -1) return 'cancelled';
    return 'draft';
  }

  function platformClass(platform) {
    var p = String(platform || '').toLowerCase();
    if (p.indexOf('meta') > -1 || p.indexOf('fb') > -1 || p.indexOf('instagram') > -1) return 'Meta';
    if (p.indexOf('google') > -1) return 'Google';
    if (p.indexOf('tiktok') > -1) return 'TikTok';
    if (p.indexOf('microsoft') > -1 || p.indexOf('bing') > -1) return 'Microsoft';
    return 'Meta';
  }

  /* ------------------------- View switching ------------------------- */
  function switchView(view) {
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    $('#view-' + view).classList.add('active');
    $all('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.view === view); });
    if (location.hash !== '#' + view) {
      try { history.replaceState(null, '', '#' + view); } catch (e) { location.hash = view; }
    }
  }

  /* --------------------------- Orders ------------------------------- */
  function currentFilterQuery() {
    var f = state.filters;
    var q = new URLSearchParams();
    if (f.search) q.set('q', f.search);
    if (f.platform) q.set('platform', f.platform);
    if (f.formId) q.set('formId', f.formId);
    if (f.status) q.set('status', f.status);
    if (f.from) q.set('from', f.from);
    if (f.to) q.set('to', f.to);
    return q;
  }

  function loadOrders() {
    return api('/api/orders?' + currentFilterQuery().toString()).then(function (d) {
      state.orders = d.orders || [];
      renderOrders();
    });
  }

  function renderStats() {
    var grid = $('#stats-grid');
    grid.innerHTML = '';
    api('/api/stats').then(function (s) {
      var cards = [
        { v: s.total, l: 'Total Lead' },
        { v: s.byStatus.Submitted || 0, l: 'Submitted' },
        { v: s.byStatus.Valid || 0, l: 'Valid' },
        { v: s.byStatus.Connected || 0, l: 'Connected' },
        { v: s.byStatus['Not Connected'] || 0, l: 'Not Connected' },
        { v: s.byStatus.Deal || 0, l: 'Deal' }
      ];
      cards.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'stat-card';
        el.innerHTML = '<div class="v">' + c.v + '</div><div class="l">' + c.l + '</div>';
        grid.appendChild(el);
      });
    });
  }

  function colCell(key, o) {
    if (key === 'total') return o.total ? 'Rp ' + Number(o.total).toLocaleString('id-ID') : '-';
    if (key === 'events') {
      var ev = o.events || {};
      return ['metaPixel', 'gtm', 'tiktok', 'googleAds'].filter(function (k) { return ev[k]; }).join(', ') || '-';
    }
    return esc(o[key] || '-');
  }

  function renderOrders() {
    var thead = $('#orders-head');
    var body = $('#orders-body');
    var empty = $('#orders-empty');
    var enabled = COLUMN_OPTIONS.filter(function (c) { return state.columns[c.key]; });
    var baseHeaders = ['Time', 'Form', 'Status', 'Name', 'Phone', 'Location', 'Platform', 'Campaign', 'Promo'];

    thead.innerHTML = '<tr>' + baseHeaders.concat(enabled.map(function (c) { return c.label; })).concat(['Actions'])
      .map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';

    body.innerHTML = '';
    if (!state.orders.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    state.orders.forEach(function (o) {
      var tr = document.createElement('tr');
      var time = o.createdAt ? new Date(o.createdAt) : null;
      var timeStr = time ? time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-';
      var cells =
        '<td>' + esc(timeStr) + '</td>' +
        '<td>' + esc(o.form || '-') + '</td>' +
        '<td><span class="badge ' + statusClass(o.status) + '">' + esc(o.status) + '</span></td>' +
        '<td>' + esc(o.nama || '-') + '</td>' +
        '<td>' + esc(o.nohp || '-') + '</td>' +
        '<td>' + esc(o.workshop || '-') + '</td>' +
        '<td><span class="platform-pill ' + platformClass(o.platform) + '">' + esc(o.platform || '-') + '</span></td>' +
        '<td>' + esc(o.utm_campaign || o.campaignId || '-') + '</td>' +
        '<td>' + esc(o.promo || '-') + '</td>';
      cells += enabled.map(function (c) { return '<td>' + colCell(c.key, o) + '</td>'; }).join('');
      cells += '<td><span class="row-actions"></span></td>';
      tr.innerHTML = cells;
      var actions = tr.querySelector('.row-actions');
      actions.innerHTML =
        '<button class="btn ghost sm" data-act="view">Detail</button>' +
        '<button class="btn danger sm" data-act="del">Delete</button>';
      tr.addEventListener('click', function (e) {
        var act = e.target && e.target.getAttribute ? e.target.getAttribute('data-act') : null;
        if (act === 'del') { e.stopPropagation(); deleteOrder(o.id); return; }
        if (act === 'view') { e.stopPropagation(); }
        openDetail(o.id);
      });
      body.appendChild(tr);
    });
  }

  /* -------------------- Column display options ---------------------- */
  function openColumns() {
    var box = $('#col-options');
    box.innerHTML = '';
    COLUMN_OPTIONS.forEach(function (c) {
      var row = document.createElement('label');
      row.className = 'col-row';
      row.innerHTML = '<input type="checkbox" data-col="' + c.key + '"' + (state.columns[c.key] ? ' checked' : '') + '><span>' + c.label + '</span>';
      box.appendChild(row);
    });
    $('#col-modal').classList.remove('hidden');
  }

  function saveColumns() {
    COLUMN_OPTIONS.forEach(function (c) {
      var cb = $('#col-modal').querySelector('[data-col="' + c.key + '"]');
      state.columns[c.key] = !!(cb && cb.checked);
    });
    try { localStorage.setItem('fo_columns', JSON.stringify(state.columns)); } catch (e) {}
    $('#col-modal').classList.add('hidden');
    renderOrders();
  }

  function cancelColumns() { $('#col-modal').classList.add('hidden'); }

  function deleteOrder(id) {
    if (!confirm('Delete this order?')) return;
    api('/api/orders/' + id, { method: 'DELETE' }).then(function () {
      toast('Order deleted');
      loadOrders(); renderStats();
    });
  }

  function openDetail(id) {
    var o = state.orders.find(function (x) { return x.id === id; });
    if (!o) return;
    $('#modal-title').textContent = 'Order Detail — ' + (o.nama || o.sessionId);
    var grid = [
      ['Status', o.status], ['Form', o.form], ['Session ID', o.sessionId],
      ['Name', o.nama], ['Phone', o.nohp], ['Plate', o.plat],
      ['Car', o.mobil], ['Location', o.workshop], ['Complaint', o.keluhan],
      ['Platform', o.platform], ['Promo', o.promo], ['Keyword', o.keyword]
    ];
    var track = [
      ['utm_source', o.utm_source], ['utm_medium', o.utm_medium], ['utm_campaign', o.utm_campaign],
      ['utm_term', o.utm_term], ['utm_content', o.utm_content], ['utm_id', o.utm_id],
      ['Campaign ID', o.campaignId], ['AdGroup/AdSet ID', o.adgroupId], ['Ad ID', o.adId],
      ['Click ID', o.clickId], ['Entity ID', o.entityId],
      ['gclid', o.gclid], ['gbraid', o.gbraid], ['wbraid', o.wbraid],
      ['fbclid', o.fbclid], ['entity_id', o.entity_id], ['ttclid', o.ttclid], ['msclkid', o.msclkid],
      ['GC campaign_id', o.gc_campaign_id], ['GC adgroup_id', o.gc_adgroup_id], ['GC ad_id', o.gc_ad_id],
      ['FB campaign_id', o.fb_campaign_id], ['FB adset_id', o.fb_adset_id], ['FB ad_id', o.fb_ad_id],
      ['TT campaign_id', o.tt_campaign_id], ['TT adgroup_id', o.tt_adgroup_id], ['TT ad_id', o.tt_ad_id]
    ];
    var ev = o.events || {};
    var eventsStr = ['metaPixel', 'gtm', 'tiktok', 'googleAds'].filter(function (k) { return ev[k]; }).join(', ') || '-';

    function gridHtml(items) {
      return items.map(function (it) {
        return '<div class="detail-item"><div class="k">' + esc(it[0]) + '</div><div class="val">' + esc(it[1] || '-') + '</div></div>';
      }).join('');
    }

    var productsStr = (o.products && o.products.length)
      ? o.products.map(function (p) { return (p.qty ? p.qty + 'x ' : '') + p.name; }).join(', ')
      : '-';

    $('#modal-body').innerHTML =
      '<div class="detail-section"><h4>Lead</h4><div class="detail-grid">' + gridHtml(grid) + '</div></div>' +
      '<div class="detail-section"><h4>Products / Services</h4><div class="val">' + esc(productsStr) + '</div><div class="val" style="margin-top:4px">Total: <strong>' + (o.total ? 'Rp ' + Number(o.total).toLocaleString('id-ID') : '-') + '</strong></div></div>' +
      '<div class="detail-section"><h4>Tracking</h4><div class="detail-grid">' + gridHtml(track) + '</div></div>' +
      '<div class="detail-section"><h4>Events Fired</h4><div class="val">' + esc(eventsStr) + '</div></div>' +
      '<div class="status-editor">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<select id="detail-status" class="input">' +
      STATUS_OPTIONS.map(function (s) {
        return '<option' + (s === o.status ? ' selected' : '') + '>' + s + '</option>';
      }).join('') +
      '</select>' +
      '<button class="btn primary sm" id="detail-save">Save Status</button>' +
      '</div>' +
      '<div class="detail-section" style="margin-top:12px"><h4>Notes / Reason</h4>' +
      '<textarea id="detail-notes" class="input" style="width:100%;min-height:60px" placeholder="Write the reason / CS follow-up note here">' + esc(o.notes || '') + '</textarea></div>' +
      '</div>';

    $('#detail-save').addEventListener('click', function () {
      var status = $('#detail-status').value;
      var notes = $('#detail-notes').value.trim();
      api('/api/orders/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status, notes: notes }) })
        .then(function () { toast('Status & notes saved'); closeModal(); loadOrders(); renderStats(); });
    });

    $('#modal').classList.remove('hidden');
  }

  function closeModal() { $('#modal').classList.add('hidden'); }

  /* --------------------------- Forms ------------------------------- */
  function loadForms() {
    return api('/api/forms').then(function (d) {
      state.forms = d.forms || [];
      renderForms();
      renderFormFilters();
    });
  }

  function renderFormFilters() {
    var sel = $('#f-form');
    var current = state.filters.formId || '';
    sel.innerHTML = '<option value="">Semua Form</option>' +
      state.forms.map(function (f) {
        return '<option value="' + esc(f.id) + '"' + (f.id === current ? ' selected' : '') + '>' + esc(f.name) + '</option>';
      }).join('');
  }

  function renderPlatformFilter() {
    var sel = $('#f-platform');
    var current = state.filters.platform || '';
    api('/api/stats').then(function (s) {
      var platforms = Object.keys(s.byPlatform || {});
      sel.innerHTML = '<option value="">Semua Platform</option>' +
        platforms.map(function (p) {
          return '<option value="' + esc(p) + '"' + (p === current ? ' selected' : '') + '>' + esc(p) + '</option>';
        }).join('');
    });
  }

  function trackingToggle(name, label, checked) {
    return '<div class="toggle-row"><span>' + esc(label) + '</span>' +
      '<label class="toggle"><input type="checkbox" data-t="' + esc(name) + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="slider"></span></label></div>';
  }

  function pixelField(key, label, placeholder, value) {
    return '<div class="form-field"><label>' + esc(label) + '</label>' +
      '<input type="text" data-px="' + esc(key) + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '" /></div>';
  }

  function renderForms() {
    var list = $('#forms-list');
    list.innerHTML = '';
    state.forms.forEach(function (f) {
      var t = f.tracking || {};
      var px = f.pixelIds || {};
      var card = document.createElement('div');
      card.className = 'form-card';
      card.dataset.id = f.id;
      card.innerHTML =
        '<div class="form-card-head"><h3>' + esc(f.name) + '</h3><span class="type-tag">' + esc(f.type) + '</span></div>' +
        '<div class="form-field"><label>Form Name</label><input type="text" data-f="name" value="' + esc(f.name) + '" /></div>' +
        '<div class="form-field"><label>Tipe</label><select data-f="type">' +
        ['short', 'long', 'direct', 'order'].map(function (t2) {
          return '<option value="' + t2 + '"' + (f.type === t2 ? ' selected' : '') + '>' + t2 + '</option>';
        }).join('') + '</select></div>' +
        '<div class="form-field"><label>Admin WhatsApp (number)</label><input type="text" data-f="adminWa" value="' + esc(f.adminWa || '') + '" placeholder="628xxxxxx" /></div>' +
        trackingToggle('metaPixel', 'Meta Pixel', t.metaPixel) +
        trackingToggle('gtm', 'Google Tag Manager', t.gtm) +
        trackingToggle('tiktok', 'TikTok Pixel', t.tiktok) +
        trackingToggle('googleAds', 'Google Ads (gtag)', t.googleAds) +
        '<div class="pixel-fields">' +
        '<h5>Pixel IDs (optional)</h5>' +
        pixelField('metaPixel', 'Meta Pixel ID', 'e.g. 123456789', px.metaPixel) +
        pixelField('tiktok', 'TikTok Pixel ID', 'e.g. ABCDEF123', px.tiktok) +
        pixelField('gtm', 'GTM Container ID', 'e.g. GTM-XXXXXXX', px.gtm) +
        pixelField('googleAds', 'Google Ads Conversion ID/Label', 'e.g. AW-123456/AbCdEf', px.googleAds) +
        '</div>' +
        '<div class="toggle-row"><span>Active</span>' +
        '<label class="toggle"><input type="checkbox" data-f="enabled"' + (f.enabled ? ' checked' : '') + '><span class="slider"></span></label></div>' +
        '<div class="form-card-actions">' +
        '<button class="btn ghost" data-act="embed">Copy Embed</button>' +
        '<button class="btn primary" data-act="save">Save</button>' +
        '<button class="btn danger" data-act="del">Delete</button>' +
        '</div>';

      card.querySelector('[data-act="save"]').addEventListener('click', function () { saveForm(f.id, card); });
      card.querySelector('[data-act="del"]').addEventListener('click', function () { deleteForm(f.id); });
      card.querySelector('[data-act="embed"]').addEventListener('click', function () { openEmbed(f.id); });
      list.appendChild(card);
    });
  }

  function saveForm(id, card) {
    var tracking = {};
    card.querySelectorAll('[data-t]').forEach(function (cb) { tracking[cb.dataset.t] = cb.checked; });
    var pixelIds = {};
    card.querySelectorAll('[data-px]').forEach(function (inp) { pixelIds[inp.dataset.px] = inp.value.trim(); });
    var body = {
      id: id,
      name: card.querySelector('[data-f="name"]').value,
      type: card.querySelector('[data-f="type"]').value,
      adminWa: card.querySelector('[data-f="adminWa"]').value,
      enabled: card.querySelector('[data-f="enabled"]').checked,
      tracking: tracking,
      pixelIds: pixelIds
    };
    api('/api/forms?id=' + encodeURIComponent(id), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function () { toast('Form saved'); loadForms(); });
  }

  function addForm() {
    var id = 'form-' + Date.now().toString(36);
    api('/api/forms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, name: 'New Form', type: 'short', enabled: true, adminWa: '', tracking: { metaPixel: false, gtm: false, tiktok: false, googleAds: false } })
    }).then(function () { toast('Form added'); loadForms(); });
  }

  function deleteForm(id) {
    if (!confirm('Delete this form?')) return;
    api('/api/forms?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      toast('Form deleted'); loadForms();
    });
  }

  /* --------------------------- Products ---------------------------- */
  function loadProducts() {
    return api('/api/products').then(function (d) {
      state.products = d.products || [];
      renderProducts();
    });
  }

  function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

  function renderProducts() {
    var list = $('#products-list');
    if (!list) return;
    list.innerHTML = '';
    state.products.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'form-card';
      card.dataset.id = p.id;
      card.innerHTML =
        '<div class="form-card-head"><h3>' + esc(p.name) + '</h3><span class="type-tag">' + esc(p.category) + '</span></div>' +
        '<div class="form-field"><label>Name</label><input type="text" data-p="name" value="' + esc(p.name) + '" /></div>' +
        '<div class="form-field"><label>Category</label><input type="text" data-p="category" value="' + esc(p.category) + '" /></div>' +
        '<div class="form-field"><label>Price (Rp)</label><input type="number" data-p="price" value="' + esc(p.price) + '" /></div>' +
        '<div class="form-card-actions"><button class="btn primary" data-act="save">Save</button><button class="btn danger" data-act="del">Delete</button></div>';
      card.querySelector('[data-act="save"]').addEventListener('click', function () { saveProduct(p.id, card); });
      card.querySelector('[data-act="del"]').addEventListener('click', function () { deleteProduct(p.id); });
      list.appendChild(card);
    });
  }

  function saveProduct(id, card) {
    var body = {
      id: id,
      name: card.querySelector('[data-p="name"]').value,
      category: card.querySelector('[data-p="category"]').value,
      price: Number(card.querySelector('[data-p="price"]').value) || 0
    };
    api('/api/products?id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function () { toast('Product saved'); loadProducts(); });
  }

  function addProduct() {
    var id = 'p-' + Date.now().toString(36);
    api('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, name: 'New Service', category: 'Service', price: 0 }) })
      .then(function () { toast('Product added'); loadProducts(); });
  }

  function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    api('/api/products?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Product deleted'); loadProducts(); });
  }

  /* --------------------------- Promos ------------------------------ */
  function loadPromos() {
    return api('/api/promos').then(function (d) {
      state.promos = d.promos || [];
      renderPromos();
    });
  }

  function renderPromos() {
    var list = $('#promos-list');
    if (!list) return;
    list.innerHTML = '';
    state.promos.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'form-card';
      card.dataset.id = p.id;
      var forms = state.forms.filter(function (f) { return f.promoId === p.id || f.id.indexOf(p.id) === 0; });
      var genRows = forms.length
        ? forms.map(function (f) {
          return '<div class="gen-form-row"><span class="tname">' + esc(f.name) + ' <span class="badge ' + (f.type === 'long' ? 'confirmed' : 'submitted') + '">' + (f.type === 'long' ? 'Full' : f.type) + '</span></span>' +
            '<button class="btn ghost sm" data-embed="' + esc(f.id) + '">Copy Embed</button></div>';
        }).join('')
        : '<div class="gen-form-row" style="color:#6b7686">No forms yet. Click "Generate Short + Full".</div>';
      card.innerHTML =
        '<div class="form-card-head"><h3>' + esc(p.name) + '</h3><span class="promo-platform">' + esc(p.platform) + '</span></div>' +
        '<div class="form-field"><label>Promo Name</label><input type="text" data-promo="name" value="' + esc(p.name) + '" /></div>' +
        '<div class="form-field"><label>Platform</label><input type="text" data-promo="platform" value="' + esc(p.platform) + '" list="platform-list" /></div>' +
        '<div class="form-field"><label>Promo Code (optional)</label><input type="text" data-promo="code" value="' + esc(p.code || '') + '" /></div>' +
        '<div class="form-field"><label>Admin WhatsApp (optional)</label><input type="text" data-promo="adminWa" value="' + esc(p.adminWa || '') + '" /></div>' +
        '<div class="form-card-actions"><button class="btn ghost" data-gen="' + esc(p.id) + '">⚡ Generate Short + Full</button>' +
        '<button class="btn primary" data-save="' + esc(p.id) + '">Save</button>' +
        '<button class="btn danger" data-del="' + esc(p.id) + '">Delete</button></div>' +
        '<div class="gen-forms"><h5>Forms for this promo</h5>' + genRows + '</div>';
      card.querySelector('[data-save]').addEventListener('click', function () { savePromo(p.id, card); });
      card.querySelector('[data-del]').addEventListener('click', function () { deletePromo(p.id); });
      card.querySelector('[data-gen]').addEventListener('click', function () { generateForms(p.id); });
      card.querySelectorAll('[data-embed]').forEach(function (b) { b.addEventListener('click', function () { openEmbed(b.getAttribute('data-embed')); }); });
      list.appendChild(card);
    });
  }

  function savePromo(id, card) {
    var body = {
      id: id,
      name: card.querySelector('[data-promo="name"]').value,
      platform: card.querySelector('[data-promo="platform"]').value,
      code: card.querySelector('[data-promo="code"]').value,
      adminWa: card.querySelector('[data-promo="adminWa"]').value
    };
    api('/api/promos?id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function () { toast('Promo saved'); loadPromos(); });
  }

  function addPromo() {
    var id = 'promo-' + Date.now().toString(36);
    api('/api/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, name: 'New Promo', platform: 'Meta Ads', code: '', active: true, adminWa: '' }) })
      .then(function () { toast('Promo added'); loadPromos(); });
  }

  function deletePromo(id) {
    if (!confirm('Delete this promo? (its forms remain)')) return;
    api('/api/promos?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Promo deleted'); loadPromos(); });
  }

  function generateForms(promoId) {
    api('/api/promos/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promoId: promoId }) })
      .then(function () { toast('Short + Full forms created'); loadForms().then(loadPromos); });
  }

  /* --------------------------- Embed code -------------------------- */
  function selectField(name, label, placeholder) {
    return '<div style="margin-bottom:12px"><label style="display:block;font-weight:600;margin-bottom:4px;font-size:13px;color:#333">' + esc(label) + '</label>' +
      '<input name="' + name + '" type="text" placeholder="' + esc(placeholder || '') + '" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box"/></div>';
  }
  function textField(name, label, placeholder) {
    return '<div style="margin-bottom:12px"><label style="display:block;font-weight:600;margin-bottom:4px;font-size:13px;color:#333">' + esc(label) + '</label>' +
      '<select name="' + name + '" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box">' +
      '<option value="" disabled selected>-- Pilih Cabang --</option><option>Kelapa Gading</option><option>PIK2</option></select></div>';
  }

  function buildEmbedHtml(form) {
    var base = state.publicBaseUrl || 'http://localhost:3000';
    var wa = form.adminWa || '';
    var body = '';
    if (form.type === 'direct') {
      body = '<button type="button" data-bcs-form="' + esc(form.id) + '" style="padding:14px 24px;background:#25D366;color:#fff;border:none;border-radius:50px;font-size:16px;font-weight:bold;cursor:pointer">💬 Konsultasi via WhatsApp</button>';
    } else {
      body = selectField('nama', 'Nama Lengkap', 'Contoh: Budi Santoso') +
        selectField('nohp', 'Nomor WhatsApp', '0812...');
      if (form.type === 'long') {
        body += selectField('plat', 'Plat Nomor', 'B 1234 ABC') + selectField('mobil', 'Merek & Tipe Mobil', 'Honda HR-V') + textField('workshop', 'Lokasi Bengkel') +
          selectField('keluhan', 'Keluhan / Layanan', 'Opsional');
      } else if (form.type === 'short') {
        body += textField('workshop', 'Lokasi Bengkel');
      } else if (form.type === 'order') {
        body += textField('workshop', 'Lokasi Bengkel') + '<div id="fo-products" style="margin-bottom:12px"></div>';
      }
      body += '<button type="submit" style="width:100%;padding:13px;background:#25D366;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:bold;cursor:pointer">Kirim via WhatsApp</button>';
    }

    var formConfig = {
      id: form.id, name: form.name, type: form.type,
      adminWa: wa, submitAction: form.submitAction || 'whatsapp', redirectUrl: form.redirectUrl || '',
      tracking: form.tracking || { metaPixel: false, gtm: false, tiktok: false, googleAds: false },
      pixelIds: form.pixelIds || { metaPixel: '', gtm: '', tiktok: '', googleAds: '' }
    };

    var orderScript = '';
    if (form.type === 'order') {
      orderScript = '\n<script>\n(function(){var b=document.getElementById("fo-products");if(!b)return;fetch("' + base + '/api/products").then(function(r){return r.json()}).then(function(d){(d.products||[]).forEach(function(p){var l=document.createElement("label");l.style.cssText="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px";l.innerHTML=\'<input type="checkbox" data-product="\'+p.id+\'" data-name="\'+p.name+\'" data-price="\'+p.price+\'"/><span>\'+p.name+\'</span><input type="number" data-qty="\'+p.id+\'" value="1" min="1" style="width:52px;padding:5px"/> \';b.appendChild(l);})}).catch(function(){});})();\n</scr' + 'ipt>';
    }

    var open = form.type === 'direct' ? body : '<form data-bcs-form="' + esc(form.id) + '" style="font-family:Arial,sans-serif;max-width:420px">' + body + '</form>';

    return '<!-- Form Order: ' + esc(form.name) + ' -->\n' + open +
      '\n<script>\nwindow.BCS_CONFIG = { scriptUrl: "' + base + '/api/track' + '", adminWa: "' + esc(wa) + '", forms: { "' + esc(form.id) + '": ' + JSON.stringify(formConfig) + ' } };\n</scr' + 'ipt>' +
      '\n<script src="' + base + '/tracker/bcs-tracker.js"><\/scr' + 'ipt>' + orderScript;
  }

  function openEmbed(formId) {
    var form = state.forms.find(function (f) { return f.id === formId; });
    if (!form) return;
    $('#embed-title').textContent = 'Embed — ' + form.name;
    $('#embed-code').value = buildEmbedHtml(form);
    $('#embed-modal').classList.remove('hidden');
  }

  function copyEmbed() {
    var ta = $('#embed-code');
    ta.select();
    try { document.execCommand('copy'); toast('Code copied'); } catch (e) { toast('Copy failed, select manually'); }
  }

  /* ----------------------- Add order modal ------------------------- */
  function openAddOrder() {
    $('#add-modal-body').dataset.mode = 'add';
    $('#ao-nama').value = ''; $('#ao-nohp').value = ''; $('#ao-plat').value = ''; $('#ao-workshop').value = ''; $('#ao-notes').value = '';
    var box = $('#ao-products');
    box.innerHTML = '';
    state.products.forEach(function (p) {
      var row = document.createElement('label');
      row.className = 'ao-product-row';
      row.innerHTML = '<input type="checkbox" data-pid="' + esc(p.id) + '" data-name="' + esc(p.name) + '" data-price="' + esc(p.price) + '" />' +
        '<span>' + esc(p.name) + '</span><em>' + fmtRp(p.price) + '</em>';
      box.appendChild(row);
    });
    $('#add-modal').classList.remove('hidden');
  }

  function saveAddOrder() {
    var chosen = [];
    $('#ao-products').querySelectorAll('input:checked').forEach(function (cb) {
      chosen.push({ id: cb.dataset.pid, name: cb.dataset.name, price: Number(cb.dataset.price) || 0, qty: 1 });
    });
    var body = {
      lead: {
        nama: $('#ao-nama').value || '-', nohp: $('#ao-nohp').value || '-',
        plat: $('#ao-plat').value || '-', mobil: '-', workshop: $('#ao-workshop').value || '-', keluhan: '-'
      },
      products: chosen,
      notes: $('#ao-notes').value,
      status: $('#ao-status').value,
      formId: 'manual', formName: 'Manual Order',
      tracking: { platform: 'Manual' }
    };
    api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function () { toast('Order added'); $('#add-modal').classList.add('hidden'); loadOrders(); renderStats(); });
  }

  /* ------------------------- Filter wiring -------------------------- */
  function bindFilters() {
    var els = ['f-search', 'f-platform', 'f-form', 'f-status', 'f-from', 'f-to'];
    els.forEach(function (id) {
      $('#' + id).addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyFilters, 250);
      });
    });
    $('#btn-columns').addEventListener('click', openColumns);
    $('#btn-clear-filter').addEventListener('click', function () {
      state.filters = {};
      els.forEach(function (id) { $('#' + id).value = ''; });
      applyFilters();
    });
  }

  function applyFilters() {
    state.filters = {
      search: $('#f-search').value,
      platform: $('#f-platform').value,
      formId: $('#f-form').value,
      status: $('#f-status').value,
      from: $('#f-from').value,
      to: $('#f-to').value
    };
    loadOrders();
  }

  function exportCsv() {
    window.open('/api/export?' + currentFilterQuery().toString(), '_blank');
  }

  /* ----------------------------- Init ------------------------------- */
  function init() {
    var h = (location.hash || '').replace('#', '');
    if (['orders', 'promos', 'forms', 'products'].indexOf(h) > -1) switchView(h);
    $all('.nav-item').forEach(function (n) { n.addEventListener('click', function () { switchView(n.dataset.view); }); });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    $('#btn-export').addEventListener('click', exportCsv);
    $('#btn-add-form').addEventListener('click', addForm);
    $('#btn-add-product').addEventListener('click', addProduct);
    $('#btn-add-promo').addEventListener('click', addPromo);
    $('#btn-add-order').addEventListener('click', openAddOrder);
    $('#add-modal-close').addEventListener('click', function () { $('#add-modal').classList.add('hidden'); });
    $('#ao-cancel').addEventListener('click', function () { $('#add-modal').classList.add('hidden'); });
    $('#ao-save').addEventListener('click', saveAddOrder);
    $('#add-modal').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
    $('#embed-modal-close').addEventListener('click', function () { $('#embed-modal').classList.add('hidden'); });
    $('#embed-copy').addEventListener('click', copyEmbed);
    $('#embed-modal').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
    $('#col-modal-close').addEventListener('click', cancelColumns);
    $('#col-cancel').addEventListener('click', cancelColumns);
    $('#col-save').addEventListener('click', saveColumns);
    $('#col-modal').addEventListener('click', function (e) { if (e.target === this) cancelColumns(); });
    bindFilters();

    api('/api/health').then(function () {
      $('#api-status').textContent = 'connected';
      $('#api-status').classList.add('ok');
    }).catch(function () {
      $('#api-status').textContent = 'offline';
      $('#api-status').classList.add('err');
    });

    loadOrders();
    renderStats();
    renderPlatformFilter();
    loadForms();
    loadProducts();
    loadPromos();

    api('/api/config').then(function (c) {
      if (c.publicBaseUrl) state.publicBaseUrl = c.publicBaseUrl;
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
