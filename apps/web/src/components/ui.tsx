import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean; icon?: ReactNode }>(
  ({ variant = 'secondary', size = 'md', busy, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background,box-shadow,color] duration-150 disabled:opacity-45 disabled:cursor-not-allowed select-none',
        size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]',
        variant === 'secondary' && 'bg-surface text-ink border border-line-strong hover:bg-sunken',
        variant === 'ghost' && 'text-ink-2 hover:text-ink hover:bg-sunken',
        variant === 'danger' && 'bg-surface text-fail border border-line-strong hover:bg-sunken',
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : icon}
      {children}
    </button>
  ),
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input ref={ref} className={cx('h-7 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft', className)} {...rest} />
));

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...rest }, ref) => (
  <textarea ref={ref} className={cx('w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft', className)} {...rest} />
));

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...rest }, ref) => (
  <select ref={ref} className={cx('h-7 w-full rounded-md border border-line-strong bg-surface px-1.5 text-[13px] text-ink focus:border-accent focus:outline-none', className)} {...rest}>{children}</select>
));

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1', className)}>
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function Panel({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('panel', className)}>
      {(title || actions) && (
        <header className="flex h-9 items-center justify-between gap-3 border-b hair px-3">
          <div className="label">{title}</div>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={pad ? 'p-3' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between gap-4 border-b hair bg-canvas/85 px-6 py-2 backdrop-blur-md">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
        {subtitle && <div className="truncate text-[12px] text-ink-3">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong px-5 py-6">
      <div className="text-[13px] font-medium">{title}</div>
      {children && <div className="max-w-prose text-[12px] text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

export function Dialog({ open, onOpenChange, title, children, width = 520 }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; width?: number }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/25 fade-in" />
        <RDialog.Content style={{ width }} className="fixed left-1/2 top-[12vh] z-50 max-h-[76vh] max-w-[92vw] -translate-x-1/2 overflow-auto rounded-xl border border-line-strong bg-raised shadow-[var(--wf-shadow)] fade-in">
          <div className="flex h-10 items-center justify-between border-b hair px-4">
            <RDialog.Title className="text-[13px] font-semibold">{title}</RDialog.Title>
            <RDialog.Close className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close"><X size={14} /></RDialog.Close>
          </div>
          <RDialog.Description className="sr-only">{title}</RDialog.Description>
          <div className="p-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-sunken px-1 font-mono text-[10px] text-ink-3">{children}</kbd>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px]', className)}>{children}</span>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-md border border-fail/30 bg-fail/5 px-2.5 py-1.5 text-[12px] text-fail">{(error as Error).message ?? String(error)}</div>;
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b hair">{head.map((h, i) => <th key={i} className="label whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDuration(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
