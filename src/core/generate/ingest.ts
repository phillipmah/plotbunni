import { z } from 'zod';
import type { PlotBunniDB } from '../db/open';
import { createBibleEntry, createChapter } from '../model/entities';
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
    user: `Extract the story entities (characters, locations, items, arcs) and a chapter outline from this brain-dump. Reply as JSON {entities:[{type,name,summary}], chapters:[{title,synopsis}]}.\n\n${opts.monologue}`,
    schema: ingestSchema,
  });

  const turnId = newTurnId();
  const ops: Op[] = [];
  for (const e of result.entities) {
    const be = createBibleEntry({ type: e.type, name: e.name, summary: e.summary });
    ops.push({ type: 'create', store: 'bibleEntries', entityId: be.id, expectedVersion: null, actor: 'gen', turnId, entity: be });
  }
  for (const c of result.chapters) {
    const ch = createChapter({ bookId: opts.bookId, title: c.title, synopsis: c.synopsis });
    ops.push({ type: 'create', store: 'chapters', entityId: ch.id, expectedVersion: null, actor: 'gen', turnId, entity: ch });
  }
  await dispatch(db, ops, { actor: 'gen', turnId });
  return { entities: result.entities.length, chapters: result.chapters.length };
}
