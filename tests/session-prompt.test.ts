import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../src/renderer/types';
import { normalizeSessionPromptInput } from '../src/renderer/hooks/session-prompt';

describe('normalizeSessionPromptInput', () => {
  it('preserves the full rich-composer display text while keeping structured content blocks', () => {
    const contentBlocks: ContentBlock[] = [
      { type: 'text', text: 'open ' },
      {
        type: 'file_mention',
        path: '/repo/foo.ts',
        name: 'foo.ts',
        workspacePath: '/repo',
        source: 'workspace',
      },
      { type: 'text', text: ' please\nnext line' },
    ];

    const result = normalizeSessionPromptInput({
      displayText: 'open @foo.ts please\nnext line',
      contentBlocks,
    });

    expect(result.prompt).toBe('open @foo.ts please\nnext line');
    expect(result.content).toEqual(contentBlocks);
  });

  it('falls back to concatenating all text blocks for legacy content-only callers', () => {
    const result = normalizeSessionPromptInput([
      { type: 'text', text: 'open ' },
      { type: 'file_mention', path: '/repo/foo.ts', name: 'foo.ts', workspacePath: '/repo' },
      { type: 'text', text: ' please' },
    ]);

    expect(result.prompt).toBe('open  please');
    expect(result.content).toEqual([
      { type: 'text', text: 'open ' },
      { type: 'file_mention', path: '/repo/foo.ts', name: 'foo.ts', workspacePath: '/repo' },
      { type: 'text', text: ' please' },
    ]);
  });
});
