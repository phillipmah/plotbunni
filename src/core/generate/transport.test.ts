import { describe, it, expect } from 'vitest';
import { createTransport, type EndpointProfile } from './transport';

const profile: EndpointProfile = {
  baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'glm-4', contextLength: 32000, maxOutput: 2000,
};

describe('createTransport', () => {
  it('POSTs to /chat/completions with auth and returns the message content', async () => {
    let seen: { url: string; body: any; auth: string } | null = null;
    const fakeFetch = (async (url: any, init: any) => {
      seen = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) } as any;
    }) as unknown as typeof fetch;

    const transport = createTransport(profile, { fetch: fakeFetch });
    const out = await transport([{ role: 'user', content: 'hi' }]);

    expect(out).toBe('{"ok":true}');
    expect(seen!.url).toBe('https://api.example.com/v1/chat/completions');
    expect(seen!.auth).toBe('Bearer sk-test');
    expect(seen!.body.model).toBe('glm-4');
    expect(seen!.body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) } as any)) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch });
    await expect(transport([{ role: 'user', content: 'hi' }])).rejects.toThrow('500');
  });
});
