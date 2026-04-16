export interface SessionMemorySummary {
  timestamp: string;
  title?: string;
  summary: string;
  signals: string[];
}

export interface ManagedMemoryState {
  userProfile: string[];
  habitsAndPreferences: string[];
  activeWorkstreams: string[];
  recentSessionSummaries: SessionMemorySummary[];
}

export type ManagedMarkerStatus = 'valid' | 'missing' | 'incomplete' | 'reversed' | 'multiple';

export interface ManagedBlockParseMetadata {
  markerStatus: ManagedMarkerStatus;
  hasManagedBlock: boolean;
  hasValidManagedBlock: boolean;
  startMarkerCount: number;
  endMarkerCount: number;
}

export interface ParsedMemoryMarkdown {
  manualNotes: string;
  managed: ManagedMemoryState;
  metadata: ManagedBlockParseMetadata;
  normalizedMarkdown: string;
}

export interface MemoryPromptBuildOptions {
  maxChars: number;
  maxFileChars: number;
}

export interface SessionMemoryTextItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface WorkspaceMemoryGenerationInput {
  existingManaged: ManagedMemoryState;
  sessionTurns: SessionMemoryTextItem[];
}

export interface WorkspaceMemoryGenerationResult {
  userProfile: string[];
  habitsAndPreferences: string[];
  activeWorkstreams: string[];
  recentSessionSummary: SessionMemorySummary;
}

export interface WorkspaceMemoryServiceOptions {
  promptMaxChars?: number;
  fileMaxChars?: number;
  recentSummaryLimit?: number;
  managedListMaxItems?: number;
}
