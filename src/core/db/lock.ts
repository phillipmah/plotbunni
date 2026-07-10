export interface WriterHandle { release(): void }

export function acquireWriter(
  novelId: string, opts: { locks?: LockManager } = {},
): Promise<WriterHandle | null> {
  const locks = opts.locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined);
  const name = `plotbunni:writer:${novelId}`;
  if (!locks) return Promise.resolve({ release() {} }); // no Web Locks → assume single context

  return new Promise<WriterHandle | null>((resolve) => {
    locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      if (!lock) { resolve(null); return; }               // someone else holds it
      return new Promise<void>((release) => {
        resolve({ release });                              // hold the lock until release() is called
      });
    }).catch(() => resolve(null));
  });
}
