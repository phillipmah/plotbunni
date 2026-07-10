import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { putEntity, getEntity } from '../db/stores';
import { createScene, type Scene } from '../model/entities';
import { draftProse, acceptProse } from './prose';

const NAME = 'TestDB_prose';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('draftProse / acceptProse', () => {
  it('drafts free text without mutating, then applies on accept', async () => {
    const db = await openPlotBunniDB(NAME);
    const scene = createScene({ chapterId: 'ch-1', title: 'Arrival' }); // version 1
    await putEntity(db, 'scenes', scene);

    const transport = async () => 'Bob stepped into the rain.';
    const suggestion = await draftProse({
      transport, system: 's', sceneId: scene.id, sceneVersion: scene.version,
      sceneSynopsis: 'Bob arrives', context: 'noir',
    });
    expect(suggestion.text).toBe('Bob stepped into the rain.');
    // not applied yet
    expect((await getEntity<Scene>(db, 'scenes', scene.id))!.content).toBe('');

    await acceptProse(db, suggestion);
    const after = (await getEntity<Scene>(db, 'scenes', scene.id))!;
    expect(after.content).toBe('Bob stepped into the rain.');
    expect(after.version).toBe(2);
    db.close();
  });
});
