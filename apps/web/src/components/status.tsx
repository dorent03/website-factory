import type { ReactNode } from 'react';
import { cx } from './ui.tsx';

type Tone = 'pass' | 'warn' | 'fail' | 'manual' | 'idle' | 'run' | 'accent';

const MAP: Record<string, { tone: Tone; label: string }> = {
  PASS: { tone: 'pass', label: 'PASS' }, WARNING: { tone: 'warn', label: 'WARNING' }, FAIL: { tone: 'fail', label: 'FAIL' },
  MANUAL_REVIEW: { tone: 'manual', label: 'MANUAL REVIEW' }, NOT_APPLICABLE: { tone: 'idle', label: 'N/A' }, NOT_RUN: { tone: 'idle', label: 'NOT RUN' },
  VERIFIED: { tone: 'pass', label: 'VERIFIED' }, LIKELY: { tone: 'accent', label: 'LIKELY' }, UNVERIFIED: { tone: 'warn', label: 'UNVERIFIED' }, CONFLICT: { tone: 'fail', label: 'CONFLICT' },
  pass: { tone: 'pass', label: 'PASS' }, warning: { tone: 'warn', label: 'WARNING' }, fail: { tone: 'fail', label: 'FAIL' }, skipped: { tone: 'idle', label: 'SKIPPED' },
  waiting: { tone: 'idle', label: 'WAITING' }, running: { tone: 'run', label: 'RUNNING' }, 'manual-review': { tone: 'manual', label: 'MANUAL REVIEW' },
  'waiting-for-agent': { tone: 'warn', label: 'WAITING FOR AGENT' }, waiting_for_agent: { tone: 'warn', label: 'WAITING FOR AGENT' },
  complete: { tone: 'pass', label: 'COMPLETE' }, failed: { tone: 'fail', label: 'FAILED' }, cancelled: { tone: 'idle', label: 'CANCELLED' }, queued: { tone: 'idle', label: 'QUEUED' },
  BLOCKED: { tone: 'fail', label: 'BLOCKED' }, READY_FOR_HUMAN_REVIEW: { tone: 'manual', label: 'READY FOR HUMAN REVIEW' }, READY_FOR_PRODUCTION: { tone: 'pass', label: 'READY FOR PRODUCTION' },
  NOT_EVALUATED: { tone: 'idle', label: 'NOT EVALUATED' },
  TECHNICAL_COMPLIANCE_CHECK_PASSED: { tone: 'pass', label: 'TECHNICAL COMPLIANCE CHECK PASSED' }, TECHNICAL_COMPLIANCE_CHECK_FAILED: { tone: 'fail', label: 'TECHNICAL COMPLIANCE CHECK FAILED' },
  MANUAL_REVIEW_REQUIRED: { tone: 'manual', label: 'MANUAL REVIEW REQUIRED' }, APPROVE: { tone: 'pass', label: 'APPROVE' }, CHANGES_REQUESTED: { tone: 'warn', label: 'CHANGES REQUESTED' },
};

const TONE: Record<Tone, string> = {
  pass: 'text-pass', warn: 'text-warn', fail: 'text-fail', manual: 'text-manual', idle: 'text-ink-3', run: 'text-accent', accent: 'text-accent',
};

/** Phases of running work are not "done"; anything not mapped renders neutral rather than green. */
export function toneOf(status: string): Tone {
  return MAP[status]?.tone ?? (/^(active|in-progress|researching|planning|designing|generating|implementing|rendering|visual-review|technical-review|.*-qa|privacy-audit|legal-audit|fixing)$/.test(status) ? 'run' : 'idle');
}

export function Status({ value, className }: { value: string | null | undefined; className?: string }) {
  const v = value ?? 'NOT_RUN';
  const m = MAP[v] ?? { tone: toneOf(v), label: v.replace(/[-_]/g, ' ').toUpperCase() };
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-semibold tracking-wide', TONE[m.tone], className)}>
      <span className={cx('size-1.5 rounded-full bg-current', m.tone === 'run' && 'pulse')} />
      {m.label}
    </span>
  );
}

export function Dot({ on, warn }: { on: boolean; warn?: boolean }) {
  return <span className={cx('inline-block size-2 rounded-full', on ? 'bg-pass' : warn ? 'bg-warn' : 'bg-ink-3/50')} />;
}

/** "Impressum ........ PASS" row. */
export function LeaderRow({ label, children, sub }: { label: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="py-1">
      <div className="flex min-w-0 items-baseline text-[12.5px]">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="leader" />
        <span className="shrink-0">{children}</span>
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  );
}
