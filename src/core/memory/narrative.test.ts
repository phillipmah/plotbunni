import { describe, it, expect } from 'vitest';
import { buildNarrativeMemory } from './narrative';
import { createChapter, createScene } from '../model/entities';

describe('buildNarrativeMemory', () => {
  const ch1 = createChapter({ bookId: 'b', title: 'One', synopsis: 'Bob finds a body.' });
  const ch2 = createChapter({ bookId: 'b', title: 'Two', synopsis: 'Bob visits the widow.' });
  const a = createScene({ chapterId: ch1.id, title: 'A', synopsis: 'Discovery at the docks.' });
  const b = createScene({ chapterId: ch1.id, title: 'B', synopsis: 'The coroner arrives.' });
  const c = createScene({ chapterId: ch2.id, title: 'C', synopsis: 'The parlor.' });
  const scenesByChapter = { [ch1.id]: [a, b], [ch2.id]: [c] };

  it('includes earlier chapter synopses for a scene in a later chapter', () => {
    const mem = buildNarrativeMemory({ orderedChapters: [ch1, ch2], scenesByChapter, targetSceneId: c.id });
    expect(mem).toContain('Bob finds a body.');   // ch1 synopsis
    expect(mem).not.toContain('The parlor.');      // the target scene itself excluded
  });

  it('includes preceding scenes within the same chapter', () => {
    const mem = buildNarrativeMemory({ orderedChapters: [ch1, ch2], scenesByChapter, targetSceneId: b.id });
    expect(mem).toContain('Discovery at the docks.'); // scene A precedes B
    expect(mem).not.toContain('The coroner arrives.'); // B itself excluded
  });

  it('returns empty string when the target is unknown', () => {
    expect(buildNarrativeMemory({ orderedChapters: [ch1], scenesByChapter, targetSceneId: 'nope' })).toBe('');
  });
});
