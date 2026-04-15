import fs from 'fs';
import { getUnsupportedWorkspacePathReason } from './workspace-path-constraints';

export type InitialWorkspaceResolutionReason = 'missing' | 'invalid' | 'unsupported' | null;

type ResolveInitialWorkspaceInput = {
  persistedWorkspacePath?: string | null;
  platform: NodeJS.Platform;
  sandboxEnabled: boolean;
  directoryExists?: (path: string) => boolean;
  directoryAccessible?: (path: string) => boolean;
};

type InitialWorkspaceResolution = {
  workspacePath: string | null;
  requiresSelection: boolean;
  reason: InitialWorkspaceResolutionReason;
};

function defaultDirectoryExists(path: string): boolean {
  try {
    return fs.existsSync(path) && fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function defaultDirectoryAccessible(path: string): boolean {
  try {
    fs.accessSync(path, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveInitialWorkspace({
  persistedWorkspacePath,
  platform,
  sandboxEnabled,
  directoryExists = defaultDirectoryExists,
  directoryAccessible = defaultDirectoryAccessible,
}: ResolveInitialWorkspaceInput): InitialWorkspaceResolution {
  const candidatePath = persistedWorkspacePath?.trim();
  if (!candidatePath) {
    return {
      workspacePath: null,
      requiresSelection: true,
      reason: 'missing',
    };
  }

  const unsupportedReason = getUnsupportedWorkspacePathReason({
    platform,
    sandboxEnabled,
    workspacePath: candidatePath,
  });
  if (unsupportedReason) {
    return {
      workspacePath: null,
      requiresSelection: true,
      reason: 'unsupported',
    };
  }

  if (!directoryExists(candidatePath) || !directoryAccessible(candidatePath)) {
    return {
      workspacePath: null,
      requiresSelection: true,
      reason: 'invalid',
    };
  }

  return {
    workspacePath: candidatePath,
    requiresSelection: false,
    reason: null,
  };
}
