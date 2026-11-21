import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from '../lib/api.ts';
import { Button, Empty, ErrorNote, Panel, cx } from '../components/ui.tsx';
import { LeaderRow, Status } from '../components/status.tsx';

export function useSiteJob(websiteId: string, kind: string) {
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api('/jobs') });
  return (jobs.data?.jobs ?? []).find((j: any) => j.websiteId === websiteId && j.kind === kind) ?? null;
}

const ACTIVE = (j: any) => j && !['complete', 'failed', 'cancelled', 'manual-review', 'waiting-for-agent'].includes(j.state);

export function JobLine({ job }: { job: any }) {
  if (!job) return null;
  const cur = job.steps.find((s: any) => s.status === 'running') ?? [...job.steps].reverse().find((s: any) => s.status !== 'waiting');
  return <Link to={`/jobs/${job.id}`} className="flex items-center justify-between gap-2 rounded-md border hair px-2 py-1 text-[12px] hover:bg-sunken"><span className="truncate">{cur ? cur.label : job.title}</span><Status value={job.state} /></Link>;
}

export function BriefPanel({ data }: { data: any }) {
  const qc = useQueryClient();
  const w = data.website;
  const job = useSiteJob(w.id, 'brief');
  const files = useQuery({ queryKey: ['website-files', w.id, w.updatedAt], queryFn: () => api(`/websites/${w.id}/files`) });
  const run = useMutation({ mutationFn: () => post(`/websites/${w.id}/jobs`, { kind: 'brief' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }) });
  const approve = useMutation({ mutationFn: () => post(`/websites/${w.id}/brief/approve`), onSuccess: () => qc.invalidateQueries({ queryKey: ['website', w.id] }) });
  const b = w.brief;
  const issues: string[] = files.data?.briefFile?.validation?.issues ?? [];
  return (
    <Panel title="1 · Website brief" actions={<>{b && !w.briefApproved && <Button size="sm" variant="primary" onClick={() => approve.mutate()} busy={approve.isPending}>Approve brief</Button>}<Button size="sm" onClick={() => run.mutate()} busy={run.isPending || ACTIVE(job)}>{b ? 'Regenerate' : 'Create brief'}</Button></>}>
      <JobLine job={job} />
      {b ? (
        <div className="mt-2 space-y-2 text-[12.5px]">
          <div className="flex items-center gap-2">{w.briefApproved ? <Status value="APPROVE" /> : <span className="font-mono text-[11px] font-semibold text-warn">AWAITING APPROVAL</span>}{issues.length ? <span className="text-[11.5px] text-warn">{issues.length} validation issue(s)</span> : <span className="text-[11.5px] text-ink-3">automated validation passed</span>}</div>
          {issues.map((i) => <div key={i} className="text-[11.5px] text-warn">• {i}</div>)}
          <div><span className="text-ink-3">Purpose</span> {b.purpose}</div>
          <div><span className="text-ink-3">Audience</span> {b.targetAudience.join(', ')}</div>
          <div><span className="text-ink-3">Tone</span> {b.tone} · <span className="text-ink-3">Architecture</span> {b.architecture}</div>
          <div><span className="text-ink-3">Primary CTA</span> {b.primaryCta.label}</div>
          <div><div className="label mb-1">Pages</div>{b.pages.map((p: any) => <div key={p.file} className="flex gap-2"><span className="w-32 shrink-0 font-mono text-[11.5px] text-ink-2">{p.file}</span><span>{p.title} — <span className="text-ink-3">{p.purpose}</span></span></div>)}</div>
          <div><span className="text-ink-3">Design direction</span> {b.designDirection}</div>
          {b.privacyImplications.length > 0 && <div><span className="text-ink-3">Privacy implications</span> {b.privacyImplications.join(' · ')}</div>}
          {b.claimsToAvoid.length > 0 && <div><span className="text-ink-3">Claims to avoid (no verified facts)</span> {b.claimsToAvoid.join(' · ')}</div>}
        </div>
      ) : <div className="mt-2 text-[12px] text-ink-3">Claude writes the brief from verified research facts. It must be approved before any code is written.</div>}
      <ErrorNote error={run.error || approve.error} />
    </Panel>
  );
}

