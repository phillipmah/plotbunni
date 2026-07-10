import { createTransport, type EndpointProfile } from './transport';

export async function testConnection(
  profile: EndpointProfile, deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: boolean; error?: string }> {
  const transport = createTransport(profile, { fetch: deps.fetch, retries: 0 });
  try {
    await transport([{ role: 'user', content: 'Reply with an empty JSON object {}.' }]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listModels(
  profile: EndpointProfile, deps: { fetch?: typeof fetch } = {},
): Promise<string[]> {
  const doFetch = deps.fetch ?? fetch;
  const res = await doFetch(`${profile.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${profile.apiKey}` },
  });
  if (!res.ok) throw new Error(`models request returned ${res.status}`);
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? []).map(m => m.id).filter((id): id is string => !!id);
}
