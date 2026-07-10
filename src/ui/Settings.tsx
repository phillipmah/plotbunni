import { useState } from 'react';
import { loadProfile, saveProfile, DEFAULT_PROFILE } from '../app/settings';
import { testConnection, listModels } from '../core/generate/endpoint';
import type { EndpointProfile } from '../core/generate/transport';

export function Settings({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<EndpointProfile>(loadProfile() ?? DEFAULT_PROFILE);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const set = (k: keyof EndpointProfile) => (e: { target: { value: string } }) =>
    setP({ ...p, [k]: k === 'contextLength' || k === 'maxOutput' ? Number(e.target.value) : e.target.value });

  const test = async () => {
    setBusy('test'); setStatus(null);
    const r = await testConnection(p);
    setStatus(r.ok ? { ok: true, text: 'Connection OK' } : { ok: false, text: r.error ?? 'failed' });
    setBusy('');
  };
  const load = async () => {
    setBusy('list'); setStatus(null);
    try { setModels(await listModels(p)); } catch (e) { setStatus({ ok: false, text: (e as Error).message }); }
    setBusy('');
  };

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h2>Endpoint</h2>
      <div className="field"><label>Base URL (…/v1)</label><input value={p.baseUrl} onChange={set('baseUrl')} /></div>
      <div className="field"><label>API key</label><input type="password" value={p.apiKey} onChange={set('apiKey')} /></div>
      <div className="field">
        <label>Model</label>
        {models.length > 0
          ? <select value={p.model} onChange={set('model')}>{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
          : <input placeholder="e.g. glm-4.6" value={p.model} onChange={set('model')} />}
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label>Context length</label><input value={p.contextLength} onChange={set('contextLength')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Max output</label><input value={p.maxOutput} onChange={set('maxOutput')} /></div>
      </div>
      <div className="row">
        <button onClick={() => { saveProfile(p); onClose(); }}>Save</button>
        <button className="ghost" disabled={!!busy} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
        <button className="ghost" disabled={!!busy} onClick={load}>{busy === 'list' ? 'Loading…' : 'List models'}</button>
      </div>
      {status && <p className={`status ${status.ok ? 'ok' : 'err'}`}>{status.text}</p>}
    </div>
  );
}
