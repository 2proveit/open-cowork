import type { AppConfig } from '../config/config-store';
import { generateTextWithClaudeSdk } from '../claude/claude-sdk-one-shot';
import type {
  SessionMemoryTextItem,
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

const SESSION_TURN_TRUNCATED_MARKER = '[truncated]';
const MAX_SESSION_TURNS = 12;
const MAX_SESSION_TURN_CHARS = 1200;
const MAX_SESSION_TURNS_TOTAL_CHARS = 8000;

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Invalid workspace memory payload shape');
  }
  return value;
}

function parseOptionalStringArray(value: unknown): string[] {
  return typeof value === 'undefined' ? [] : parseStringArray(value);
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
    signals: parseOptionalStringArray(summary.signals),
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
    userProfile: parseOptionalStringArray(data.userProfile),
    habitsAndPreferences: parseOptionalStringArray(data.habitsAndPreferences),
    activeWorkstreams: parseOptionalStringArray(data.activeWorkstreams),
    recentSessionSummary: parseRecentSessionSummary(data.recentSessionSummary),
  };
}

function trimSessionTurnText(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return '';
  }

  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= SESSION_TURN_TRUNCATED_MARKER.length) {
    return SESSION_TURN_TRUNCATED_MARKER.slice(0, maxChars);
  }

  return `${text.slice(0, maxChars - SESSION_TURN_TRUNCATED_MARKER.length)}${SESSION_TURN_TRUNCATED_MARKER}`;
}

function boundSessionTurns(sessionTurns: SessionMemoryTextItem[]): SessionMemoryTextItem[] {
  const normalized = sessionTurns.filter((turn) => turn.text.trim().length > 0);
  const bounded: SessionMemoryTextItem[] = [];
  let remainingChars = MAX_SESSION_TURNS_TOTAL_CHARS;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (bounded.length >= MAX_SESSION_TURNS || remainingChars <= 0) {
      break;
    }

    const turn = normalized[index];
    const textBudget = Math.min(MAX_SESSION_TURN_CHARS, remainingChars);
    const boundedText = trimSessionTurnText(turn.text.trim(), textBudget);
    if (!boundedText) {
      continue;
    }

    bounded.push({
      role: turn.role,
      text: boundedText,
    });
    remainingChars -= boundedText.length;
  }

  return bounded.reverse();
}

function buildMemoryGenerationPrompt(input: WorkspaceMemoryGenerationInput): string {
  const boundedSessionTurns = boundSessionTurns(input.sessionTurns);

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
    JSON.stringify(boundedSessionTurns, null, 2),
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
