export type WorkspaceFileSearchSource = 'workspace';

export interface WorkspaceFileSearchResult {
  path: string;
  name: string;
  relativePath: string;
  source: WorkspaceFileSearchSource;
}

export const WORKSPACE_SEARCH_EXCLUDED_DIR_NAMES = [
  '.git',
  'node_modules',
  '.cowork-user-data',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.turbo',
] as const;

const WORKSPACE_SEARCH_EXCLUDED_DIR_SET: ReadonlySet<string> = new Set(
  WORKSPACE_SEARCH_EXCLUDED_DIR_NAMES
);

export function isWorkspaceSearchExcludedDirName(name: string): boolean {
  return WORKSPACE_SEARCH_EXCLUDED_DIR_SET.has(name);
}

export function isWorkspaceSearchExcludedPath(filePath: string): boolean {
  return filePath.split(/[\\/]/).some((segment) => isWorkspaceSearchExcludedDirName(segment));
}
