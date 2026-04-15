import type { AppConfig } from '../config/config-store';
import { generateTextWithClaudeSdk } from '../claude/claude-sdk-one-shot';
import type {
  SessionMemorySummary,
  WorkspaceMemoryGenerationInput,
  WorkspaceMemoryGenerationResult,
} from './workspace-memory-types';

export interface WorkspaceMemoryGenerator {
  generate(input: WorkspaceMemoryGenerationInput): Promise<WorkspaceMemoryGenerationResult>;
}

interface WorkspaceMemoryPayload {
  userProfile: string[];
  habitsAndPreferences: string[];
  activeWorkstreams: string[];
  recentSessionSummary: SessionMemorySummary;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Invalid workspace memory payload shape');
  }
  return value;
}

function parseRecentSessionSummary(value: unknown): SessionMemorySummary {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid workspace memory payload shape');
  }
  const summary = value as Record<string, unknown>;
  if (typeof summary.timestamp !== 'string' || typeof summary.summary !== 'string') {
    throw new Error('Invalid workspace memory payload shape');
  }
  if (typeof summary.title !== 'undefined' && typeof summary.title !== 'string') {
    throw new Error('Invalid workspace memory payload shape');
  }

  return {
    timestamp: summary.timestamp,
    title: typeof summary.title === 'string' ? summary.title : undefined,
    summary: summary.summary,
    signals: parseStringArray(summary.signals),
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
    userProfile: parseStringArray(data.userProfile),
    habitsAndPreferences: parseStringArray(data.habitsAndPreferences),
    activeWorkstreams: parseStringArray(data.activeWorkstreams),
    recentSessionSummary: parseRecentSessionSummary(data.recentSessionSummary),
  };
}

function buildMemoryGenerationPrompt(input: WorkspaceMemoryGenerationInput): string {
  return [
    '请根据现有托管记忆和最新会话，保守地输出一个 JSON 对象。',
    '只输出 JSON，不要包含 Markdown 代码块或额外解释。',
    '仅保留对协作有帮助的记忆信息；不要包含密钥、令牌、原始工具输出、无关噪声路径。',
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

const MEMORY_GENERATION_SYSTEM_PROMPT = [
  '你是工作区记忆生成器。',
  '行为要求：保守抽取，只保留后续协作决策真正需要的事实。',
  '只输出 JSON，不要输出任何额外文本。',
  '不要包含密钥、令牌、原始工具输出、冗长日志、噪声路径或其他敏感细节。',
  '不要包含原始工具输出。',
].join(' ');

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
