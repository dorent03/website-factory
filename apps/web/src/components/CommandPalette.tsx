import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '../lib/api.ts';

type Cmd = { id: string; label: string; hint?: string; run: () => void | Promise<unknown> };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const nav = useNavigate();
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api('/customers'), enabled: open });
  const websites = useQuery({ queryKey: ['websites'], queryFn: () => api('/websites'), enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wf-palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('wf-palette', onOpen); };
  }, []);

  const go = (to: string) => () => nav(to);
  const job = (siteId: string, kind: string) => async () => { const r = await post(`/websites/${siteId}/jobs`, { kind }); nav(`/jobs/${r.job.id}`); };
  const global: Cmd[] = [
    { id: 'new-customer', label: 'New Customer', run: go('/customers/new') },
    { id: 'new-website', label: 'New Website', run: go('/generate') },
    { id: 'generate', label: 'Generate Website', run: go('/generate') },
    { id: 'agents', label: 'AI Agents', hint: 'Test connection', run: go('/agents') },
    { id: 'open-root', label: 'Open Folder', hint: 'sites/', run: () => post('/system/open', { what: 'folder' }) },
  ];
  const perCustomer: Cmd[] = (customers.data?.customers ?? []).flatMap((c: any) => [
    { id: `research-${c.id}`, label: 'Research Customer', hint: c.marketing.companyName, run: async () => { await post(`/customers/${c.id}/research`); nav(`/customers/${c.id}?tab=research`); } },
    { id: `open-${c.id}`, label: 'Open Customer', hint: c.marketing.companyName, run: go(`/customers/${c.id}`) },
  ]);
  const perSite: Cmd[] = (websites.data?.websites ?? []).flatMap((w: any) => {
    const h = `${w.customerName} · ${w.name}`;
    return [
      { id: `ws-${w.id}`, label: 'Open Workspace', hint: h, run: go(`/websites/${w.id}`) },
      { id: `cr-${w.id}`, label: 'Run Claude Review', hint: h, run: job(w.id, 'visual-review') },
      { id: `xr-${w.id}`, label: 'Run Codex Review', hint: h, run: job(w.id, 'technical-qa') },
      { id: `qa-${w.id}`, label: 'Run Full QA', hint: h, run: job(w.id, 'qa') },
      { id: `la-${w.id}`, label: 'Run Legal Audit', hint: h, run: job(w.id, 'legal') },
      { id: `pv-${w.id}`, label: 'Open Preview', hint: h, run: () => post('/system/open', { what: 'site', websiteId: w.id }) },
      { id: `ex-${w.id}`, label: 'Export ZIP', hint: h, run: () => { window.location.href = `/api/websites/${w.id}/export`; } },
      { id: `of-${w.id}`, label: 'Open Folder', hint: h, run: () => post('/system/open', { what: 'folder', websiteId: w.id }) },
    ];
  });

  const exec = async (c: Cmd) => {
    setMsg('');
    try { await c.run(); setOpen(false); } catch (e) { setMsg((e as Error).message); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/20 fade-in" onMouseDown={() => setOpen(false)}>
      <Command label="Command palette" onMouseDown={(e) => e.stopPropagation()} className="mx-auto mt-[14vh] w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-line-strong bg-raised shadow-[var(--wf-shadow)]">
        <Command.Input autoFocus placeholder="Type a command or search…" className="h-11 w-full border-b hair bg-transparent px-4 text-[14px] outline-none placeholder:text-ink-3" />
        {msg && <div className="border-b hair px-4 py-2 text-[12px] text-fail">{msg}</div>}
        <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[12px] text-ink-3">No matching command.</Command.Empty>
          {[['Factory', global], ['Customers', perCustomer], ['Websites', perSite]].map(([group, items]) => (items as Cmd[]).length > 0 && (
            <Command.Group key={group as string} heading={group as string} className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5">
              {(items as Cmd[]).map((c) => (
                <Command.Item key={c.id} value={`${c.label} ${c.hint ?? ''}`} onSelect={() => exec(c)} className="flex h-8 cursor-default items-center justify-between rounded-md px-2.5 text-[13px] data-[selected=true]:bg-accent-soft">
                  <span>{c.label}</span>{c.hint && <span className="truncate pl-4 text-[12px] text-ink-3">{c.hint}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
