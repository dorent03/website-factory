/**
 * Per-resource FIFO mutex. Every job that touches a website holds that website's lock for its whole run,
 * so two agents can never write the same site concurrently.
 */
const tails = new Map<string, Promise<void>>();
const holders = new Map<string, string>();

export async function withLock<T>(key: string, holder: string, fn: () => Promise<T>, onWait?: () => void): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  if (holders.has(key)) onWait?.();
  await prev;
  holders.set(key, holder);
  try {
    return await fn();
  } finally {
    holders.delete(key);
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

export function lockHolder(key: string): string | undefined {
  return holders.get(key);
}
