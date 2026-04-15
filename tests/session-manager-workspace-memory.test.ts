import { describe, expect, it, vi } from 'vitest';
import type { DatabaseInstance } from '../src/main/db/database';
import { SessionManager } from '../src/main/session/session-manager';

vi.mock('../src/main/claude/agent-runner', () => ({
  ClaudeAgentRunner: class {
    run = vi.fn();
    cancel = vi.fn();
  },
}));

function makeDb(overrides: Partial<DatabaseInstance> = {}): DatabaseInstance {
  return {
    sessions: {
      create: vi.fn(),
      get: vi.fn(() => ({
        id: 's1',
        title: 'Session',
        claude_session_id: null,
        openai_thread_id: null,
        status: 'idle',
        cwd: '/tmp/workspace',
        mounted_paths: '[]',
        allowed_tools: '[]',
        memory_enabled: 0,
        model: null,
        created_at: 1,
        updated_at: 1,
      })),
      getAll: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    },
    messages: {
      create: vi.fn(),
      getBySessionId: vi.fn(() => [
        {
          id: 'm1',
          session_id: 's1',
          role: 'user',
          content: JSON.stringify([{ type: 'text', text: 'archive this session' }]),
          timestamp: 1,
          token_usage: null,
          execution_time_ms: null,
        },
      ]),
      delete: vi.fn(),
      deleteBySessionId: vi.fn(),
    },
    traceSteps: {
      create: vi.fn(),
      update: vi.fn(),
      getBySessionId: vi.fn(() => []),
      deleteBySessionId: vi.fn(),
    },
    ...overrides,
  } as unknown as DatabaseInstance;
}

describe('SessionManager workspace memory integration', () => {
  it('archives session memory before deleting the session row', async () => {
    const db = makeDb();
    const workspaceMemoryService = {
      archiveSessionToMemory: vi.fn().mockResolvedValue(undefined),
      buildPromptMemory: vi.fn().mockReturnValue(''),
    };
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService as never);

    await manager.deleteSession('s1');

    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ id: 's1', cwd: '/tmp/workspace' }),
      })
    );
    expect(db.sessions.delete).toHaveBeenCalledWith('s1');
  });

  it('swallows archive failures and still deletes the session', async () => {
    const db = makeDb();
    const workspaceMemoryService = {
      archiveSessionToMemory: vi.fn().mockRejectedValue(new Error('generator failed')),
      buildPromptMemory: vi.fn().mockReturnValue(''),
    };
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService as never);

    await expect(manager.deleteSession('s1')).resolves.toBeUndefined();
    expect(db.sessions.delete).toHaveBeenCalledWith('s1');
  });
});
