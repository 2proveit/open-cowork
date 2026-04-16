import { describe, expect, it } from 'vitest';
import { createUniqueAttachmentFilename } from '../src/main/session/attachment-filename';

describe('createUniqueAttachmentFilename', () => {
  it('keeps distinct mentioned files with the same basename from colliding', () => {
    const usedNames = new Set<string>();

    const first = createUniqueAttachmentFilename({
      requestedName: 'index.ts',
      sourcePath: '/repo/src/a/index.ts',
      usedNames,
    });
    const second = createUniqueAttachmentFilename({
      requestedName: 'index.ts',
      sourcePath: '/repo/src/b/index.ts',
      usedNames,
    });

    expect(first).toBe('index.ts');
    expect(second).not.toBe(first);
    expect(second).toContain('repo__src__b__index.ts');
  });
});
