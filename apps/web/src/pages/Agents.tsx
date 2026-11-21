import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, type AgentHealth } from '@wf/shared';
import { api, post, put } from '../lib/api.ts';
import { setAgents, useAgents } from '../lib/events.ts';
import { Button, ErrorNote, PageHeader, Panel, Select, Table, fmtDuration, fmtTime } from '../components/ui.tsx';
import { Dot, LeaderRow, Status } from '../components/status.tsx';
import { Link } from 'react-router-dom';

const MODE_LABEL = { hybrid: 'Hybrid — Claude + Codex', 'claude-only': 'Claude only', 'codex-only': 'Codex only' } as const;

export function AgentCard({ a, onTest, busy }: { a?: AgentHealth; onTest?: () => void; busy?: boolean }) {
  if (!a) return <div className="panel h-[132px] animate-pulse" />;
  const name = a.agent === 'claude' ? 'Claude Code' : a.agent === 'codex' ? 'Codex' : 'Ollama';
  const state = a.optional ? (a.installed ? 'Installed · optional' : 'Optional') : a.available ? 'Connected' : a.simulatedFailure ? 'Simulated unavailable' : a.installed ? 'Unavailable' : 'Not installed';
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Dot on={a.available && !a.optional} warn={a.installed && !a.available && !a.optional} />{name}</div>
        {onTest && !a.optional && <Button size="sm" onClick={onTest} busy={busy}>Test connection</Button>}
      </div>
      <div className="mt-2 text-[12px] text-ink-2">{state}</div>
      <div className="mt-2 space-y-0.5 text-[12px]">
        <LeaderRow label="Version"><span className="font-mono text-ink-2">{a.version || '—'}</span></LeaderRow>
        <LeaderRow label="Authenticated"><span className="font-mono text-ink-2">{a.authenticated}</span></LeaderRow>
        <LeaderRow label="Last check"><span className="text-ink-2">{fmtTime(a.lastCheck)}</span></LeaderRow>
      </div>
      {a.message && a.message !== 'Ready' && <div className="mt-2 text-[11.5px] text-ink-3">{a.message}</div>}
    </div>
  );
}

export function Agents() {
  const qc = useQueryClient();
  const agents = useAgents();
  const [testing, setTesting] = useState<string | null>(null);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api('/tasks') });
  const save = useMutation({ mutationFn: (patch: object) => put('/settings', patch), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) });
  const test = async (agent?: string) => {
    setTesting(agent ?? 'all');
    try { const r = await post('/agents/check', agent ? { agent } : {}); setAgents(r.agents); } finally { setTesting(null); }
  };
  const s = settings.data;
  return (
    <div className="fade-in">
      <PageHeader title="AI Agents" subtitle="Local CLIs used as cooperating agents. Credentials stay with the CLIs and are never read by the Factory." actions={<Button onClick={() => test()} busy={testing === 'all'}>Test all</Button>} />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(['claude', 'codex', 'ollama'] as const).map((id) => <AgentCard key={id} a={agents.find((x) => x.agent === id)} onTest={() => test(id)} busy={testing === id} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <Panel title="Generation mode">
            <div className="space-y-1.5">
              {(Object.keys(MODE_LABEL) as Array<keyof typeof MODE_LABEL>).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sunken">
                  <input type="radio" name="mode" checked={s?.generationMode === m} onChange={() => save.mutate({ generationMode: m })} className="accent-[var(--wf-accent)]" />
                  <span className="text-[13px]">{MODE_LABEL[m]}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-ink-3">Hybrid routes each role to its assigned agent and falls back to the other one only when the assigned agent is unavailable — always marked as “Fallback Agent Used”. Single-agent modes never switch providers.</p>
            <ErrorNote error={save.error} />
          </Panel>
          <Panel title="Role assignment (Hybrid)" pad={false}>
            <div className="grid grid-cols-1 gap-x-6 px-3 py-2 sm:grid-cols-2">
              {ROLES.map((r) => (
                <div key={r} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-[12.5px] capitalize">{r.replace(/-/g, ' ')}</span>
                  <Select className="w-28" value={s?.roleMap?.[r] ?? ''} onChange={(e) => save.mutate({ roleMap: { ...s.roleMap, [r]: e.target.value } })}>
                    <option value="claude">Claude</option>
                    <option value="codex">Codex</option>
                  </Select>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <Panel title="Recent agent tasks" pad={false}>
          <Table head={['Task', 'Agent', 'Role', 'Status', 'Duration', 'Started']}>
            {(tasks.data?.tasks ?? []).slice(0, 40).map((t: any) => (
              <tr key={t.id}>
                <td className="max-w-[420px]"><div className="truncate">{t.objective}</div>{t.error && <div className="truncate text-[11.5px] text-fail">{t.errorKind}: {t.error}</div>}</td>
                <td className="whitespace-nowrap">{t.agent}{t.fallbackUsed && <span className="ml-1.5 rounded bg-warn/10 px-1 text-[10.5px] font-semibold text-warn">FALLBACK AGENT USED</span>}</td>
                <td className="whitespace-nowrap text-ink-2">{t.role}</td>
                <td><Status value={t.status} /></td>
                <td className="whitespace-nowrap font-mono text-ink-2">{fmtDuration(t.durationMs)}</td>
                <td className="whitespace-nowrap text-ink-3">{t.jobId ? <Link className="hover:text-ink" to={`/jobs/${t.jobId}`}>{fmtTime(t.createdAt)}</Link> : fmtTime(t.createdAt)}</td>
              </tr>
            ))}
          </Table>
          {!tasks.data?.tasks?.length && <div className="px-3 py-4 text-[12px] text-ink-3">No agent tasks yet.</div>}
        </Panel>
      </div>
    </div>
  );
}
