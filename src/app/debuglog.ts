import type { ChatTransport, ChatMessage } from '../core/generate/transport';

export interface LogEntry { ts: number; kind: string; message: string }

const buffer: LogEntry[] = [];
const subscribers = new Set<() => void>();
const MAX = 500;

export function pushLog(kind: string, message: string): void {
  buffer.push({ ts: Date.now(), kind, message });
  if (buffer.length > MAX) buffer.shift();
  subscribers.forEach(cb => cb());
}
export function getLogs(): LogEntry[] { return [...buffer]; }
export function clearLogs(): void { buffer.length = 0; subscribers.forEach(cb => cb()); }
export function subscribeLogs(cb: () => void): () => void {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

export function loggingTransport(inner: ChatTransport): ChatTransport {
  return async (messages: ChatMessage[]) => {
    const last = messages[messages.length - 1]?.content ?? '';
    pushLog('req', `→ ${messages.length} msg(s); last: ${last.slice(0, 100)}`);
    try {
      const out = await inner(messages);
      pushLog('res', `← ${out.length} chars`);
      return out;
    } catch (e) {
      pushLog('error', (e as Error).message);
      throw e;
    }
  };
}
