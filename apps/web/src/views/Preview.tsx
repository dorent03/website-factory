import { useEffect, useRef, useState } from 'react';
import { MousePointerClick, Monitor, Smartphone, Tablet, RotateCw } from 'lucide-react';
import { cx, Select } from '../components/ui.tsx';

export interface Annotation { selector: string; html: string; text: string; page: string; note: string }
const DEVICES = { desktop: { w: 1440, icon: Monitor }, tablet: { w: 768, icon: Tablet }, mobile: { w: 390, icon: Smartphone } } as const;

/** Preview of the site on the isolated preview origin. Scaled to fit; optional element picker for visual editing. */
export function Preview({ base, pages, onPick, picking, setPicking, version }: { base: string; pages: Array<{ path: string; title: string }>; onPick: (a: Omit<Annotation, 'note'>) => void; picking: boolean; setPicking: (v: boolean) => void; version?: string | null }) {
  const [page, setPage] = useState(pages[0]?.path ?? 'index.html');
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop');
  const [nonce, setNonce] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const width = DEVICES[device].w;
  useEffect(() => { if (!pages.some((p) => p.path === page) && pages[0]) setPage(pages[0].path); }, [pages.map((p) => p.path).join()]);
  useEffect(() => {
    const ro = new ResizeObserver(() => { const w = wrap.current?.clientWidth ?? width; setScale(Math.min(1, (w - 24) / width)); });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [width]);
  useEffect(() => {
    const origin = new URL(base).origin;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      if (e.data?.type === 'wf-picked') onPick({ selector: e.data.selector, html: e.data.html, text: e.data.text, page: e.data.page.split('/').pop() || 'index.html' });
      if (e.data?.type === 'wf-picker-ready') frame.current?.contentWindow?.postMessage({ type: 'wf-picker', on: picking }, origin);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [base, picking, onPick]);
  useEffect(() => { frame.current?.contentWindow?.postMessage({ type: 'wf-picker', on: picking }, new URL(base).origin); }, [picking, base]);
  const src = `${base}${page}?wf-picker=1&v=${encodeURIComponent(version ?? '')}-${nonce}`;
  const height = 900;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b hair px-3">
        <Select aria-label="Page" className="w-52" value={page} onChange={(e) => setPage(e.target.value)}>{pages.map((p) => <option key={p.path} value={p.path}>{p.path} — {p.title.slice(0, 40)}</option>)}</Select>
        <div className="flex rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Device">
          {(Object.keys(DEVICES) as Array<keyof typeof DEVICES>).map((d) => { const Icon = DEVICES[d].icon; return (
            <button key={d} role="radio" aria-checked={device === d} aria-label={d} onClick={() => setDevice(d)} className={cx('grid h-6 w-8 place-items-center rounded', device === d ? 'bg-surface shadow-[0_0_0_1px_var(--wf-line)]' : 'text-ink-3 hover:text-ink')}><Icon size={13} /></button>
          ); })}
        </div>
        <span className="font-mono text-[11px] text-ink-3">{width}px · {Math.round(scale * 100)}%</span>
        <div className="flex-1" />
        <button onClick={() => setPicking(!picking)} aria-pressed={picking} className={cx('flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px]', picking ? 'bg-accent text-accent-ink' : 'border border-line-strong text-ink-2 hover:text-ink')}><MousePointerClick size={13} />{picking ? 'Click an element…' : 'Select element'}</button>
        <button onClick={() => setNonce((n) => n + 1)} aria-label="Reload preview" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"><RotateCw size={13} /></button>
        <a href={`${base}${page}`} target="_blank" rel="noreferrer" className="text-[12px] text-accent">Open ↗</a>
      </div>
      <div ref={wrap} className="min-h-0 flex-1 overflow-auto bg-sunken/70 p-3">
        <div style={{ width: width * scale, height: height * scale }} className="mx-auto overflow-hidden rounded-lg border border-line-strong bg-white shadow-[var(--wf-shadow)]">
          <iframe ref={frame} key={`${page}-${device}`} title="Website preview" src={src} style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        </div>
      </div>
    </div>
  );
}
