(function () {
  var defaultsCache = null;

  function esc(s) { return String(s == null ? '' : s); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function get(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce(function (o, k) { return o && o[k] != null ? o[k] : undefined; }, obj);
  }
  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (base && typeof base === 'object') {
      var out = {};
      Object.keys(base).forEach(function (k) { out[k] = merge(base[k], over ? over[k] : undefined); });
      if (over && typeof over === 'object') Object.keys(over).forEach(function (k) { if (!(k in out)) out[k] = over[k]; });
      return out;
    }
    return over == null ? base : over;
  }
  async function fetchJson(url, opts) {
    var res = await fetch(url, Object.assign({ headers: { 'Accept': 'application/json' } }, opts || {}));
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText || 'Request failed'), { status: res.status, data: data });
    return data;
  }
  async function loadDefaults() {
    if (defaultsCache) return defaultsCache;
    defaultsCache = await fetch('/cms/data/content.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
    return defaultsCache;
  }
  async function loadContent() {
    var defs = await loadDefaults();
    var live = await fetch('/api/content', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
    return merge(defs, live && typeof live === 'object' ? live : {});
  }

  function applyScalars(data) {
    document.querySelectorAll('[data-admin-key]').forEach(function (el) {
      var key = el.getAttribute('data-admin-key');
      var val = get(data, key);
      var type = el.getAttribute('data-admin-type') || 'text';
      var hrefKey = el.getAttribute('data-admin-href-key');
      if (hrefKey) {
        var hv = get(data, hrefKey);
        if (hv != null) el.setAttribute('href', esc(hv));
      }
      if (val == null) return;
      if (type === 'href') {
        var prefix = el.getAttribute('data-admin-prefix') || '';
        var v = esc(val);
        if (prefix) {
          v = v.replace(/^mailto:|^tel:/i, '');
          el.textContent = esc(val).replace(/^mailto:|^tel:/i, '');
          el.setAttribute('href', prefix + v.replace(/\s+/g, ''));
        } else {
          el.setAttribute('href', v);
        }
      } else if (type === 'src') {
        el.setAttribute('src', esc(val));
      } else if (type === 'bg') {
        el.style.backgroundImage = 'linear-gradient(180deg, rgba(1,31,71,0.55) 0%, rgba(2,51,115,0.62) 45%, rgba(26,44,64,0.72) 100%), url("' + esc(val).replace(/"/g, '\\"') + '")';
        el.style.backgroundPosition = 'center'; el.style.backgroundSize = 'cover'; el.style.backgroundRepeat = 'no-repeat';
      } else if (type === 'bg-soft') {
        el.style.backgroundImage = 'linear-gradient(180deg, rgba(1,31,71,0.58) 0%, rgba(2,51,115,0.66) 50%, rgba(26,44,64,0.76) 100%), url("' + esc(val).replace(/"/g, '\\"') + '")';
        el.style.backgroundPosition = 'center'; el.style.backgroundSize = 'cover'; el.style.backgroundRepeat = 'no-repeat';
      } else if (type === 'bg-header') {
        el.style.background = 'linear-gradient(180deg, rgba(1,31,71,0.72), rgba(2,51,115,0.62)), url("' + esc(val).replace(/"/g, '\\"') + '") center/cover no-repeat';
      } else if (type === 'bg-plain') {
        el.style.backgroundImage = 'linear-gradient(180deg, rgba(1,31,71,0.2), rgba(1,31,71,0.38)), url("' + esc(val).replace(/"/g, '\\"') + '")';
        el.style.backgroundPosition = 'center'; el.style.backgroundSize = 'cover';
      } else if (type === 'html') {
        el.innerHTML = esc(val).replace(/\n/g, '<br>');
      } else if (type === 'attr') {
        var attr = el.getAttribute('data-admin-attr') || 'title';
        el.setAttribute(attr, esc(val));
      } else {
        var txt = esc(val);
        if (/\n/.test(val)) { el.innerHTML = txt.replace(/\n/g, '<br>'); } else { el.textContent = txt; }
      }
    });
    var page = document.body.getAttribute('data-admin-page') || '';
    var title = get(data, page + '.pageTitle') || (page === 'home' ? get(data, 'home.pageTitle') : null);
    if (title) document.title = esc(title);
  }

  function renderEvents(data) {
    var host = document.querySelector('[data-admin-list="events"]');
    if (!host) return;
    var items = Array.isArray(data.events) ? data.events.filter(function (e) { return e && e.published !== false; }) : [];
    if (!items.length) { host.innerHTML = '<p class="section-lead" style="text-align:center;grid-column:1/-1;">Event details will be announced soon.</p>'; return; }
    host.innerHTML = items.map(function (e, i) {
      return '<article class="event-card reveal ' + (i===1?'d1':i===2?'d2':'') + '">' +
        '<div class="event-media"><img loading="lazy" src="' + escAttr(e.image) + '" alt="' + escAttr(e.title) + '"><div class="event-date"><strong>' + esc(e.day) + '</strong><span>' + esc(e.month) + '</span></div></div>' +
        '<div class="event-body"><span class="tag">' + esc(e.tag) + '</span><h3>' + esc(e.title) + '</h3><p>' + esc(e.description) + '</p>' +
        '<div class="meta"><span><strong>Time:</strong> ' + esc(e.time) + '</span><span><strong>Location:</strong> ' + esc(e.location) + '</span></div></div></article>';
    }).join('');
  }

  function renderFeaturedEvent(data) {
    var host = document.querySelector('[data-admin-block="featured-event"]');
    var e = data.featuredEvent;
    if (!host) return;
    if (!e || e.published === false) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.innerHTML =
      '<div class="featured-media"><img loading="lazy" src="' + escAttr(e.image) + '" alt="' + escAttr(e.title) + '"></div>' +
      '<div class="featured-body"><span class="tag">' + esc(e.tag) + '</span><h3 id="featured-title">' + esc(e.title) + '</h3><p>' + esc(e.description) + '</p>' +
      (e.note ? '<p>' + esc(e.note) + '</p>' : '') + '<a class="btn btn-primary" href="' + escAttr(e.href || 'contact.html') + '">' + esc(e.cta || 'Learn More') + '</a></div>';
  }

  function renderGallery(data) {
    var host = document.querySelector('[data-admin-list="gallery"]');
    if (!host) return;
    var items = Array.isArray(data.gallery) ? data.gallery : [];
    if (!items.length) { host.innerHTML = '<p class="section-lead">Gallery photos will appear here.</p>'; return; }
    host.innerHTML = items.map(function (g, i) {
      var delay = i%3===1?' d1':i%3===2?' d2':'';
      var featured = g.featured ? ' is-featured' : '';
      return '<figure class="gallery-item span-' + esc(g.span||'4') + ' ' + esc(g.height||'short') + featured + ' reveal' + delay + '" data-kicker="' + escAttr(g.kicker) + '" data-caption="' + escAttr(g.caption) + '" data-sub="' + escAttr(g.sub) + '">' +
        '<img loading="lazy" src="' + escAttr(g.src) + '" alt="' + escAttr(g.alt || g.caption) + '">' +
        '<button class="gallery-open" type="button" aria-label="View image: ' + escAttr(g.caption) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/></svg></button>' +
        '<figcaption class="gallery-meta"><span class="gallery-kicker">' + esc(g.kicker) + '</span><h3 class="gallery-caption">' + esc(g.caption) + '</h3><p class="gallery-sub">' + esc(g.sub) + '</p></figcaption></figure>';
    }).join('');
    wireGalleryLightbox(host);
  }

  function renderLocations(data) {
    var host = document.querySelector('[data-admin-list="locations"]');
    if (!host) return;
    var items = Array.isArray(data.locations) ? data.locations : [];
    if (!items.length) { host.innerHTML = '<p class="section-lead">Location details will be announced soon.</p>'; return; }
    host.innerHTML = items.map(function (loc, i) {
      var delay = i===1?' d1':i===2?' d2':'';
      var addr = esc(loc.address).replace(/\n/g, '<br>');
      return '<article class="location-card reveal' + delay + '">' +
        '<div class="map-visual" aria-hidden="true"><span class="pin"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span></div>' +
        '<div class="location-body"><span class="tag">' + esc(loc.tag) + '</span><h3>' + esc(loc.name) + '</h3><p>' + addr + '</p>' +
        '<div class="meta"><span><strong>Service:</strong> ' + esc(loc.service) + '</span>' +
        '<span><strong>Phone:</strong> <a href="tel:' + escAttr(esc(loc.phone).replace(/\s/g,'')) + '">' + esc(loc.phone) + '</a></span>' +
        '<span><strong>Email:</strong> <a href="mailto:' + escAttr(loc.email) + '">' + esc(loc.email) + '</a></span></div>' +
        '<a class="btn btn-secondary" href="' + escAttr(loc.mapUrl || 'https://maps.google.com/') + '" target="_blank" rel="noopener noreferrer">' + esc(loc.btn || 'Get Directions') + '</a></div></article>';
    }).join('');
  }

  function wireGalleryLightbox(scope) {
    var lightbox = document.getElementById('gallery-lightbox');
    var lbImg = document.getElementById('lightbox-image');
    var lbKicker = document.getElementById('lightbox-kicker');
    var lbCaption = document.getElementById('lightbox-caption');
    var closeBtn = lightbox ? lightbox.querySelector('.lightbox-close') : null;
    if (!lightbox || !scope || scope._lbWired) return;
    scope._lbWired = true;
    var lastFocus = null;
    function open(item) {
      var img = item.querySelector('img'); if (!img) return;
      lastFocus = document.activeElement;
      lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt || '';
      lbKicker.textContent = item.getAttribute('data-kicker') || '';
      lbCaption.textContent = item.getAttribute('data-caption') || img.alt || '';
      lightbox.classList.add('is-open'); lightbox.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
      if (closeBtn) closeBtn.focus();
    }
    function close() { lightbox.classList.remove('is-open'); lightbox.setAttribute('aria-hidden','true'); document.body.style.overflow=''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    scope.addEventListener('click', function (e) { var item = e.target.closest('.gallery-item'); if (item) open(item); });
    if (closeBtn) closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lightbox.classList.contains('is-open')) close(); });
  }

  function observeReveals() {
    var items = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('is-visible'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); } });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  async function applyAll() {
    try {
      var data = await loadContent();
      applyScalars(data);
      renderEvents(data);
      renderFeaturedEvent(data);
      renderGallery(data);
      renderLocations(data);
      observeReveals();
      document.dispatchEvent(new CustomEvent('rafm:content-applied', { detail: { data: data } }));
    } catch (e) { /* keep static defaults visible if CMS API is unavailable */ }
  }

  window.RAFMCMS = { fetchJson: fetchJson, loadContent: loadContent, loadDefaults: loadDefaults, merge: merge, get: get, esc: esc, applyAll: applyAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAll); else applyAll();
})();
