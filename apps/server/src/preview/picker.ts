/**
 * Injected only on the preview origin when the workspace is in "select element" mode.
 * Sends a CSS selector + a short outerHTML snippet of the clicked element to the Factory via postMessage.
 */
export const PICKER_SCRIPT = `(() => {
  const PARENT = '__PARENT__';
  let on = false, box = null;
  const sel = (el) => {
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let p = el.tagName.toLowerCase();
      const cls = [...el.classList].filter(c => !c.startsWith('wf-')).slice(0, 2);
      if (cls.length) p += '.' + cls.map(c => CSS.escape(c)).join('.');
      const sib = el.parentElement ? [...el.parentElement.children].filter(c => c.tagName === el.tagName) : [];
      if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(el) + 1) + ')';
      parts.unshift(p); el = el.parentElement;
    }
    return parts.join(' > ');
  };
  const ensureBox = () => { if (!box) { box = document.createElement('div'); box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #2f6fed;background:rgba(47,111,237,.08);transition:all .06s'; document.documentElement.appendChild(box); } return box; };
  window.addEventListener('message', (e) => { if (e.origin === PARENT && e.data && e.data.type === 'wf-picker') { on = !!e.data.on; if (box) box.style.display = on ? 'block' : 'none'; } });
  document.addEventListener('mousemove', (e) => { if (!on) return; const r = e.target.getBoundingClientRect(); Object.assign(ensureBox().style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }, true);
  document.addEventListener('click', (e) => {
    if (!on) return; e.preventDefault(); e.stopPropagation();
    const el = e.target;
    parent.postMessage({ type: 'wf-picked', selector: sel(el), tag: el.tagName.toLowerCase(), text: (el.innerText || '').slice(0, 160), html: el.outerHTML.slice(0, 600), page: location.pathname }, PARENT);
  }, true);
  parent.postMessage({ type: 'wf-picker-ready' }, PARENT);
})();`;
