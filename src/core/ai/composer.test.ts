import { describe, it, expect } from 'vitest';
import { composeSystemPrompt } from './composer';
import type { PromptModule } from './promptModules';

const mod = (p: Partial<PromptModule> & { id: string; content: string; order: number }): PromptModule =>
  ({ kind: 'task-base', name: p.id, enabled: true, ...p });

describe('composeSystemPrompt', () => {
  it('joins enabled modules in order', () => {
    const out = composeSystemPrompt([
      mod({ id: 'b', content: 'Second', order: 10 }),
      mod({ id: 'a', content: 'First', order: 0 }),
    ]);
    expect(out).toBe('First\n\nSecond');
  });
  it('omits disabled and empty modules', () => {
    const out = composeSystemPrompt([
      mod({ id: 'a', content: 'Keep', order: 0 }),
      mod({ id: 'b', content: 'Drop', order: 5, enabled: false }),
      mod({ id: 'c', content: '   ', order: 10 }),
    ]);
    expect(out).toBe('Keep');
  });
});
