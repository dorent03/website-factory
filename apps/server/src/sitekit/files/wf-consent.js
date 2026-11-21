/*! Website Factory consent manager — self-hosted, no third-party requests.
 * Consent-dependent content is inert until its category is granted:
 *   <script type="text/plain" data-wf-category="analytics" data-wf-src="…"></script>
 *   <div class="wf-embed" data-wf-category="external-media" data-wf-service="YouTube" data-wf-src="https://www.youtube-nocookie.com/embed/ID" data-wf-title="…"></div>
 * Reopen settings with any element carrying [data-wf-consent-open]. */
(function () {
  'use strict';
  var cfgEl = document.getElementById('wf-consent-config');
  if (!cfgEl) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent || '{}'); } catch (e) { return; }
  var KEY = cfg.storageKey || 'wf-consent';
  var optional = (cfg.categories || []).filter(function (c) { return c.key !== 'necessary'; });

  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.v === cfg.version ? v : null; } catch (e) { return null; }
  }
  function write(cats) {
    var prev = read();
    try { localStorage.setItem(KEY, JSON.stringify({ v: cfg.version, categories: cats, at: new Date().toISOString() })); } catch (e) {}
    var revoked = prev && prev.categories.some(function (c) { return cats.indexOf(c) < 0; });
    if (revoked) { location.reload(); return; }
    apply(cats);
  }
  function granted(cat) { var s = read(); return cat === 'necessary' || (!!s && s.categories.indexOf(cat) >= 0); }

  function activateScripts() {
    var list = document.querySelectorAll('script[type="text/plain"][data-wf-category]');
    for (var i = 0; i < list.length; i++) {
      var old = list[i];
      if (!granted(old.getAttribute('data-wf-category'))) continue;
      var s = document.createElement('script');
      if (old.getAttribute('data-wf-src')) s.src = old.getAttribute('data-wf-src'); else s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    }
  }
  function renderEmbeds() {
    var list = document.querySelectorAll('.wf-embed[data-wf-src]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.getAttribute('data-wf-loaded')) continue;
      var cat = el.getAttribute('data-wf-category') || 'external-media';
      if (granted(cat)) {
        var f = document.createElement('iframe');
        f.src = el.getAttribute('data-wf-src');
        f.title = el.getAttribute('data-wf-title') || 'Eingebetteter Inhalt';
        f.loading = 'lazy';
        f.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        el.innerHTML = '';
        el.appendChild(f);
        el.setAttribute('data-wf-loaded', '1');
      } else if (!el.querySelector('.wf-embed__ph')) {
        var svc = el.getAttribute('data-wf-service') || 'einem externen Anbieter';
        var ph = document.createElement('div');
        ph.className = 'wf-embed__ph';
        ph.innerHTML = '<p>Dieser Inhalt wird von <strong></strong> bereitgestellt. Beim Laden werden Daten (u. a. Ihre IP-Adresse) an den Anbieter übermittelt.</p>' +
          '<p><button type="button" class="wf-btn wf-btn--primary" data-wf-load>Inhalt laden</button> <a href="' + (cfg.privacyUrl || 'datenschutz.html') + '">Mehr in der Datenschutzerklärung</a></p>';
        ph.querySelector('strong').textContent = svc;
        ph.querySelector('[data-wf-load]').addEventListener('click', (function (c) { return function () { var s = read(); var cats = s ? s.categories.slice() : []; if (cats.indexOf(c) < 0) cats.push(c); write(cats); }; })(cat));
        el.appendChild(ph);
      }
    }
  }
  function apply() { activateScripts(); renderEmbeds(); }

  var dlg;
  function close() { if (dlg) { dlg.remove(); dlg = null; } }
  function open(showDetails) {
    close();
    var s = read();
    dlg = document.createElement('div');
    dlg.className = 'wf-consent';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'false');
    dlg.setAttribute('aria-labelledby', 'wf-consent-title');
    var rows = optional.map(function (c) {
      var on = s ? s.categories.indexOf(c.key) >= 0 : false;
      return '<label class="wf-consent__row"><input type="checkbox" data-wf-cat="' + c.key + '"' + (on ? ' checked' : '') + '> <span><strong></strong><br><small></small></span></label>';
    }).join('');
    dlg.innerHTML = '<div class="wf-consent__box"><h2 id="wf-consent-title">Datenschutz-Einstellungen</h2><p class="wf-consent__text"></p>' +
      '<div class="wf-consent__details"' + (showDetails ? '' : ' hidden') + '>' + rows + '</div>' +
      '<div class="wf-consent__actions"><button type="button" class="wf-btn" data-wf-consent-reject>Nur notwendige</button>' +
      '<button type="button" class="wf-btn" data-wf-consent-details' + (showDetails ? ' hidden' : '') + '>Einstellungen</button>' +
      '<button type="button" class="wf-btn" data-wf-consent-save' + (showDetails ? '' : ' hidden') + '>Auswahl speichern</button>' +
      '<button type="button" class="wf-btn" data-wf-consent-accept>Alle akzeptieren</button></div>' +
      '<p class="wf-consent__links"><a href="' + (cfg.privacyUrl || 'datenschutz.html') + '">Datenschutzerklärung</a> · <a href="' + (cfg.imprintUrl || 'impressum.html') + '">Impressum</a></p></div>';
    dlg.querySelector('.wf-consent__text').textContent = cfg.text || 'Wir verwenden nur notwendige Speicherungen. Optionale Inhalte externer Anbieter laden wir erst nach Ihrer Einwilligung. Sie können Ihre Auswahl jederzeit über „Cookie-Einstellungen“ ändern oder widerrufen.';
    var labels = dlg.querySelectorAll('.wf-consent__row');
    optional.forEach(function (c, i) { labels[i].querySelector('strong').textContent = c.label; labels[i].querySelector('small').textContent = c.description; });
    dlg.querySelector('[data-wf-consent-reject]').onclick = function () { write([]); close(); };
    dlg.querySelector('[data-wf-consent-accept]').onclick = function () { write(optional.map(function (c) { return c.key; })); close(); };
    dlg.querySelector('[data-wf-consent-details]').onclick = function () { open(true); };
    dlg.querySelector('[data-wf-consent-save]').onclick = function () {
      var cats = [].slice.call(dlg.querySelectorAll('[data-wf-cat]')).filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-wf-cat'); });
      write(cats); close();
    };
    document.body.appendChild(dlg);
    var first = dlg.querySelector('button:not([hidden])');
    if (first) first.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-wf-consent-open]');
    if (t) { e.preventDefault(); open(true); }
  });
  function init() { apply(); if (!read()) open(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
