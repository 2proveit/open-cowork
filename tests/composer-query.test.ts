import { describe, expect, it } from 'vitest';
import {
  applySuggestionNavigation,
  extractActiveMentionQuery,
} from '../src/renderer/components/composer/composer-query';

describe('extractActiveMentionQuery', () => {
  it('detects @ queries only at token boundaries', () => {
    const inMiddle = 'hello@wo';
    const atBoundary = 'hello @wo';

    expect(extractActiveMentionQuery(inMiddle, inMiddle.length)).toBeNull();
    expect(extractActiveMentionQuery(atBoundary, atBoundary.length)).toEqual({
      marker: '@',
      query: 'wo',
      replaceFrom: 6,
      replaceTo: 9,
    });
  });
});

describe('applySuggestionNavigation', () => {
  it('moves highlighted index with arrow keys and wraps safely', () => {
    expect(applySuggestionNavigation(0, 'ArrowUp', 3)).toBe(2);
    expect(applySuggestionNavigation(2, 'ArrowDown', 3)).toBe(0);
    expect(applySuggestionNavigation(-1, 'ArrowDown', 3)).toBe(0);
    expect(applySuggestionNavigation(-1, 'ArrowUp', 3)).toBe(2);
    expect(applySuggestionNavigation(0, 'ArrowDown', 0)).toBe(-1);
  });
});
