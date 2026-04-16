import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const typesPath = path.resolve(process.cwd(), 'src/renderer/types/index.ts');
const useIPCPath = path.resolve(process.cwd(), 'src/renderer/hooks/useIPC.ts');
const mainIndexPath = path.resolve(process.cwd(), 'src/main/index.ts');

function readSource(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('session continue cwd synchronization', () => {
  it('allows session.continue events to carry an optional cwd', () => {
    const source = readSource(typesPath);

    expect(source).toContain(
      'payload: { sessionId: string; prompt: string; content?: ContentBlock[]; cwd?: string }'
    );
  });

  it('forwards the selected workspace from useIPC when continuing a session', () => {
    const source = readSource(useIPCPath);

    expect(source).toContain(
      'async (sessionId: string, promptOrContent: SessionPromptInput, cwd?: string) => {'
    );
    expect(source).toContain('cwd,');
  });

  it('updates the backend session workspace before continuing the turn', () => {
    const source = readSource(mainIndexPath);

    expect(source).toContain('if (event.payload.cwd) {');
    expect(source).toContain(
      'const result = await setWorkingDir(event.payload.cwd, event.payload.sessionId);'
    );
    expect(source).toContain('return sm.continueSession(');
  });
});
