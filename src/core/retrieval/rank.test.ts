import { describe, it, expect } from 'vitest';
import { rankCandidates } from './rank';
import { createBibleEntry } from '../model/entities';
import type { Candidate } from './candidates';

describe('rankCandidates', () => {
  it('ranks linked above keyword above graph, and adds entry priority', () => {
    const mk = (name: string, sources: Candidate['sources'], priority = 0): Candidate =>
      ({ entry: createBibleEntry({ type: 'character', name, priority }), sources });
    const ranked = rankCandidates([
      mk('graphOnly', ['graph']),
      mk('linked', ['linked']),
      mk('keyword', ['keyword']),
    ]);
    expect(ranked.map(r => r.entry.name)).toEqual(['linked', 'keyword', 'graphOnly']);
  });
  it('uses the strongest source when several apply', () => {
    const c: Candidate = { entry: createBibleEntry({ type: 'item', name: 'X' }), sources: ['graph', 'linked'] };
    expect(rankCandidates([c])[0]!.score).toBe(100);
  });
});
