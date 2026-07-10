import { describe, it, expect } from 'vitest';
import { retrieve } from './retrieve';
import { createBibleEntry, createRelationship } from '../model/entities';

describe('retrieve (golden eval)', () => {
  const bob = createBibleEntry({ type: 'character', name: 'Bob', keys: ['Bob'], summary: 'A detective.', priority: 1 });
  const vivian = createBibleEntry({ type: 'character', name: 'Vivian', keys: ['Vivian'], summary: 'The widow.' });
  const docks = createBibleEntry({ type: 'location', name: 'the docks', keys: ['docks'], summary: 'Foggy piers.' });
  const rel = createRelationship({ from: bob.id, to: vivian.id, type: 'knows' });

  it('returns linked+keyword+graph entries as scored PackItems, linked first', () => {
    const items = retrieve({
      entries: [bob, vivian, docks], relationships: [rel],
      queryText: 'Bob walks the docks', linkedEntryIds: [bob.id],
    });
    const ids = items.map(i => i.id);
    expect(ids).toContain(bob.id);
    expect(ids).toContain(docks.id);   // keyword
    expect(ids).toContain(vivian.id);  // graph via Bob
    expect(items[0]!.id).toBe(bob.id); // linked ranks first
    for (const i of items) expect(i.tokens).toBeGreaterThan(0);
  });

  it('renders at the requested view', () => {
    const items = retrieve({ entries: [bob], relationships: [], queryText: 'Bob', view: 'identity' });
    expect(items[0]!.content.startsWith('Bob')).toBe(true);
  });
});
