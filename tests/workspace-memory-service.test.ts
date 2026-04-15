import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../src/renderer/types';
import { WorkspaceMemoryService } from '../src/main/memory/workspace-memory-service';

const generator = {
  generate: vi.fn(async () => ({
    userProfile: ['Prefers direct execution.'],
    habitsAndPreferences: ['会要求先写设计再实现。'],
    activeWorkstreams: ['可能正在实现工作区记忆注入。'],
    recentSessionSummary: {
      timestamp: '2026-04-15 18:18',
      title: '实现计划',
      summary: '拆出了 WorkspaceMemoryService 和生成器边界。',
      signals: ['只改托管区'],
    },
  })),
};

describe('WorkspaceMemoryService', () => {
  it('creates MEMORY.md and writes a managed block on first archive', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-memory-'));
    const service = new WorkspaceMemoryService(generator as never);
    const session = { id: 's1', cwd: workspace } as Session;

    await service.archiveSessionToMemory({
      session,
      messages: [
        {
          id: 'm1',
          sessionId: 's1',
          role: 'user',
          timestamp: 1,
          content: [{ type: 'text', text: '请在删除会话时写入 MEMORY.md' }],
        },
      ],
    });

    const markdown = fs.readFileSync(path.join(workspace, 'MEMORY.md'), 'utf8');
    expect(markdown).toContain('## Manual Notes');
    expect(markdown).toContain('### Habits And Preferences');
    expect(markdown).toContain('实现计划');
  });

  it('does not overwrite a file when managed markers are malformed', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-memory-'));
    const file = path.join(workspace, 'MEMORY.md');
    fs.writeFileSync(file, '# MEMORY\n<!-- COWORK:MANAGED:START -->\nmissing end');
    const service = new WorkspaceMemoryService(generator as never);
    const session = { id: 's2', cwd: workspace } as Session;

    await expect(
      service.archiveSessionToMemory({
        session,
        messages: [],
      })
    ).rejects.toThrow('Invalid managed memory markers');
  });

  it('builds prompt memory with trimming and wrapper text', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-memory-'));
    fs.writeFileSync(
      path.join(workspace, 'MEMORY.md'),
      '# MEMORY\n\n## Manual Notes\n' + 'manual\n'.repeat(120)
    );
    const service = new WorkspaceMemoryService(generator as never, {
      promptMaxChars: 240,
      fileMaxChars: 4000,
    });
    const promptText = service.buildPromptMemory(workspace);
    expect(promptText).toContain('<workspace_memory>');
    expect(promptText).toContain('[truncated]');
  });

  it('skips generator and write for empty or tool-only sessions', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-memory-'));
    const memoryFile = path.join(workspace, 'MEMORY.md');
    fs.writeFileSync(memoryFile, '# MEMORY\n\n## Manual Notes\nmanual');
    const before = fs.readFileSync(memoryFile, 'utf8');

    const localGenerator = {
      generate: vi.fn(async () => ({
        userProfile: ['x'],
        habitsAndPreferences: ['x'],
        activeWorkstreams: ['x'],
        recentSessionSummary: {
          timestamp: '2026-04-15 18:18',
          summary: 'x',
          signals: [],
        },
      })),
    };
    const service = new WorkspaceMemoryService(localGenerator as never);
    const session = { id: 's3', cwd: workspace } as Session;

    await service.archiveSessionToMemory({ session, messages: [] });
    await service.archiveSessionToMemory({
      session,
      messages: [
        {
          id: 'm-tool',
          sessionId: 's3',
          role: 'assistant',
          timestamp: 1,
          content: [{ type: 'tool_result', toolUseId: 't1', content: 'only-tool-output' }],
        },
      ],
    });

    const after = fs.readFileSync(memoryFile, 'utf8');
    expect(localGenerator.generate).not.toHaveBeenCalled();
    expect(after).toBe(before);
  });

  it('returns empty prompt memory when managed markers are malformed', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-memory-'));
    fs.writeFileSync(
      path.join(workspace, 'MEMORY.md'),
      '# MEMORY\n\n## Manual Notes\nx\n\n<!-- COWORK:MANAGED:START -->\nmissing end'
    );
    const service = new WorkspaceMemoryService(generator as never);

    expect(service.buildPromptMemory(workspace)).toBe('');
  });

  it('merges with newest-first ordering, dedupe, summary window, and bounded growth', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-memory-'));
    const localGenerator = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          userProfile: [],
          habitsAndPreferences: [],
          activeWorkstreams: ['ws-new-1', 'ws-old-2'],
          recentSessionSummary: {
            timestamp: '2026-04-15 19:00',
            title: 'new-1',
            summary: 'new-1',
            signals: [],
          },
        })
        .mockResolvedValueOnce({
          userProfile: [],
          habitsAndPreferences: [],
          activeWorkstreams: ['ws-new-2'],
          recentSessionSummary: {
            timestamp: '2026-04-15 19:30',
            title: 'new-2',
            summary: 'new-2',
            signals: [],
          },
        }),
    };
    const service = new WorkspaceMemoryService(localGenerator as never, {
      recentSummaryLimit: 2,
      managedListMaxItems: 3,
    });
    const session = { id: 's4', cwd: workspace } as Session;

    fs.writeFileSync(
      path.join(workspace, 'MEMORY.md'),
      [
        '# MEMORY',
        '',
        '## Manual Notes',
        'manual',
        '',
        '<!-- COWORK:MANAGED:START -->',
        '### User Profile',
        '- (empty)',
        '',
        '### Habits And Preferences',
        '- (empty)',
        '',
        '### Active Workstreams',
        '- ws-old-1',
        '- ws-old-2',
        '',
        '### Recent Session Summaries',
        '#### 2026-04-15 18:00 | old-1',
        '- Summary: old-1',
        '#### 2026-04-15 18:30 | old-2',
        '- Summary: old-2',
        '<!-- COWORK:MANAGED:END -->',
        '',
      ].join('\n')
    );

    await service.archiveSessionToMemory({
      session,
      messages: [
        {
          id: 'm-1',
          sessionId: 's4',
          role: 'user',
          timestamp: 1,
          content: [{ type: 'text', text: 'first' }],
        },
      ],
    });
    await service.archiveSessionToMemory({
      session,
      messages: [
        {
          id: 'm-2',
          sessionId: 's4',
          role: 'user',
          timestamp: 2,
          content: [{ type: 'text', text: 'second' }],
        },
      ],
    });

    const markdown = fs.readFileSync(path.join(workspace, 'MEMORY.md'), 'utf8');
    const workstreamsSection = markdown.match(
      /### Active Workstreams\n([\s\S]*?)\n### Recent Session Summaries/
    )?.[1];
    const summaryHeadings =
      markdown.match(/#### [^\n]+/g)?.map((line) => line.replace(/^####\s+/, '')) ?? [];

    expect(workstreamsSection).toContain('- ws-new-2');
    expect(workstreamsSection).toContain('- ws-new-1');
    expect(workstreamsSection).toContain('- ws-old-2');
    expect(workstreamsSection).not.toContain('- ws-old-1');
    expect(summaryHeadings).toEqual(['2026-04-15 19:30 | new-2', '2026-04-15 19:00 | new-1']);
  });
});
