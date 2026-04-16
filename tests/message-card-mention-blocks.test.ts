import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const contentBlockViewPath = path.resolve(
  process.cwd(),
  'src/renderer/components/message/ContentBlockView.tsx'
);

describe('ContentBlockView mention rendering', () => {
  it('renders file and skill mention blocks as chips', () => {
    const source = fs.readFileSync(contentBlockViewPath, 'utf8');

    expect(source).toContain("case 'file_mention'");
    expect(source).toContain("case 'skill_mention'");
    expect(source).toContain('@{fileBlock.name}');
    expect(source).toContain('/{skillBlock.name}');
  });
});
