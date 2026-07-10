import { openPlotBunniDB, type PlotBunniDB } from '../core/db/open';
import { getAllEntities, getEntity } from '../core/db/stores';
import { createBook, type Book, type Chapter, type Scene, type BibleEntry } from '../core/model/entities';
import { dispatch, newTurnId } from '../core/ops/dispatcher';
import type { ChatTransport } from '../core/generate/transport';
import { ingestBrainDump } from '../core/generate/ingest';
import { elaborateScenes } from '../core/generate/scenes';
import { draftProse, acceptProse, type ProseSuggestion } from '../core/generate/prose';
import { retrieve } from '../core/retrieval/retrieve';
import { undo } from '../core/ops/undo';

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

  async ingest(transport: ChatTransport, system: string, bookId: string, monologue: string) {
    return ingestBrainDump(this.db, { transport, system, bookId, monologue });
  }

  async elaborate(transport: ChatTransport, system: string, chapterId: string, chapterSynopsis: string) {
    return elaborateScenes(this.db, { transport, system, chapterId, chapterSynopsis });
  }

  async draft(transport: ChatTransport, system: string, sceneId: string): Promise<ProseSuggestion> {
    const scene = await getEntity<Scene>(this.db, 'scenes', sceneId);
    if (!scene) throw new Error(`scene ${sceneId} not found`);
    const entries = await this.entries();
    const items = retrieve({
      entries, relationships: [], queryText: scene.synopsis,
      linkedEntryIds: scene.linkedEntryIds.map(l => l.entryId),
    });
    const context = items.map(i => i.content).join('\n\n');
    return draftProse({
      transport, system, sceneId, sceneVersion: scene.version,
      sceneSynopsis: scene.synopsis, context,
    });
  }

  async accept(s: ProseSuggestion): Promise<void> {
    await acceptProse(this.db, s);
  }

  async undoLast(): Promise<boolean> {
    return undo(this.db);
  }
}
