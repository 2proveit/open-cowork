import path from 'node:path';
import type { ContentBlock } from '../../types';
import type { ComposerSegment, SerializeComposerInput } from './types';

interface SerializedComposerValue {
  displayText: string;
  contentBlocks: ContentBlock[];
}

function normalizeDisplayPathSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}

function toDisplayFilePath(filePath: string, workspacePath: string): string {
  if (!workspacePath) {
    return filePath;
  }

  const useWindowsPath = path.win32.isAbsolute(filePath) && path.win32.isAbsolute(workspacePath);
  const usePosixPath = path.posix.isAbsolute(filePath) && path.posix.isAbsolute(workspacePath);
  const useNativePath = path.isAbsolute(filePath) && path.isAbsolute(workspacePath);
  if (!useWindowsPath && !usePosixPath && !useNativePath) {
    return filePath;
  }

  const relative = useWindowsPath
    ? path.win32.relative(workspacePath, filePath)
    : usePosixPath
      ? path.posix.relative(workspacePath, filePath)
      : path.relative(workspacePath, filePath);
  const isRelativeOutsideWorkspace =
    !relative ||
    relative.startsWith('..') ||
    path.win32.isAbsolute(relative) ||
    path.posix.isAbsolute(relative) ||
    path.isAbsolute(relative);
  if (isRelativeOutsideWorkspace) {
    return filePath;
  }

  return normalizeDisplayPathSeparators(relative);
}

function segmentToDisplayText(segment: ComposerSegment): string {
  switch (segment.type) {
    case 'text':
      return segment.text;
    case 'line_break':
      return '\n';
    case 'file_mention':
      return `@${toDisplayFilePath(segment.mention.path, segment.mention.workspacePath)}`;
    case 'skill_mention':
      return `/${segment.mention.name}`;
    default:
      return '';
  }
}

function segmentToContentBlocks(segment: ComposerSegment): ContentBlock[] {
  switch (segment.type) {
    case 'text':
      return [{ type: 'text', text: segment.text }];
    case 'line_break':
      return [{ type: 'text', text: '\n' }];
    case 'file_mention':
      return [segment.mention];
    case 'skill_mention':
      return [segment.mention];
    default:
      return [];
  }
}

export function serializeComposerValue(input: SerializeComposerInput): SerializedComposerValue {
  const displayText = input.segments.map(segmentToDisplayText).join('');

  const contentBlocks: ContentBlock[] = [
    ...(input.imageBlocks ?? []),
    ...(input.attachmentBlocks ?? []),
  ];
  for (const segment of input.segments) {
    contentBlocks.push(...segmentToContentBlocks(segment));
  }

  return { displayText, contentBlocks };
}
