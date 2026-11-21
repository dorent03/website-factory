import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Empty, PageHeader, Panel } from '../components/ui.tsx';
import { DesignSystemView } from '../views/Versions.tsx';

export function DesignSystems() {
  const sites = useQuery({ queryKey: ['websites'], queryFn: () => api('/websites') });
  const list = sites.data?.websites ?? [];
  const details = useQueries({ queries: list.map((w: any) => ({ queryKey: ['website', w.id], queryFn: () => api(`/websites/${w.id}`) })) });
  const withDs = details.map((d) => d.data).filter((d: any) => d?.designSystem);
  return (
    <div className="fade-in">
      <PageHeader title="Design systems" subtitle="Semantic tokens per website, with automatic WCAG contrast checks." />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
        {withDs.length ? withDs.map((d: any) => (
          <Panel key={d.website.id} title={<Link className="hover:text-ink" to={`/websites/${d.website.id}?tab=design`}>{d.customer.companyName} · {d.website.name}</Link>}><DesignSystemView ds={d.designSystem} /></Panel>
        )) : <Empty title="No design systems yet">A design system is created when you select a concept and build a website.</Empty>}
      </div>
    </div>
  );
}
