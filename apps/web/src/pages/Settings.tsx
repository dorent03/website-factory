import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, put } from '../lib/api.ts';
import { applyTheme, currentTheme, type Theme } from '../lib/theme.ts';
import { setAgents } from '../lib/events.ts';
import { ErrorNote, Field, Input, PageHeader, Panel } from '../components/ui.tsx';

export function Settings() {
  const qc = useQueryClient();
  const [theme, setTheme] = useState<Theme>(currentTheme());
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const system = useQuery({ queryKey: ['system'], queryFn: () => api('/system') });
  const save = useMutation({
    mutationFn: (patch: object) => put('/settings', patch),
    onSuccess: async () => { qc.invalidateQueries({ queryKey: ['settings'] }); const r = await api('/agents'); setAgents(r.agents); },
  });
  const s = settings.data;
  return (
    <div className="fade-in">
      <PageHeader title="Settings" />
      <div className="grid max-w-5xl grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <Panel title="Appearance">
          <div className="flex gap-1 rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => { applyTheme(t); setTheme(t); }} className={`h-7 flex-1 rounded-md text-[12.5px] capitalize ${theme === t ? 'bg-surface font-medium shadow-[0_0_0_1px_var(--wf-line)]' : 'text-ink-2'}`}>{t}</button>
            ))}
          </div>
        </Panel>
        <Panel title="Storage">
          <div className="space-y-1 text-[12.5px]">
            <div><span className="text-ink-3">Websites:</span> <span className="font-mono">{system.data?.sitesRoot}</span></div>
            <div><span className="text-ink-3">Factory:</span> <span className="font-mono">{system.data?.factoryRoot}</span></div>
            <div><span className="text-ink-3">Preview origin:</span> <span className="font-mono">{system.data?.previewOrigin}</span></div>
          </div>
        </Panel>
        <Panel title="Speed">
          {s && (
            <div className="space-y-2">
              <div className="flex gap-1 rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label="Speed profile">
                {([['fast', 'Fast'], ['balanced', 'Balanced'], ['thorough', 'Thorough']] as const).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={s.speedProfile === v} onClick={() => save.mutate({ speedProfile: v })} className={`h-7 flex-1 rounded-md text-[12.5px] ${s.speedProfile === v ? 'bg-surface font-medium shadow-[0_0_0_1px_var(--wf-line)]' : 'text-ink-2'}`}>{l}</button>
                ))}
              </div>
              <p className="text-[11.5px] text-ink-3">{s.speedProfile === 'fast' ? 'Medium reasoning effort, 1 Claude↔Codex review round, Lighthouse on the homepage, compact prompts.' : s.speedProfile === 'balanced' ? 'High reasoning effort, up to 2 review rounds, Lighthouse on 2 pages.' : 'CLI default effort, all configured review rounds, Lighthouse on 3 pages, full skill context.'} QA, privacy and legal checks are identical in every profile.</p>
              <label className="flex items-center justify-between pt-1 text-[13px]"><span>Auto-advance (brief → concepts, concept → build)</span><input type="checkbox" checked={s.autoAdvance} onChange={(e) => save.mutate({ autoAdvance: e.target.checked })} className="size-4 accent-[var(--wf-accent)]" /></label>
            </div>
          )}
        </Panel>
        <Panel title="Agent execution">
          {s && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Claude model" hint="Empty = CLI default"><Input defaultValue={s.models.claude} onBlur={(e) => save.mutate({ models: { ...s.models, claude: e.target.value.trim() } })} /></Field>
              <Field label="Codex model" hint="Empty = ~/.codex/config.toml"><Input defaultValue={s.models.codex} onBlur={(e) => save.mutate({ models: { ...s.models, codex: e.target.value.trim() } })} /></Field>
              <Field label="Task timeout (minutes)"><Input type="number" min={2} max={90} defaultValue={s.taskTimeoutMinutes} onBlur={(e) => save.mutate({ taskTimeoutMinutes: Number(e.target.value) })} /></Field>
              <Field label="Max review rounds" hint="Used by Thorough; Fast = 1, Balanced ≤ 2"><Input type="number" min={1} max={5} defaultValue={s.maxReviewRounds} onBlur={(e) => save.mutate({ maxReviewRounds: Number(e.target.value) })} /></Field>
            </div>
          )}
          <ErrorNote error={save.error} />
        </Panel>
        <Panel title="Diagnostics">
          <p className="mb-2 text-[12px] text-ink-2">Simulate an agent outage to exercise the fallback path. The real CLI is not called while simulated; a banner is shown everywhere.</p>
          {s && (['claude', 'codex'] as const).map((a) => (
            <label key={a} className="flex items-center justify-between py-1 text-[13px]">
              <span>Simulate {a === 'claude' ? 'Claude Code' : 'Codex'} unavailable</span>
              <input type="checkbox" checked={!!s.simulateUnavailable[a]} onChange={(e) => save.mutate({ simulateUnavailable: { ...s.simulateUnavailable, [a]: e.target.checked } })} className="size-4 accent-[var(--wf-accent)]" />
            </label>
          ))}
        </Panel>
      </div>
    </div>
  );
}
