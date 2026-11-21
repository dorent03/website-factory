import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SITE_TYPES, SITE_TYPE_LABELS } from '@wf/shared';
import { api, post } from '../lib/api.ts';
import { Button, ErrorNote, Field, Input, PageHeader, Panel, Select, cx } from '../components/ui.tsx';
import { Status } from '../components/status.tsx';
import { PipelineView } from '../views/Pipeline.tsx';

const STEPS = ['Customer', 'Website type', 'Functionality & privacy', 'Brief', 'Concepts', 'Build'];
const PAGES_FOR: Record<string, string[]> = {
  company: ['Start', 'Leistungen', 'Über uns', 'Kontakt'], trades: ['Start', 'Leistungen', 'Referenzen*', 'Über uns', 'Kontakt'], landing: ['Landingpage (one page)'],
  'local-business': ['Start', 'Angebot', 'Öffnungszeiten & Anfahrt', 'Kontakt'], restaurant: ['Start', 'Speisekarte', 'Reservierung/Kontakt'], recruiting: ['Karriere', 'Stellen', 'Bewerbung'],
  consulting: ['Start', 'Leistungen', 'Vorgehen', 'Über uns', 'Kontakt'], 'professional-services': ['Start', 'Leistungen', 'Team*', 'Kontakt'], portfolio: ['Start', 'Arbeiten', 'Über mich', 'Kontakt'],
  campaign: ['Kampagnenseite (one page)'], custom: ['Start', 'Kontakt'],
};

