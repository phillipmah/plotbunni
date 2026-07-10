import { describe, it, expect } from 'vitest';
import { renderView } from './views';
import { createBibleEntry } from '../model/entities';

const bob = createBibleEntry({
  type: 'character', name: 'Bob', summary: 'A washed-up detective.',
  facets: [
    { key: 'appearance', content: 'Tall, gaunt.\n\nAlways in a grey coat.', priority: 5 },
    { key: 'backstory', content: 'Left the force after the docks case.', priority: 9 },
  ],
});

describe('renderView', () => {
  it('identity is compact', () => {
    const out = renderView(bob, 'identity');
    expect(out).toContain('Bob');
    expect(out).not.toContain('grey coat');
  });
  it('brief includes the highest-priority facet only', () => {
    const out = renderView(bob, 'brief');
    expect(out).toContain('washed-up detective');
    expect(out).toContain('Left the force'); // backstory, priority 9
    expect(out).not.toContain('grey coat');  // appearance, lower priority
  });
  it('standard includes every facet but only first paragraphs', () => {
    const out = renderView(bob, 'standard');
    expect(out).toContain('Tall, gaunt.');
    expect(out).not.toContain('grey coat'); // second paragraph dropped
  });
  it('full includes complete facet content', () => {
    const out = renderView(bob, 'full');
    expect(out).toContain('grey coat');
  });
});
