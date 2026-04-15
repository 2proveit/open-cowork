export interface SessionMemorySummary {
  timestamp: string;
  title: string;
  summary: string;
  signals: string[];
}

export interface ManagedMemoryState {
  userProfile: string[];
  habitsAndPreferences: string[];
  activeWorkstreams: string[];
  recentSessionSummaries: SessionMemorySummary[];
}

export interface ParsedMemoryMarkdown {
  manualNotes: string;
  managed: ManagedMemoryState;
}

export interface MemoryPromptBuildOptions {
  maxChars: number;
  maxFileChars: number;
}

export interface SessionMemoryTextItem {
  role: 'user' | 'assistant';
  text: string;
}
