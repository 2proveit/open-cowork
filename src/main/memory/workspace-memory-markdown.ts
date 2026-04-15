import type { Message } from '../../renderer/types';
import type {
  ManagedMemoryState,
  MemoryPromptBuildOptions,
  ParsedMemoryMarkdown,
  SessionMemorySummary,
  SessionMemoryTextItem,
} from './workspace-memory-types';

const MEMORY_TITLE = '# MEMORY';
const MANUAL_NOTES_HEADING = '## Manual Notes';
const MANAGED_START = '<!-- COWORK:MANAGED:START -->';
const MANAGED_END = '<!-- COWORK:MANAGED:END -->';
const TRUNCATED_MARKER = '[truncated]';

const EMPTY_MANAGED_STATE: ManagedMemoryState = {
  userProfile: [],
  habitsAndPreferences: [],
  activeWorkstreams: [],
  recentSessionSummaries: [],
};

function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

function renderBulletItems(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- (empty)';
}

function renderRecentSummaries(summaries: SessionMemorySummary[]): string {
  if (summaries.length === 0) {
    return '- (empty)';
  }

  return summaries
    .map((summary) => {
      const lines = [
        `#### ${summary.timestamp} | ${summary.title}`,
        `- Summary: ${summary.summary}`,
      ];

      if (summary.signals.length > 0) {
        lines.push('- Signals:');
        lines.push(...summary.signals.map((signal) => `  - ${signal}`));
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

function renderManagedBlock(state: ManagedMemoryState): string {
  const normalizedState: ManagedMemoryState = {
    ...EMPTY_MANAGED_STATE,
    ...state,
  };

  return [
    MANAGED_START,
    '### User Profile',
    renderBulletItems(normalizedState.userProfile),
    '',
    '### Habits And Preferences',
    renderBulletItems(normalizedState.habitsAndPreferences),
    '',
    '### Active Workstreams',
    renderBulletItems(normalizedState.activeWorkstreams),
    '',
    '### Recent Session Summaries',
    renderRecentSummaries(normalizedState.recentSessionSummaries),
    MANAGED_END,
  ].join('\n');
}

function extractManagedBlock(content: string): string {
  const startIndex = content.indexOf(MANAGED_START);
  const endIndex = content.indexOf(MANAGED_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return renderManagedBlock(EMPTY_MANAGED_STATE);
  }

  return content.slice(startIndex, endIndex + MANAGED_END.length).trimEnd();
}

function extractManualNotes(content: string): string {
  const headingIndex = content.indexOf(MANUAL_NOTES_HEADING);
  if (headingIndex === -1) {
    return '';
  }

  const bodyStart = headingIndex + MANUAL_NOTES_HEADING.length;
  return content.slice(bodyStart).replace(/^\n+/, '').trimEnd();
}

function ensureManagedBlock(content: string): string {
  if (content.includes(MANAGED_START) && content.includes(MANAGED_END)) {
    return content;
  }

  const managedBlock = renderManagedBlock(EMPTY_MANAGED_STATE);
  const manualHeadingIndex = content.indexOf(MANUAL_NOTES_HEADING);
  if (manualHeadingIndex === -1) {
    return `${content.trimEnd()}\n\n${managedBlock}\n`;
  }

  return `${content.slice(0, manualHeadingIndex).trimEnd()}\n\n${managedBlock}\n\n${content
    .slice(manualHeadingIndex)
    .trimStart()}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sectionBody(managedContent: string, heading: string): string {
  const pattern = new RegExp(`${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n### |$)`);
  const match = managedContent.match(pattern);
  return match ? match[1].trim() : '';
}

function parseBulletList(section: string): string[] {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0 && line !== '(empty)');
}

function parseRecentSessionSummaries(section: string): SessionMemorySummary[] {
  if (!section || section.includes('- (empty)')) {
    return [];
  }

  const chunks = section
    .split(/\n(?=#### )/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('#### '));

  return chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const header = lines[0]?.replace(/^####\s+/, '') ?? '';
    const separatorIndex = header.indexOf(' | ');
    const timestamp = separatorIndex === -1 ? header : header.slice(0, separatorIndex).trim();
    const title = separatorIndex === -1 ? '' : header.slice(separatorIndex + 3).trim();
    const summaryLine = lines.find((line) => line.startsWith('- Summary: '));
    const summary = summaryLine ? summaryLine.slice('- Summary: '.length).trim() : '';
    const signals = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .filter((line) => !line.startsWith('- Summary:') && !line.startsWith('- Signals:'))
      .map((line) => line.slice(2).trim());

    return {
      timestamp,
      title,
      summary,
      signals,
    };
  });
}

function parseManagedState(content: string): ManagedMemoryState {
  const managedBlock = extractManagedBlock(content);
  const withoutMarkers = managedBlock.replace(MANAGED_START, '').replace(MANAGED_END, '').trim();

  return {
    userProfile: parseBulletList(sectionBody(withoutMarkers, '### User Profile')),
    habitsAndPreferences: parseBulletList(
      sectionBody(withoutMarkers, '### Habits And Preferences')
    ),
    activeWorkstreams: parseBulletList(sectionBody(withoutMarkers, '### Active Workstreams')),
    recentSessionSummaries: parseRecentSessionSummaries(
      sectionBody(withoutMarkers, '### Recent Session Summaries')
    ),
  };
}

function trimWithMarker(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  const usableChars = Math.max(0, maxChars - TRUNCATED_MARKER.length - 1);
  return `${content.slice(0, usableChars).trimEnd()}\n${TRUNCATED_MARKER}`;
}

export function ensureMemoryMarkdown(current?: string): string {
  let content = normalizeNewlines(current ?? '').trim();

  if (!content) {
    content = MEMORY_TITLE;
  }
  if (!content.includes(MEMORY_TITLE)) {
    content = `${MEMORY_TITLE}\n\n${content}`.trim();
  }
  if (!content.includes(MANUAL_NOTES_HEADING)) {
    content = `${content}\n\n${MANUAL_NOTES_HEADING}\n`;
  }

  return ensureManagedBlock(content).trimEnd() + '\n';
}

export function renderMemoryMarkdown(
  current: string | undefined,
  state: ManagedMemoryState
): string {
  const ensured = ensureMemoryMarkdown(current);
  const managedBlock = renderManagedBlock(state);
  const replaced = ensured.replace(
    new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}`, 'm'),
    managedBlock
  );
  return replaced.trimEnd() + '\n';
}

export function parseMemoryMarkdown(markdown: string | undefined): ParsedMemoryMarkdown {
  const ensured = ensureMemoryMarkdown(markdown);
  return {
    manualNotes: extractManualNotes(ensured),
    managed: parseManagedState(ensured),
  };
}

export function extractSessionMemoryText(messages: Message[]): SessionMemoryTextItem[] {
  const result: SessionMemoryTextItem[] = [];

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }

    const text = message.content
      .filter((block): block is Extract<Message['content'][number], { type: 'text' }> => {
        return block.type === 'text';
      })
      .map((block) => block.text.trim())
      .filter((blockText) => blockText.length > 0)
      .join('\n')
      .trim();

    if (text) {
      result.push({ role: message.role, text });
    }
  }

  return result;
}

export function buildPromptMemoryText(
  markdown: string | undefined,
  options: MemoryPromptBuildOptions
): string {
  const { maxChars, maxFileChars } = options;
  const ensured = trimWithMarker(ensureMemoryMarkdown(markdown), maxFileChars);
  const managedBlock = extractManagedBlock(ensured);
  const manualNotes = extractManualNotes(ensured);
  const prompt = [MEMORY_TITLE, '', managedBlock, '', MANUAL_NOTES_HEADING, manualNotes]
    .join('\n')
    .trimEnd();

  return trimWithMarker(prompt, maxChars);
}
