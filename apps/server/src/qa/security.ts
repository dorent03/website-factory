import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { QAFinding, QASection } from '@wf/shared';
import { isAllowedSitekitFile } from '../sitekit/index.ts';
import { f, section } from './section.ts';

const SECRET = [/sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /AIza[0-9A-Za-z_-]{35}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, /(api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i, /xox[baprs]-[A-Za-z0-9-]{10,}/];

/** Static security review of the deployable files. */
export function securityQA(siteDir: string): QASection {
  const t0 = Date.now();
  const findings: QAFinding[] = [];
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { if (n === '.git') continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(siteDir);
  for (const p of files) {
    const rel = p.slice(siteDir.length + 1);
    const ext = extname(p).toLowerCase();
    if (ext === '.php') { if (!isAllowedSitekitFile(rel, readFileSync(p))) findings.push(f('critical', 'Unverified server-side script', { page: rel })); continue; }
    if (!['.html', '.js', '.css', '.json', '.txt', '.xml', '.svg', '.webmanifest'].includes(ext)) continue;
    const text = readFileSync(p, 'utf8');
    for (const re of SECRET) if (re.test(text)) findings.push(f('critical', 'Possible secret/credential in a public file', { page: rel, evidence: text.match(re)![0].slice(0, 12) + '…' }));
    if (ext === '.html' || ext === '.svg') {
      for (const m of text.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*(?:src|href)=["']http:\/\/[^"']+/gi)) findings.push(f('major', 'Mixed content (http:// resource)', { page: rel, evidence: m[0].slice(0, 100) }));
      for (const m of text.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) if (!/rel=["'][^"']*noopener/i.test(m[0])) findings.push(f('minor', 'target="_blank" without rel="noopener"', { page: rel }));
      const inline = [...text.matchAll(/\son(click|load|error|mouseover|submit|change)\s*=/gi)].length;
      if (inline) findings.push(f('minor', `${inline} inline event handler(s) — prevents a strict Content-Security-Policy`, { page: rel }));
      for (const m of text.matchAll(/<script\b[^>]*src=["'](https?:)?\/\/[^"']+["'][^>]*>/gi)) if (!/integrity=/i.test(m[0])) findings.push(f('major', 'External script without Subresource Integrity', { page: rel, evidence: m[0].slice(0, 120) }));
      for (const m of text.matchAll(/<form\b[^>]*>/gi)) {
        const method = m[0].match(/method=["']([^"']+)/i)?.[1]?.toLowerCase() ?? 'get';
        const action = m[0].match(/action=["']([^"']*)/i)?.[1] ?? '';
        if (method !== 'post') findings.push(f('major', 'Form submits via GET (data ends up in URLs and logs)', { page: rel }));
        if (action && !/^(kontakt-senden\.php|#|mailto:)/.test(action) && !/^https:\/\//.test(action)) findings.push(f('minor', `Form action "${action}" is not the verified handler`, { page: rel }));
      }
    }
    if (ext === '.js' && /\beval\s*\(|new Function\s*\(/.test(text)) findings.push(f('major', 'eval / new Function in client code', { page: rel }));
    if (ext === '.js' && /innerHTML\s*=\s*[^'"`;]*location/.test(text)) findings.push(f('critical', 'DOM XSS pattern: location → innerHTML', { page: rel }));
  }
  if (!existsSync(join(siteDir, '.htaccess'))) findings.push(f('minor', 'No .htaccess (security headers / HTTPS redirect) for Apache hosting'));
  if (existsSync(join(siteDir, 'kontakt-senden.php')) && !existsSync(join(siteDir, 'kontakt-config.php'))) findings.push(f('critical', 'Form handler without configuration'));
  return section('security', 'Security', t0, findings, { metrics: { files: files.length }, summary: `${files.length} files scanned: secrets, mixed content, SRI, inline handlers, forms, server scripts, headers` });
}
