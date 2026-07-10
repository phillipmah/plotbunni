import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';
import type { ChatTransport } from '../core/generate/transport';

const NAME = 'TestDB_actions';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('AppStore actions', () => {
  it('ingests, elaborates, drafts+accepts prose, and undoes', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();

    const ingestT: ChatTransport = async () => JSON.stringify({
      entities: [{ type: 'character', name: 'Bob', summary: 'A detective.' }],
      chapters: [{ title: 'The Body', synopsis: 'Bob finds a corpse.' }],
    });
    const ing = await s.ingest(ingestT, 'sys', book.id, 'noir brain dump');
    expect(ing).toEqual({ entities: 1, chapters: 1 });

    const chapter = (await s.chapters(book.id))[0]!;
    const sceneT: ChatTransport = async () => JSON.stringify({ scenes: [{ title: 'Arrival', synopsis: 'Bob arrives.' }] });
    expect(await s.elaborate(sceneT, 'sys', chapter.id, chapter.synopsis)).toBe(1);

    const scene = (await s.scenes(chapter.id))[0]!;
    const proseT: ChatTransport = async () => 'Bob stepped into the rain.';
    const suggestion = await s.draft(proseT, 'sys', scene.id);
    expect(suggestion.text).toBe('Bob stepped into the rain.');
    await s.accept(suggestion);
    expect((await s.scenes(chapter.id))[0]!.content).toBe('Bob stepped into the rain.');

    expect(await s.undoLast()).toBe(true); // undoes the prose accept
    expect((await s.scenes(chapter.id))[0]!.content).toBe('');
    s.db.close();
  });
});
