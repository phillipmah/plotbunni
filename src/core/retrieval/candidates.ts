import type { BibleEntry, Relationship } from '../model/entities';
import { matchKeys } from './keys';

export type CandidateSource = 'linked' | 'always-on' | 'keyword' | 'graph';
export interface Candidate { entry: BibleEntry; sources: CandidateSource[] }
export interface GatherInput {
  entries: BibleEntry[];
  relationships: Relationship[];
  queryText: string;
  linkedEntryIds?: string[];
  alwaysOnIds?: string[];
}

export function gatherCandidates(input: GatherInput): Candidate[] {
  const live = input.entries.filter(e => !e.deleted);
  const byId = new Map(live.map(e => [e.id, e]));
  const sources = new Map<string, Set<CandidateSource>>();
  const add = (id: string, s: CandidateSource) => {
    if (!byId.has(id)) return;
    if (!sources.has(id)) sources.set(id, new Set());
    sources.get(id)!.add(s);
  };

  for (const id of input.linkedEntryIds ?? []) add(id, 'linked');
  for (const id of input.alwaysOnIds ?? []) add(id, 'always-on');
  for (const e of live) {
    if (matchKeys(input.queryText, [e.name, ...e.aliases, ...e.keys])) add(e.id, 'keyword');
  }

  // 1-hop graph expansion from the seeds gathered so far
  const seeds = new Set(sources.keys());
  for (const rel of input.relationships) {
    if (seeds.has(rel.from) && byId.has(rel.to)) add(rel.to, 'graph');
    if (seeds.has(rel.to) && byId.has(rel.from)) add(rel.from, 'graph');
  }

  return [...sources.entries()].map(([id, s]) => ({ entry: byId.get(id)!, sources: [...s] }));
}
