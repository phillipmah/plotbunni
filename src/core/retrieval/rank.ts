import type { Candidate, CandidateSource } from './candidates';

const SOURCE_WEIGHT: Record<CandidateSource, number> = {
  linked: 100, 'always-on': 90, keyword: 50, graph: 20,
};

export interface RankedCandidate extends Candidate { score: number }

export function rankCandidates(cands: Candidate[]): RankedCandidate[] {
  return cands
    .map(c => ({
      ...c,
      score: Math.max(...c.sources.map(s => SOURCE_WEIGHT[s])) + c.entry.priority,
    }))
    .sort((a, b) => b.score - a.score);
}
