import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expandMentionBlocks } from '../src/main/session/mention-expansion';
import { SessionManager } from '../src/main/session/session-manager';
import type { FileAttachmentContent, Session } from '../src/renderer/types';

describe('mention-expansion', () => {
  it('preserves original mention blocks and adds execution-ready context', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mention-expansion-'));
    const filePath = path.join(tempDir, 'ChatView.tsx');
    fs.writeFileSync(filePath, 'export const ok = true;\n', 'utf8');

    const result = await expandMentionBlocks(tempDir, [
      {
        type: 'file_mention',
        path: filePath,
        name: 'ChatView.tsx',
        workspacePath: tempDir,
        source: 'workspace',
      },
      {
        type: 'skill_mention',
        skillId: 'brainstorming',
        name: 'brainstorming',
        path: '/skills/brainstorming/SKILL.md',
      },
    ]);

    expect(result.contentBlocks.map((block) => block.type)).toContain('file_mention');
    expect(result.contentBlocks.map((block) => block.type)).toContain('skill_mention');
    expect(result.contentBlocks.map((block) => block.type)).not.toContain('file_attachment');
    expect(result.executionContentBlocks.map((block) => block.type)).toContain('file_attachment');
    expect(result.enhancedPrompt).toContain('[Selected skills]');
    expect(result.enhancedPrompt).toContain('[Mentioned files]');
    expect(result.enhancedPrompt).toContain('ChatView.tsx');
  });

  it('copies same-basename mentioned files into distinct .tmp files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mention-collision-'));
    const firstDir = path.join(tempDir, 'src', 'a');
    const secondDir = path.join(tempDir, 'src', 'b');
    fs.mkdirSync(firstDir, { recursive: true });
    fs.mkdirSync(secondDir, { recursive: true });

    const firstPath = path.join(firstDir, 'index.ts');
    const secondPath = path.join(secondDir, 'index.ts');
    fs.writeFileSync(firstPath, 'export const first = true;\n', 'utf8');
    fs.writeFileSync(secondPath, 'export const second = true;\n', 'utf8');

    const expanded = await expandMentionBlocks(tempDir, [
      {
        type: 'file_mention',
        path: firstPath,
        name: 'index.ts',
        workspacePath: tempDir,
        source: 'workspace',
      },
      {
        type: 'file_mention',
        path: secondPath,
        name: 'index.ts',
        workspacePath: tempDir,
        source: 'workspace',
      },
    ]);

    const processFileAttachments = (
      SessionManager.prototype as unknown as {
        processFileAttachments: (session: Session, content: unknown[]) => Promise<unknown[]>;
      }
    ).processFileAttachments;
    const processed = (await processFileAttachments.call(
      { sendToRenderer: vi.fn() },
      {
        id: 'session-1',
        title: 'Test Session',
        status: 'idle',
        cwd: tempDir,
        mountedPaths: [],
        allowedTools: [],
        memoryEnabled: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies Session,
      expanded.executionContentBlocks
    )) as FileAttachmentContent[];

    const attachments = processed.filter((block) => block.type === 'file_attachment');
    expect(attachments).toHaveLength(2);
    expect(new Set(attachments.map((attachment) => attachment.relativePath)).size).toBe(2);
    attachments.forEach((attachment) => {
      expect(fs.existsSync(path.join(tempDir, attachment.relativePath))).toBe(true);
    });
  });

  it('does not duplicate existing attachments when execution-only mention files are appended', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mention-attachments-'));
    const attachmentPath = path.join(tempDir, 'report.pdf');
    const mentionedFilePath = path.join(tempDir, 'src', 'report.ts');
    fs.mkdirSync(path.dirname(mentionedFilePath), { recursive: true });
    fs.writeFileSync(attachmentPath, 'pdf-bytes', 'utf8');
    fs.writeFileSync(mentionedFilePath, 'export const report = true;\n', 'utf8');

    const processPrompt = (
      SessionManager.prototype as unknown as {
        processPrompt: (session: Session, prompt: string, content: unknown[]) => Promise<void>;
      }
    ).processPrompt;
    const session = {
      id: 'session-attachment-mention',
      title: 'Test Session',
      status: 'idle',
      cwd: tempDir,
      mountedPaths: [],
      allowedTools: [],
      memoryEnabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies Session;
    const agentRunner = {
      run: vi.fn().mockResolvedValue(undefined),
    };
    const fakeManager = {
      ensureSandboxInitialized: vi.fn().mockResolvedValue(undefined),
      processFileAttachments: (
        SessionManager.prototype as unknown as {
          processFileAttachments: (session: Session, content: unknown[]) => Promise<unknown[]>;
        }
      ).processFileAttachments,
      getMessages: vi.fn().mockReturnValue([]),
      saveMessage: vi.fn(),
      sendToRenderer: vi.fn(),
      agentRunner,
      db: { sessions: { update: vi.fn() } },
    };

    await processPrompt.call(fakeManager, session, 'check both files', [
      {
        type: 'file_attachment',
        filename: 'report.pdf',
        relativePath: attachmentPath,
        size: fs.statSync(attachmentPath).size,
      },
      {
        type: 'file_mention',
        path: mentionedFilePath,
        name: 'report.ts',
        workspacePath: tempDir,
        source: 'workspace',
      },
      { type: 'text', text: 'check both files' },
    ]);

    const executionUserMessage = agentRunner.run.mock.calls[0]?.[2]?.[0] as {
      content: FileAttachmentContent[];
    };
    const attachmentPaths = executionUserMessage.content
      .filter((block) => block.type === 'file_attachment')
      .map((block) => block.relativePath)
      .sort();

    expect(attachmentPaths).toEqual(['.tmp/report.pdf', '.tmp/report.ts']);
    expect(fs.readdirSync(path.join(tempDir, '.tmp')).sort()).toEqual(['report.pdf', 'report.ts']);
  });
});
