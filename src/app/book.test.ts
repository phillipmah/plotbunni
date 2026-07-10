import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';
import { createBook } from '../core/model/entities';

const NAME = 'TestDB_book';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('Book editing', () => {
  it('createBook has an empty synopsis by default', () => {
    expect(createBook({ title: 'X' }).synopsis).toBe('');
  });
  it('updateBook changes title and synopsis', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();
    await s.updateBook(book.id, { title: 'The Dockside Murder', synopsis: 'A noir mystery.' });
    const again = await s.ensureBook();
    expect(again.title).toBe('The Dockside Murder');
    expect(again.synopsis).toBe('A noir mystery.');
    s.db.close();
  });
});
