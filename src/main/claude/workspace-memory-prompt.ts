export interface WorkspaceMemoryPromptService {
  buildPromptMemory(workspacePath: string): string;
}

interface BuildFreshSessionWorkspaceMemoryPromptOptions {
  isFreshSession: boolean;
  workspacePath?: string;
  workspaceMemoryService?: WorkspaceMemoryPromptService;
}

export function buildFreshSessionWorkspaceMemoryPrompt(
  options: BuildFreshSessionWorkspaceMemoryPromptOptions
): string {
  if (!options.isFreshSession || !options.workspaceMemoryService || !options.workspacePath) {
    return '';
  }

  const promptSection = options.workspaceMemoryService.buildPromptMemory(options.workspacePath);
  return promptSection.trim() ? promptSection : '';
}
