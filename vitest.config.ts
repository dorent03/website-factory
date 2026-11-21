import { defineConfig } from 'vitest/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'wf-test-'));
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { WF_SITES_ROOT: join(tmp, 'sites'), WF_DATA_DIR: join(tmp, 'data') },
    testTimeout: 30_000,
  },
});
