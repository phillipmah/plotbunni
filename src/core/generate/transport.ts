export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatTransport = (messages: ChatMessage[]) => Promise<string>;

export interface EndpointProfile {
  baseUrl: string; apiKey: string; model: string; contextLength: number; maxOutput: number;
}

interface TransportDeps {
  fetch?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export function createTransport(profile: EndpointProfile, deps: TransportDeps = {}): ChatTransport {
  const doFetch = deps.fetch ?? fetch;
  const retries = deps.retries ?? 2;
  const timeoutMs = deps.timeoutMs ?? 60000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

  return async (messages) => {
    let lastErr: Error = new Error('no attempt');
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(200 * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${profile.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.apiKey}` },
          body: JSON.stringify({
            model: profile.model, messages, max_tokens: profile.maxOutput,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = new Error(`endpoint returned ${res.status}`);
          if (isRetryable(res.status) && attempt < retries) { lastErr = err; continue; }
          throw err;
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return data.choices?.[0]?.message?.content ?? '';
      } catch (e) {
        lastErr = e as Error;
        const status = Number((lastErr.message.match(/returned (\d+)/) ?? [])[1]);
        if (status && !isRetryable(status)) throw lastErr; // non-retryable HTTP → stop
        if (attempt >= retries) throw lastErr;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  };
}
