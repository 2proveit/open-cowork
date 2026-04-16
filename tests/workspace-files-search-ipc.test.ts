import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');
const mainIndexPath = path.resolve(process.cwd(), 'src/main/index.ts');

describe('workspace files search IPC', () => {
  it('allows the preload API to pass an explicit workspace path for mention search', () => {
    const source = fs.readFileSync(preloadPath, 'utf8');

    expect(source).toContain(
      'searchFiles: (query: string, workspacePath?: string): Promise<WorkspaceFileSearchResult[]> =>'
    );
    expect(source).toContain("ipcRenderer.invoke('workspace.files.search', query, workspacePath)");
  });

  it('searches the requested workspace instead of always using the global cwd', () => {
    const source = fs.readFileSync(mainIndexPath, 'utf8');

    expect(source).toContain(
      "ipcMain.handle('workspace.files.search', async (_event, query: string, workspacePath?: string) => {"
    );
    expect(source).toContain('const index = await getWorkspaceMentionIndex(workspacePath);');
  });
});
