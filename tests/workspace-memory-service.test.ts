import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
