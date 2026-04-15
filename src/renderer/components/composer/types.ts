import type {
  FileAttachmentContent,
  FileMentionContent,
  ImageContent,
  SkillMentionContent,
} from '../../types';

export interface ComposerTextSegment {
  type: 'text';
  text: string;
}

export interface ComposerLineBreakSegment {
  type: 'line_break';
}

export interface ComposerFileMentionSegment {
  type: 'file_mention';
  mention: FileMentionContent;
}

export interface ComposerSkillMentionSegment {
  type: 'skill_mention';
  mention: SkillMentionContent;
}

export type ComposerSegment =
  | ComposerTextSegment
  | ComposerLineBreakSegment
  | ComposerFileMentionSegment
  | ComposerSkillMentionSegment;

export interface ComposerCursor {
  segmentIndex: number;
  offset: number;
}

export type ComposerDeleteDirection = 'backward' | 'forward';

export interface RemoveSegmentResult {
  segments: ComposerSegment[];
  cursor: ComposerCursor;
  removed: boolean;
}

export interface SerializeComposerInput {
  segments: ComposerSegment[];
  imageBlocks?: ImageContent[];
  attachmentBlocks?: FileAttachmentContent[];
}

export type ComposerCandidate = FileComposerCandidate | SkillComposerCandidate;

export interface FileComposerCandidate {
  type: 'file_mention';
  id: string;
  label: string;
  mention: FileMentionContent;
}

export interface SkillComposerCandidate {
  type: 'skill_mention';
  id: string;
  label: string;
  mention: SkillMentionContent;
}

export interface ActiveMentionQuery {
  marker: '@' | '/';
  query: string;
  replaceFrom: number;
  replaceTo: number;
}
