---
name: static-site-quality
description: Technical quality gate for FTP-hostable static websites (HTML/CSS/JS) — valid markup, working links and assets, no external runtime dependencies, performance budgets, caching/HTTPS/.htaccess, meta and favicon set, 404 page, JS-optional content, and a deploy-ready file tree. Load when building or before handing over a Website Factory site.
---

# Static site quality

The deliverable is a folder that works when copied to any FTP document root — no build step, no server runtime except optionally PHP for the form handler.

## File tree

- Root contains `index.html`, page folders with `index.html` (clean URLs `/leistungen/`), `assets/` (`css/`, `js/`, `img/`, `fonts/`), `favicon.ico` + icons, `robots.txt`, `sitemap.xml`, `404.html`, optional `.htaccess`, optional `kontakt.php`.
- Filenames: lowercase, ASCII, hyphens; no spaces/umlauts in file or folder names.
- No source maps, `node_modules`, `.git`, `.env`, drafts, test data, editor files or unused assets in the deploy folder.
- Links work from the document root and when opened via a local static server; prefer root-relative (`/assets/...`) only if the site is always at the domain root — otherwise relative paths. Decide once, apply consistently.

## HTML

- Valid HTML5 (Nu validator: zero errors). `<!doctype html>`, `<html lang="de">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">` (no zoom blocking).
- Unique `<title>` and meta description per page; canonical; Open Graph basics (`local-business-seo`).
- Favicons: `favicon.ico` (32 px), `icon.svg`, `apple-touch-icon.png` (180 px); `<meta name="theme-color">`.
- No inline event handlers (`onclick=`) — keeps a strict CSP possible.
- All content readable with JavaScript disabled (navigation may degrade to an always-visible list). Content never starts hidden waiting for JS.

## Links and assets

- Crawl every page: zero broken internal links, anchors, images, fonts, scripts (HTTP 200 from the local server).
- External links checked (status < 400) and `rel="noopener"` on `target="_blank"`; new-tab links indicate it.
- `tel:` and `mailto:` links match the verified data.
- No hotlinked resources. **Zero third-party requests** on page load unless documented in the privacy inventory (`privacy-audit`): fonts, icon fonts, CSS frameworks, jQuery, analytics — all local or absent.

## CSS / JS

- One or few CSS files, minified for deploy; critical CSS inline only if it measurably improves LCP.
- No unused frameworks; vanilla JS, `defer`ed or `type="module"`. No console errors or warnings on any page.
- No `document.write`, no blocking scripts in `<head>`.
- JS features have a no-JS fallback (forms post normally, menus visible, accordions use `<details>` where suitable).

## Performance budgets (mobile, throttled "Slow 4G", per page)

| Metric | Budget |
| --- | --- |
| LCP | ≤ 2.5 s |
| CLS | ≤ 0.1 (aim 0) |
| INP / TBT | INP ≤ 200 ms; TBT ≤ 200 ms |
| Total transfer | ≤ 1 MB home, ≤ 1.5 MB image-heavy pages |
| JS | ≤ 50 KB compressed |
| CSS | ≤ 50 KB compressed |
| Fonts | ≤ 4 files, WOFF2, subset, `font-display: swap`, preload the primary one |
| Lighthouse | Performance ≥ 90, Accessibility 100, Best Practices ≥ 95, SEO ≥ 95 |

- Images: AVIF/WebP + fallback, `srcset`/`sizes`, explicit `width`/`height`, lazy below the fold, LCP image `fetchpriority="high"` and not lazy, compressed (photos ≤ 200 KB at 1600 px wide as guideline). SVG optimised, no embedded raster in SVG.
- Video: self-hosted, `preload="none"` with poster, or click-to-load embed.

## Server config (Apache hosts, only with customer's confirmation)

`.htaccess` template elements, each documented in handover:
- Force HTTPS and the preferred host (301).
- `ErrorDocument 404 /404.html`.
- Cache headers: long `max-age` + `immutable` for fingerprinted assets, short for HTML.
- Compression (`mod_deflate`/`mod_brotli` if available).
- Security headers: `Content-Security-Policy` (default-src 'self'; adjust only for documented third parties), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'`. HSTS only after HTTPS is confirmed stable.
- Block access to `.htaccess`, backup and dot files.
- If the host is not Apache (nginx, IIS) → write equivalent instructions in handover instead.

## Form handler (if PHP)

- Server-side validation and sanitisation; honeypot + minimum fill time; no open mail relay (fixed recipient, header-injection safe).
- No storage of submissions on the server unless documented; no logging of message contents.
- Credentials/recipient config outside web root or in a non-served file; never in JS.
- Success and error pages in German; works without JS.

## Gate checks

- [ ] Nu validator: 0 errors on every page.
- [ ] Link crawl: 0 broken internal links/assets.
- [ ] 0 third-party requests not in the privacy inventory.
- [ ] Budgets met on home + heaviest page (Lighthouse mobile, report attached).
- [ ] 0 console errors; content readable with JS disabled.
- [ ] Deploy folder clean; `404.html`, `robots.txt`, `sitemap.xml`, favicons present.
- [ ] Handover lists: hosting requirements (PHP version if needed), `.htaccess` contents, upload instructions, what to check after upload.
