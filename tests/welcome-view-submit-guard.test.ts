import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const welcomeViewPath = path.resolve(process.cwd(), 'src/renderer/components/WelcomeView.tsx');

describe('WelcomeView submit guards', () => {
  it('keeps the working-directory warning in the RichPromptComposer submit path', () => {
    const source = fs.readFileSync(welcomeViewPath, 'utf8');

    expect(source).toContain("message: t('welcome.selectWorkingFolder')");
    expect(source).toContain('return false;');
  });

  it('only lets the shared composer clear after startSession returns a created session', () => {
    const source = fs.readFileSync(welcomeViewPath, 'utf8');

    expect(source).toContain('const session = await startSession(');
    expect(source).toContain('{ displayText, contentBlocks }');
    expect(source).toContain('workingDir || undefined');
    expect(source).toContain('if (session) {');
    expect(source).toContain('setSelectedTag(null);');
    expect(source).toContain('return true;');
  });

  it('surfaces working-directory picker failures to the global notice toast', () => {
    const source = fs.readFileSync(welcomeViewPath, 'utf8');

    expect(source).toContain(
      'const setGlobalNotice = useAppStore((state) => state.setGlobalNotice);'
    );
    expect(source).toContain(
      'const result = await changeWorkingDir(undefined, workingDir || undefined);'
    );
    expect(source).toContain(
      "message: `${t('welcome.selectWorkingFolderFailed')}: ${result.error}`"
    );
    expect(source).toContain(": t('welcome.selectWorkingFolderFailed')");
  });
});
