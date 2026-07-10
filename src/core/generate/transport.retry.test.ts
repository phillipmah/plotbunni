import { describe, it, expect } from 'vitest';
import { createTransport, type EndpointProfile } from './transport';

const profile: EndpointProfile = {
  baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'glm-4', contextLength: 32000, maxOutput: 2000,
};
const ok = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'done' } }] }) } as any;
const err500 = { ok: false, status: 500, json: async () => ({}) } as any;

describe('createTransport resilience', () => {
  it('retries on a 500 then succeeds', async () => {
    let calls = 0;
    const fakeFetch = (async () => (calls++ === 0 ? err500 : ok)) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch, retries: 2, sleep: async () => {} });
    expect(await transport([{ role: 'user', content: 'hi' }])).toBe('done');
    expect(calls).toBe(2);
  });

  it('gives up after exhausting retries', async () => {
    let calls = 0;
    const fakeFetch = (async () => { calls++; return err500; }) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch, retries: 2, sleep: async () => {} });
    await expect(transport([{ role: 'user', content: 'hi' }])).rejects.toThrow('500');
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('does not retry on a 400', async () => {
    let calls = 0;
    const err400 = { ok: false, status: 400, json: async () => ({}) } as any;
    const fakeFetch = (async () => { calls++; return err400; }) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch, retries: 2, sleep: async () => {} });
    await expect(transport([{ role: 'user', content: 'hi' }])).rejects.toThrow('400');
    expect(calls).toBe(1);
  });
});
