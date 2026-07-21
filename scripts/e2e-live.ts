import 'fake-indexeddb/auto';
import { AppStore } from '../src/app/store';
import { createTransport } from '../src/core/generate/transport';
import { loggingTransport } from '../src/app/debuglog';
import { composeSystemPrompt } from '../src/core/ai/composer';
import { BUILTIN_MODULES } from '../src/core/ai/promptModules';
import { exportNovel } from '../src/app/export';
import { writeFileSync } from 'node:fs';

const SYSTEM = composeSystemPrompt(BUILTIN_MODULES);
const profile = {
  baseUrl: 'https://ollama.com/v1',
  apiKey: process.env.OLLAMA_API_KEY as string,
  model: 'glm-5.2:cloud',
  contextLength: 120000,
  maxOutput: 8000,
};
const t = loggingTransport(createTransport(profile, { retries: 2, timeoutMs: 240000 }));
const log = (...a: unknown[]) => console.log('[e2e]', ...a);

const BRAINDUMP = `A retelling of King Arthur as a hero's journey. Young Arthur, an unknowing heir raised by Sir Ector, pulls the sword Excalibur from the stone and is revealed as rightful king of Britain. Guided by the wizard Merlin he must unite the warring lords, found Camelot and the Round Table, win knights like Lancelot, contend with the sorceress Morgan le Fay and his fated son Mordred, love and lose Guinevere, and face his destiny in a final battle. Keep it to a compact 5-chapter arc: the call, the mentor and the sword, gathering the knights, the betrayal, the last battle.`;

const run = async () => {
  const s = await AppStore.open('e2e');
  const book = await s.ensureBook();
  await s.updateBook(book.id, { title: 'The Once and Future King', synopsis: "King Arthur as a hero's journey." });
  log('book ready');

  log('=== INGEST ===');
  const ing = await s.ingest(t, SYSTEM, book.id, BRAINDUMP);
  log('ingest ->', ing);
  log('entities:', (await s.entries()).map(e => `${e.type}:${e.name}`).join(', '));
  const chapters = await s.chapters(book.id);
  log('chapters:', chapters.map(c => c.title).join(' | '));

  let drafted = 0; const CAP = 15;
  outer: for (const ch of chapters) {
    log(`=== ELABORATE "${ch.title}" ===`);
    const n = await s.elaborate(t, SYSTEM, ch.id, ch.synopsis);
    log(`  -> ${n} scenes`);
    for (const sc of await s.scenes(ch.id)) {
      if (drafted >= CAP) { log(`  (reached ${CAP}-scene draft cap; remaining scenes left as outline)`); break outer; }
      log(`  DRAFT "${sc.title}"…`);
      const sug = await s.draft(t, SYSTEM, sc.id);
      await s.accept(sug);
      drafted++;
      log(`    -> ${sug.text.length} chars :: ${sug.text.slice(0, 140).replace(/\s+/g, ' ')}…`);
    }
  }

  const data = await exportNovel(s.db);
  const outPath = process.env.E2E_OUT ?? new URL('../arthur-export.json', import.meta.url).pathname;
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  log('=== DONE ===', {
    out: outPath,
    entities: (data.stores.bibleEntries as unknown[]).length,
    chapters: (data.stores.chapters as unknown[]).length,
    scenes: (data.stores.scenes as unknown[]).length,
    drafted,
  });
  s.db.close();
};
run().then(() => { log('exit ok'); process.exit(0); })
     .catch(e => { console.error('[e2e] FAILED:', e); process.exit(1); });
