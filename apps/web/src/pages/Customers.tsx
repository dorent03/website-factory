import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { LEGAL_FORMS, SITE_TYPE_LABELS } from '@wf/shared';
import { api, patch, post } from '../lib/api.ts';
import { Button, Empty, ErrorNote, Field, Input, PageHeader, Panel, Select, Table, Textarea, cx, fmtTime } from '../components/ui.tsx';
import { Status } from '../components/status.tsx';
import { ResearchPanel } from './Research.tsx';

const emptyMarketing = { companyName: '', industry: '', website: '', phone: '', email: '', contactPerson: '', address: { street: '', postalCode: '', city: '', country: 'Deutschland' }, openingHours: '', services: [] as string[], serviceArea: '', socialMedia: [] as Array<{ network: string; url: string }>, logoAssetId: '', brandColors: [] as string[], notes: '' };
const emptyLegal = { legalName: '', legalForm: '', street: '', postalCode: '', city: '', country: 'Deutschland', email: '', phone: '', representatives: [] as string[], registerCourt: '', registerNumber: '', vatId: '', economicId: '', supervisoryAuthority: '', chamber: '', professionalTitle: '', professionalTitleCountry: '', professionalRules: '', editorialResponsible: '', isCommercial: true, isRegulatedProfession: false, sellsToConsumers: false, hasJournalisticContent: false, employeeCountBand: 'unknown' };

