import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';
import { DEFAULT_PROFILE } from './settings';
import { putEntity, getEntity } from '../core/db/stores';
import { createChapter, type Book } from '../core/model/entities';
import type { ChatTransport } from '../core/generate/transport';

const NAME = 'TestDB_ordering';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('chapter ordering + defaults', () => {
  it('ingest records chapterOrder on the book, matching display order', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();
    const t: ChatTransport = async () => JSON.stringify({
      entities: [],
      chapters: [{ title: 'One', synopsis: 'a' }, { title: 'Two', synopsis: 'b' }, { title: 'Three', synopsis: 'c' }],
    });
    await s.ingest(t, 'sys', book.id, 'dump');
    const updated = (await getEntity<Book>(s.db, 'books', book.id))!;
    const displayed = await s.chapters(book.id);
    expect(updated.chapterOrder.length).toBe(3);
    expect(updated.chapterOrder).toEqual(displayed.map(c => c.id));
    expect(displayed.map(c => c.title)).toEqual(['One', 'Two', 'Three']);
    s.db.close();
  });

  it('chapters() honors chapterOrder over createdAt', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();
    const first = createChapter({ bookId: book.id, title: 'First' }); first.createdAt = 5000;   // later in time
    const second = createChapter({ bookId: book.id, title: 'Second' }); second.createdAt = 1000; // earlier in time
    await putEntity(s.db, 'chapters', first);
    await putEntity(s.db, 'chapters', second);
    await putEntity(s.db, 'books', { ...book, chapterOrder: [first.id, second.id] });
    expect((await s.chapters(book.id)).map(c => c.title)).toEqual(['First', 'Second']); // order wins, not createdAt
    s.db.close();
  });

  it('default maxOutput is 8000 (headroom for reasoning models)', () => {
    expect(DEFAULT_PROFILE.maxOutput).toBe(8000);
  });
});
