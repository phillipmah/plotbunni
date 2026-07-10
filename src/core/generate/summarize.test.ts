import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { putEntity, getEntity } from '../db/stores';
import { createScene, type Scene } from '../model/entities';
import { summarizeScene } from './summarize';

const NAME = 'TestDB_summarize';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('summarizeScene', () => {
  it('writes a synopsis from the prose', async () => {
    const db = await openPlotBunniDB(NAME);
    const scene = createScene({ chapterId: 'ch', title: 'Arrival', content: 'Bob stepped into the rain and found the body.' });
    await putEntity(db, 'scenes', scene);

    const transport = async () => 'Bob discovers a body in the rain.';
    const synopsis = await summarizeScene(db, { transport, system: 's', sceneId: scene.id });

    expect(synopsis).toBe('Bob discovers a body in the rain.');
    expect((await getEntity<Scene>(db, 'scenes', scene.id))!.synopsis).toBe('Bob discovers a body in the rain.');
    db.close();
  });
});
