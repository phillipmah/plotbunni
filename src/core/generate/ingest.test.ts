import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities } from '../db/stores';
import { ingestBrainDump } from './ingest';
import type { BibleEntry, Chapter } from '../model/entities';

const NAME = 'TestDB_ingest';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('ingestBrainDump', () => {
  it('creates entities and chapters from one structured reply', async () => {
    const db = await openPlotBunniDB(NAME);
    const transport = async () => JSON.stringify({
      entities: [{ type: 'character', name: 'Bob', summary: 'A detective.' }],
      chapters: [{ title: 'The Body', synopsis: 'Bob finds a corpse.' }],
    });
    const res = await ingestBrainDump(db, { transport, system: 's', bookId: 'book-1', monologue: 'noir story' });
    expect(res).toEqual({ entities: 1, chapters: 1 });

    const entries = await getAllEntities<BibleEntry>(db, 'bibleEntries');
    const chapters = await getAllEntities<Chapter>(db, 'chapters');
    expect(entries.map(e => e.name)).toEqual(['Bob']);
    expect(chapters[0]!.bookId).toBe('book-1');
    expect(chapters[0]!.title).toBe('The Body');
    db.close();
  });
});
