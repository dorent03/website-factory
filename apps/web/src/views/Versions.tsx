import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from '../lib/api.ts';
import { Button, ErrorNote, Select, fmtTime } from '../components/ui.tsx';
import { Status } from '../components/status.tsx';

export function VersionsView({ data }: { data: any }) {
  const qc = useQueryClient();
  const versions = data.versions ?? [];
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const diff = useQuery({ queryKey: ['diff', a, b], queryFn: () => api(`/websites/${data.website.id}/diff?from=${a}&to=${b}`), enabled: !!a && !!b && a !== b });
  const restore = useMutation({ mutationFn: (v: string) => post(`/websites/${data.website.id}/versions/${v}/restore`), onSuccess: () => qc.invalidateQueries({ queryKey: ['website', data.website.id] }) });
  const preview = (dir: string) => data.previewBase.replace('/current/', `/versions/${dir}/`);
  if (!versions.length) return <div className="text-[12px] text-ink-3">No versions yet. Every meaningful change (agent or Factory) creates one.</div>;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {versions.map((v: any) => (
          <div key={v.id} className="rounded-md border hair px-2 py-1.5 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-medium">{v.dirName}{v.dirName === data.website.currentVersion && <span className="ml-1.5 text-[10.5px] text-accent">CURRENT</span>}</span>
              <span className="text-ink-3">{fmtTime(v.createdAt)}</span>
            </div>
            <div className="text-ink-2">{v.agent} · {v.provider}{v.model ? ` · ${v.model}` : ''} · {v.filesChanged.length} files</div>
            {v.impact?.requiresReaudit && <div className="text-[11.5px] text-warn">{v.impact.summary}</div>}
            <div className="mt-1 flex items-center gap-2"><Status value={v.qaState} /><Status value={v.legalState} />
              <a className="text-accent" href={`${preview(v.dirName)}index.html`} target="_blank" rel="noreferrer">Preview</a>
              {v.dirName !== data.website.currentVersion && <button className="text-ink-2 hover:text-ink" onClick={() => { if (confirm(`Restore ${v.dirName}? This creates a new version with that content.`)) restore.mutate(v.id); }}>Restore</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md border hair p-2">
        <div className="label mb-1.5">Compare</div>
        <div className="flex gap-2"><Select value={a} onChange={(e) => setA(e.target.value)}><option value="">from…</option>{versions.map((v: any) => <option key={v.id} value={v.id}>{v.dirName}</option>)}</Select><Select value={b} onChange={(e) => setB(e.target.value)}><option value="">to…</option>{versions.map((v: any) => <option key={v.id} value={v.id}>{v.dirName}</option>)}</Select></div>
        {diff.data && (
          <div className="mt-2">
            <div className="mb-1 text-[11.5px] text-ink-2">{diff.data.files.length} files changed: {diff.data.files.slice(0, 12).map((f: any) => `${f.status} ${f.path}`).join(', ')}</div>
            <pre className="max-h-80 overflow-auto rounded bg-sunken p-2 font-mono text-[10.5px] leading-snug">{diff.data.patch.split('\n').slice(0, 1200).map((l: string, i: number) => <div key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'text-pass' : l.startsWith('-') && !l.startsWith('---') ? 'text-fail' : ''}>{l}</div>)}</pre>
          </div>
        )}
      </div>
      <ErrorNote error={restore.error || diff.error} />
      {restore.data && <Button size="sm" onClick={() => restore.reset()}>Restored as {restore.data.version.dirName}</Button>}
    </div>
  );
}

export function DesignSystemView({ ds }: { ds: any }) {
  if (!ds) return <div className="text-[12px] text-ink-3">No design system yet — it is created from the selected concept.</div>;
  return (
    <div className="space-y-3 text-[12px]">
      <div className="font-medium">{ds.name}</div>
      <div className="grid grid-cols-2 gap-1.5">{ds.colors.map((c: any) => <div key={c.token} className="flex items-center gap-2"><span className="size-6 rounded border hair" style={{ background: c.value }} /><div><div className="font-mono text-[11px]">--{c.token}</div><div className="text-[10.5px] text-ink-3">{c.value} · {c.role}</div></div></div>)}</div>
      <div><div className="label mb-1">Typography</div><div>{ds.typography.display.family} ({ds.typography.display.source}) / {ds.typography.body.family} ({ds.typography.body.source}) · measure {ds.typography.measure}</div>{ds.typography.scale.map((t: any) => <div key={t.token} className="font-mono text-[11px] text-ink-2">{t.token}: {t.size} / {t.lineHeight} / {t.weight}</div>)}</div>
      <div><div className="label mb-1">Spacing · radius · motion</div><div className="font-mono text-[11px] text-ink-2">{ds.spacing.map((s: any) => `${s.token} ${s.value}`).join(' · ')}</div><div className="font-mono text-[11px] text-ink-2">{ds.radius.map((s: any) => `${s.token} ${s.value}`).join(' · ')}</div><div className="font-mono text-[11px] text-ink-2">{ds.motion.durationFast} / {ds.motion.durationBase} · {ds.motion.easing}</div></div>
      <div className="text-ink-2"><span className="text-ink-3">Buttons</span> {ds.buttons}</div>
      <div className="text-ink-2"><span className="text-ink-3">Navigation</span> {ds.navigation}</div>
      <div className="text-ink-2"><span className="text-ink-3">Imagery</span> {ds.imageStyle}</div>
    </div>
  );
}
