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
import { buildNarrativeMemory } from '../core/memory/narrative';
import { summarizeScene } from '../core/generate/summarize';

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

  async updateBook(bookId: string, patch: { title?: string; synopsis?: string }): Promise<void> {
    const book = await getEntity<Book>(this.db, 'books', bookId);
    if (!book) throw new Error(`book ${bookId} not found`);
    const turnId = newTurnId();
    await dispatch(this.db, [{
      type: 'update', store: 'books', entityId: bookId,
      expectedVersion: book.version, actor: 'user', turnId, patch,
    }], { actor: 'user', turnId });
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
    const chapter = await getEntity<Chapter>(this.db, 'chapters', scene.chapterId);

    let narrative = '';
    if (chapter) {
      const chapters = await this.chapters(chapter.bookId);
      const scenesByChapter: Record<string, Scene[]> = {};
      for (const ch of chapters) scenesByChapter[ch.id] = await this.scenes(ch.id);
      narrative = buildNarrativeMemory({ orderedChapters: chapters, scenesByChapter, targetSceneId: sceneId });
    }

    const entries = await this.entries();
    const items = retrieve({
      entries, relationships: [], queryText: scene.synopsis,
      linkedEntryIds: scene.linkedEntryIds.map(l => l.entryId),
    });
    const bible = items.map(i => i.content).join('\n\n');
    const context = [narrative, bible].filter(Boolean).join('\n\n---\n\n');

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

  async summarize(transport: ChatTransport, system: string, sceneId: string): Promise<string> {
    return summarizeScene(this.db, { transport, system, sceneId });
  }
}
