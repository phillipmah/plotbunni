import { useEffect, useState, useCallback } from 'react';
import { AppStore } from '../app/store';
import { loadProfile } from '../app/settings';
import { createTransport } from '../core/generate/transport';
import { composeSystemPrompt } from '../core/ai/composer';
import { BUILTIN_MODULES } from '../core/ai/promptModules';
import type { ProseSuggestion } from '../core/generate/prose';
import type { Book, Chapter, Scene, BibleEntry } from '../core/model/entities';
import { Settings } from './Settings';
import { exportNovel } from '../app/export';
import { downloadJson } from '../app/persist';

const SYSTEM = composeSystemPrompt(BUILTIN_MODULES);

export function App() {
  const [store, setStore] = useState<AppStore | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [entries, setEntries] = useState<BibleEntry[]>([]);
  const [scenesByCh, setScenesByCh] = useState<Record<string, Scene[]>>({});
  const [sel, setSel] = useState<{ kind: 'chapter' | 'scene'; id: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [monologue, setMonologue] = useState('');
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<ProseSuggestion | null>(null);

  const say = (m: string) => setLog(l => [...l, m]);

  const refresh = useCallback(async (s: AppStore, b: Book) => {
    const chs = await s.chapters(b.id);
    setChapters(chs);
    const map: Record<string, Scene[]> = {};
    for (const c of chs) map[c.id] = await s.scenes(c.id);
    setScenesByCh(map);
    setEntries(await s.entries());
  }, []);

  useEffect(() => {
    (async () => {
      const s = await AppStore.open();
      const b = await s.ensureBook();
      setStore(s); setBook(b); await refresh(s, b);
    })();
  }, [refresh]);

  const transport = () => {
    const p = loadProfile();
    if (!p || !p.baseUrl || !p.model) { setShowSettings(true); throw new Error('configure endpoint first'); }
    return createTransport(p);
  };

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { say(`⚠ ${(e as Error).message}`); } finally { setBusy(''); }
  };

  if (showSettings) return <Settings onClose={() => setShowSettings(false)} />;
  if (!store || !book) return <div style={{ padding: 24 }}>Loading…</div>;

  const selChapter = sel?.kind === 'chapter' ? chapters.find(c => c.id === sel.id) : undefined;
  const selScene = sel?.kind === 'scene'
    ? Object.values(scenesByCh).flat().find(s => s.id === sel.id) : undefined;

  return (
    <div className="app">
      <div className="pane">
        <div className="row"><button className="ghost" onClick={() => setShowSettings(true)}>⚙ Endpoint</button></div>
        <h3>{book.title}</h3>
        {chapters.map(c => (
          <div key={c.id}>
            <div className={`tree-item ${sel?.id === c.id ? 'sel' : ''}`} onClick={() => setSel({ kind: 'chapter', id: c.id })}>▸ {c.title}</div>
            {(scenesByCh[c.id] ?? []).map(s => (
              <div key={s.id} className={`tree-item scene ${sel?.id === s.id ? 'sel' : ''}`} onClick={() => setSel({ kind: 'scene', id: s.id })}>{s.title}</div>
            ))}
          </div>
        ))}
        <h3>Story Bible</h3>
        {entries.map(e => <div key={e.id} className="tree-item">{e.name} — {e.type}</div>)}
      </div>

      <div className="pane">
        {!sel && <p style={{ opacity: .6 }}>Brain-dump your premise in the agent panel → the AI extracts characters and chapters. Then pick a chapter to elaborate scenes, and a scene to draft prose.</p>}
        {selChapter && (
          <div>
            <h2>{selChapter.title}</h2>
            <p className="prose">{selChapter.synopsis}</p>
            <button disabled={!!busy} onClick={() => guard('Elaborating scenes…', async () => {
              await store.elaborate(transport(), SYSTEM, selChapter.id, selChapter.synopsis);
              await refresh(store, book); say(`Elaborated scenes for “${selChapter.title}”.`);
            })}>{busy || 'Elaborate scenes'}</button>
          </div>
        )}
        {selScene && (
          <div>
            <h2>{selScene.title}</h2>
            <p className="prose" style={{ opacity: .7 }}>{selScene.synopsis}</p>
            <div className="prose">{selScene.content || <em style={{ opacity: .5 }}>No prose yet.</em>}</div>
            <div className="row">
              <button disabled={!!busy} onClick={() => guard('Drafting prose…', async () => {
                const sug = await store.draft(transport(), SYSTEM, selScene.id);
                setSuggestion(sug); say('Drafted prose — review below.');
              })}>{busy || 'Draft prose'}</button>
            </div>
            {suggestion && suggestion.sceneId === selScene.id && (
              <div className="suggestion">
                <div className="prose">{suggestion.text}</div>
                <div className="row">
                  <button onClick={() => guard('Applying…', async () => {
                    await store.accept(suggestion); setSuggestion(null); await refresh(store, book); say('Prose accepted.');
                  })}>Accept</button>
                  <button className="ghost" onClick={() => setSuggestion(null)}>Reject</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pane agent">
        <h3>Agent</h3>
        <textarea rows={5} placeholder="Brain-dump your story premise…" value={monologue} onChange={e => setMonologue(e.target.value)} />
        <div className="row">
          <button disabled={!!busy} onClick={() => guard('Ingesting…', async () => {
            const r = await store.ingest(transport(), SYSTEM, book.id, monologue);
            setMonologue(''); await refresh(store, book); say(`Created ${r.entities} entities, ${r.chapters} chapters.`);
          })}>{busy || 'Ingest brain-dump'}</button>
          <button className="ghost" disabled={!!busy} onClick={() => guard('Undoing…', async () => {
            await store.undoLast(); await refresh(store, book); say('Undid last change.');
          })}>Undo</button>
          <button className="ghost" disabled={!!busy} onClick={() => guard('Exporting…', async () => {
            const data = await exportNovel(store.db);
            downloadJson(`${book.title.replace(/\s+/g, '-').toLowerCase()}.json`, data);
            say('Exported novel JSON.');
          })}>Export</button>
        </div>
        {log.map((m, i) => <div key={i} className="msg">{m}</div>)}
      </div>
    </div>
  );
}
