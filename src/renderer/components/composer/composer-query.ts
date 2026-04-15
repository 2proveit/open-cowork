import type { ActiveMentionQuery } from './types';

const MENTION_PATTERN = /(?:^|[\s([{])([@/])([^\s]*)$/;
const TRAILING_QUERY_PUNCTUATION = /[)\],]+$/;

export function extractActiveMentionQuery(
  text: string,
  cursorOffset: number
): ActiveMentionQuery | null {
  const offset = Math.max(0, Math.min(cursorOffset, text.length));
  const prefix = text.slice(0, offset);
  const match = prefix.match(MENTION_PATTERN);

  if (!match) {
    return null;
  }

  const marker = match[1] as ActiveMentionQuery['marker'];
  const rawQuery = match[2] ?? '';
  const query = rawQuery.replace(TRAILING_QUERY_PUNCTUATION, '');
  if (marker === '@' && query.includes('@')) {
    return null;
  }
  if (marker === '/' && query.includes('/')) {
    return null;
  }
  const replaceTo = offset - (rawQuery.length - query.length);
  const replaceFrom = replaceTo - query.length - 1;

  return { marker, query, replaceFrom, replaceTo };
}

export function applySuggestionNavigation(
  highlightedIndex: number,
  key: 'ArrowUp' | 'ArrowDown',
  candidateCount: number
): number {
  if (candidateCount <= 0) {
    return -1;
  }

  if (key === 'ArrowDown') {
    if (highlightedIndex < 0) {
      return 0;
    }
    return (highlightedIndex + 1) % candidateCount;
  }

  if (highlightedIndex < 0) {
    return candidateCount - 1;
  }
  return (highlightedIndex - 1 + candidateCount) % candidateCount;
}
