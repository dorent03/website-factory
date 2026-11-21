import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import { SITE_TYPE_LABELS } from '@wf/shared';
import { api, post } from '../lib/api.ts';
import { Button, ErrorNote, Empty, cx } from '../components/ui.tsx';
import { Status } from '../components/status.tsx';
import { Preview, type Annotation } from '../views/Preview.tsx';
import { ChatPanel } from '../views/Chat.tsx';
import { PipelineView } from '../views/Pipeline.tsx';
import { DesignSystemView, VersionsView } from '../views/Versions.tsx';
import { ConsentView, GateView, InventoryView, LegalAuditView, QAReportView } from '../views/Reports.tsx';

const TABS = [['ai', 'AI'], ['pipeline', 'Pipeline'], ['versions', 'Versions'], ['qa', 'QA'], ['legal', 'Legal & Privacy'], ['design', 'Design'], ['research', 'Research']] as const;

export function Workspace() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ['website', id], queryFn: () => api(`/websites/${id}`), refetchInterval: 8000 });
  const [picking, setPicking] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const tab = sp.get('tab') ?? (q.data?.website?.currentVersion ? 'ai' : 'pipeline');
  const job = useMutation({ mutationFn: (kind: string) => post(`/websites/${id}/jobs`, { kind }) });
  const open = useMutation({ mutationFn: (b: object) => post('/system/open', { websiteId: id, ...b }) });
  const onPick = useCallback((a: Omit<Annotation, 'note'>) => { setAnnotations((x) => [...x, { ...a, note: '' }]); setPicking(false); setSp({ tab: 'ai' }); }, [setSp]);
  const d = q.data;
  if (!d) return <div className="p-6 text-ink-3">{q.error ? (q.error as Error).message : 'Loading…'}</div>;
  const w = d.website;
  const built = !!w.currentVersion && d.pages.length > 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b hair px-4 py-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h1 className="truncate text-[14px] font-semibold">{w.name}</h1><Status value={w.gate?.state ?? 'NOT_EVALUATED'} /></div>
          <div className="truncate text-[11.5px] text-ink-3"><Link className="hover:text-ink" to={`/customers/${d.customer.id}`}>{d.customer.companyName}</Link> · {(SITE_TYPE_LABELS as any)[w.siteType]} · <span className="font-mono">{w.currentVersion ?? 'not built'}</span>{w.staleness?.stale && <span className="text-warn"> · compliance state invalidated</span>}</div>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" disabled={!built} onClick={() => job.mutate('visual-review')}>Claude review</Button>
          <Button size="sm" disabled={!built} onClick={() => job.mutate('technical-qa')}>Codex review</Button>
          <Button size="sm" disabled={!built} onClick={() => job.mutate('qa')}>Full QA</Button>
          <Button size="sm" disabled={!built} onClick={() => job.mutate('legal')}>Legal audit</Button>
          <Button size="sm" disabled={!built} onClick={() => open.mutate({ what: 'site' })}>Open site</Button>
          <Button size="sm" onClick={() => open.mutate({ what: 'folder' })}>Folder</Button>
          <Button size="sm" onClick={() => open.mutate({ what: 'terminal', sub: 'current' })}>Terminal</Button>
          <a href={built ? `/api/websites/${w.id}/export` : undefined} aria-disabled={!built}><Button size="sm" variant="primary" disabled={!built}>Export ZIP</Button></a>
        </div>
      </div>
      {(job.data || job.error || open.error) && <div className="shrink-0 border-b hair px-4 py-1 text-[12px]">{job.data && <Link to={`/jobs/${job.data.job.id}`} className="text-accent">Started: {job.data.job.title} →</Link>}<ErrorNote error={job.error || open.error} /></div>}
      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 border-r hair" aria-label="Preview">
          {built ? <Preview base={d.previewBase} pages={d.pages} onPick={onPick} picking={picking} setPicking={setPicking} version={w.currentVersion} /> : <div className="p-6"><Empty title="Nothing to preview yet">Create the brief, generate concepts, select one and build — the preview appears here.</Empty></div>}
        </section>
        <aside className="flex w-[440px] shrink-0 flex-col bg-canvas">
          <Tabs.Root value={tab} onValueChange={(v) => setSp({ tab: v })} className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="flex shrink-0 gap-3 overflow-x-auto border-b hair px-3">
              {TABS.map(([v, l]) => <Tabs.Trigger key={v} value={v} className={cx('-mb-px h-9 shrink-0 border-b-2 text-[12.5px]', tab === v ? 'border-accent font-medium' : 'border-transparent text-ink-2 hover:text-ink')}>{l}</Tabs.Trigger>)}
            </Tabs.List>
            <Tabs.Content value="ai" className="min-h-0 flex-1"><ChatPanel websiteId={w.id} annotations={annotations} setAnnotations={setAnnotations} disabled={built ? undefined : 'Build the website first'} /></Tabs.Content>
            <Tabs.Content value="pipeline" className="min-h-0 flex-1 overflow-y-auto p-3"><PipelineView data={d} /></Tabs.Content>
            <Tabs.Content value="versions" className="min-h-0 flex-1 overflow-y-auto p-3"><VersionsView data={d} /></Tabs.Content>
            <Tabs.Content value="qa" className="min-h-0 flex-1 overflow-y-auto p-3"><QAReportView qa={d.qa} /></Tabs.Content>
            <Tabs.Content value="legal" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <GateView websiteId={w.id} gate={w.gate} />
              <div className="panel p-3"><div className="label mb-2">Legal audit</div><LegalAuditView audit={d.legalAudit} />{d.legalAudit && <a className="mt-2 block text-[12px] text-accent" href={`/api/websites/${w.id}/legal-report`} target="_blank" rel="noreferrer">Human-readable report ↗</a>}</div>
              <div className="panel p-3"><div className="label mb-2">Consent</div><ConsentView consent={d.consent} /></div>
              <div className="panel overflow-x-auto p-3"><div className="label mb-2">Privacy inventory</div><InventoryView inv={d.inventory} /></div>
            </Tabs.Content>
            <Tabs.Content value="design" className="min-h-0 flex-1 overflow-y-auto p-3"><DesignSystemView ds={d.designSystem} /></Tabs.Content>
            <Tabs.Content value="research" className="min-h-0 flex-1 overflow-y-auto p-3 text-[12.5px]"><Link className="text-accent" to={`/customers/${d.customer.id}?tab=research`}>Open research & sources for {d.customer.companyName} →</Link><div className="mt-2 text-ink-3">Facts used in the brief:</div>{(w.brief?.factsUsed ?? []).map((f: any) => <div key={f.factId + f.claim} className="border-b hair py-1">{f.claim} <span className="font-mono text-[10.5px] text-ink-3">{f.factId}</span></div>)}</Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>
    </div>
  );
}
