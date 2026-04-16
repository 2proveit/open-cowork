import * as fs from 'fs';
import * as path from 'path';
import type { ContentBlock, FileAttachmentContent } from '../../renderer/types';

interface MentionExpansionResult {
  contentBlocks: ContentBlock[];
  executionContentBlocks: ContentBlock[];
  enhancedPrompt: string;
}

function toRelativeDisplayPath(cwd: string, targetPath: string): string {
  const relativePath = path.relative(cwd, targetPath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : targetPath;
}

function createMentionAttachment(
  fileMention: Extract<ContentBlock, { type: 'file_mention' }>
): FileAttachmentContent | null {
  if (!fileMention.path || !fs.existsSync(fileMention.path)) {
    return null;
  }

  const stats = fs.statSync(fileMention.path);
  if (!stats.isFile()) {
    return null;
  }

  return {
    type: 'file_attachment',
    filename: fileMention.name,
    relativePath: fileMention.path,
    size: stats.size,
  };
}

export async function expandMentionBlocks(
  cwd: string,
  content: ContentBlock[]
): Promise<MentionExpansionResult> {
  const fileMentions = content.filter(
    (block): block is Extract<ContentBlock, { type: 'file_mention' }> =>
      block.type === 'file_mention'
  );
  const skillMentions = content.filter(
    (block): block is Extract<ContentBlock, { type: 'skill_mention' }> =>
      block.type === 'skill_mention'
  );

  const existingAttachmentPaths = new Set(
    content
      .filter((block): block is FileAttachmentContent => block.type === 'file_attachment')
      .map((block) => block.relativePath)
  );

  const mentionAttachments = fileMentions
    .map(createMentionAttachment)
    .filter((attachment): attachment is FileAttachmentContent => Boolean(attachment))
    .filter((attachment) => !existingAttachmentPaths.has(attachment.relativePath));

  const mentionedFilesPrompt = fileMentions
    .map((file) => {
      const location = toRelativeDisplayPath(cwd, file.path);
      const lineSuffix =
        typeof file.line === 'number'
          ? `:${file.line}${typeof file.column === 'number' ? `:${file.column}` : ''}`
          : '';
      return `- ${file.name} at path: ${location}${lineSuffix}`;
    })
    .join('\n');

  const selectedSkillsPrompt = skillMentions
    .map((skill) => `- ${skill.name}${skill.path ? ` (${skill.path})` : ''}`)
    .join('\n');

  const enhancedPrompt = [
    mentionedFilesPrompt ? `[Mentioned files]\n${mentionedFilesPrompt}` : '',
    selectedSkillsPrompt ? `[Selected skills]\n${selectedSkillsPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    contentBlocks: content,
    executionContentBlocks: [...content, ...mentionAttachments],
    enhancedPrompt,
  };
}
