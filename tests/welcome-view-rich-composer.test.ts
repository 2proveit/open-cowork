import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const welcomeViewPath = path.resolve(process.cwd(), 'src/renderer/components/WelcomeView.tsx');

describe('WelcomeView rich composer integration', () => {
  it('starts sessions from RichPromptComposer output while preserving workdir guards', () => {
    const source = fs.readFileSync(welcomeViewPath, 'utf8');

    expect(source).toContain("import { RichPromptComposer } from './composer/RichPromptComposer';");
    expect(source).toContain('<RichPromptComposer');
    expect(source).toContain('workspacePath={workingDir || undefined}');
    expect(source).toContain('const session = await startSession(');
    expect(source).toContain('{ displayText, contentBlocks }');
    expect(source).toContain('workingDir || undefined');
    expect(source).toContain("message: t('welcome.selectWorkingFolder')");
  });
});
