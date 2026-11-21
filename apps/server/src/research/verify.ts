import { type Fact, type FactStatus } from '@wf/shared';

export const MULTI_FIELDS = new Set(['services', 'products', 'certifications', 'socialProfiles', 'locations', 'team', 'representatives', 'history']);

export function normalize(field: string, value: string): string {
  let v = value.trim().toLowerCase().normalize('NFKC');
  switch (field) {
    case 'phone': v = v.replace(/^\+49|^0049/, '0').replace(/\D/g, ''); break;
    case 'street': v = v.replace(/stra(ß|ss)e\b/g, 'str').replace(/str\./g, 'str').replace(/[^a-z0-9äöü]/g, ''); break;
    case 'website': try { v = new URL(v.startsWith('http') ? v : `https://${v}`).hostname.replace(/^www\./, ''); } catch { /* keep */ } break;
    case 'registerNumber': case 'vatId': case 'postalCode': v = v.replace(/[\s.-]/g, '').toUpperCase(); break;
    case 'registerCourt': v = v.replace(/^amtsgericht\s*/, '').replace(/[^a-zäöü]/g, ''); break;
    default: v = v.replace(/[\s,.;:()"'„“-]+/g, ' ').trim();
  }
  return v;
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u.slice(0, 60); } };

/**
 * Assigns provenance statuses. The agent never decides this:
 * VERIFIED = at least two independent sources (different hosts) agree;
 * LIKELY = one source with confidence ≥ 0.6; UNVERIFIED = otherwise;
 * CONFLICT = sources disagree on a single-valued field (never auto-resolved).
 */
export function assignStatuses(facts: Fact[]): Fact[] {
  const byField = new Map<string, Fact[]>();
  for (const f of facts) byField.set(f.field, [...(byField.get(f.field) ?? []), f]);
  const out: Fact[] = [];
  for (const [field, list] of byField) {
    const groups = new Map<string, Fact[]>();
    for (const f of list) {
      const k = normalize(field, f.value);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), f]);
    }
    const multi = MULTI_FIELDS.has(field);
    const credible = [...groups.values()].filter((g) => g.some((f) => f.confidence >= 0.5));
    const conflict = !multi && credible.length > 1;
    for (const g of groups.values()) {
      const hosts = new Set(g.map((f) => host(f.sourceUrl)));
      const best = Math.max(...g.map((f) => f.confidence));
      let status: FactStatus = hosts.size >= 2 ? 'VERIFIED' : best >= 0.6 ? 'LIKELY' : 'UNVERIFIED';
      if (conflict && g.some((f) => f.confidence >= 0.5)) status = 'CONFLICT';
      for (const f of g) out.push({ ...f, status, note: conflict ? `conflicting values: ${credible.map((c) => c[0]!.value).join(' | ')}`.slice(0, 400) : hosts.size >= 2 ? `confirmed by ${[...hosts].join(', ')}` : '' });
    }
  }
  return out;
}

/** One row per field with the best value — for display and for the website brief (verified/likely only). */
export function summarizeFacts(facts: Fact[]): Array<{ field: string; value: string; status: FactStatus; sources: string[]; factIds: string[] }> {
  const rank: Record<FactStatus, number> = { VERIFIED: 3, LIKELY: 2, UNVERIFIED: 1, CONFLICT: 0 };
  const groups = new Map<string, Fact[]>();
  for (const f of facts) {
    const key = `${f.field}::${MULTI_FIELDS.has(f.field) ? normalize(f.field, f.value) : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const rows: Array<{ field: string; value: string; status: FactStatus; sources: string[]; factIds: string[] }> = [];
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => rank[b.status] - rank[a.status] || b.confidence - a.confidence);
    const top = sorted[0]!;
    rows.push({ field: top.field, value: top.status === 'CONFLICT' ? [...new Set(g.map((f) => f.value))].join(' | ') : top.value, status: top.status, sources: [...new Set(g.map((f) => f.sourceUrl))], factIds: g.map((f) => f.id) });
  }
  return rows.sort((a, b) => a.field.localeCompare(b.field));
}
