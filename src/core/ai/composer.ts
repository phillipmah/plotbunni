import type { PromptModule } from './promptModules';

export function composeSystemPrompt(modules: PromptModule[]): string {
  return modules
    .filter(m => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map(m => m.content.trim())
    .filter(c => c.length > 0)
    .join('\n\n');
}
