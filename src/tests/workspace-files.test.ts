import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorkspaceChildren, isMarkdownPath } from '../main/workspace-files';

describe('workspace-files helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-files-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists immediate children with directories first and marks expandable folders', () => {
    fs.mkdirSync(path.join(tmpDir, 'b-dir', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'a-dir'));
    fs.writeFileSync(path.join(tmpDir, 'z-last.md'), '# note');
    fs.writeFileSync(path.join(tmpDir, 'm-middle.txt'), 'text');

    const children = listWorkspaceChildren(tmpDir);

    expect(children.map((item) => item.name)).toEqual([
      'a-dir',
      'b-dir',
      'm-middle.txt',
      'z-last.md',
    ]);
    expect(children[0]).toMatchObject({
      type: 'directory',
      hasChildren: false,
    });
    expect(children[1]).toMatchObject({
      type: 'directory',
      hasChildren: true,
    });
    expect(children[3]).toMatchObject({
      type: 'file',
      hasChildren: false,
    });
  });

  it('recognizes markdown paths case-insensitively', () => {
    expect(isMarkdownPath('/repo/docs/readme.md')).toBe(true);
    expect(isMarkdownPath('/repo/docs/README.MD')).toBe(true);
    expect(isMarkdownPath('/repo/docs/readme.txt')).toBe(false);
  });
});
