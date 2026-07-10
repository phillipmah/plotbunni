export type PromptModuleKind = 'director-voice' | 'pov' | 'narrative-tracking' | 'task-base';

export interface PromptModule {
  id: string;
  kind: PromptModuleKind;
  name: string;
  content: string;
  enabled: boolean;
  order: number;
}

export const BUILTIN_MODULES: PromptModule[] = [
  {
    id: 'core-voice', kind: 'director-voice', name: 'Core narrator', order: 0, enabled: true,
    content:
      'You are an experienced novelist and a sharp writing partner. Prose is vivid, ' +
      'concrete, and economical. Show through action and sensory detail; avoid cliché and filler.',
  },
  {
    id: 'pov-third-past', kind: 'pov', name: 'Third person, past tense', order: 10, enabled: true,
    content:
      'Write in third-person limited, past tense, staying inside the point-of-view ' +
      'character for the scene unless told otherwise.',
  },
  {
    id: 'continuity', kind: 'narrative-tracking', name: 'Continuity', order: 20, enabled: true,
    content:
      'Honor established facts about characters, places, and prior events. Do not contradict ' +
      'canon or introduce information the point-of-view character could not know.',
  },
];
