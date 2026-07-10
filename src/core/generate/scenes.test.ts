import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities } from '../db/stores';
import { elaborateScenes } from './scenes';
import type { Scene } from '../model/entities';

const NAME = 'TestDB_scenes';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('elaborateScenes', () => {
  it('creates scenes under the chapter from one structured reply', async () => {
    const db = await openPlotBunniDB(NAME);
    const transport = async () => JSON.stringify({
      scenes: [
        { title: 'Arrival', synopsis: 'Bob arrives in the rain.' },
        { title: 'The parlor', synopsis: 'Vivian deflects.' },
      ],
    });
    const n = await elaborateScenes(db, { transport, system: 's', chapterId: 'ch-1', chapterSynopsis: 'Bob visits the widow.' });
    expect(n).toBe(2);
    const scenes = await getAllEntities<Scene>(db, 'scenes');
    expect(scenes.map(s => s.title).sort()).toEqual(['Arrival', 'The parlor'].sort());
    expect(scenes.every(s => s.chapterId === 'ch-1')).toBe(true);
    db.close();
  });
});
