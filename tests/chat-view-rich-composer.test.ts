import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const chatViewPath = path.resolve(process.cwd(), 'src/renderer/components/ChatView.tsx');

function readChatViewSource() {
  return fs.readFileSync(chatViewPath, 'utf8');
}

describe('ChatView rich composer integration', () => {
  it('imports and renders RichPromptComposer', () => {
    const source = readChatViewSource();

    expect(source).toContain("import { RichPromptComposer } from './composer/RichPromptComposer';");
    expect(source).toContain('<RichPromptComposer');
  });

  it('does not keep inline textarea composer markup', () => {
    const source = readChatViewSource();

    expect(source).not.toContain('<textarea');
  });
});
