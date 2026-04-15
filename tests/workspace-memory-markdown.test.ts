import { describe, expect, it } from 'vitest';
import type { Message } from '../src/renderer/types';
import {
  buildPromptMemoryText,
  ensureMemoryMarkdown,
  extractSessionMemoryText,
  parseMemoryMarkdown,
  renderMemoryMarkdown,
} from '../src/main/memory/workspace-memory-markdown';
import type { ManagedMemoryState } from '../src/main/memory/workspace-memory-types';

function createManagedState(): ManagedMemoryState {
  return {
    userProfile: ['Prefers direct implementation over long discussion.'],
    habitsAndPreferences: ['Usually works in Chinese.'],
    activeWorkstreams: ['可能正在推进工作区级记忆功能。'],
    recentSessionSummaries: [
      {
        timestamp: '2026-04-15 18:18',
        title: '工作区 MEMORY 设计',
        summary: '确认只在删除会话时归档，并为启动注入设计托管区块。',
        signals: ['只在删除时触发', '手写区不覆盖'],
      },
    ],
  };
}

describe('workspace-memory markdown helpers', () => {
  it('creates a default skeleton when MEMORY.md is missing', () => {
    const markdown = ensureMemoryMarkdown(undefined);
    expect(markdown).toContain('# MEMORY');
    expect(markdown).toContain('<!-- COWORK:MANAGED:START -->');
    expect(markdown).toContain('## Manual Notes');
  });

  it('preserves manual notes while replacing the managed block', () => {
    const current = [
      '# MEMORY',
      '',
      '## Manual Notes',
      'Keep this line.',
      '',
      '<!-- COWORK:MANAGED:START -->',
      'old block',
      '<!-- COWORK:MANAGED:END -->',
      '',
    ].join('\n');
    const rendered = renderMemoryMarkdown(current, createManagedState());
    expect(rendered).toContain('Keep this line.');
    expect(rendered).toContain('### User Profile');
    expect(rendered).not.toContain('old block');
  });

  it('parses managed sections into structured state', () => {
    const parsed = parseMemoryMarkdown(renderMemoryMarkdown(undefined, createManagedState()));
    expect(parsed.managed.userProfile).toEqual([
      'Prefers direct implementation over long discussion.',
    ]);
    expect(parsed.managed.recentSessionSummaries[0]?.signals).toEqual([
      '只在删除时触发',
      '手写区不覆盖',
    ]);
  });

  it('extracts only memory-relevant text blocks from messages', () => {
    const messages: Message[] = [
      {
        id: 'u1',
        sessionId: 's1',
        role: 'user',
        timestamp: 1,
        content: [{ type: 'text', text: '请在删除会话时写入 MEMORY.md' }],
      },
      {
        id: 'a1',
        sessionId: 's1',
        role: 'assistant',
        timestamp: 2,
        content: [
          { type: 'text', text: '我会把逻辑放进 WorkspaceMemoryService。' },
          { type: 'tool_result', toolUseId: 'tool-1', content: 'large tool output' },
        ],
      },
    ];
    expect(extractSessionMemoryText(messages)).toEqual([
      { role: 'user', text: '请在删除会话时写入 MEMORY.md' },
      { role: 'assistant', text: '我会把逻辑放进 WorkspaceMemoryService。' },
    ]);
  });

  it('trims prompt memory by keeping managed block before manual notes', () => {
    const markdown = renderMemoryMarkdown(
      '# MEMORY\n\n## Manual Notes\n' + 'manual line\n'.repeat(80),
      createManagedState()
    );
    const promptText = buildPromptMemoryText(markdown, {
      maxChars: 240,
      maxFileChars: 4000,
    });
    expect(promptText).toContain('### User Profile');
    expect(promptText).toContain('[truncated]');
  });
});
