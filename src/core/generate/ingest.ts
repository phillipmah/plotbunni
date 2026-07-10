import { z } from 'zod';
import type { PlotBunniDB } from '../db/open';
import { getEntity } from '../db/stores';
import { createBibleEntry, createChapter, type Book } from '../model/entities';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { Op } from '../ops/types';
import { generateStructured } from './structured';
import type { ChatTransport } from './transport';

export const ingestSchema = z.object({
  entities: z.array(z.object({
    type: z.string(), name: z.string(), summary: z.string().default(''),
  })),
  chapters: z.array(z.object({
    title: z.string(), synopsis: z.string().default(''),
  })),
});

export async function ingestBrainDump(
  db: PlotBunniDB,
  opts: { transport: ChatTransport; system: string; bookId: string; monologue: string },
): Promise<{ entities: number; chapters: number }> {
  const result = await generateStructured({
    transport: opts.transport,
    system: opts.system,
    user: `Extract the story entities (characters, locations, items, arcs) and a chapter outline from this brain-dump. List the chapters in chronological story order (first chapter first, last chapter last). Reply as JSON {entities:[{type,name,summary}], chapters:[{title,synopsis}]}.\n\n${opts.monologue}`,
    schema: ingestSchema,
  });

  const book = await getEntity<Book>(db, 'books', opts.bookId);
  const turnId = newTurnId();
  const ops: Op[] = [];
  for (const e of result.entities) {
    const be = createBibleEntry({ type: e.type, name: e.name, summary: e.summary });
    ops.push({ type: 'create', store: 'bibleEntries', entityId: be.id, expectedVersion: null, actor: 'gen', turnId, entity: be });
  }
  const newChapterIds: string[] = [];
  for (const c of result.chapters) {
    const ch = createChapter({ bookId: opts.bookId, title: c.title, synopsis: c.synopsis });
    newChapterIds.push(ch.id);
    ops.push({ type: 'create', store: 'chapters', entityId: ch.id, expectedVersion: null, actor: 'gen', turnId, entity: ch });
  }
  if (book) {
    ops.push({
      type: 'update', store: 'books', entityId: book.id, expectedVersion: book.version,
      actor: 'gen', turnId, patch: { chapterOrder: [...book.chapterOrder, ...newChapterIds] },
    });
  }
  await dispatch(db, ops, { actor: 'gen', turnId });
  return { entities: result.entities.length, chapters: result.chapters.length };
}
