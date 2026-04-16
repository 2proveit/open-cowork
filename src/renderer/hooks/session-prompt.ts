import type { ContentBlock } from '../types';

export interface RichComposerSubmitValue {
  displayText: string;
  contentBlocks: ContentBlock[];
}

export type SessionPromptInput = string | ContentBlock[] | RichComposerSubmitValue;

export function normalizeSessionPromptInput(input: SessionPromptInput): {
  prompt: string;
  content: ContentBlock[];
} {
  if (typeof input === 'string') {
    return {
      prompt: input,
      content: [{ type: 'text', text: input }],
    };
  }

  if ('displayText' in input) {
    return {
      prompt: input.displayText,
      content: input.contentBlocks,
    };
  }

  return {
    prompt: input
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join(''),
    content: input,
  };
}
