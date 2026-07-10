import { describe, it, expect, beforeEach } from 'vitest';
import { pushLog, getLogs, clearLogs, subscribeLogs, loggingTransport } from './debuglog';

beforeEach(() => clearLogs());

describe('debuglog', () => {
  it('records and clears entries, notifying subscribers', () => {
    let fires = 0;
    const unsub = subscribeLogs(() => { fires++; });
    pushLog('info', 'hello');
    expect(getLogs().at(-1)!.message).toBe('hello');
    expect(fires).toBe(1);
    clearLogs();
    expect(getLogs()).toEqual([]);
    unsub();
  });
  it('loggingTransport records req and res', async () => {
    const inner = async () => 'the response';
    const wrapped = loggingTransport(inner);
    expect(await wrapped([{ role: 'user', content: 'hi' }])).toBe('the response');
    const kinds = getLogs().map(l => l.kind);
    expect(kinds).toContain('req');
    expect(kinds).toContain('res');
  });
  it('loggingTransport records and rethrows errors', async () => {
    const inner = async () => { throw new Error('boom'); };
    await expect(loggingTransport(inner)([{ role: 'user', content: 'hi' }])).rejects.toThrow('boom');
    expect(getLogs().some(l => l.kind === 'error' && l.message.includes('boom'))).toBe(true);
  });
});