export function Generate() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api('/customers') });
  const [customerId, setCustomerId] = useState(sp.get('customer') ?? '');
  const [step, setStep] = useState(customerId ? 1 : 0);
  const [name, setName] = useState('Unternehmenswebsite');
  const [siteType, setSiteType] = useState('company');
  const [fn, setFn] = useState({ contactForm: true, map: 'external-link', video: 'none', newsletter: false, booking: false, shop: false, jobApplications: false, userAccounts: false, socialEmbeds: false });
  const [hosting, setHosting] = useState({ provider: '', location: 'Deutschland', domain: '' });
  const [siteId, setSiteId] = useState<string | null>(null);
  const customer = useQuery({ queryKey: ['customer', customerId], queryFn: () => api(`/customers/${customerId}`), enabled: !!customerId });
  const site = useQuery({ queryKey: ['website', siteId], queryFn: () => api(`/websites/${siteId}`), enabled: !!siteId, refetchInterval: 4000 });
  const create = useMutation({
    mutationFn: async () => {
      const r = await post(`/customers/${customerId}/websites`, { name, siteType, functionality: fn, hosting });
      await post(`/websites/${r.website.id}/jobs`, { kind: 'brief' });
      return r;
    },
    onSuccess: (r) => { setSiteId(r.website.id); setStep(3); qc.invalidateQueries({ queryKey: ['websites'] }); },
  });
  const impact = useMemo(() => {
    const out: Array<[string, string]> = [['Hosting & server logs', 'always — Datenschutz section, AV contract with the host']];
    if (fn.contactForm) out.push(['Contact form', 'personal data → privacy section, form security, PHP mail handler']);
    if (fn.map === 'embed') out.push(['Interactive map (OpenStreetMap)', 'third party → consent required, placeholder until consent']);
    if (fn.map === 'external-link') out.push(['Map link', 'no third-party request on the website']);
    if (fn.video === 'youtube' || fn.video === 'vimeo') out.push([fn.video === 'youtube' ? 'YouTube' : 'Vimeo', 'third party → consent banner, placeholder, Datenschutz section']);
    for (const [k, l] of [['newsletter', 'Newsletter'], ['booking', 'Booking'], ['shop', 'Shop'], ['jobApplications', 'Job applications'], ['userAccounts', 'User accounts']] as const) if ((fn as any)[k]) out.push([l, 'special module → MANUAL REVIEW required']);
    return out;
  }, [fn]);
  const c = customer.data?.customer;
  const legalMissing = c ? ['legalName', 'legalForm', 'street', 'postalCode', 'city', 'email'].filter((k) => !c.legal[k]) : [];
  const w = site.data?.website;
  const reached = w ? (w.currentVersion ? 5 : w.selectedConcept ? 5 : w.briefApproved ? 4 : 3) : step;
  return (
    <div className="fade-in">
      <PageHeader title="Generate website" subtitle="Customer → type → functionality → privacy impact → brief → concepts → build" actions={w && <Link to={`/websites/${w.id}`}><Button>Open workspace</Button></Link>} />
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[200px_1fr]">
        <ol className="space-y-1" aria-label="Wizard steps">
          {STEPS.map((s, i) => (
            <li key={s}><button disabled={i > Math.max(step, reached) || (i < 3 && !!siteId)} onClick={() => setStep(i)} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] disabled:opacity-40', step === i ? 'bg-surface font-medium shadow-[0_0_0_1px_var(--wf-line)]' : 'text-ink-2')}><span className="grid size-5 place-items-center rounded-full border border-line-strong font-mono text-[10.5px]">{i + 1}</span>{s}</button></li>
          ))}
        </ol>
        <div className="max-w-4xl space-y-4">
          {step === 0 && (
            <Panel title="Select customer">
              <div className="flex gap-2"><Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Choose…</option>{(customers.data?.customers ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.marketing.companyName}</option>)}</Select><Link to="/customers/new"><Button>New customer</Button></Link></div>
              {c && <div className="mt-3 text-[12px] text-ink-2">{c.marketing.address.city} · {customer.data.facts.length} research facts · {customer.data.websites.length} existing websites{legalMissing.length > 0 && <div className="mt-1 text-warn">Legal profile incomplete ({legalMissing.join(', ')}) — you can continue, the legal audit will block release until it is complete.</div>}</div>}
              <Button className="mt-3" variant="primary" disabled={!customerId} onClick={() => setStep(1)}>Continue</Button>
            </Panel>
          )}
          {step === 1 && (
            <Panel title="Website type">
              <Field label="Website name" className="mb-3 max-w-sm"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {SITE_TYPES.map((t) => <button key={t} onClick={() => setSiteType(t)} aria-pressed={siteType === t} className={cx('rounded-lg border px-3 py-2 text-left text-[12.5px]', siteType === t ? 'border-accent bg-accent-soft font-medium' : 'border-line hover:border-line-strong')}>{SITE_TYPE_LABELS[t]}</button>)}
              </div>
              <div className="mt-3 text-[12px] text-ink-2"><span className="text-ink-3">Recommended pages</span> {PAGES_FOR[siteType]?.join(' · ')} · Impressum · Datenschutz <span className="text-ink-3">(* only with verified content; final page list comes from the brief)</span></div>
              <Button className="mt-3" variant="primary" onClick={() => setStep(2)}>Continue</Button>
            </Panel>
          )}
          {step === 2 && (
            <>
              <Panel title="Functionality">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={fn.contactForm} onChange={(e) => setFn({ ...fn, contactForm: e.target.checked })} />Contact form</label>
                  <Field label="Map"><Select value={fn.map} onChange={(e) => setFn({ ...fn, map: e.target.value })}><option value="none">none</option><option value="address-only">address only</option><option value="external-link">link to external map</option><option value="embed">interactive map (consent)</option></Select></Field>
                  <Field label="Video"><Select value={fn.video} onChange={(e) => setFn({ ...fn, video: e.target.value })}><option value="none">none</option><option value="self-hosted">self-hosted</option><option value="youtube">YouTube (consent)</option><option value="vimeo">Vimeo (consent)</option></Select></Field>
                  {(['newsletter', 'booking', 'shop', 'jobApplications', 'userAccounts'] as const).map((k) => <label key={k} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={(fn as any)[k]} onChange={(e) => setFn({ ...fn, [k]: e.target.checked })} />{k}</label>)}
                </div>
                <p className="mt-2 text-[11.5px] text-ink-3">Analytics, tracking, Google Fonts, reCAPTCHA and Google Maps embeds are never added automatically.</p>
              </Panel>
              <Panel title="Hosting">
                <div className="grid grid-cols-3 gap-3"><Field label="Hosting provider" hint="needed for the Datenschutz hosting section"><Input value={hosting.provider} onChange={(e) => setHosting({ ...hosting, provider: e.target.value })} placeholder="e.g. IONOS SE, Montabaur" /></Field><Field label="Server location"><Input value={hosting.location} onChange={(e) => setHosting({ ...hosting, location: e.target.value })} /></Field><Field label="Production domain" hint="for canonical + sitemap"><Input value={hosting.domain} onChange={(e) => setHosting({ ...hosting, domain: e.target.value })} placeholder="https://www.example.de" /></Field></div>
              </Panel>
              <Panel title="Privacy impact">
                {impact.map(([k, v]) => <div key={k} className="flex gap-3 border-b hair py-1 text-[12.5px] last:border-0"><span className="w-56 shrink-0 font-medium">{k}</span><span className="text-ink-2">{v}</span></div>)}
                <div className="mt-2 text-[12px]">Consent banner: {fn.map === 'embed' || fn.video === 'youtube' || fn.video === 'vimeo' ? <span className="text-warn">required (determined from functionality, verified in the browser later)</span> : <span className="text-pass">not required for the planned functionality</span>}</div>
              </Panel>
              <div className="flex items-center gap-3"><Button variant="primary" onClick={() => create.mutate()} busy={create.isPending}>Create website & write brief</Button><span className="text-[12px] text-ink-3">Stored under sites/{c?.slug}/sites/…</span></div>
              <ErrorNote error={create.error} />
            </>
          )}
          {step >= 3 && site.data && (
            <>
              <div className="flex items-center gap-3 text-[12.5px]"><span className="font-mono text-ink-3">{site.data.paths.root}</span><Status value={w?.gate?.state ?? 'NOT_EVALUATED'} /></div>
              <PipelineView data={site.data} />
              {w?.currentVersion && <Button variant="primary" onClick={() => nav(`/websites/${w.id}`)}>Open workspace</Button>}
            </>
          )}
          {step >= 3 && !siteId && <div className="text-[12px] text-ink-3">Website not created in this session. Open it from <Link className="text-accent" to="/websites">Websites</Link>.</div>}
        </div>
      </div>
    </div>
  );
}
