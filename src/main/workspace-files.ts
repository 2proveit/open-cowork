import fs from 'fs';
import path from 'path';
import type { WorkspaceTreeNode } from '../renderer/types';

export function isMarkdownPath(filePath: string): boolean {
  return /\.md$/i.test(filePath);
}

export function listWorkspaceChildren(dirPath: string): WorkspaceTreeNode[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  return entries
    .map<WorkspaceTreeNode>((entry) => {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return {
          path: entryPath,
          name: entry.name,
          type: 'directory',
          hasChildren: hasDirectoryChildren(entryPath),
        };
      }

      return {
        path: entryPath,
        name: entry.name,
        type: 'file',
        hasChildren: false,
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

function hasDirectoryChildren(dirPath: string): boolean {
  try {
    return fs.readdirSync(dirPath).length > 0;
  } catch {
    return false;
  }
}
