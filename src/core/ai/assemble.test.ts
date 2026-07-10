import { describe, it, expect } from 'vitest';
import { assemblePrompt } from './assemble';
import { BUILTIN_MODULES } from './promptModules';
import type { PackItem } from './packer';

const ctx = (id: string, content: string, tokens: number, priority: number): PackItem =>
  ({ id, content, tokens, priority });

describe('assemblePrompt', () => {
  it('composes system prompt including an appended task base', () => {
    const out = assemblePrompt({
      modules: BUILTIN_MODULES, taskBase: 'TASK: draft the scene.',
      contextItems: [], budget: 1000, userMessage: 'Write scene 1.',
    });
    expect(out.system).toContain('novelist');
    expect(out.system).toContain('TASK: draft the scene.');
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]!.content).toBe('Write scene 1.');
  });
  it('prepends packed context and drops over-budget items', () => {
    const out = assemblePrompt({
      modules: [], contextItems: [ctx('a', 'BOB is a detective', 5, 9), ctx('b', 'noise', 999, 1)],
      budget: 10, userMessage: 'Continue.',
    });
    expect(out.messages[0]!.content).toContain('BOB is a detective');
    expect(out.messages[0]!.content).toContain('---');
    expect(out.messages[0]!.content).toContain('Continue.');
    expect(out.breakdown.droppedItems).toBe(1);
    expect(out.breakdown.contextTokens).toBeGreaterThan(0);
  });
});
