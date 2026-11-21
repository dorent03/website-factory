import { z } from 'zod';

/** Result of one automated or manual check. Never a percentage. */
export const CheckStatus = z.enum(['PASS', 'WARNING', 'FAIL', 'MANUAL_REVIEW', 'NOT_APPLICABLE', 'NOT_RUN']);
export type CheckStatus = z.infer<typeof CheckStatus>;

/** Provenance status of a researched fact. */
export const FactStatus = z.enum(['VERIFIED', 'LIKELY', 'UNVERIFIED', 'CONFLICT']);
export type FactStatus = z.infer<typeof FactStatus>;

export const Severity = z.enum(['critical', 'major', 'minor', 'info']);
export type Severity = z.infer<typeof Severity>;

const rank: Record<CheckStatus, number> = { FAIL: 5, MANUAL_REVIEW: 4, WARNING: 3, PASS: 1, NOT_APPLICABLE: 0, NOT_RUN: 2 };

/** Worst status wins. NOT_RUN outranks PASS so an unrun check can never look green. */
export function worstStatus(list: CheckStatus[]): CheckStatus {
  if (list.length === 0) return 'NOT_RUN';
  return list.reduce((a, b) => (rank[b] > rank[a] ? b : a));
}
