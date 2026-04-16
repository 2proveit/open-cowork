import { describe, expect, it, vi } from 'vitest';
import type { ContentBlock } from '../src/renderer/types';
import type { DatabaseInstance } from '../src/main/db/database';
import {
  SessionManager,
  type WorkspaceMemoryArchiveService,
} from '../src/main/session/session-manager';

vi.mock('../src/main/claude/agent-runner', () => ({
  ClaudeAgentRunner: class {
    run = vi.fn();
    cancel = vi.fn();
  },
}));

function makeDb(overrides: Partial<DatabaseInstance> = {}): DatabaseInstance {
  return {
    raw: {
      transaction: vi.fn((fn: () => void) => fn),
    } as unknown as DatabaseInstance['raw'],
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
    scheduledTasks: {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(() => []),
      delete: vi.fn(),
    },
    prepare: vi.fn(),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as DatabaseInstance;
}

function makeWorkspaceMemoryService(
  overrides: Partial<WorkspaceMemoryArchiveService> = {}
): WorkspaceMemoryArchiveService {
  return {
    archiveSessionToMemory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeSessionRow(
  overrides: Partial<ReturnType<DatabaseInstance['sessions']['get']>> = {}
): NonNullable<ReturnType<DatabaseInstance['sessions']['get']>> {
  return {
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
    ...overrides,
  };
}

describe('SessionManager workspace memory integration', () => {
  it('archives session memory before deleting the session row', async () => {
    const db = makeDb();
    const workspaceMemoryService = makeWorkspaceMemoryService();
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    await manager.deleteSession('s1');

    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ id: 's1', cwd: '/tmp/workspace' }),
      })
    );
    expect(db.sessions.delete).toHaveBeenCalledWith('s1');
  });

  it('archives before deleting the session row', async () => {
    const db = makeDb();
    const workspaceMemoryService = makeWorkspaceMemoryService();
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    await manager.deleteSession('s1');

    const archiveOrder = (workspaceMemoryService.archiveSessionToMemory as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[0];
    const deleteOrder = (db.sessions.delete as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(archiveOrder).toBeLessThan(deleteOrder);
  });

  it('skips archive when session has no cwd', async () => {
    const sessions: DatabaseInstance['sessions'] = {
      create: vi.fn(),
      get: vi.fn(() => makeSessionRow({ cwd: null })),
      getAll: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const db = makeDb({
      sessions,
    });
    const workspaceMemoryService = makeWorkspaceMemoryService();
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    await manager.deleteSession('s1');

    expect(workspaceMemoryService.archiveSessionToMemory).not.toHaveBeenCalled();
    expect(db.sessions.delete).toHaveBeenCalledWith('s1');
  });

  it('archives when deleting a running session', async () => {
    const sessions: DatabaseInstance['sessions'] = {
      create: vi.fn(),
      get: vi.fn(() => makeSessionRow({ status: 'running' })),
      getAll: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const db = makeDb({
      sessions,
    });
    const workspaceMemoryService = makeWorkspaceMemoryService();
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    await manager.deleteSession('s1');

    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ id: 's1', status: 'running' }),
      })
    );
    expect(db.sessions.delete).toHaveBeenCalledWith('s1');
  });

  it('includes queued prompts in archive input before deleting a running session', async () => {
    const sessions: DatabaseInstance['sessions'] = {
      create: vi.fn(),
      get: vi.fn(() => makeSessionRow({ status: 'running' })),
      getAll: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const db = makeDb({
      sessions,
      messages: {
        create: vi.fn(),
        getBySessionId: vi.fn(() => [
          {
            id: 'm1',
            session_id: 's1',
            role: 'user',
            content: JSON.stringify([{ type: 'text', text: 'persisted message' }]),
            timestamp: 1,
            token_usage: null,
            execution_time_ms: null,
          },
        ]),
        delete: vi.fn(),
        deleteBySessionId: vi.fn(),
      },
    });
    const workspaceMemoryService = makeWorkspaceMemoryService();
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    const activeSessions = Reflect.get(manager, 'activeSessions') as Map<string, AbortController>;
    const promptQueues = Reflect.get(manager, 'promptQueues') as Map<
      string,
      Array<{ prompt: string; content?: ContentBlock[] }>
    >;

    activeSessions.set('s1', new AbortController());
    promptQueues.set('s1', [
      {
        prompt: 'queued latest intent',
      },
    ]);

    await manager.deleteSession('s1');

    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: 'queued latest intent' }],
          }),
        ]),
      })
    );
  });

  it('archives sessions during batch delete before removing rows', async () => {
    const sessionRows = new Map<string, ReturnType<typeof makeSessionRow>>([
      ['s1', makeSessionRow({ id: 's1', cwd: '/tmp/workspace-1' })],
      ['s2', makeSessionRow({ id: 's2', cwd: '/tmp/workspace-2' })],
    ]);

    const sessions: DatabaseInstance['sessions'] = {
      create: vi.fn(),
      get: vi.fn((id: string) => sessionRows.get(id)),
      getAll: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const db = makeDb({
      sessions,
    });
    const workspaceMemoryService = makeWorkspaceMemoryService();
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    await manager.batchDeleteSessions(['s1', 's2']);

    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenCalledTimes(2);
    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        session: expect.objectContaining({ id: 's1', cwd: '/tmp/workspace-1' }),
      })
    );
    expect(workspaceMemoryService.archiveSessionToMemory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        session: expect.objectContaining({ id: 's2', cwd: '/tmp/workspace-2' }),
      })
    );

    const archiveOrder = (workspaceMemoryService.archiveSessionToMemory as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[1];
    const deleteOrder = (db.sessions.delete as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(archiveOrder).toBeLessThan(deleteOrder);
  });

  it('swallows archive failures and still deletes the session', async () => {
    const db = makeDb();
    const workspaceMemoryService = makeWorkspaceMemoryService({
      archiveSessionToMemory: vi.fn().mockRejectedValue(new Error('generator failed')),
    });
    const manager = new SessionManager(db, vi.fn(), undefined, workspaceMemoryService);

    await expect(manager.deleteSession('s1')).resolves.toBeUndefined();
    expect(db.sessions.delete).toHaveBeenCalledWith('s1');
  });
});
