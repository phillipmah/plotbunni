import { z } from 'zod';
import type { PlotBunniDB } from '../db/open';
import { createScene } from '../model/entities';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { Op } from '../ops/types';
import { generateStructured } from './structured';
import type { ChatTransport } from './transport';

export const scenesSchema = z.object({
  scenes: z.array(z.object({ title: z.string(), synopsis: z.string().default('') })),
});

export async function elaborateScenes(
  db: PlotBunniDB,
  opts: { transport: ChatTransport; system: string; chapterId: string; chapterSynopsis: string },
): Promise<number> {
  const result = await generateStructured({
    transport: opts.transport,
    system: opts.system,
    user: `Break this chapter into an ordered list of scenes. Reply as JSON {scenes:[{title,synopsis}]}.\n\nChapter: ${opts.chapterSynopsis}`,
    schema: scenesSchema,
  });

  const turnId = newTurnId();
  const ops: Op[] = result.scenes.map(s => {
    const sc = createScene({ chapterId: opts.chapterId, title: s.title, synopsis: s.synopsis });
    return { type: 'create', store: 'scenes', entityId: sc.id, expectedVersion: null, actor: 'gen', turnId, entity: sc };
  });
  await dispatch(db, ops, { actor: 'gen', turnId });
  return result.scenes.length;
}
