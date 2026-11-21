import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsentConfiguration } from '@wf/shared';

const FILES = join(import.meta.dirname, 'files');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const HANDLER_HASH = sha(readFileSync(join(FILES, 'kontakt-senden.php')));
const CONFIG_RE = /^<\?php\nreturn \['to' => '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'site' => '[^'\\\n]{1,120}', 'redirect' => '[a-z0-9-]+\.html', 'salt' => '[a-f0-9]{32}'\];\n$/;

/** Factory-authored server files are the only non-static files allowed in a site — verified by content. */
export function isAllowedSitekitFile(relPath: string, content: Buffer): boolean {
  if (relPath === 'kontakt-senden.php') return sha(content) === HANDLER_HASH;
  if (relPath === 'kontakt-config.php') return CONFIG_RE.test(content.toString('utf8'));
  return false;
}

export function installFormHandler(siteDir: string, opts: { to: string; site: string; redirect?: string }): boolean {
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(opts.to)) return false;
  copyFileSync(join(FILES, 'kontakt-senden.php'), join(siteDir, 'kontakt-senden.php'));
  const site = opts.site.replace(/['\\\n]/g, '').slice(0, 120) || 'Website';
  const cfgPath = join(siteDir, 'kontakt-config.php');
  // Keep the existing salt so re-running the Factory pass is idempotent (no spurious versions).
  const prevSalt = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf8').match(/'salt' => '([a-f0-9]{32})'/)?.[1] : undefined;
  writeFileSync(cfgPath, `<?php\nreturn ['to' => '${opts.to}', 'site' => '${site}', 'redirect' => '${opts.redirect ?? 'kontakt.html'}', 'salt' => '${prevSalt ?? randomBytes(16).toString('hex')}'];\n`);
  return true;
}

export function htmlFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.html'));
}

const CONSENT_START = '<!-- wf:consent:start -->';
const CONSENT_END = '<!-- wf:consent:end -->';
const stripBlock = (html: string, a: string, b: string) => html.replace(new RegExp(`\\s*${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '');

/** Installs (or refreshes) the self-hosted consent manager on every page, including a reopen link in the footer. */
export function installConsent(siteDir: string, config: ConsentConfiguration): void {
  const dir = join(siteDir, 'assets', 'wf');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FILES, 'wf-consent.js'), join(dir, 'wf-consent.js'));
  copyFileSync(join(FILES, 'wf-consent.css'), join(dir, 'wf-consent.css'));
  const json = JSON.stringify({ version: config.version, storageKey: config.storageKey, categories: config.categories, privacyUrl: 'datenschutz.html', imprintUrl: 'impressum.html' }).replace(/</g, '\\u003c');
  for (const f of htmlFiles(siteDir)) {
    const p = join(siteDir, f);
    let html = stripBlock(stripBlock(readFileSync(p, 'utf8'), '<!-- wf:consent-head:start -->', '<!-- wf:consent-head:end -->'), CONSENT_START, CONSENT_END);
    html = html.replace('</head>', `<!-- wf:consent-head:start --><link rel="stylesheet" href="assets/wf/wf-consent.css"><!-- wf:consent-head:end -->\n</head>`);
    const block = `${CONSENT_START}\n<script id="wf-consent-config" type="application/json">${json}</script>\n<script src="assets/wf/wf-consent.js" defer></script>\n${CONSENT_END}`;
    html = html.replace('</body>', `${block}\n</body>`);
    if (!html.includes('data-wf-consent-open')) {
      const link = '<a href="#" data-wf-consent-open class="wf-consent-link">Cookie-Einstellungen</a>';
      html = /<\/footer>/i.test(html) ? html.replace(/<\/footer>/i, `<p class="wf-consent-settings">${link}</p></footer>`) : html.replace('</body>', `<p>${link}</p></body>`);
    }
    writeFileSync(p, html);
  }
}

export function removeConsent(siteDir: string): boolean {
  let changed = false;
  for (const f of htmlFiles(siteDir)) {
    const p = join(siteDir, f);
    const before = readFileSync(p, 'utf8');
    let html = stripBlock(stripBlock(before, '<!-- wf:consent-head:start -->', '<!-- wf:consent-head:end -->'), CONSENT_START, CONSENT_END);
    html = html.replace(/<p class="wf-consent-settings">[\s\S]*?<\/p>/g, '');
    if (html !== before) { writeFileSync(p, html); changed = true; }
  }
  if (existsSync(join(siteDir, 'assets', 'wf'))) { rmSync(join(siteDir, 'assets', 'wf'), { recursive: true, force: true }); changed = true; }
  return changed;
}

/** Apache config for typical German shared hosting: security headers, caching, 404 page, HTTPS redirect. */
export function htaccess(): string {
  return `# Website Factory — Apache configuration
ErrorDocument 404 /404.html
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !=https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  Header always set Strict-Transport-Security "max-age=31536000"
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType text/javascript "access plus 1 month"
  ExpiresByType image/webp "access plus 6 months"
  ExpiresByType image/svg+xml "access plus 6 months"
  ExpiresByType font/woff2 "access plus 1 year"
</IfModule>
<FilesMatch "^kontakt-config\\.php$">
  Require all denied
</FilesMatch>
`;
}
