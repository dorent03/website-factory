import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Empty, PageHeader, Panel } from '../components/ui.tsx';
import { QAReportView } from '../views/Reports.tsx';

export function QAOverview() {
  const sites = useQuery({ queryKey: ['websites'], queryFn: () => api('/websites') });
  const list = sites.data?.websites ?? [];
  const details = useQueries({ queries: list.map((w: any) => ({ queryKey: ['website', w.id], queryFn: () => api(`/websites/${w.id}`) })) });
  const rows = details.map((d) => d.data).filter(Boolean);
  return (
    <div className="fade-in">
      <PageHeader title="QA" subtitle="Measured in a real browser: responsive (8 widths), axe WCAG 2.2 AA, SEO, Lighthouse, security, links, console, forms." />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
        {rows.length ? rows.map((d: any) => <Panel key={d.website.id} title={<Link className="hover:text-ink" to={`/websites/${d.website.id}?tab=qa`}>{d.customer.companyName} · {d.website.name}</Link>}><QAReportView qa={d.qa} /></Panel>) : <Empty title="No websites yet" />}
      </div>
    </div>
  );
}
