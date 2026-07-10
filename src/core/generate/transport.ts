export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatTransport = (messages: ChatMessage[]) => Promise<string>;

export interface EndpointProfile {
  baseUrl: string; apiKey: string; model: string; contextLength: number; maxOutput: number;
}

export function createTransport(
  profile: EndpointProfile, deps: { fetch?: typeof fetch } = {},
): ChatTransport {
  const doFetch = deps.fetch ?? fetch;
  return async (messages) => {
    const res = await doFetch(`${profile.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.apiKey}` },
      body: JSON.stringify({
        model: profile.model,
        messages,
        max_tokens: profile.maxOutput,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`endpoint returned ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  };
}
