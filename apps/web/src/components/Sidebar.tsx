import { NavLink } from 'react-router-dom';
import { Activity, Boxes, Building2, FileSearch, Gauge, Globe2, ImageIcon, Palette, Scale, Settings, ShieldCheck, Sparkles, Bot } from 'lucide-react';
import { useAgents } from '../lib/events.ts';
import { Kbd, cx } from './ui.tsx';
import { Dot } from './status.tsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/customers', label: 'Customers', icon: Building2 },
  { to: '/websites', label: 'Websites', icon: Globe2 },
  { to: '/research', label: 'Research', icon: FileSearch },
  { to: '/generate', label: 'Generate', icon: Sparkles },
  { to: '/agents', label: 'AI Agents', icon: Bot },
  { to: '/jobs', label: 'Jobs', icon: Activity },
  { to: '/design-systems', label: 'Design Systems', icon: Palette },
  { to: '/assets', label: 'Assets', icon: ImageIcon },
  { to: '/qa', label: 'QA', icon: ShieldCheck },
  { to: '/legal', label: 'Legal & Privacy', icon: Scale },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const agents = useAgents();
  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-r hair bg-sunken/60">
      <div className="flex h-12 items-center gap-2 px-4">
        <div className="grid size-6 place-items-center rounded-md bg-ink text-canvas"><Boxes size={13} strokeWidth={2.2} /></div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Website Factory</div>
          <div className="text-[10.5px] text-ink-3">Claude Code + Codex</div>
        </div>
      </div>
      <nav className="flex-1 space-y-px px-2 py-1" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx(
            'flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-100',
            isActive ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--wf-line)]' : 'text-ink-2 hover:bg-surface/60 hover:text-ink',
          )}>
            <Icon size={14} strokeWidth={1.8} className="shrink-0 opacity-80" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t hair px-4 py-3">
        <div className="label mb-1.5">Agents</div>
        {(['claude', 'codex'] as const).map((id) => {
          const a = agents.find((x) => x.agent === id);
          return (
            <NavLink to="/agents" key={id} className="flex items-center justify-between text-[12px] text-ink-2 hover:text-ink">
              <span className="flex items-center gap-2"><Dot on={!!a?.available} warn={!!a?.installed && !a?.available} />{id === 'claude' ? 'Claude Code' : 'Codex'}</span>
              <span className="text-[11px] text-ink-3">{a ? (a.available ? 'Ready' : a.simulatedFailure ? 'Simulated' : 'Offline') : '…'}</span>
            </NavLink>
          );
        })}
        <button onClick={() => window.dispatchEvent(new CustomEvent('wf-palette'))} className="mt-2 flex w-full items-center justify-between rounded-md border border-line-strong bg-surface px-2 py-1 text-[12px] text-ink-3 hover:text-ink">
          Commands <span className="flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>
      </div>
    </aside>
  );
}
