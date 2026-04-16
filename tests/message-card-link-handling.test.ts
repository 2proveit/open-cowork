import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

// Content split across MessageCard.tsx and the message/ sub-components directory
const messageCardPath = path.resolve(process.cwd(), 'src/renderer/components/MessageCard.tsx');
const messageDir = path.resolve(process.cwd(), 'src/renderer/components/message');

function readAllMessageContent() {
  return [
    fs.readFileSync(messageCardPath, 'utf8'),
    ...fs.readdirSync(messageDir).map((f) => fs.readFileSync(path.join(messageDir, f), 'utf8')),
  ].join('\n');
}

describe('MessageCard local link handling', () => {
  it('renders local markdown links as folder-locate buttons instead of target-blank anchors', () => {
    const source = readAllMessageContent();

    expect(source).toContain(
      'const localFilePath = resolveLocalFilePathFromHref(href, currentWorkingDir);'
    );
    expect(source).toContain('title={localFilePath}');
    expect(source).toContain('await revealFileInShell({');
    expect(source).toContain('filePath: localFilePath,');
    expect(source).toContain('cwd: currentWorkingDir ?? undefined,');
    expect(source).not.toContain('const fallbackUrl = `file://${encodeURI(localFilePath)}`;');
    expect(source).not.toContain('target="_blank"');
  });

  it('shows a warning toast when revealing a local file fails', () => {
    const source = readAllMessageContent();

    expect(source).toContain('const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);');
    expect(source).toContain('const handleRevealFailure = (error?: unknown) => {');
    expect(source).toContain(
      "error instanceof Error && error.message ? error.message : t('context.revealFailed')"
    );
  });

  it('treats Windows forward-slash paths as absolute file targets', () => {
    const source = readAllMessageContent();

    expect(source).toContain(
      'const resolveFilePath = (value: string) => resolvePathAgainstWorkspace(value, currentWorkingDir);'
    );
  });
});
