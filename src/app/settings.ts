import type { EndpointProfile } from '../core/generate/transport';

const KEY = 'plotbunni:endpoint';

export const DEFAULT_PROFILE: EndpointProfile = {
  baseUrl: '', apiKey: '', model: '', contextLength: 32000, maxOutput: 8000,
};

export function loadProfile(): EndpointProfile | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as EndpointProfile; } catch { return null; }
}

export function saveProfile(p: EndpointProfile): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
