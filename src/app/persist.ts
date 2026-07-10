export async function requestPersistence(
  nav: { storage?: { persist?: () => Promise<boolean> } } =
    (typeof navigator !== 'undefined' ? navigator : {}) as Navigator,
): Promise<boolean> {
  try {
    if (nav.storage?.persist) return await nav.storage.persist();
  } catch { /* ignore */ }
  return false;
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
