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

  it('allows slash in @ file mention queries but still ignores email-like tokens', () => {
    const nestedPathQuery = 'open @src/renderer/composer';
    const emailLike = 'contact dev@example.com';

    expect(extractActiveMentionQuery(nestedPathQuery, nestedPathQuery.length)).toEqual({
      marker: '@',
      query: 'src/renderer/composer',
      replaceFrom: 5,
      replaceTo: 27,
    });
    expect(extractActiveMentionQuery(emailLike, emailLike.length)).toBeNull();
  });

  it('ignores trailing punctuation when extracting mention queries', () => {
    const fileWithPunctuation = 'open @src/renderer),';
    const skillWithPunctuation = 'run /brainstorming,';
    const slashWithExtraSlash = 'run /a/b';

    expect(extractActiveMentionQuery(fileWithPunctuation, fileWithPunctuation.length)).toEqual({
      marker: '@',
      query: 'src/renderer',
      replaceFrom: 5,
      replaceTo: 18,
    });
    expect(extractActiveMentionQuery(skillWithPunctuation, skillWithPunctuation.length)).toEqual({
      marker: '/',
      query: 'brainstorming',
      replaceFrom: 4,
      replaceTo: 18,
    });
    expect(extractActiveMentionQuery(slashWithExtraSlash, slashWithExtraSlash.length)).toBeNull();
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
