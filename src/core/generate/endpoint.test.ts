import { describe, it, expect } from 'vitest';
import { testConnection, listModels } from './endpoint';
import type { EndpointProfile } from './transport';

const profile: EndpointProfile = {
  baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'glm-4', contextLength: 32000, maxOutput: 2000,
};

describe('endpoint tools', () => {
  it('testConnection reports ok on a good response', async () => {
    const fakeFetch = (async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }) } as any)) as unknown as typeof fetch;
    expect(await testConnection(profile, { fetch: fakeFetch })).toEqual({ ok: true });
  });
  it('testConnection reports the error on failure', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 401, json: async () => ({}) } as any)) as unknown as typeof fetch;
    const r = await testConnection(profile, { fetch: fakeFetch });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });
  it('listModels returns model ids from /models', async () => {
    let url = '';
    const fakeFetch = (async (u: any) => { url = u; return { ok: true, json: async () => ({ data: [{ id: 'glm-4.6' }, { id: 'glm-4-air' }] }) } as any; }) as unknown as typeof fetch;
    expect(await listModels(profile, { fetch: fakeFetch })).toEqual(['glm-4.6', 'glm-4-air']);
    expect(url).toBe('https://api.example.com/v1/models');
  });
});
