import { describe, it, expect } from 'vitest';
import { createBibleEntry, createScene } from './entities';

describe('entity factories', () => {
  it('creates a bible entry at version 1, not deleted', () => {
    const e = createBibleEntry({ type: 'character', name: 'Bob' });
    expect(e.id).toMatch(/[0-9a-f-]{36}/);
    expect(e.version).toBe(1);
    expect(e.deleted).toBe(false);
    expect(e.type).toBe('character');
    expect(e.facets).toEqual([]);
    expect(e.createdAt).toBe(e.updatedAt);
  });

  it('creates a scene with empty prose and links', () => {
    const s = createScene({ chapterId: 'c1', title: 'Arrival' });
    expect(s.content).toBe('');
    expect(s.synopsis).toBe('');
    expect(s.linkedEntryIds).toEqual([]);
    expect(s.version).toBe(1);
  });
});
