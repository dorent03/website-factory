import { useAgents } from '../lib/events.ts';

export function SimulationBanner() {
  const sim = useAgents().filter((a) => a.simulatedFailure);
  if (!sim.length) return null;
  return (
    <div role="status" className="sticky top-0 z-20 border-b border-warn/30 bg-warn/10 px-6 py-1.5 text-[12px] text-warn">
      Diagnostics: {sim.map((a) => (a.agent === 'claude' ? 'Claude Code' : 'Codex')).join(' and ')} simulated as unavailable. Turn off in Settings → Diagnostics.
    </div>
  );
}
