export type WorkspaceFileSearchSource = 'workspace';

export interface WorkspaceFileSearchResult {
  path: string;
  name: string;
  relativePath: string;
  source: WorkspaceFileSearchSource;
}
