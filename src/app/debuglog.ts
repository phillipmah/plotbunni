import type { ChatTransport, ChatMessage } from '../core/generate/transport';

export interface LogEntry { ts: number; kind: string; message: string }

const MAX = 500;
let logs: LogEntry[] = [];
const subscribers = new Set<() => void>();

export function pushLog(kind: string, message: string): void {
  const next = [...logs, { ts: Date.now(), kind, message }];
  logs = next.length > MAX ? next.slice(next.length - MAX) : next;
  subscribers.forEach(cb => cb());
}
export function getLogs(): LogEntry[] { return logs; }
export function clearLogs(): void { logs = []; subscribers.forEach(cb => cb()); }
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
