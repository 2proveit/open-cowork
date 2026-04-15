import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { WorkspaceFileSearchResult } from '../../shared/workspace-file-search';

const EXCLUDED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.cowork-user-data',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.turbo',
]);

interface IndexedWorkspaceFile extends WorkspaceFileSearchResult {
  searchableName: string;
  searchableRelativePath: string;
}

export interface WorkspaceMentionIndex {
  search(query: string): WorkspaceFileSearchResult[];
}

export async function createWorkspaceMentionIndex(
  rootPath: string
): Promise<WorkspaceMentionIndex> {
  const workspaceRoot = path.resolve(rootPath);
  const files = await collectWorkspaceFiles(workspaceRoot);

  return {
    search(query: string): WorkspaceFileSearchResult[] {
      const normalizedQuery = query.trim().toLowerCase();

      if (!normalizedQuery) {
        return [...files]
          .sort((a, b) =>
            a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })
          )
          .map(toSearchResult);
      }

      return files
        .map((file) => ({ file, rank: rankFile(file, normalizedQuery) }))
        .filter((entry) => entry.rank !== null)
        .sort((a, b) => {
          if (!a.rank || !b.rank) {
            return 0;
          }
          if (a.rank.tier !== b.rank.tier) {
            return a.rank.tier - b.rank.tier;
          }
          if (a.rank.position !== b.rank.position) {
            return a.rank.position - b.rank.position;
          }
          if (a.rank.nameLength !== b.rank.nameLength) {
            return a.rank.nameLength - b.rank.nameLength;
          }
          if (a.rank.pathDepth !== b.rank.pathDepth) {
            return a.rank.pathDepth - b.rank.pathDepth;
          }
          return a.file.relativePath.localeCompare(b.file.relativePath, undefined, {
            sensitivity: 'base',
          });
        })
        .map((entry) => toSearchResult(entry.file));
    },
  };
}

async function collectWorkspaceFiles(workspaceRoot: string): Promise<IndexedWorkspaceFile[]> {
  const collected: IndexedWorkspaceFile[] = [];
  const queue: string[] = [workspaceRoot];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current) continue;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIR_NAMES.has(entry.name)) {
          queue.push(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(workspaceRoot, absolutePath);
      collected.push({
        path: absolutePath,
        name: entry.name,
        relativePath,
        source: 'workspace',
        searchableName: entry.name.toLowerCase(),
        searchableRelativePath: relativePath.toLowerCase(),
      });
    }
  }

  return collected;
}

function toSearchResult(file: IndexedWorkspaceFile): WorkspaceFileSearchResult {
  return {
    path: file.path,
    name: file.name,
    relativePath: file.relativePath,
    source: file.source,
  };
}

function rankFile(
  file: IndexedWorkspaceFile,
  normalizedQuery: string
): { tier: number; position: number; nameLength: number; pathDepth: number } | null {
  const namePrefix = file.searchableName.startsWith(normalizedQuery);
  if (namePrefix) {
    return {
      tier: 0,
      position: 0,
      nameLength: file.name.length,
      pathDepth: countPathDepth(file.relativePath),
    };
  }

  const namePosition = file.searchableName.indexOf(normalizedQuery);
  if (namePosition >= 0) {
    return {
      tier: 1,
      position: namePosition,
      nameLength: file.name.length,
      pathDepth: countPathDepth(file.relativePath),
    };
  }

  const pathPrefix = file.searchableRelativePath.startsWith(normalizedQuery);
  if (pathPrefix) {
    return {
      tier: 2,
      position: 0,
      nameLength: file.name.length,
      pathDepth: countPathDepth(file.relativePath),
    };
  }

  const pathPosition = file.searchableRelativePath.indexOf(normalizedQuery);
  if (pathPosition >= 0) {
    return {
      tier: 3,
      position: pathPosition,
      nameLength: file.name.length,
      pathDepth: countPathDepth(file.relativePath),
    };
  }

  return null;
}

function countPathDepth(relativePath: string): number {
  return relativePath.split(/[\\/]/).length;
}
