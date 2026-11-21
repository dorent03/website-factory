import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_ROLE_MAP, GenerationMode, Role } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { now } from './util.ts';

export const FactorySettings = z.object({
  generationMode: GenerationMode.default('hybrid'),
  roleMap: z.record(Role, z.enum(['claude', 'codex'])).default(DEFAULT_ROLE_MAP),
  models: z.object({ claude: z.string().max(80).default(''), codex: z.string().max(80).default('') }).default({ claude: '', codex: '' }),
  /** Diagnostics only: makes the adapter report the agent as unavailable so fallback can be exercised. */
  simulateUnavailable: z.object({ claude: z.boolean().default(false), codex: z.boolean().default(false) }).default({ claude: false, codex: false }),
  maxReviewRounds: z.number().int().min(1).max(5).default(2),
  taskTimeoutMinutes: z.number().int().min(2).max(90).default(25),
  claudeMaxBudgetUsd: z.number().min(0).max(100).default(0),
  /** Speed vs. depth: reasoning effort, review rounds, Lighthouse pages and prompt size. */
  speedProfile: z.enum(['fast', 'balanced', 'thorough']).default('fast'),
  /** Brief (if validation passes) → concepts, and concept selection → build, start automatically. */
  autoAdvance: z.boolean().default(true),
});
export type FactorySettings = z.infer<typeof FactorySettings>;

const KEY = 'factory';

export function getSettings(): FactorySettings {
  const row = db().select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  const parsed = FactorySettings.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : FactorySettings.parse({});
}

export interface SpeedProfile { codexEffort: string; claudeEffort: string; rounds: number; lighthousePages: number; skillChars: number; maxSkills: number }

/** Effective execution parameters. "thorough" keeps the CLIs' own defaults and the configured review rounds. */
export function profile(s: FactorySettings = getSettings()): SpeedProfile {
  if (s.speedProfile === 'fast') return { codexEffort: 'medium', claudeEffort: 'medium', rounds: 1, lighthousePages: 1, skillChars: 5000, maxSkills: 3 };
  if (s.speedProfile === 'balanced') return { codexEffort: 'high', claudeEffort: 'high', rounds: Math.min(s.maxReviewRounds, 2), lighthousePages: 2, skillChars: 9000, maxSkills: 4 };
  return { codexEffort: '', claudeEffort: '', rounds: s.maxReviewRounds, lighthousePages: 3, skillChars: 14000, maxSkills: 6 };
}

export function updateSettings(patch: Partial<FactorySettings>): FactorySettings {
  const next = FactorySettings.parse({ ...getSettings(), ...patch });
  db().insert(schema.settings).values({ key: KEY, value: next, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next, updatedAt: now() } }).run();
  return next;
}
