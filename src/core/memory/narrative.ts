import type { Chapter, Scene } from '../model/entities';

export function buildNarrativeMemory(input: {
  orderedChapters: Chapter[];
  scenesByChapter: Record<string, Scene[]>;
  targetSceneId: string;
  precedingScenes?: number;
}): string {
  const { orderedChapters, scenesByChapter, targetSceneId, precedingScenes = 2 } = input;

  let targetChIdx = -1;
  let targetScIdx = -1;
  orderedChapters.forEach((ch, ci) => {
    const scenes = scenesByChapter[ch.id] ?? [];
    const si = scenes.findIndex(s => s.id === targetSceneId);
    if (si >= 0) { targetChIdx = ci; targetScIdx = si; }
  });
  if (targetChIdx < 0) return '';

  const parts: string[] = [];
  orderedChapters.forEach((ch, ci) => {
    if (ci < targetChIdx) {
      if (ch.synopsis) parts.push(`Chapter "${ch.title}": ${ch.synopsis}`);
    } else if (ci === targetChIdx) {
      const scenes = scenesByChapter[ch.id] ?? [];
      const start = Math.max(0, targetScIdx - precedingScenes);
      for (let i = start; i < targetScIdx; i++) {
        const s = scenes[i]!;
        if (s.synopsis) parts.push(`Scene "${s.title}": ${s.synopsis}`);
      }
    }
  });
  return parts.join('\n');
}
