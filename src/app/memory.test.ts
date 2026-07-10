import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';
import type { ChatTransport, ChatMessage } from '../core/generate/transport';

const NAME = 'TestDB_appmemory';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('AppStore narrative memory', () => {
  it('feeds prior-scene synopsis into the prose draft context', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();

    const ingestT: ChatTransport = async () => JSON.stringify({
      entities: [], chapters: [{ title: 'One', synopsis: 'The setup.' }],
    });
    await s.ingest(ingestT, 'sys', book.id, 'dump');
    const chapter = (await s.chapters(book.id))[0]!;

    const sceneT: ChatTransport = async () => JSON.stringify({
      scenes: [{ title: 'A', synopsis: 'Bob arrives at the docks.' }, { title: 'B', synopsis: 'Bob meets the coroner.' }],
    });
    await s.elaborate(sceneT, 'sys', chapter.id, chapter.synopsis);
    const scenes = await s.scenes(chapter.id);
    const sceneB = scenes[1]!;

    let captured: ChatMessage[] = [];
    const proseT: ChatTransport = async (msgs) => { captured = msgs; return 'prose'; };
    await s.draft(proseT, 'sys', sceneB.id);

    const userMsg = captured.find(m => m.role === 'user')!.content;
    expect(userMsg).toContain('Bob arrives at the docks.'); // scene A's synopsis = narrative memory
    s.db.close();
  });

  it('summarize writes the synopsis', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();
    await s.ingest(async () => JSON.stringify({ entities: [], chapters: [{ title: 'One', synopsis: 'x' }] }), 'sys', book.id, 'd');
    const chapter = (await s.chapters(book.id))[0]!;
    await s.elaborate(async () => JSON.stringify({ scenes: [{ title: 'A', synopsis: 'old' }] }), 'sys', chapter.id, 'x');
    const scene = (await s.scenes(chapter.id))[0]!;

    const out = await s.summarize(async () => 'a fresh summary', 'sys', scene.id);
    expect(out).toBe('a fresh summary');
    expect((await s.scenes(chapter.id))[0]!.synopsis).toBe('a fresh summary');
    s.db.close();
  });
});
