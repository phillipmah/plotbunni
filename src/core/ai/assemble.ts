import { composeSystemPrompt } from './composer';
import { packContext, type PackItem } from './packer';
import { countTokens } from './tokenizer';
import type { PromptModule } from './promptModules';

export interface AssembleInput {
  modules: PromptModule[];
  taskBase?: string;
  contextItems: PackItem[];
  budget: number;
  userMessage: string;
}

export interface AssembledPrompt {
  system: string;
  messages: { role: 'user'; content: string }[];
  breakdown: { systemTokens: number; contextTokens: number; userTokens: number; droppedItems: number };
}

export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const modules: PromptModule[] = input.taskBase
    ? [...input.modules, {
        id: 'task-base', kind: 'task-base', name: 'Task', order: 1000, enabled: true, content: input.taskBase,
      }]
    : input.modules;

  const system = composeSystemPrompt(modules);
  const { packed, dropped } = packContext(input.contextItems, input.budget);
  const contextBlock = packed.map(p => p.content).join('\n\n');
  const userContent = contextBlock ? `${contextBlock}\n\n---\n\n${input.userMessage}` : input.userMessage;

  return {
    system,
    messages: [{ role: 'user', content: userContent }],
    breakdown: {
      systemTokens: countTokens(system),
      contextTokens: countTokens(contextBlock),
      userTokens: countTokens(input.userMessage),
      droppedItems: dropped.length,
    },
  };
}
