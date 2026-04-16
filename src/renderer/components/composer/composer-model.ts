import type {
  ComposerCursor,
  ComposerDeleteDirection,
  ComposerSegment,
  RemoveSegmentResult,
} from './types';

function clampCursor(cursor: ComposerCursor, segments: ComposerSegment[]): ComposerCursor {
  const index = Math.max(0, Math.min(cursor.segmentIndex, segments.length));
  if (segments.length === 0 || index === segments.length) {
    return { segmentIndex: index, offset: 0 };
  }
  const segment = segments[index];
  if (segment?.type === 'text') {
    return {
      segmentIndex: index,
      offset: Math.max(0, Math.min(cursor.offset, segment.text.length)),
    };
  }
  return { segmentIndex: index, offset: 0 };
}

function removeAt<T>(items: T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

function isAtomicNonTextSegment(segment: ComposerSegment | undefined): boolean {
  return !!segment && segment.type !== 'text';
}

function getBackwardAtomicTargetIndex(
  segments: ComposerSegment[],
  cursor: ComposerCursor
): number | null {
  if (cursor.segmentIndex === 0) {
    return null;
  }

  if (cursor.segmentIndex === segments.length) {
    return segments.length - 1;
  }

  const current = segments[cursor.segmentIndex];
  if (current?.type === 'text') {
    return cursor.offset === 0 ? cursor.segmentIndex - 1 : null;
  }

  return cursor.segmentIndex - 1;
}

function getForwardAtomicTargetIndex(
  segments: ComposerSegment[],
  cursor: ComposerCursor
): number | null {
  if (cursor.segmentIndex >= segments.length) {
    return null;
  }

  const current = segments[cursor.segmentIndex];
  if (current?.type === 'text') {
    return cursor.offset === current.text.length ? cursor.segmentIndex + 1 : null;
  }

  return cursor.segmentIndex;
}

export function removeSegmentAtCursor(
  segments: ComposerSegment[],
  cursor: ComposerCursor,
  direction: ComposerDeleteDirection = 'backward'
): RemoveSegmentResult {
  if (segments.length === 0) {
    return { segments, cursor: { segmentIndex: 0, offset: 0 }, removed: false };
  }

  const normalizedCursor = clampCursor(cursor, segments);
  const targetIndex =
    direction === 'backward'
      ? getBackwardAtomicTargetIndex(segments, normalizedCursor)
      : getForwardAtomicTargetIndex(segments, normalizedCursor);
  if (targetIndex === null) {
    return { segments, cursor: normalizedCursor, removed: false };
  }

  const target = segments[targetIndex];
  if (!isAtomicNonTextSegment(target)) {
    return { segments, cursor: normalizedCursor, removed: false };
  }

  const nextSegments = removeAt(segments, targetIndex);
  return {
    segments: nextSegments,
    cursor: {
      segmentIndex:
        direction === 'backward'
          ? Math.min(targetIndex, nextSegments.length)
          : Math.min(normalizedCursor.segmentIndex, nextSegments.length),
      offset: 0,
    },
    removed: true,
  };
}
