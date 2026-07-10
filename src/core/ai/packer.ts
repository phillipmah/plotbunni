export interface PackItem { id: string; content: string; tokens: number; priority: number }
export interface PackResult { packed: PackItem[]; dropped: PackItem[]; usedTokens: number }

export function packContext(items: PackItem[], budget: number): PackResult {
  const indexed = items.map((it, i) => ({ it, i }));
  const byPriority = [...indexed].sort((a, b) => b.it.priority - a.it.priority);
  const chosen = new Set<number>();
  let used = 0;
  for (const { it, i } of byPriority) {
    if (used + it.tokens <= budget) { chosen.add(i); used += it.tokens; }
  }
  const packed = indexed.filter(x => chosen.has(x.i)).map(x => x.it);
  const dropped = indexed.filter(x => !chosen.has(x.i)).map(x => x.it);
  return { packed, dropped, usedTokens: used };
}
