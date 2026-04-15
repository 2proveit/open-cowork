import type { AppConfig } from '../config/config-store';
import { generateTextWithClaudeSdk } from '../claude/claude-sdk-one-shot';
import type {
  ManagedMemoryState,
  SessionMemorySummary,
  SessionMemoryTextItem,
} from './workspace-memory-types';

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

export interface WorkspaceMemoryGenerator {
  generate(input: WorkspaceMemoryGenerationInput): Promise<WorkspaceMemoryGenerationResult>;
}

interface WorkspaceMemoryPayload {
  userProfile: string[];
  habitsAndPreferences: string[];
  activeWorkstreams: string[];
  recentSessionSummary: SessionMemorySummary;
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid workspace memory payload: ${field}`);
  }
  return value;
}

function parseRecentSessionSummary(value: unknown): SessionMemorySummary {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid workspace memory payload: recentSessionSummary');
  }
  const summary = value as Record<string, unknown>;
  if (typeof summary.timestamp !== 'string' || typeof summary.summary !== 'string') {
    throw new Error('Invalid workspace memory payload: recentSessionSummary');
  }
  if (
    typeof summary.title !== 'undefined' &&
    summary.title !== null &&
    typeof summary.title !== 'string'
  ) {
    throw new Error('Invalid workspace memory payload: recentSessionSummary.title');
  }

  return {
    timestamp: summary.timestamp,
    title: typeof summary.title === 'string' ? summary.title : undefined,
    summary: summary.summary,
    signals: parseStringArray(summary.signals, 'recentSessionSummary.signals'),
  };
}

function parsePayload(raw: string): WorkspaceMemoryGenerationResult {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('Invalid workspace memory payload');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid workspace memory payload');
  }

  const data = payload as WorkspaceMemoryPayload;
  return {
    userProfile: parseStringArray(data.userProfile, 'userProfile'),
    habitsAndPreferences: parseStringArray(data.habitsAndPreferences, 'habitsAndPreferences'),
    activeWorkstreams: parseStringArray(data.activeWorkstreams, 'activeWorkstreams'),
    recentSessionSummary: parseRecentSessionSummary(data.recentSessionSummary),
  };
}

function buildMemoryGenerationPrompt(input: WorkspaceMemoryGenerationInput): string {
  return [
    '请根据现有托管记忆和最新会话，输出一个 JSON 对象。',
    '仅输出 JSON，不要包含 Markdown 代码块或额外解释。',
    'JSON 结构必须为：',
    '{"userProfile": string[], "habitsAndPreferences": string[], "activeWorkstreams": string[], "recentSessionSummary": {"timestamp": string, "title"?: string, "summary": string, "signals": string[]}}',
    '',
    'existingManaged:',
    JSON.stringify(input.existingManaged, null, 2),
    '',
    'sessionTurns:',
    JSON.stringify(input.sessionTurns, null, 2),
  ].join('\n');
}

const MEMORY_GENERATION_SYSTEM_PROMPT =
  '你是工作区记忆生成器。合并历史托管信息和最新对话，返回结构化 JSON。';

export function createModelBackedWorkspaceMemoryGenerator(
  getConfig: () => AppConfig
): WorkspaceMemoryGenerator {
  return {
    async generate(
      input: WorkspaceMemoryGenerationInput
    ): Promise<WorkspaceMemoryGenerationResult> {
      const text = await generateTextWithClaudeSdk(
        buildMemoryGenerationPrompt(input),
        MEMORY_GENERATION_SYSTEM_PROMPT,
        getConfig()
      );
      if (!text) {
        throw new Error('Empty workspace memory payload');
      }
      return parsePayload(text);
    },
  };
}
