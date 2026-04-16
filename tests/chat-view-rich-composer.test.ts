import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const chatViewPath = path.resolve(process.cwd(), 'src/renderer/components/ChatView.tsx');

function readChatViewSource() {
  return fs.readFileSync(chatViewPath, 'utf8');
}

describe('ChatView rich composer integration', () => {
  it('imports and renders RichPromptComposer with the active composer workspace', () => {
    const source = readChatViewSource();

    expect(source).toContain("import { RichPromptComposer } from './composer/RichPromptComposer';");
    expect(source).toContain('<RichPromptComposer');
    expect(source).toContain(
      'const composerWorkspacePath = activeSession?.cwd || workingDir || undefined;'
    );
    expect(source).toContain('workspacePath={composerWorkspacePath}');
  });

  it('forwards both displayText/contentBlocks and the composer workspace on submit', () => {
    const source = readChatViewSource();

    expect(source).toContain(
      'const handleComposerSubmit = async (displayText: string, contentBlocks: ContentBlock[]) => {'
    );
    expect(source).toContain(
      'await continueSession(activeSessionId, { displayText, contentBlocks }, composerWorkspacePath);'
    );
    expect(source).toContain('onSubmit={async ({ displayText, contentBlocks }) => {');
    expect(source).toContain('await handleComposerSubmit(displayText, contentBlocks);');
  });

  it('does not keep inline textarea composer markup', () => {
    const source = readChatViewSource();

    expect(source).not.toContain('<textarea');
  });
});
