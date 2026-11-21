import type { AgentId } from '@wf/shared';
import { claudeAdapter } from './claude.ts';
import { codexAdapter } from './codex.ts';
import type { AgentAdapter } from './types.ts';

export const adapters: Partial<Record<AgentId, AgentAdapter>> = { claude: claudeAdapter, codex: codexAdapter };
