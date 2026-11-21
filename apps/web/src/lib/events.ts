import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { AgentHealth, ServerEvent } from '@wf/shared';

type Listener = (e: ServerEvent) => void;
const listeners = new Set<Listener>();
let agents: AgentHealth[] = [];
const agentListeners = new Set<(a: AgentHealth[]) => void>();

/** One SSE connection for the whole app; events invalidate the matching queries. */
export function connectEvents(qc: QueryClient): () => void {
  let es: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const open = () => {
    es = new EventSource('/api/events');
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as ServerEvent;
      if (e.type === 'agents') { agents = e.agents; agentListeners.forEach((l) => l(agents)); }
      if (e.type === 'job') { qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['job', e.job.id] }); }
      if (e.type === 'task') qc.invalidateQueries({ queryKey: ['tasks'] });
      if (e.type === 'website') { qc.invalidateQueries({ queryKey: ['website', e.websiteId] }); qc.invalidateQueries({ queryKey: ['websites'] }); }
      listeners.forEach((l) => l(e));
    };
    es.onerror = () => { es?.close(); retry = setTimeout(open, 2000); };
  };
  open();
  return () => { es?.close(); if (retry) clearTimeout(retry); };
}

export function useServerEvents(fn: Listener): void {
  useEffect(() => { listeners.add(fn); return () => { listeners.delete(fn); }; }, [fn]);
}

export function useAgents(): AgentHealth[] {
  const [a, setA] = useState(agents);
  useEffect(() => {
    agentListeners.add(setA);
    setA(agents);
    if (!agents.length) fetch('/api/agents').then((r) => r.json()).then((d) => { if (!agents.length) setAgents(d.agents); }).catch(() => {});
    return () => { agentListeners.delete(setA); };
  }, []);
  return a;
}

export function setAgents(a: AgentHealth[]): void {
  agents = a;
  agentListeners.forEach((l) => l(a));
}
