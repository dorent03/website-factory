import { matchService } from './catalog.ts';
import { staticScan } from './static.ts';

export interface ImpactAnalysis {
  newOrigins: string[];
  removedOrigins: string[];
  newServices: Array<{ key: string; name: string; consentRequired: boolean }>;
  formsChanged: boolean;
  storageChanged: boolean;
  affected: string[];
  dependencyPaths: string[];
  summary: string;
  requiresReaudit: boolean;
}

/**
 * Legal-aware editing: compares the agent's worktree with the live site before merge. Any new external service,
 * form or storage use invalidates the compliance state along the dependency graph.
 */
export function impactAnalysis(beforeDir: string, afterDir: string): ImpactAnalysis {
  const a = staticScan(beforeDir);
  const b = staticScan(afterDir);
  const ao = new Set(a.refs.map((r) => r.origin));
  const bo = new Set(b.refs.map((r) => r.origin));
  const newOrigins = [...bo].filter((o) => !ao.has(o));
  const removedOrigins = [...ao].filter((o) => !bo.has(o));
  const newServices = [...new Map(newOrigins.map((o) => matchService(o)).filter((s) => !!s).map((s) => [s!.key, { key: s!.key, name: s!.name, consentRequired: s!.consentRequired }])).values()];
  const formSig = (s: typeof a) => JSON.stringify(s.forms.map((f) => [f.page, f.action, f.fields.map((x) => x.name)]));
  const formsChanged = formSig(a) !== formSig(b);
  const storageChanged = JSON.stringify(a.storageApis) !== JSON.stringify(b.storageApis);
  const affected = new Set<string>();
  const paths: string[] = [];
  for (const o of newOrigins) {
    const s = matchService(o);
    affected.add('privacy-inventory').add('datenschutz').add('browser-qa');
    if (!s || s.consentRequired) affected.add('consent');
    paths.push(`${s?.name ?? o} → External Service → Privacy Inventory${!s || s.consentRequired ? ' → Consent' : ''} → Datenschutzerklärung → Browser QA`);
  }
  for (const o of removedOrigins) { affected.add('privacy-inventory').add('datenschutz').add('consent'); paths.push(`${matchService(o)?.name ?? o} removed → Privacy Inventory → Datenschutzerklärung (section may now be obsolete)`); }
  if (formsChanged) { affected.add('privacy-inventory').add('datenschutz').add('form-security'); paths.push('Contact Form → Personal Data → Privacy Inventory → Datenschutzerklärung → Form Security'); }
  if (storageChanged) { affected.add('privacy-inventory').add('consent'); paths.push('Storage API → Cookies/Storage → Consent → Network QA'); }
  const list = [...affected];
  const summary = list.length ? `Compliance-relevant change: ${[...newServices.map((s) => `new service ${s.name}`), ...newOrigins.filter((o) => !matchService(o)).map((o) => `new unknown origin ${o}`), ...removedOrigins.map((o) => `removed ${o}`), formsChanged ? 'forms changed' : '', storageChanged ? 'storage use changed' : ''].filter(Boolean).join(', ')}` : 'No compliance-relevant change detected';
  return { newOrigins, removedOrigins, newServices, formsChanged, storageChanged, affected: list, dependencyPaths: paths, summary, requiresReaudit: list.length > 0 };
}
