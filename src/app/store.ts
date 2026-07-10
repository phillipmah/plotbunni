import { openPlotBunniDB, type PlotBunniDB } from '../core/db/open';
import { getAllEntities } from '../core/db/stores';
import { createBook, type Book, type Chapter, type Scene, type BibleEntry } from '../core/model/entities';
import { dispatch, newTurnId } from '../core/ops/dispatcher';

const byCreated = <T extends { createdAt: number }>(a: T, b: T) => a.createdAt - b.createdAt;

export class AppStore {
  private constructor(readonly db: PlotBunniDB) {}

  static async open(dbName?: string): Promise<AppStore> {
    return new AppStore(await openPlotBunniDB(dbName));
  }

  async ensureBook(): Promise<Book> {
    const books = await getAllEntities<Book>(this.db, 'books');
    if (books.length > 0) return books.sort(byCreated)[0]!;
    const book = createBook({ title: 'Untitled Novel' });
    const turnId = newTurnId();
    await dispatch(this.db, [{
      type: 'create', store: 'books', entityId: book.id, expectedVersion: null, actor: 'user', turnId, entity: book,
    }], { actor: 'user', turnId });
    return book;
  }

  async chapters(bookId: string): Promise<Chapter[]> {
    return (await getAllEntities<Chapter>(this.db, 'chapters')).filter(c => c.bookId === bookId).sort(byCreated);
  }
  async scenes(chapterId: string): Promise<Scene[]> {
    return (await getAllEntities<Scene>(this.db, 'scenes')).filter(s => s.chapterId === chapterId).sort(byCreated);
  }
  async entries(): Promise<BibleEntry[]> {
    return (await getAllEntities<BibleEntry>(this.db, 'bibleEntries')).sort(byCreated);
  }
}
