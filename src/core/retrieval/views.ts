import type { BibleEntry } from '../model/entities';

export type ViewLevel = 'identity' | 'brief' | 'standard' | 'full';

const header = (e: BibleEntry): string => `${e.name} — ${e.type}`;
const firstParagraph = (s: string): string => s.split(/\n\n/)[0] ?? s;
const firstLine = (s: string): string => s.split('\n')[0] ?? s;

export function renderView(entry: BibleEntry, level: ViewLevel): string {
  const byPriority = [...entry.facets].sort((a, b) => b.priority - a.priority);

  if (level === 'identity') {
    return entry.summary ? `${header(entry)}: ${firstLine(entry.summary)}` : header(entry);
  }
  if (level === 'brief') {
    const top = byPriority[0];
    return [header(entry), entry.summary, top ? `${top.key}: ${firstParagraph(top.content)}` : '']
      .filter(Boolean).join('\n');
  }
  if (level === 'standard') {
    return [header(entry), entry.summary, ...byPriority.map(f => `${f.key}: ${firstParagraph(f.content)}`)]
      .filter(Boolean).join('\n');
  }
  // full
  return [header(entry), entry.summary, ...byPriority.map(f => `${f.key}: ${f.content}`)]
    .filter(Boolean).join('\n');
}
