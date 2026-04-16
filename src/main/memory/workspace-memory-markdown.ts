import type { Message } from '../../renderer/types';
import type {
  ManagedBlockParseMetadata,
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

interface ManagedRange {
  start: number;
  end: number;
}

interface ManagedMarkerAnalysis extends ManagedBlockParseMetadata {
  range: ManagedRange | null;
}

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
      const heading = summary.title
        ? `#### ${summary.timestamp} | ${summary.title}`
        : `#### ${summary.timestamp}`;
      const lines = [heading, `- Summary: ${summary.summary}`];

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

function collectMarkerIndices(content: string, marker: string): number[] {
  const indices: number[] = [];
  let fromIndex = 0;

  while (fromIndex < content.length) {
    const index = content.indexOf(marker, fromIndex);
    if (index === -1) {
      break;
    }
    indices.push(index);
    fromIndex = index + marker.length;
  }

  return indices;
}

function collectManagedRanges(content: string): ManagedRange[] {
  const starts = collectMarkerIndices(content, MANAGED_START);
  const ends = collectMarkerIndices(content, MANAGED_END);
  const ranges: ManagedRange[] = [];
  const usedEnds = new Set<number>();

  for (const start of starts) {
    const end = ends.find((candidate) => candidate > start && !usedEnds.has(candidate));
    if (typeof end !== 'number') {
      continue;
    }
    usedEnds.add(end);
    ranges.push({ start, end: end + MANAGED_END.length });
  }

  return ranges;
}

function analyzeManagedMarkers(content: string): ManagedMarkerAnalysis {
  const starts = collectMarkerIndices(content, MANAGED_START);
  const ends = collectMarkerIndices(content, MANAGED_END);
  const startMarkerCount = starts.length;
  const endMarkerCount = ends.length;
  const hasManagedBlock = startMarkerCount > 0 || endMarkerCount > 0;

  if (startMarkerCount === 0 && endMarkerCount === 0) {
    return {
      markerStatus: 'missing',
      hasManagedBlock: false,
      hasValidManagedBlock: false,
      startMarkerCount,
      endMarkerCount,
      range: null,
    };
  }

  if (startMarkerCount === 0 || endMarkerCount === 0) {
    return {
      markerStatus: 'incomplete',
      hasManagedBlock,
      hasValidManagedBlock: false,
      startMarkerCount,
      endMarkerCount,
      range: null,
    };
  }

  for (const start of starts) {
    const end = ends.find((candidate) => candidate > start);
    if (typeof end === 'number') {
      const markerStatus = startMarkerCount === 1 && endMarkerCount === 1 ? 'valid' : 'multiple';
      return {
        markerStatus,
        hasManagedBlock,
        hasValidManagedBlock: true,
        startMarkerCount,
        endMarkerCount,
        range: { start, end: end + MANAGED_END.length },
      };
    }
  }

  return {
    markerStatus: 'reversed',
    hasManagedBlock,
    hasValidManagedBlock: false,
    startMarkerCount,
    endMarkerCount,
    range: null,
  };
}

function extractManagedBlock(content: string, analysis?: ManagedMarkerAnalysis): string {
  const markerAnalysis = analysis ?? analyzeManagedMarkers(content);
  if (!markerAnalysis.range) {
    return renderManagedBlock(EMPTY_MANAGED_STATE);
  }

  return content.slice(markerAnalysis.range.start, markerAnalysis.range.end).trimEnd();
}

function removeManagedContent(content: string, analysis?: ManagedMarkerAnalysis): string {
  const markerAnalysis = analysis ?? analyzeManagedMarkers(content);

  if (markerAnalysis.hasValidManagedBlock) {
    const ranges = collectManagedRanges(content);
    if (ranges.length === 0) {
      return content.trimEnd();
    }

    let cursor = 0;
    const parts: string[] = [];
    for (const range of ranges) {
      parts.push(content.slice(cursor, range.start));
      cursor = range.end;
    }
    parts.push(content.slice(cursor));

    return parts
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (markerAnalysis.hasManagedBlock) {
    const firstStart = content.indexOf(MANAGED_START);
    const firstEnd = content.indexOf(MANAGED_END);
    const candidateStarts = [firstStart, firstEnd].filter((index) => index >= 0);
    if (candidateStarts.length > 0) {
      const start = Math.min(...candidateStarts);
      const lastStart = content.lastIndexOf(MANAGED_START);
      const lastEnd = content.lastIndexOf(MANAGED_END);
      const candidateEnds = [
        lastStart >= 0 ? lastStart + MANAGED_START.length : -1,
        lastEnd >= 0 ? lastEnd + MANAGED_END.length : -1,
      ].filter((index) => index >= 0);
      const end = candidateEnds.length > 0 ? Math.max(...candidateEnds) : start;
      return `${content.slice(0, start)}${content.slice(end)}`.replace(/\n{3,}/g, '\n\n').trim();
    }
  }

  return stripMarkerLines(content).trim();
}

function extractManualNotes(content: string, analysis?: ManagedMarkerAnalysis): string {
  const markerAnalysis = analysis ?? analyzeManagedMarkers(content);
  let manualContent = removeManagedContent(content, markerAnalysis);

  if (manualContent.startsWith(MEMORY_TITLE)) {
    manualContent = manualContent.slice(MEMORY_TITLE.length).replace(/^\n+/, '');
  }

  if (manualContent.startsWith(MANUAL_NOTES_HEADING)) {
    manualContent = manualContent.slice(MANUAL_NOTES_HEADING.length);
  }

  return manualContent.replace(/^\n+/, '').trimEnd();
}

function stripMarkerLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== MANAGED_START && trimmed !== MANAGED_END;
    })
    .join('\n')
    .trim();
}

