import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { generateStructured } from './structured';
import type { ChatMessage } from './transport';

const schema = z.object({ name: z.string() });

describe('generateStructured', () => {
  it('parses valid JSON on the first try', async () => {
    const transport = async (_m: ChatMessage[]) => '{"name":"Bob"}';
    expect(await generateStructured({ transport, system: 's', user: 'u', schema })).toEqual({ name: 'Bob' });
  });

  it('extracts JSON embedded in prose', async () => {
    const transport = async () => 'Sure! Here you go: {"name":"Vivian"} — hope that helps';
    expect(await generateStructured({ transport, system: 's', user: 'u', schema })).toEqual({ name: 'Vivian' });
  });

  it('repairs once after an invalid reply', async () => {
    let call = 0;
    const transport = async (_m: ChatMessage[]) => (call++ === 0 ? 'not json at all' : '{"name":"Bob"}');
    expect(await generateStructured({ transport, system: 's', user: 'u', schema })).toEqual({ name: 'Bob' });
    expect(call).toBe(2);
  });

  it('throws after exhausting repairs', async () => {
    const transport = async () => 'never valid';
    await expect(generateStructured({ transport, system: 's', user: 'u', schema, maxRepairs: 1 }))
      .rejects.toThrow(/failed/i);
  });
});
