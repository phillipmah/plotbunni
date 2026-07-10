export function matchKeys(
  text: string, keys: string[], opts: { caseSensitive?: boolean } = {},
): boolean {
  if (!text || keys.length === 0) return false;
  const flags = opts.caseSensitive ? '' : 'i';
  for (const raw of keys) {
    const key = raw.trim();
    if (!key) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, flags).test(text)) return true;
  }
  return false;
}
