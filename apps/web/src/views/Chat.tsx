import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, post } from '../lib/api.ts';
import { Button, ErrorNote, Textarea, cx, fmtTime } from '../components/ui.tsx';
import type { Annotation } from './Preview.tsx';

export function ChatPanel({ websiteId, annotations, setAnnotations, disabled }: { websiteId: string; annotations: Annotation[]; setAnnotations: (a: Annotation[]) => void; disabled?: string }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const [agent, setAgent] = useState<'auto' | 'claude' | 'codex'>('auto');
  const [route, setRoute] = useState<any>(null);
  const history = useQuery({ queryKey: ['chat', websiteId], queryFn: () => api(`/websites/${websiteId}/chat`), refetchInterval: 5000 });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [history.data?.messages?.length]);
  useEffect(() => {
    if (msg.trim().length < 3) { setRoute(null); return; }
    const t = setTimeout(() => post(`/websites/${websiteId}/chat/route`, { message: msg }).then((r) => setRoute(r.route)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [msg]);
  const send = useMutation({
    mutationFn: () => post(`/websites/${websiteId}/chat`, { message: msg, agent, annotations }),
    onSuccess: () => { setMsg(''); setAnnotations([]); qc.invalidateQueries({ queryKey: ['chat', websiteId] }); },
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {(history.data?.messages ?? []).map((m: any) => (
          <div key={m.id} className={cx('rounded-lg px-2.5 py-2 text-[12.5px]', m.role === 'user' ? 'ml-6 bg-accent-soft' : 'mr-4 border hair bg-surface')}>
            <div className="mb-0.5 flex justify-between text-[10.5px] text-ink-3"><span>{m.role === 'user' ? `You · ${m.agent.toUpperCase()}` : m.agent}</span><span>{fmtTime(m.createdAt)}</span></div>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.annotations?.length > 0 && <div className="mt-1 text-[11px] text-ink-3">{m.annotations.length} element annotation(s)</div>}
            {m.jobId && <Link className="text-[11px] text-accent" to={`/jobs/${m.jobId}`}>job →</Link>}
          </div>
        ))}
        {!history.data?.messages?.length && <div className="text-[12px] text-ink-3">Ask for a change, e.g. “Make the hero more premium”, “Fix mobile overflow”, “Add a PV page”, “Remove Google Maps”. Every change runs in an isolated worktree, creates a version and triggers legal impact analysis.</div>}
        <div ref={end} />
      </div>
      <div className="border-t hair p-3">
        {annotations.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {annotations.map((a, i) => (
              <div key={i} className="rounded-md border hair bg-sunken/60 p-1.5 text-[11.5px]">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-ink-2" title={a.selector}>{a.page} · {a.selector}</span><button aria-label="Remove annotation" onClick={() => setAnnotations(annotations.filter((_, j) => j !== i))}><X size={12} /></button></div>
                <input className="mt-1 h-6 w-full rounded border border-line-strong bg-surface px-1.5" placeholder='Instruction for this element, e.g. "20% shorter"' value={a.note} onChange={(e) => setAnnotations(annotations.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              </div>
            ))}
          </div>
        )}
        <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={disabled ?? 'Describe the change…'} disabled={!!disabled} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && msg.trim()) send.mutate(); }} />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Agent">
            {(['auto', 'claude', 'codex'] as const).map((a) => <button key={a} role="radio" aria-checked={agent === a} onClick={() => setAgent(a)} className={cx('h-6 rounded px-2 text-[11.5px] uppercase', agent === a ? 'bg-surface font-semibold shadow-[0_0_0_1px_var(--wf-line)]' : 'text-ink-3')}>{a}</button>)}
          </div>
          <div className="min-w-0 flex-1 truncate text-[11px] text-ink-3" title={route?.reason}>{agent === 'auto' && route ? `→ ${route.agents}` : agent !== 'auto' ? `→ ${agent} only` : ''}</div>
          <Button variant="primary" size="sm" disabled={!msg.trim() || !!disabled} busy={send.isPending} onClick={() => send.mutate()}>Send ⌘↵</Button>
        </div>
        <ErrorNote error={send.error} />
      </div>
    </div>
  );
}
