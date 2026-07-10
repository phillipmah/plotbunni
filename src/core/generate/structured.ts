import type { ZodType } from 'zod';
import type { ChatTransport, ChatMessage } from './transport';

function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  try { return JSON.parse(slice); } catch { return null; }
}

export async function generateStructured<T>(input: {
  transport: ChatTransport;
  system: string;
  user: string;
  schema: ZodType<T>;
  maxRepairs?: number;
}): Promise<T> {
  const maxRepairs = input.maxRepairs ?? 1;
  const base: ChatMessage[] = [
    { role: 'system', content: input.system },
    { role: 'user', content: input.user },
  ];
  let lastErr = 'no response';
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const messages = attempt === 0
      ? base
      : [...base, { role: 'user' as const, content:
          `Your previous reply was not valid JSON for the required schema (${lastErr}). Reply with ONLY the JSON object.` }];
    const raw = await input.transport(messages);
    const parsed = input.schema.safeParse(extractJson(raw));
    if (parsed.success) return parsed.data;
    lastErr = parsed.error.message.slice(0, 200);
  }
  throw new Error(`generateStructured failed after ${maxRepairs} repair(s): ${lastErr}`);
}
