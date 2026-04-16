import type { ContentBlock } from '../../types';
import type { ComposerSegment, SerializeComposerInput } from './types';

interface SerializedComposerValue {
  displayText: string;
  contentBlocks: ContentBlock[];
}

function normalizeDisplayPathSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:\//.test(value) || /^\/\/[^/]+\/[^/]+/.test(value);
}

function isPosixAbsolutePath(value: string): boolean {
  return value.startsWith('/');
}

function pathKind(value: string): 'windows' | 'posix' | 'relative' {
  if (isWindowsAbsolutePath(value)) {
    return 'windows';
  }
  if (isPosixAbsolutePath(value)) {
    return 'posix';
  }
  return 'relative';
}

function trimTrailingSlashes(value: string, kind: 'windows' | 'posix' | 'relative'): string {
  if (kind === 'posix') {
    return value === '/' ? value : value.replace(/\/+$/, '');
  }
  if (kind === 'windows') {
    if (/^[a-zA-Z]:\/$/.test(value) || /^\/\/[^/]+\/[^/]+\/?$/.test(value)) {
      return value.endsWith('/') ? value : `${value}/`;
    }
    return value.replace(/\/+$/, '');
  }
  return value.replace(/\/+$/, '');
}

export function toDisplayFilePath(filePath: string, workspacePath: string): string {
  const normalizedFilePath = normalizeDisplayPathSeparators(filePath);
  if (!workspacePath) {
    return normalizedFilePath;
  }

  const normalizedWorkspacePath = normalizeDisplayPathSeparators(workspacePath);
  const fileKind = pathKind(normalizedFilePath);
  const workspaceKind = pathKind(normalizedWorkspacePath);
  if (fileKind === 'relative') {
    return normalizedFilePath;
  }
  if (workspaceKind !== fileKind) {
    return normalizedFilePath;
  }

  const workspaceRoot = trimTrailingSlashes(normalizedWorkspacePath, workspaceKind);
  const fileValue = trimTrailingSlashes(normalizedFilePath, fileKind);
  const comparableWorkspaceRoot =
    fileKind === 'windows' ? workspaceRoot.toLowerCase() : workspaceRoot;
  const comparableFileValue = fileKind === 'windows' ? fileValue.toLowerCase() : fileValue;
  if (comparableWorkspaceRoot === comparableFileValue) {
    return normalizedFilePath;
  }

  const comparablePrefix = comparableWorkspaceRoot.endsWith('/')
    ? comparableWorkspaceRoot
    : `${comparableWorkspaceRoot}/`;
  if (!comparableFileValue.startsWith(comparablePrefix)) {
    return normalizedFilePath;
  }

  const originalPrefixLength = workspaceRoot.endsWith('/')
    ? workspaceRoot.length
    : workspaceRoot.length + 1;
  const relativePath = fileValue.slice(originalPrefixLength);
  if (!relativePath || relativePath.startsWith('../')) {
    return normalizedFilePath;
  }

  return relativePath;
}

export function segmentToDisplayText(segment: ComposerSegment): string {
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
