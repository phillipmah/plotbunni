import type { PlotBunniDB } from '../db/open';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { ChatTransport } from './transport';

export interface ProseSuggestion { sceneId: string; expectedVersion: number; text: string }

export async function draftProse(opts: {
  transport: ChatTransport;
  system: string;
  sceneId: string;
  sceneVersion: number;
  sceneSynopsis: string;
  context: string;
}): Promise<ProseSuggestion> {
  const text = await opts.transport([
    { role: 'system', content: opts.system },
    { role: 'user', content:
      `Write the full prose for this scene. Return prose only, no preamble.\n\nOutline: ${opts.sceneSynopsis}\n\nContext:\n${opts.context}` },
  ]);
  return { sceneId: opts.sceneId, expectedVersion: opts.sceneVersion, text: text.trim() };
}

export async function acceptProse(db: PlotBunniDB, s: ProseSuggestion): Promise<void> {
  const turnId = newTurnId();
  await dispatch(db, [{
    type: 'update', store: 'scenes', entityId: s.sceneId,
    expectedVersion: s.expectedVersion, actor: 'gen', turnId, patch: { content: s.text },
  }], { actor: 'gen', turnId });
}
