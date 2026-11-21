import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { useAgents } from '../lib/events.ts';
import { Button, Empty, PageHeader, Panel, fmtTime } from '../components/ui.tsx';
import { LeaderRow, Status } from '../components/status.tsx';
import { AgentCard } from './Agents.tsx';
import { JobSteps } from './Jobs.tsx';

const ACTIVE = ['queued', 'researching', 'planning', 'designing', 'generating', 'implementing', 'rendering', 'visual-review', 'technical-review', 'responsive-qa', 'accessibility-qa', 'seo-qa', 'performance-qa', 'security-qa', 'privacy-audit', 'legal-audit', 'fixing', 'waiting-for-agent'];

function Stat({ label, value, to }: { label: string; value: number | string; to: string }) {
  return (
    <Link to={to} className="panel block px-3 py-2.5 transition-colors hover:border-line-strong">
      <div className="label">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.02em]">{value}</div>
    </Link>
  );
}

export function Dashboard() {
  const agents = useAgents();
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api('/customers') });
  const websites = useQuery({ queryKey: ['websites'], queryFn: () => api('/websites') });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api('/jobs') });
  const qa = useQuery({ queryKey: ['overview'], queryFn: () => api('/overview') });
  const active = (jobs.data?.jobs ?? []).filter((j: any) => ACTIVE.includes(j.state));
  const sites = websites.data?.websites ?? [];
  return (
    <div className="fade-in">
      <PageHeader title="Dashboard" actions={<><Link to="/customers/new"><Button>New customer</Button></Link><Link to="/generate"><Button variant="primary">Generate website</Button></Link></>} />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Customers" value={customers.data?.customers?.length ?? '—'} to="/customers" />
          <Stat label="Websites" value={sites.length} to="/websites" />
          <Stat label="Active jobs" value={active.length} to="/jobs" />
          <Stat label="QA failures" value={qa.data?.qaFailures ?? '—'} to="/qa" />
          <Stat label="Legal warnings" value={qa.data?.legalWarnings ?? '—'} to="/legal" />
          <Stat label="Manual review" value={qa.data?.manualReview ?? '—'} to="/legal" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <Panel title="AI agents">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['claude', 'codex'] as const).map((id) => <AgentCard key={id} a={agents.find((a) => a.agent === id)} />)}
              </div>
            </Panel>
            <Panel title="Recent websites" pad={false}>
              {sites.length ? sites.slice(0, 8).map((w: any) => (
                <Link key={w.id} to={`/websites/${w.id}`} className="flex items-center justify-between border-b hair px-3 py-2 last:border-0 hover:bg-sunken/50">
                  <div><div className="text-[13px] font-medium">{w.customerName}</div><div className="text-[12px] text-ink-3">{w.name} · {w.currentVersion ?? 'no version yet'}</div></div>
                  <div className="text-right"><Status value={(w.gate as any)?.state ?? 'NOT_EVALUATED'} /><div className="text-[11px] text-ink-3">{fmtTime(w.updatedAt)}</div></div>
                </Link>
              )) : <div className="p-3"><Empty title="No websites yet" action={<Link to="/generate"><Button variant="primary">Generate website</Button></Link>} /></div>}
            </Panel>
          </div>
          <div className="space-y-4">
            {active.length ? active.slice(0, 3).map((j: any) => (
              <Panel key={j.id} title="Active job" actions={<Link to={`/jobs/${j.id}`} className="text-[12px] text-accent">Open →</Link>}>
                <div className="mb-2"><div className="text-[13px] font-medium">{j.title}</div><div className="text-[12px] text-ink-3"><Status value={j.state} /></div></div>
                <JobSteps job={j} />
              </Panel>
            )) : (
              <Panel title="Active jobs"><div className="text-[12px] text-ink-3">Nothing running.</div></Panel>
            )}
            <Panel title="Latest results">
              {(qa.data?.sites ?? []).slice(0, 6).map((s: any) => (
                <LeaderRow key={s.id} label={<Link to={`/websites/${s.id}`} className="hover:text-accent">{s.customerName} · {s.name}</Link>} sub={s.gateReasons?.slice(0, 2).join(' · ')}>
                  <Status value={s.gate ?? 'NOT_EVALUATED'} />
                </LeaderRow>
              ))}
              {!qa.data?.sites?.length && <div className="text-[12px] text-ink-3">No QA or legal audit has run yet.</div>}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
