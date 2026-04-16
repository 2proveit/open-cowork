import { describe, expect, it, vi } from 'vitest';
import { revealFileInShell } from '../src/renderer/components/message/reveal-file';

describe('revealFileInShell', () => {
  it('does nothing when showItemInFolder is unavailable', async () => {
    const onFailure = vi.fn();

    await revealFileInShell({
      filePath: '/tmp/example.ts',
      cwd: '/tmp',
      onFailure,
    });

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports a failure when showItemInFolder returns false', async () => {
    const onFailure = vi.fn();

    await revealFileInShell({
      filePath: '/tmp/example.ts',
      cwd: '/tmp',
      showItemInFolder: vi.fn().mockResolvedValue(false),
      onFailure,
    });

    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('reports a failure when showItemInFolder throws', async () => {
    const onFailure = vi.fn();
    const error = new Error('boom');

    await revealFileInShell({
      filePath: '/tmp/example.ts',
      cwd: '/tmp',
      showItemInFolder: vi.fn().mockRejectedValue(error),
      onFailure,
    });

    expect(onFailure).toHaveBeenCalledWith(error);
  });
});