function ensureStructure(current?: string): string {
  let content = normalizeNewlines(current ?? '').trim();

  if (!content) {
    content = `${MEMORY_TITLE}\n\n${MANUAL_NOTES_HEADING}`;
  }
  if (!content.includes(MEMORY_TITLE)) {
    content = `${MEMORY_TITLE}\n\n${content}`.trim();
  }

  return content.trimEnd() + '\n';
}

function composeMemoryMarkdown(manualNotes: string, managedBlock: string): string {
  const normalizedManualNotes = stripMarkerLines(manualNotes);
  const manualSection = normalizedManualNotes
    ? `${MANUAL_NOTES_HEADING}\n${normalizedManualNotes}`
    : `${MANUAL_NOTES_HEADING}`;

  return [MEMORY_TITLE, '', manualSection, '', managedBlock]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

function normalizeMemoryMarkdown(content: string): string {
  const analysis = analyzeManagedMarkers(content);
  const manualNotes = extractManualNotes(content, analysis);
  const managedBlock = extractManagedBlock(content, analysis);
  return composeMemoryMarkdown(manualNotes, managedBlock);
}

function ensureManagedBlock(content: string): string {
  const analysis = analyzeManagedMarkers(content);
  if (analysis.hasValidManagedBlock) {
    return normalizeMemoryMarkdown(content);
  }

  return composeMemoryMarkdown(
    extractManualNotes(content, analysis),
    renderManagedBlock(EMPTY_MANAGED_STATE)
  );
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
    const title = separatorIndex === -1 ? undefined : header.slice(separatorIndex + 3).trim();
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
  if (maxChars <= 0) {
    return '';
  }

  if (content.length <= maxChars) {
    return content;
  }

  if (maxChars <= TRUNCATED_MARKER.length) {
    return TRUNCATED_MARKER.slice(0, maxChars);
  }

  const usableChars = Math.max(0, maxChars - TRUNCATED_MARKER.length);
  const head = content.slice(0, usableChars).trimEnd();
  const combined = `${head}${TRUNCATED_MARKER}`;
  return combined.length <= maxChars ? combined : combined.slice(0, maxChars);
}

export function ensureMemoryMarkdown(current?: string): string {
  const content = ensureStructure(current);
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
  const structured = ensureStructure(markdown);
  const metadata = analyzeManagedMarkers(structured);
  const ensured = ensureManagedBlock(structured);
  return {
    manualNotes: extractManualNotes(ensured, analyzeManagedMarkers(ensured)),
    managed: parseManagedState(ensured),
    metadata: {
      markerStatus: metadata.markerStatus,
      hasManagedBlock: metadata.hasManagedBlock,
      hasValidManagedBlock: metadata.hasValidManagedBlock,
      startMarkerCount: metadata.startMarkerCount,
      endMarkerCount: metadata.endMarkerCount,
    },
    normalizedMarkdown: ensured,
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
  const ensured = ensureMemoryMarkdown(markdown);
  const analysis = analyzeManagedMarkers(ensured);
  const managedBlock = extractManagedBlock(ensured, analysis);
  const manualNotes = extractManualNotes(ensured, analysis);

  const prefix = [MEMORY_TITLE, '', managedBlock, '', MANUAL_NOTES_HEADING].join('\n') + '\n';
  const manualBudget = maxFileChars - prefix.length;
  const boundedManualNotes =
    manualBudget <= 0 ? '' : trimWithMarker(manualNotes, Math.max(0, manualBudget));
  const fileBounded = trimWithMarker(`${prefix}${boundedManualNotes}`.trimEnd(), maxFileChars);

  return trimWithMarker(fileBounded, maxChars);
}

export function hasInvalidManagedMemoryMarkers(markdown: string | undefined): boolean {
  const metadata = parseMemoryMarkdown(markdown).metadata;
  return metadata.hasManagedBlock && !metadata.hasValidManagedBlock;
}
