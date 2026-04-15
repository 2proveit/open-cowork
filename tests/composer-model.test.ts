import { describe, expect, it } from 'vitest';
import type {
  FileAttachmentContent,
  FileMentionContent,
  ImageContent,
  SkillMentionContent,
} from '../src/renderer/types';
import type { ComposerSegment } from '../src/renderer/components/composer/types';
import { removeSegmentAtCursor } from '../src/renderer/components/composer/composer-model';
import { serializeComposerValue } from '../src/renderer/components/composer/composer-serialize';

describe('serializeComposerValue', () => {
  it('serializes file and skill mentions into display text and content blocks', () => {
    const image: ImageContent = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'abc',
      },
    };
    const attachment: FileAttachmentContent = {
      type: 'file_attachment',
      filename: 'report.md',
      relativePath: 'tmp/report.md',
      size: 10,
    };
    const fileMention: FileMentionContent = {
      type: 'file_mention',
      path: 'src/index.ts',
      name: 'index.ts',
      workspacePath: '/workspace',
      source: 'workspace',
      line: 12,
      column: 2,
    };
    const skillMention: SkillMentionContent = {
      type: 'skill_mention',
      skillId: 'brainstorming',
      name: 'brainstorming',
      description: 'Design first',
      path: '/skills/brainstorming',
    };
    const segments: ComposerSegment[] = [
      { type: 'text', text: 'Open ' },
      { type: 'file_mention', mention: fileMention },
      { type: 'text', text: ' then run ' },
      { type: 'skill_mention', mention: skillMention },
      { type: 'line_break' },
      { type: 'text', text: 'Done' },
    ];

    const result = serializeComposerValue({
      segments,
      imageBlocks: [image],
      attachmentBlocks: [attachment],
    });

    expect(result.displayText).toBe('Open @src/index.ts then run /brainstorming\nDone');
    expect(result.contentBlocks).toEqual([
      image,
      attachment,
      { type: 'text', text: 'Open ' },
      fileMention,
      { type: 'text', text: ' then run ' },
      skillMention,
      { type: 'text', text: '\n' },
      { type: 'text', text: 'Done' },
    ]);
  });
});

describe('removeSegmentAtCursor', () => {
  it('removes an atomic mention chip when deleting backward at chip boundary', () => {
    const fileMention: FileMentionContent = {
      type: 'file_mention',
      path: 'README.md',
      name: 'README.md',
      workspacePath: '/workspace',
      source: 'recent',
    };
    const segments: ComposerSegment[] = [
      { type: 'text', text: 'A' },
      { type: 'file_mention', mention: fileMention },
      { type: 'text', text: 'B' },
    ];

    const result = removeSegmentAtCursor(segments, { segmentIndex: 2, offset: 0 }, 'backward');

    expect(result.segments).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B' },
    ]);
    expect(result.removed).toBe(true);
    expect(result.cursor).toEqual({ segmentIndex: 1, offset: 0 });
  });
});
