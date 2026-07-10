import { useState } from 'react';
import { loadProfile, saveProfile, DEFAULT_PROFILE } from '../app/settings';
import type { EndpointProfile } from '../core/generate/transport';

export function Settings({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<EndpointProfile>(loadProfile() ?? DEFAULT_PROFILE);
  const set = (k: keyof EndpointProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP({ ...p, [k]: k === 'contextLength' || k === 'maxOutput' ? Number(e.target.value) : e.target.value });
  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <h2>Endpoint</h2>
      <div className="row"><input placeholder="Base URL (…/v1)" value={p.baseUrl} onChange={set('baseUrl')} /></div>
      <div className="row"><input placeholder="API key" value={p.apiKey} onChange={set('apiKey')} /></div>
      <div className="row"><input placeholder="Model (e.g. glm-4.6)" value={p.model} onChange={set('model')} /></div>
      <div className="row">
        <input placeholder="Context length" value={p.contextLength} onChange={set('contextLength')} />
        <input placeholder="Max output" value={p.maxOutput} onChange={set('maxOutput')} />
      </div>
      <div className="row"><button onClick={() => { saveProfile(p); onClose(); }}>Save</button></div>
    </div>
  );
}