export function Customers() {
  const q = useQuery({ queryKey: ['customers'], queryFn: () => api('/customers') });
  const [filter, setFilter] = useState('');
  const list = (q.data?.customers ?? []).filter((c: any) => `${c.marketing.companyName} ${c.marketing.address.city} ${c.marketing.industry}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="fade-in">
      <PageHeader title="Customers" subtitle={`${q.data?.customers?.length ?? 0} customers`} actions={<><Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48" /><Link to="/customers/new"><Button variant="primary">New customer</Button></Link></>} />
      <div className="p-6">
        {q.data && !q.data.customers.length ? (
          <Empty title="No customers yet" action={<Link to="/customers/new"><Button variant="primary">New customer</Button></Link>}>Create a customer, then let the Factory research publicly available company information with full source provenance.</Empty>
        ) : (
          <Panel pad={false}>
            <Table head={['Company', 'City', 'Industry', 'Websites', 'Updated']}>
              {list.map((c: any) => (
                <tr key={c.id} className="hover:bg-sunken/50">
                  <td><Link className="font-medium hover:text-accent" to={`/customers/${c.id}`}>{c.marketing.companyName}</Link><div className="font-mono text-[11px] text-ink-3">{c.slug}</div></td>
                  <td className="text-ink-2">{c.marketing.address.city || '—'}</td>
                  <td className="text-ink-2">{c.marketing.industry || '—'}</td>
                  <td className="font-mono">{c.websiteCount}</td>
                  <td className="text-ink-3">{fmtTime(c.updatedAt)}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        )}
      </div>
    </div>
  );
}

function CustomerForm({ initial, onSubmit, submitLabel, busy, error }: { initial?: any; onSubmit: (v: any) => void; submitLabel: string; busy?: boolean; error?: unknown }) {
  const [m, setM] = useState<any>(initial?.marketing ?? emptyMarketing);
  const [l, setL] = useState<any>(initial?.legal ?? emptyLegal);
  useEffect(() => { if (initial) { setM(initial.marketing); setL(initial.legal); } }, [initial?.updatedAt]);
  const mf = (k: string) => ({ value: m[k] ?? '', onChange: (e: any) => setM({ ...m, [k]: e.target.value }) });
  const af = (k: string) => ({ value: m.address?.[k] ?? '', onChange: (e: any) => setM({ ...m, address: { ...m.address, [k]: e.target.value } }) });
  const lf = (k: string) => ({ value: l[k] ?? '', onChange: (e: any) => setL({ ...l, [k]: e.target.value }) });
  const lb = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={!!l[k]} onChange={(e) => setL({ ...l, [k]: e.target.checked })} className="accent-[var(--wf-accent)]" />{label}</label>
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const colors = (typeof m.brandColors === 'string' ? m.brandColors.split(/[\s,]+/) : m.brandColors).filter((c: string) => /^#[0-9a-f]{6}$/i.test(c));
    const services = typeof m.services === 'string' ? m.services.split('\n').map((s: string) => s.trim()).filter(Boolean) : m.services;
    const reps = typeof l.representatives === 'string' ? l.representatives.split('\n').map((s: string) => s.trim()).filter(Boolean) : l.representatives;
    onSubmit({ marketing: { ...m, brandColors: colors, services }, legal: { ...l, representatives: reps } });
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Marketing information" actions={<span className="text-[11px] text-ink-3">may be shaped for presentation</span>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company name *" className="col-span-2"><Input required {...mf('companyName')} /></Field>
          <Field label="Industry"><Input {...mf('industry')} placeholder="z. B. Elektrotechnik" /></Field>
          <Field label="Existing website"><Input {...mf('website')} placeholder="https://…" /></Field>
          <Field label="Street"><Input {...af('street')} /></Field>
          <div className="grid grid-cols-[96px_1fr] gap-2"><Field label="Postal code"><Input {...af('postalCode')} /></Field><Field label="City"><Input {...af('city')} /></Field></div>
          <Field label="Phone"><Input {...mf('phone')} /></Field>
          <Field label="Email"><Input type="email" {...mf('email')} /></Field>
          <Field label="Contact person"><Input {...mf('contactPerson')} /></Field>
          <Field label="Service area"><Input {...mf('serviceArea')} placeholder="z. B. Zollernalbkreis" /></Field>
          <Field label="Opening hours" className="col-span-2"><Input {...mf('openingHours')} placeholder="Mo–Fr 7:30–17:00" /></Field>
          <Field label="Services (one per line)" className="col-span-2"><Textarea rows={3} value={Array.isArray(m.services) ? m.services.join('\n') : m.services} onChange={(e) => setM({ ...m, services: e.target.value })} /></Field>
          <Field label="Brand colors" hint="Hex, comma separated"><Input value={Array.isArray(m.brandColors) ? m.brandColors.join(', ') : m.brandColors} onChange={(e) => setM({ ...m, brandColors: e.target.value })} placeholder="#1a4d8f, #f2b705" /></Field>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} {...mf('notes')} /></Field>
        </div>
      </Panel>
      <Panel title="Legal information" actions={<span className="text-[11px] text-ink-3">exact · sourced · never invented</span>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Legal company name" className="col-span-2"><Input {...lf('legalName')} placeholder="exactly as registered" /></Field>
          <Field label="Legal form"><Select {...lf('legalForm')}><option value="">—</option>{LEGAL_FORMS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
          <Field label="Representatives (one per line)"><Textarea rows={2} value={Array.isArray(l.representatives) ? l.representatives.join('\n') : l.representatives} onChange={(e) => setL({ ...l, representatives: e.target.value })} /></Field>
          <Field label="Street (registered)"><Input {...lf('street')} /></Field>
          <div className="grid grid-cols-[96px_1fr] gap-2"><Field label="Postal code"><Input {...lf('postalCode')} /></Field><Field label="City"><Input {...lf('city')} /></Field></div>
          <Field label="Legal email"><Input {...lf('email')} /></Field>
          <Field label="Legal phone"><Input {...lf('phone')} /></Field>
          <Field label="Register court"><Input {...lf('registerCourt')} placeholder="Amtsgericht Stuttgart" /></Field>
          <Field label="Register number"><Input {...lf('registerNumber')} placeholder="HRB 123456" /></Field>
          <Field label="VAT ID (USt-IdNr.)"><Input {...lf('vatId')} /></Field>
          <Field label="Wirtschafts-ID"><Input {...lf('economicId')} /></Field>
          <Field label="Supervisory authority"><Input {...lf('supervisoryAuthority')} /></Field>
          <Field label="Chamber (Kammer)"><Input {...lf('chamber')} placeholder="z. B. Handwerkskammer Reutlingen" /></Field>
          <Field label="Professional title"><Input {...lf('professionalTitle')} /></Field>
          <Field label="Title awarded in"><Input {...lf('professionalTitleCountry')} /></Field>
          <Field label="Professional rules" className="col-span-2"><Input {...lf('professionalRules')} /></Field>
          <Field label="Editorially responsible (§ 18 MStV)" className="col-span-2"><Input {...lf('editorialResponsible')} placeholder="only if journalistic-editorial content" /></Field>
          <div className="col-span-2 grid grid-cols-2 gap-1.5 pt-1">
            {lb('isCommercial', 'Commercial (geschäftsmäßig)')}
            {lb('sellsToConsumers', 'Sells to consumers (B2C)')}
            {lb('isRegulatedProfession', 'Regulated profession')}
            {lb('hasJournalisticContent', 'Journalistic-editorial content')}
          </div>
          <Field label="Employees" hint="Relevant for accessibility-law applicability"><Select {...lf('employeeCountBand')}><option value="unknown">unknown</option><option value="lt10">fewer than 10</option><option value="10to49">10–49</option><option value="50plus">50+</option></Select></Field>
        </div>
      </Panel>
      <div className="flex items-center gap-3 xl:col-span-2">
        <Button variant="primary" type="submit" busy={busy}>{submitLabel}</Button>
        <ErrorNote error={error} />
      </div>
    </form>
  );
}

export function NewCustomer() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [research, setResearch] = useState(true);
  const create = useMutation({
    mutationFn: async (v: any) => {
      const r = await post('/customers', v);
      if (research) await post(`/customers/${r.customer.id}/research`);
      return r;
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['customers'] }); nav(`/customers/${r.customer.id}${research ? '?tab=research' : ''}`); },
  });
  return (
    <div className="fade-in">
      <PageHeader title="New customer" subtitle="Only enter what you know. Research fills gaps with sourced facts you can accept or reject." actions={<label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} className="accent-[var(--wf-accent)]" />Research company after saving</label>} />
      <div className="p-6"><CustomerForm onSubmit={(v) => create.mutate(v)} submitLabel="Create customer" busy={create.isPending} error={create.error} /></div>
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api(`/customers/${id}`) });
  const save = useMutation({ mutationFn: (v: any) => patch(`/customers/${id}`, v), onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', id] }) });
  const open = useMutation({ mutationFn: () => post('/system/open', { what: 'folder', customerId: id }) });
  const tab = sp.get('tab') ?? 'profile';
  const c = q.data?.customer;
  const missing = useMemo(() => c ? ['legalName', 'legalForm', 'street', 'postalCode', 'city', 'email'].filter((k) => !c.legal[k]) : [], [c]);
  if (!c) return <div className="p-6 text-ink-3">{q.error ? (q.error as Error).message : 'Loading…'}</div>;
  return (
    <div className="fade-in">
      <PageHeader title={c.marketing.companyName} subtitle={<span className="font-mono">sites/{c.slug}/</span>}
        actions={<><Button onClick={() => open.mutate()}>Open folder</Button><Link to={`/generate?customer=${c.id}`}><Button variant="primary">New website</Button></Link></>} />
      <Tabs.Root value={tab} onValueChange={(v) => setSp({ tab: v })}>
        <Tabs.List className="flex gap-4 border-b hair px-6">
          {[['profile', 'Profile'], ['research', 'Research & sources'], ['websites', `Websites (${q.data.websites.length})`]].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className={cx('-mb-px h-9 border-b-2 text-[13px]', tab === v ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink')}>{l}</Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="profile" className="p-6">
          {missing.length > 0 && <div className="mb-4 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn">Legal profile incomplete: {missing.join(', ')}. Missing required Impressum data blocks legal approval.</div>}
          <CustomerForm initial={c} onSubmit={(v) => save.mutate(v)} submitLabel="Save changes" busy={save.isPending} error={save.error} />
        </Tabs.Content>
        <Tabs.Content value="research" className="p-6"><ResearchPanel customerId={c.id} data={q.data} /></Tabs.Content>
        <Tabs.Content value="websites" className="p-6">
          {q.data.websites.length ? (
            <Panel pad={false}>
              <Table head={['Website', 'Type', 'Status', 'Version', 'Updated']}>
                {q.data.websites.map((w: any) => (
                  <tr key={w.id}>
                    <td><Link className="font-medium hover:text-accent" to={`/websites/${w.id}`}>{w.name}</Link><div className="font-mono text-[11px] text-ink-3">sites/{c.slug}/sites/{w.slug}/</div></td>
                    <td className="text-ink-2">{(SITE_TYPE_LABELS as any)[w.siteType] ?? w.siteType}</td>
                    <td><Status value={(w.gate as any)?.state ?? w.status} /></td>
                    <td className="font-mono text-ink-2">{w.currentVersion ?? '—'}</td>
                    <td className="text-ink-3">{fmtTime(w.updatedAt)}</td>
                  </tr>
                ))}
              </Table>
            </Panel>
          ) : <Empty title="No websites yet" action={<Link to={`/generate?customer=${c.id}`}><Button variant="primary">New website</Button></Link>}>One customer can have several websites — a company site, a landing page, a recruiting site — each stored separately.</Empty>}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
