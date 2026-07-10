import { describe, it, expect } from 'vitest';
import { gatherCandidates } from './candidates';
import { createBibleEntry, createRelationship } from '../model/entities';

const bob = createBibleEntry({ type: 'character', name: 'Bob', keys: ['Bob'] });
const vivian = createBibleEntry({ type: 'character', name: 'Vivian', keys: ['Vivian'] });
const docks = createBibleEntry({ type: 'location', name: 'the docks', keys: ['docks'] });
const rel = createRelationship({ from: bob.id, to: vivian.id, type: 'knows' });

describe('gatherCandidates', () => {
  it('gathers linked, keyword, and 1-hop graph candidates', () => {
    const cands = gatherCandidates({
      entries: [bob, vivian, docks], relationships: [rel],
      queryText: 'a night at the docks', linkedEntryIds: [bob.id],
    });
    const byId = new Map(cands.map(c => [c.entry.id, c.sources]));
    expect(byId.get(bob.id)).toContain('linked');
    expect(byId.get(docks.id)).toContain('keyword');   // matched "docks"
    expect(byId.get(vivian.id)).toContain('graph');    // 1-hop from Bob
  });
  it('excludes deleted entries', () => {
    const dead = createBibleEntry({ type: 'item', name: 'Ghost', keys: ['Ghost'], deleted: true });
    const cands = gatherCandidates({
      entries: [dead], relationships: [], queryText: 'the Ghost appears',
    });
    expect(cands).toEqual([]);
  });
});
