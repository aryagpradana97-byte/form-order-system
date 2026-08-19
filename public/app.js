(function () {
  'use strict';

  var state = { orders: [], forms: [], products: [], filters: {} };
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
    if (s.indexOf('confirm') > -1) return 'confirmed';
    if (s.indexOf('paid') > -1) return 'paid';
    if (s.indexOf('cancel') > -1) return 'cancelled';
    if (s.indexOf('direct') > -1) return 'direct';
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
        { v: s.byStatus.Draft || 0, l: 'Draft' },
        { v: s.byStatus.Confirmed || 0, l: 'Confirmed' },
        { v: Object.keys(s.byPlatform || {}).length, l: 'Platform Aktif' }
      ];
      cards.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'stat-card';
        el.innerHTML = '<div class="v">' + c.v + '</div><div class="l">' + c.l + '</div>';
        grid.appendChild(el);
      });
    });
  }

  function renderOrders() {
    var body = $('#orders-body');
    body.innerHTML = '';
    var empty = $('#orders-empty');
    if (!state.orders.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    state.orders.forEach(function (o) {
      var tr = document.createElement('tr');
      var time = o.createdAt ? new Date(o.createdAt) : null;
      var timeStr = time ? time.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' + time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
      tr.innerHTML =
        '<td>' + esc(timeStr) + '</td>' +
        '<td>' + esc(o.form || '-') + '</td>' +
        '<td><span class="badge ' + statusClass(o.status) + '">' + esc(o.status) + '</span></td>' +
        '<td>' + esc(o.nama || '-') + '</td>' +
        '<td>' + esc(o.nohp || '-') + '</td>' +
        '<td>' + esc(o.workshop || '-') + '</td>' +
        '<td><span class="platform-pill ' + platformClass(o.platform) + '">' + esc(o.platform || '-') + '</span></td>' +
        '<td>' + esc(o.utm_campaign || o.campaignId || '-') + '</td>' +
        '<td>' + esc(o.promo || '-') + '</td>' +
        '<td><span class="row-actions"></span></td>';
      var actions = tr.querySelector('.row-actions');
      actions.innerHTML =
        '<button class="btn ghost sm" data-act="view">Detail</button>' +
        '<button class="btn danger sm" data-act="del">Hapus</button>';
      tr.addEventListener('click', function (e) {
        var act = e.target && e.target.getAttribute ? e.target.getAttribute('data-act') : null;
        if (act === 'del') { e.stopPropagation(); deleteOrder(o.id); return; }
        if (act === 'view') { e.stopPropagation(); }
        openDetail(o.id);
      });
      body.appendChild(tr);
    });
  }

  function deleteOrder(id) {
    if (!confirm('Hapus order ini?')) return;
    api('/api/orders/' + id, { method: 'DELETE' }).then(function () {
      toast('Order dihapus');
      loadOrders(); renderStats();
    });
  }

  function openDetail(id) {
    var o = state.orders.find(function (x) { return x.id === id; });
    if (!o) return;
    $('#modal-title').textContent = 'Detail Order — ' + (o.nama || o.sessionId);
    var grid = [
      ['Status', o.status], ['Form', o.form], ['Session ID', o.sessionId],
      ['Nama', o.nama], ['No HP', o.nohp], ['Plat', o.plat],
      ['Mobil', o.mobil], ['Lokasi', o.workshop], ['Keluhan', o.keluhan],
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
      '<div class="detail-section"><h4>Produk / Layanan</h4><div class="val">' + esc(productsStr) + '</div><div class="val" style="margin-top:4px">Total: <strong>' + (o.total ? 'Rp ' + Number(o.total).toLocaleString('id-ID') : '-') + '</strong></div>' + (o.notes ? '<div class="val" style="margin-top:4px">Catatan: ' + esc(o.notes) + '</div>' : '') + '</div>' +
      '<div class="detail-section"><h4>Tracking</h4><div class="detail-grid">' + gridHtml(track) + '</div></div>' +
      '<div class="detail-section"><h4>Event Terkirim</h4><div class="val">' + esc(eventsStr) + '</div></div>' +
      '<div class="status-editor">' +
      '<select id="detail-status" class="input">' +
      ['Draft', 'Submitted', 'Confirmed', 'Paid', 'Cancelled'].map(function (s) {
        return '<option' + (s === o.status ? ' selected' : '') + '>' + s + '</option>';
      }).join('') +
      '</select>' +
      '<button class="btn primary sm" id="detail-save">Simpan Status</button>' +
      '</div>';

    $('#detail-save').addEventListener('click', function () {
      var status = $('#detail-status').value;
      api('/api/orders/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }) })
        .then(function () { toast('Status disimpan'); closeModal(); loadOrders(); renderStats(); });
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

  function renderForms() {
    var list = $('#forms-list');
    list.innerHTML = '';
    state.forms.forEach(function (f) {
      var t = f.tracking || {};
      var card = document.createElement('div');
      card.className = 'form-card';
      card.dataset.id = f.id;
      card.innerHTML =
        '<div class="form-card-head"><h3>' + esc(f.name) + '</h3><span class="type-tag">' + esc(f.type) + '</span></div>' +
        '<div class="form-field"><label>Nama Form</label><input type="text" data-f="name" value="' + esc(f.name) + '" /></div>' +
        '<div class="form-field"><label>Tipe</label><select data-f="type">' +
        ['short', 'long', 'direct', 'order'].map(function (t2) {
          return '<option value="' + t2 + '"' + (f.type === t2 ? ' selected' : '') + '>' + t2 + '</option>';
        }).join('') + '</select></div>' +
        '<div class="form-field"><label>Admin WhatsApp (nomor)</label><input type="text" data-f="adminWa" value="' + esc(f.adminWa || '') + '" placeholder="628xxxxxx" /></div>' +
        trackingToggle('metaPixel', 'Meta Pixel', t.metaPixel) +
        trackingToggle('gtm', 'Google Tag Manager', t.gtm) +
        trackingToggle('tiktok', 'TikTok Pixel', t.tiktok) +
        trackingToggle('googleAds', 'Google Ads (gtag)', t.googleAds) +
        '<div class="toggle-row"><span>Form Aktif</span>' +
        '<label class="toggle"><input type="checkbox" data-f="enabled"' + (f.enabled ? ' checked' : '') + '><span class="slider"></span></label></div>' +
        '<div class="form-card-actions">' +
        '<button class="btn primary" data-act="save">Simpan</button>' +
        '<button class="btn danger" data-act="del">Hapus</button>' +
        '</div>';

      card.querySelector('[data-act="save"]').addEventListener('click', function () { saveForm(f.id, card); });
      card.querySelector('[data-act="del"]').addEventListener('click', function () { deleteForm(f.id); });
      list.appendChild(card);
    });
  }

  function saveForm(id, card) {
    var tracking = {};
    card.querySelectorAll('[data-t]').forEach(function (cb) { tracking[cb.dataset.t] = cb.checked; });
    var body = {
      id: id,
      name: card.querySelector('[data-f="name"]').value,
      type: card.querySelector('[data-f="type"]').value,
      adminWa: card.querySelector('[data-f="adminWa"]').value,
      enabled: card.querySelector('[data-f="enabled"]').checked,
      tracking: tracking
    };
    api('/api/forms?id=' + encodeURIComponent(id), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function () { toast('Form disimpan'); loadForms(); });
  }

  function addForm() {
    var id = 'form-' + Date.now().toString(36);
    api('/api/forms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, name: 'Form Baru', type: 'short', enabled: true, adminWa: '', tracking: { metaPixel: false, gtm: false, tiktok: false, googleAds: false } })
    }).then(function () { toast('Form ditambahkan'); loadForms(); });
  }

  function deleteForm(id) {
    if (!confirm('Hapus form ini?')) return;
    api('/api/forms?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      toast('Form dihapus'); loadForms();
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
        '<div class="form-field"><label>Nama</label><input type="text" data-p="name" value="' + esc(p.name) + '" /></div>' +
        '<div class="form-field"><label>Kategori</label><input type="text" data-p="category" value="' + esc(p.category) + '" /></div>' +
        '<div class="form-field"><label>Harga (Rp)</label><input type="number" data-p="price" value="' + esc(p.price) + '" /></div>' +
        '<div class="form-card-actions"><button class="btn primary" data-act="save">Simpan</button><button class="btn danger" data-act="del">Hapus</button></div>';
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
      .then(function () { toast('Produk disimpan'); loadProducts(); });
  }

  function addProduct() {
    var id = 'p-' + Date.now().toString(36);
    api('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, name: 'Layanan Baru', category: 'Service', price: 0 }) })
      .then(function () { toast('Produk ditambahkan'); loadProducts(); });
  }

  function deleteProduct(id) {
    if (!confirm('Hapus produk ini?')) return;
    api('/api/products?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Produk dihapus'); loadProducts(); });
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
      .then(function () { toast('Order ditambahkan'); $('#add-modal').classList.add('hidden'); loadOrders(); renderStats(); });
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
    $all('.nav-item').forEach(function (n) { n.addEventListener('click', function () { switchView(n.dataset.view); }); });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    $('#btn-export').addEventListener('click', exportCsv);
    $('#btn-add-form').addEventListener('click', addForm);
    $('#btn-add-product').addEventListener('click', addProduct);
    $('#btn-add-order').addEventListener('click', openAddOrder);
    $('#add-modal-close').addEventListener('click', function () { $('#add-modal').classList.add('hidden'); });
    $('#ao-cancel').addEventListener('click', function () { $('#add-modal').classList.add('hidden'); });
    $('#ao-save').addEventListener('click', saveAddOrder);
    $('#add-modal').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
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
  }

  document.addEventListener('DOMContentLoaded', init);
})();
