import { describe, it, expect } from 'vitest';
import { packContext, type PackItem } from './packer';

const item = (id: string, tokens: number, priority: number): PackItem =>
  ({ id, content: id, tokens, priority });

describe('packContext', () => {
  it('includes everything when under budget, preserving input order', () => {
    const r = packContext([item('a', 10, 1), item('b', 20, 5)], 100);
    expect(r.packed.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.usedTokens).toBe(30);
    expect(r.dropped).toEqual([]);
  });
  it('drops lowest-priority whole items when over budget', () => {
    const r = packContext([
      item('low', 60, 1),
      item('high', 60, 9),
    ], 100);
    expect(r.packed.map(p => p.id)).toEqual(['high']);
    expect(r.dropped.map(p => p.id)).toEqual(['low']);
    expect(r.usedTokens).toBe(60);
  });
  it('never partially includes an item', () => {
    const r = packContext([item('big', 200, 9)], 100);
    expect(r.packed).toEqual([]);
    expect(r.dropped.map(p => p.id)).toEqual(['big']);
    expect(r.usedTokens).toBe(0);
  });
  it('respects the budget when the next item would overflow', () => {
    const r = packContext([item('big', 90, 9), item('small', 5, 1)], 92);
    expect(r.packed.map(p => p.id)).toEqual(['big']);
    expect(r.dropped.map(p => p.id)).toEqual(['small']);
    expect(r.usedTokens).toBe(90);
  });
});
