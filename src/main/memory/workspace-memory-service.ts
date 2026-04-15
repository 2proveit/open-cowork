import fs from 'node:fs';
import path from 'node:path';
import type { Message, Session } from '../../renderer/types';
import type { WorkspaceMemoryGenerator } from './workspace-memory-generator';
import {
  buildPromptMemoryText,
  extractSessionMemoryText,
  hasInvalidManagedMemoryMarkers,
  parseMemoryMarkdown,
  renderMemoryMarkdown,
} from './workspace-memory-markdown';
import type {
  ManagedMemoryState,
  SessionMemorySummary,
  WorkspaceMemoryGenerationResult,
  WorkspaceMemoryServiceOptions,
} from './workspace-memory-types';

const MEMORY_FILE_NAME = 'MEMORY.md';
const DEFAULT_PROMPT_MAX_CHARS = 4000;
const DEFAULT_FILE_MAX_CHARS = 12000;
const DEFAULT_RECENT_SUMMARY_LIMIT = 8;

interface ArchiveSessionToMemoryInput {
  session: Session;
  messages: Message[];
}

const ARRAY_KEYS = ['userProfile', 'habitsAndPreferences', 'activeWorkstreams'] as const;

function normalizeMemoryItem(item: string): string {
  return item.trim();
}

function mergeUniqueItems(existing: string[], incoming: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  const push = (item: string) => {
    const normalized = normalizeMemoryItem(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    merged.push(normalized);
  };

  for (const item of existing) {
    push(item);
  }
  for (const item of incoming) {
    push(item);
  }

  return merged;
}

function summaryKey(summary: SessionMemorySummary): string {
  return `${summary.timestamp}\n${summary.title ?? ''}\n${summary.summary}`;
}

function mergeRecentSessionSummaries(
  existing: SessionMemorySummary[],
  incoming: SessionMemorySummary,
  maxItems: number
): SessionMemorySummary[] {
  if (maxItems <= 0) {
    return [];
  }

  const deduped: SessionMemorySummary[] = [];
  const seen = new Set<string>();
  for (const summary of [...existing, incoming]) {
    const key = summaryKey(summary);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(summary);
  }

  if (deduped.length <= maxItems) {
    return deduped;
  }

  return deduped.slice(deduped.length - maxItems);
}

function mergeManagedMemory(
  existing: ManagedMemoryState,
  generated: WorkspaceMemoryGenerationResult,
  recentSummaryLimit: number
): ManagedMemoryState {
  const merged: ManagedMemoryState = {
    userProfile: existing.userProfile,
    habitsAndPreferences: existing.habitsAndPreferences,
    activeWorkstreams: existing.activeWorkstreams,
    recentSessionSummaries: existing.recentSessionSummaries,
  };

  for (const key of ARRAY_KEYS) {
    merged[key] = mergeUniqueItems(existing[key], generated[key]);
  }

  merged.recentSessionSummaries = mergeRecentSessionSummaries(
    existing.recentSessionSummaries,
    generated.recentSessionSummary,
    recentSummaryLimit
  );

  return merged;
}

function writeFileSafely(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export class WorkspaceMemoryService {
  private readonly promptMaxChars: number;
  private readonly fileMaxChars: number;
  private readonly recentSummaryLimit: number;

  constructor(
    private readonly generator: WorkspaceMemoryGenerator,
    options: WorkspaceMemoryServiceOptions = {}
  ) {
    this.promptMaxChars = options.promptMaxChars ?? DEFAULT_PROMPT_MAX_CHARS;
    this.fileMaxChars = options.fileMaxChars ?? DEFAULT_FILE_MAX_CHARS;
    this.recentSummaryLimit = options.recentSummaryLimit ?? DEFAULT_RECENT_SUMMARY_LIMIT;
  }

  async archiveSessionToMemory(input: ArchiveSessionToMemoryInput): Promise<void> {
    const workspacePath = input.session.cwd;
    if (!workspacePath) {
      return;
    }

    const memoryFile = path.join(workspacePath, MEMORY_FILE_NAME);
    const currentMarkdown = fs.existsSync(memoryFile)
      ? fs.readFileSync(memoryFile, 'utf8')
      : undefined;

    if (hasInvalidManagedMemoryMarkers(currentMarkdown)) {
      throw new Error('Invalid managed memory markers');
    }

    const parsed = parseMemoryMarkdown(currentMarkdown);
    const generated = await this.generator.generate({
      existingManaged: parsed.managed,
      sessionTurns: extractSessionMemoryText(input.messages),
    });
    const merged = mergeManagedMemory(parsed.managed, generated, this.recentSummaryLimit);
    const nextMarkdown = renderMemoryMarkdown(parsed.normalizedMarkdown, merged);
    writeFileSafely(memoryFile, nextMarkdown);
  }

  buildPromptMemory(workspacePath: string): string {
    const memoryFile = path.join(workspacePath, MEMORY_FILE_NAME);
    if (!fs.existsSync(memoryFile)) {
      return '';
    }

    const markdown = fs.readFileSync(memoryFile, 'utf8');
    const promptMemory = buildPromptMemoryText(markdown, {
      maxChars: this.promptMaxChars,
      maxFileChars: this.fileMaxChars,
    });

    if (!promptMemory) {
      return '';
    }

    return [
      '<workspace_memory>',
      '以下是来自当前工作区 MEMORY.md 的记忆。请优先用于协作连续性；若与用户最新指令冲突，以用户最新指令为准。',
      promptMemory,
      '</workspace_memory>',
    ].join('\n');
  }
}