export function ConceptsPanel({ data }: { data: any }) {
  const qc = useQueryClient();
  const w = data.website;
  const job = useSiteJob(w.id, 'concepts');
  const run = useMutation({ mutationFn: () => post(`/websites/${w.id}/jobs`, { kind: 'concepts' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }) });
  const select = useMutation({ mutationFn: (c: string) => post(`/websites/${w.id}/concept`, { concept: c }), onSuccess: () => qc.invalidateQueries({ queryKey: ['website', w.id] }) });
  const concepts = w.concepts?.concepts ?? [];
  const review = w.conceptReview;
  const img = (p: string) => `/api/websites/${w.id}/artifact?path=${encodeURIComponent(p)}&t=${encodeURIComponent(w.updatedAt)}`;
  return (
    <Panel title="2 · Design concepts" actions={<Button size="sm" onClick={() => run.mutate()} disabled={!w.briefApproved} busy={run.isPending || ACTIVE(job)}>{concepts.length ? 'Regenerate' : 'Generate 3 concepts'}</Button>}>
      <JobLine job={job} />
      {!w.briefApproved && <div className="mt-2 text-[12px] text-ink-3">Approve the brief first.</div>}
      {concepts.length > 0 && (
        <div className="@container mt-2">
          <div className="grid grid-cols-1 gap-3 @4xl:grid-cols-3">
            {concepts.map((c: any) => {
              const r = review?.concepts?.find((x: any) => x.id === c.id);
              const chosen = w.selectedConcept === c.id;
              const count = (st: string) => r?.criteria.filter((k: any) => k.status === st).length ?? 0;
              const order: Record<string, number> = { FAIL: 0, WARNING: 1, PASS: 2 };
              const criteria = [...(r?.criteria ?? [])].sort((a: any, b: any) => order[a.status] - order[b.status]);
              const href = `${data.previewBase.replace('/current/', `/concepts/${c.id}/`)}index.html`;
              return (
                <article key={c.id} className={cx('@container rounded-lg border bg-surface p-2.5', chosen ? 'border-accent ring-2 ring-accent-soft' : 'border-line')}>
                  <header className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-[13px] font-semibold leading-snug">{c.id} · {c.name}</h3>
                    {review?.recommendation === c.id && <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent">RECOMMENDED</span>}
                  </header>
                  <div className="grid grid-cols-1 gap-2.5 @sm:grid-cols-[164px_minmax(0,1fr)]">
                    <a href={href} target="_blank" rel="noreferrer" className="flex gap-1" title="Open preview">
                      <span className="block h-36 min-w-0 flex-1 overflow-hidden rounded border hair bg-sunken"><img alt={`Concept ${c.id}, desktop`} src={img(`qa/visual/concepts/${c.id}-desktop.png`)} className="h-full w-full object-cover object-top" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /></span>
                      <span className="block h-36 w-11 shrink-0 overflow-hidden rounded border hair bg-sunken"><img alt={`Concept ${c.id}, mobile`} src={img(`qa/visual/concepts/${c.id}-mobile.png`)} className="h-full w-full object-cover object-top" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /></span>
                    </a>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap gap-1">{c.designSystem.colors.slice(0, 8).map((t: any) => <span key={t.token} title={`--${t.token} ${t.value}`} className="size-3.5 rounded-sm border hair" style={{ background: t.value }} />)}</div>
                      <div className="truncate text-[11.5px] text-ink-2" title={`${c.designSystem.typography.display.family} / ${c.designSystem.typography.body.family}`}>{c.designSystem.typography.display.family} / {c.designSystem.typography.body.family}</div>
                      <p className="line-clamp-3 text-[11.5px] leading-snug text-ink-3" title={c.rationale}>{c.rationale}</p>
                      {r && (
                        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[10.5px] font-semibold">
                          <span className="text-pass">{count('PASS')} PASS</span>
                          <span className={count('WARNING') ? 'text-warn' : 'text-ink-3'}>{count('WARNING')} WARN</span>
                          <span className={count('FAIL') ? 'text-fail' : 'text-ink-3'}>{count('FAIL')} FAIL</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {r && (
                    <details className="group mt-2 rounded-md border hair">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1 text-[11.5px] text-ink-2 hover:text-ink">Claude review<span className="text-ink-3 transition-transform group-open:rotate-90">›</span></summary>
                      <ul className="border-t hair px-2 py-1">
                        {criteria.map((k: any) => (
                          <li key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 py-0.5" title={k.evidence}>
                            <span className="truncate text-[11.5px]">{k.label}</span>
                            <Status value={k.status} />
                          </li>
                        ))}
                      </ul>
                      {r.weaknesses?.length > 0 && <ul className="space-y-0.5 border-t hair px-2 py-1.5 text-[11px] leading-snug text-ink-3">{r.weaknesses.slice(0, 3).map((x: string) => <li key={x}>– {x}</li>)}</ul>}
                    </details>
                  )}
                  <Button size="sm" variant={chosen ? 'primary' : 'secondary'} className="mt-2 w-full" onClick={() => select.mutate(c.id)}>{chosen ? 'Selected' : `Select concept ${c.id}`}</Button>
                </article>
              );
            })}
          </div>
        </div>
      )}
      {review && <div className="mt-2 text-[12px] text-ink-2"><span className="text-ink-3">Claude:</span> {review.recommendationReason}</div>}
      <ErrorNote error={run.error || select.error} />
    </Panel>
  );
}

export function BuildPanel({ data }: { data: any }) {
  const qc = useQueryClient();
  const w = data.website;
  const job = useSiteJob(w.id, 'build');
  const run = useMutation({ mutationFn: () => post(`/websites/${w.id}/jobs`, { kind: 'build' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }) });
  return (
    <Panel title="3 · Build" actions={<Button size="sm" variant="primary" onClick={() => run.mutate()} disabled={!w.selectedConcept || !w.briefApproved} busy={run.isPending || ACTIVE(job)}>{w.currentVersion ? 'Rebuild' : 'Build website'}</Button>}>
      {!w.selectedConcept ? <div className="text-[12px] text-ink-3">Select a concept first.</div> : <div className="text-[12px] text-ink-2">Codex implements in an isolated worktree → Factory legal/SEO pass → Claude reviews screenshots ↔ Codex fixes → QA → Codex fixes → privacy → consent → legal → final review → gate.</div>}
      {job && <div className="mt-2 space-y-0.5">{job.steps.map((s: any) => <LeaderRow key={s.key} label={<span className="text-[12px]">{s.label}</span>}><Status value={s.status} /></LeaderRow>)}<Link to={`/jobs/${job.id}`} className="text-[12px] text-accent">Live log →</Link></div>}
      <ErrorNote error={run.error} />
    </Panel>
  );
}

export function PipelineView({ data }: { data: any }) {
  if (!data) return <Empty title="Loading…" />;
  return <div className="space-y-3"><BriefPanel data={data} /><ConceptsPanel data={data} /><BuildPanel data={data} /></div>;
}
