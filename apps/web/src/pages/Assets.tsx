import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, patch, post } from '../lib/api.ts';
import { Button, ErrorNote, Field, Input, PageHeader, Panel, Select, Table, fmtTime } from '../components/ui.tsx';

const CATS = ['customer', 'generated', 'licensed-stock', 'open-license', 'unknown'];

export function Assets() {
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => api('/assets') });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api('/customers') });
  const upd = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => patch(`/assets/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }) });
  const [up, setUp] = useState({ customerId: '', category: 'customer', source: '', license: '', alt: '' });
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      const buf = await file!.arrayBuffer();
      let bin = '';
      new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
      return post(`/customers/${up.customerId}/assets`, { filename: file!.name, dataBase64: btoa(bin), category: up.category, source: up.source, license: up.license, alt: up.alt });
    },
    onSuccess: () => { setFile(null); qc.invalidateQueries({ queryKey: ['assets'] }); },
  });
  const names = new Map<string, string>((customers.data?.customers ?? []).map((c: any) => [c.id, c.marketing.companyName]));
  return (
    <div className="fade-in">
      <PageHeader title="Assets" subtitle="Provenance for every image, graphic and font. Unknown origin = MANUAL REVIEW REQUIRED." />
      <div className="space-y-4 p-6">
        <Panel title="Add customer asset">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Field label="Customer"><Select value={up.customerId} onChange={(e) => setUp({ ...up, customerId: e.target.value })}><option value="">—</option>{(customers.data?.customers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.marketing.companyName}</option>)}</Select></Field>
            <Field label="File"><input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.avif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12px]" /></Field>
            <Field label="Category"><Select value={up.category} onChange={(e) => setUp({ ...up, category: e.target.value })}>{CATS.filter((c) => c !== 'generated').map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Source"><Input value={up.source} onChange={(e) => setUp({ ...up, source: e.target.value })} placeholder="who supplied it" /></Field>
            <Field label="License / usage"><Input value={up.license} onChange={(e) => setUp({ ...up, license: e.target.value })} /></Field>
            <Field label="Alt text"><Input value={up.alt} onChange={(e) => setUp({ ...up, alt: e.target.value })} /></Field>
          </div>
          <Button className="mt-3" variant="primary" disabled={!file || !up.customerId} busy={upload.isPending} onClick={() => upload.mutate()}>Upload</Button>
          <p className="mt-2 text-[11.5px] text-ink-3">Never present stock or generated people as actual employees.</p>
          <ErrorNote error={upload.error} />
        </Panel>
        <Panel title={`Assets · ${assets.data?.assets?.length ?? 0}`} pad={false}>
          <Table head={['File', 'Customer', 'Category', 'Source / license', 'Review', 'Added']}>
            {(assets.data?.assets ?? []).map((a: any) => (
              <tr key={a.id}>
                <td className="max-w-[280px] truncate font-mono text-[11.5px]" title={a.localPath}>{a.localPath}<div className="font-sans text-[11px] text-ink-3">{a.kind} · {a.purpose}</div></td>
                <td className="text-ink-2">{names.get(a.customerId) ?? '—'}</td>
                <td><Select className="w-36" value={a.category} onChange={(e) => upd.mutate({ id: a.id, body: { category: e.target.value } })}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></td>
                <td className="max-w-[260px] text-[12px] text-ink-2">{a.source}<div className="text-ink-3">{a.license}</div></td>
                <td><Select className="w-28" value={a.reviewStatus} onChange={(e) => upd.mutate({ id: a.id, body: { reviewStatus: e.target.value } })}>{['pending', 'approved', 'rejected', 'n/a'].map((c) => <option key={c}>{c}</option>)}</Select>{a.category === 'unknown' && <div className="text-[10.5px] font-semibold text-manual">MANUAL REVIEW</div>}</td>
                <td className="text-ink-3">{fmtTime(a.createdAt)}</td>
              </tr>
            ))}
          </Table>
          <ErrorNote error={upd.error} />
        </Panel>
      </div>
    </div>
  );
}
