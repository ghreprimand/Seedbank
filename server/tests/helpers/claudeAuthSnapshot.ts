import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from '../../src/db.js';
import { clearTokens } from '../../src/ai/claude-account/auth.js';
import { resetCatalogCacheForTests } from '../../src/ai/claude-account/catalog.js';

const AUTH_PATH = path.join(dataDir, 'claude-auth.json');
const LOCK_DIR = path.join(dataDir, '.claude-auth-test.lock');

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireAuthSnapshotLock(): Promise<() => Promise<void>> {
  for (;;) {
    try {
      await fs.mkdir(LOCK_DIR, { recursive: false });
      return async () => {
        await fs.rm(LOCK_DIR, { recursive: true, force: true });
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      await delay(10);
    }
  }
}

export async function withClaudeAuthSnapshot(run: () => Promise<void>): Promise<void> {
  const release = await acquireAuthSnapshotLock();
  let previous: Buffer | null = null;
  try {
    previous = await fs.readFile(AUTH_PATH);
  } catch {
    previous = null;
  }

  try {
    await run();
  } finally {
    resetCatalogCacheForTests();
    if (previous) {
      await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
      await fs.writeFile(AUTH_PATH, previous);
    } else {
      await clearTokens().catch(() => {});
      await fs.rm(AUTH_PATH, { force: true }).catch(() => {});
    }
    await release();
  }
}
