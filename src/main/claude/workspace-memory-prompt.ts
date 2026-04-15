export interface WorkspaceMemoryPromptService {
  buildPromptMemory(workspacePath: string): string;
}

interface BuildFreshSessionWorkspaceMemoryPromptOptions {
  isFreshSession: boolean;
  effectiveCwd: string;
  workspaceMemoryService?: WorkspaceMemoryPromptService;
}

export function buildFreshSessionWorkspaceMemoryPrompt(
  options: BuildFreshSessionWorkspaceMemoryPromptOptions
): string {
  if (!options.isFreshSession || !options.workspaceMemoryService) {
    return '';
  }

  const promptSection = options.workspaceMemoryService.buildPromptMemory(options.effectiveCwd);
  return promptSection.trim() ? promptSection : '';
}
