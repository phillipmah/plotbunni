import { gatherCandidates, type GatherInput } from './candidates';
import { rankCandidates } from './rank';
import { renderView, type ViewLevel } from './views';
import { countTokens } from '../ai/tokenizer';
import type { PackItem } from '../ai/packer';

export interface RetrieveInput extends GatherInput { view?: ViewLevel }

export function retrieve(input: RetrieveInput): PackItem[] {
  const view = input.view ?? 'brief';
  const ranked = rankCandidates(gatherCandidates(input));
  return ranked.map(rc => {
    const content = renderView(rc.entry, view);
    return { id: rc.entry.id, content, tokens: countTokens(content), priority: rc.score };
  });
}
