import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SITE_TYPE_LABELS } from '@wf/shared';
import { api } from '../lib/api.ts';
import { Button, Empty, PageHeader, Panel, Table, fmtTime } from '../components/ui.tsx';
import { Status } from '../components/status.tsx';

export function Websites() {
  const q = useQuery({ queryKey: ['websites'], queryFn: () => api('/websites') });
  const list = q.data?.websites ?? [];
  return (
    <div className="fade-in">
      <PageHeader title="Websites" subtitle="Every website lives in sites/<customer>/sites/<website>/" actions={<Link to="/generate"><Button variant="primary">New website</Button></Link>} />
      <div className="p-6">
        {q.data && !list.length ? <Empty title="No websites yet" action={<Link to="/generate"><Button variant="primary">New website</Button></Link>} /> : (
          <Panel pad={false}>
            <Table head={['Website', 'Customer', 'Type', 'Production gate', 'Version', 'Updated']}>
              {list.map((w: any) => (
                <tr key={w.id} className="hover:bg-sunken/50">
                  <td><Link className="font-medium hover:text-accent" to={`/websites/${w.id}`}>{w.name}</Link>{w.staleness?.stale && <div className="text-[11px] text-warn">compliance state invalidated</div>}</td>
                  <td><Link className="text-ink-2 hover:text-ink" to={`/customers/${w.customerId}`}>{w.customerName}</Link></td>
                  <td className="text-ink-2">{(SITE_TYPE_LABELS as any)[w.siteType] ?? w.siteType}</td>
                  <td><Status value={w.gate?.state ?? 'NOT_EVALUATED'} /></td>
                  <td className="font-mono text-[12px] text-ink-2">{w.currentVersion ?? '—'}</td>
                  <td className="text-ink-3">{fmtTime(w.updatedAt)}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        )}
      </div>
    </div>
  );
}
