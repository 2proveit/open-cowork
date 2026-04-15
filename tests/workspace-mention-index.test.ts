import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceMentionIndex } from '../src/main/utils/workspace-mention-index';

const tempDirs: string[] = [];

async function createWorkspaceFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-mention-index-'));
  tempDirs.push(root);

  await fs.mkdir(path.join(root, 'src', 'views'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', 'features'), { recursive: true });

  await fs.writeFile(path.join(root, 'src', 'views', 'ChatView.tsx'), 'export {};', 'utf-8');
  await fs.writeFile(path.join(root, 'docs', 'features', 'chatting-guide.md'), '# guide', 'utf-8');
  await fs.writeFile(path.join(root, 'src', 'views', 'Other.tsx'), 'export {};', 'utf-8');

  return root;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('createWorkspaceMentionIndex', () => {
  it('recursively indexes workspace files and returns filename prefix matches first', async () => {
    const root = await createWorkspaceFixture();
    const index = await createWorkspaceMentionIndex(root);

    const results = index.search('chat');
    expect(results).toHaveLength(2);
    expect(results[0]?.name).toBe('ChatView.tsx');
    expect(results[0]).toMatchObject({
      path: path.join(root, 'src', 'views', 'ChatView.tsx'),
      relativePath: path.join('src', 'views', 'ChatView.tsx'),
      source: 'workspace',
    });
    expect(results[1]?.name).toBe('chatting-guide.md');
  });
});
