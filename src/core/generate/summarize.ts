import type { PlotBunniDB } from '../db/open';
import { getEntity } from '../db/stores';
import type { Scene } from '../model/entities';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { ChatTransport } from './transport';

export async function summarizeScene(
  db: PlotBunniDB,
  opts: { transport: ChatTransport; system: string; sceneId: string },
): Promise<string> {
  const scene = await getEntity<Scene>(db, 'scenes', opts.sceneId);
  if (!scene) throw new Error(`scene ${opts.sceneId} not found`);

  const raw = await opts.transport([
    { role: 'system', content: opts.system },
    { role: 'user', content: `Summarize this scene in 1-2 sentences for continuity notes. Return the summary only.\n\n${scene.content}` },
  ]);
  const synopsis = raw.trim();

  const turnId = newTurnId();
  await dispatch(db, [{
    type: 'update', store: 'scenes', entityId: scene.id,
    expectedVersion: scene.version, actor: 'gen', turnId, patch: { synopsis },
  }], { actor: 'gen', turnId });
  return synopsis;
}
