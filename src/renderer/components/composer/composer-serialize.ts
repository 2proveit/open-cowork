import type { ContentBlock } from '../../types';
import type { ComposerSegment, SerializeComposerInput } from './types';

interface SerializedComposerValue {
  displayText: string;
  contentBlocks: ContentBlock[];
}

function segmentToDisplayText(segment: ComposerSegment): string {
  switch (segment.type) {
    case 'text':
      return segment.text;
    case 'line_break':
      return '\n';
    case 'file_mention':
      return `@${segment.mention.path}`;
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
