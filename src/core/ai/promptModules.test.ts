import { describe, it, expect } from 'vitest';
import { BUILTIN_MODULES } from './promptModules';

describe('BUILTIN_MODULES', () => {
  it('ships at least one enabled module of each core kind', () => {
    const kinds = new Set(BUILTIN_MODULES.filter(m => m.enabled).map(m => m.kind));
    expect(kinds.has('director-voice')).toBe(true);
    expect(kinds.has('pov')).toBe(true);
    expect(kinds.has('narrative-tracking')).toBe(true);
  });
  it('every module has non-empty content and a unique id', () => {
    const ids = BUILTIN_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of BUILTIN_MODULES) expect(m.content.trim().length).toBeGreaterThan(0);
  });
});
