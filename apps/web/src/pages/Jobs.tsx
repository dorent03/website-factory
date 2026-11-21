import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, post } from '../lib/api.ts';
import { useServerEvents } from '../lib/events.ts';
import { Button, ErrorNote, PageHeader, Panel, Table, fmtDuration, fmtTime } from '../components/ui.tsx';
import { LeaderRow, Status } from '../components/status.tsx';

export function JobSteps({ job }: { job: any }) {
  return (
    <div>
      {job.steps.map((s: any) => (
        <LeaderRow key={s.key} label={<span>{s.label}{s.agent && <span className="ml-1.5 text-ink-3">· {s.agent}</span>}</span>} sub={s.detail || undefined}>
          <Status value={s.status} />
        </LeaderRow>
      ))}
    </div>
  );
}

export function Jobs() {
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api('/jobs') });
  return (
    <div className="fade-in">
      <PageHeader title="Jobs" subtitle="Every pipeline run with its steps, agents and outcome." />
      <div className="p-6">
        <Panel pad={false}>
          <Table head={['Job', 'Kind', 'State', 'Progress', 'Created']}>
            {(jobs.data?.jobs ?? []).map((j: any) => {
              const done = j.steps.filter((s: any) => !['waiting', 'running'].includes(s.status)).length;
              return (
                <tr key={j.id} className="hover:bg-sunken/50">
                  <td><Link to={`/jobs/${j.id}`} className="font-medium hover:text-accent">{j.title}</Link>{j.error && <div className="max-w-[520px] truncate text-[11.5px] text-fail">{j.error}</div>}</td>
                  <td className="text-ink-2">{j.kind}</td>
                  <td><Status value={j.state} /></td>
                  <td className="font-mono text-ink-2">{done}/{j.steps.length}</td>
                  <td className="whitespace-nowrap text-ink-3">{fmtTime(j.createdAt)}</td>
                </tr>
              );
            })}
          </Table>
          {!jobs.data?.jobs?.length && <div className="px-3 py-4 text-[12px] text-ink-3">No jobs yet. Start one from a customer, the Generate wizard or ⌘K.</div>}
        </Panel>
      </div>
    </div>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api(`/jobs/${id}`), refetchInterval: 4000 });
  const [lines, setLines] = useState<string[]>([]);
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => { if (q.data?.log) setLines(q.data.log); }, [q.data?.log?.length]);
  useServerEvents((e) => { if (e.type === 'log' && e.jobId === id) setLines((l) => [...l.slice(-1500), `${e.at.slice(11, 19)} ${e.line}`]); });
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines.length]);
  const retry = useMutation({ mutationFn: (agent?: string) => post(`/jobs/${id}/retry`, agent ? { agent } : {}), onSuccess: () => q.refetch() });
  const cancel = useMutation({ mutationFn: () => post(`/jobs/${id}/cancel`), onSuccess: () => q.refetch() });
  const job = q.data?.job;
  if (!job) return <div className="p-6 text-ink-3">{q.error ? (q.error as Error).message : 'Loading…'}</div>;
  const lastTask = q.data.tasks?.[0];
  const other = lastTask?.agent === 'claude' ? 'codex' : 'claude';
  const active = !['complete', 'failed', 'cancelled', 'manual-review', 'waiting-for-agent'].includes(job.state);
  return (
    <div className="fade-in">
      <PageHeader
        title={job.title}
        subtitle={<span className="flex items-center gap-3"><Status value={job.state} /><span>{job.kind}</span><span>{fmtTime(job.createdAt)}</span>{job.websiteId && <Link className="hover:text-ink" to={`/websites/${job.websiteId}`}>Open workspace →</Link>}</span>}
        actions={<>
          {(job.state === 'failed' || job.state === 'waiting-for-agent' || job.state === 'cancelled') && <Button variant="primary" onClick={() => retry.mutate(undefined)} busy={retry.isPending}>Retry</Button>}
          {job.state === 'waiting-for-agent' && lastTask && <Button onClick={() => retry.mutate(other)}>Use {other === 'claude' ? 'Claude' : 'Codex'} instead</Button>}
          {active && <Button variant="danger" onClick={() => cancel.mutate()} busy={cancel.isPending}>Cancel</Button>}
        </>}
      />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="space-y-4">
          <Panel title="Steps"><JobSteps job={job} /></Panel>
          {job.error && <Panel title="Stopped because"><div className="whitespace-pre-wrap text-[12px] text-fail">{job.error}</div>
            {job.state === 'waiting-for-agent' && <p className="mt-2 text-[12px] text-ink-2">The agent reported a limit, auth or provider problem. The Factory does not retry automatically. Retry later, switch agent, or cancel.</p>}</Panel>}
          <ErrorNote error={retry.error || cancel.error} />
        </div>
        <div className="space-y-4">
          <Panel title="Agent tasks" pad={false}>
            <Table head={['Task', 'Agent', 'Status', 'Duration']}>
              {(q.data.tasks ?? []).map((t: any) => (
                <tr key={t.id}>
                  <td className="max-w-[460px]"><div className="truncate">{t.objective}</div><div className="text-[11px] text-ink-3">{t.role} · {t.write ? 'write (isolated worktree)' : 'read-only'}{t.model ? ` · ${t.model}` : ''}</div>{t.error && <div className="truncate text-[11.5px] text-fail">{t.error}</div>}</td>
                  <td className="whitespace-nowrap">{t.agent}{t.fallbackUsed && <div className="mt-0.5 inline-block rounded bg-warn/10 px-1 text-[10.5px] font-semibold text-warn">FALLBACK AGENT USED</div>}</td>
                  <td><Status value={t.status} /></td>
                  <td className="font-mono text-ink-2">{fmtDuration(t.durationMs)}</td>
                </tr>
              ))}
            </Table>
            {!q.data.tasks?.length && <div className="px-3 py-3 text-[12px] text-ink-3">No agent tasks in this job yet.</div>}
          </Panel>
          <Panel title="Live log" pad={false}>
            <pre ref={logRef} className="max-h-[460px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-2">{lines.join('\n') || 'No output yet.'}</pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}
