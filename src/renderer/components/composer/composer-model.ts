import type {
  ComposerCursor,
  ComposerDeleteDirection,
  ComposerSegment,
  RemoveSegmentResult,
} from './types';

function clampCursor(cursor: ComposerCursor, segments: ComposerSegment[]): ComposerCursor {
  if (segments.length === 0) {
    return { segmentIndex: 0, offset: 0 };
  }

  const index = Math.max(0, Math.min(cursor.segmentIndex, segments.length - 1));
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

export function removeSegmentAtCursor(
  segments: ComposerSegment[],
  cursor: ComposerCursor,
  direction: ComposerDeleteDirection = 'backward'
): RemoveSegmentResult {
  if (segments.length === 0) {
    return { segments, cursor: { segmentIndex: 0, offset: 0 }, removed: false };
  }

  const normalizedCursor = clampCursor(cursor, segments);
  const current = segments[normalizedCursor.segmentIndex];

  if (direction === 'backward') {
    const targetIndex =
      current.type === 'text' && normalizedCursor.offset > 0
        ? normalizedCursor.segmentIndex
        : normalizedCursor.segmentIndex - 1;
    const target = segments[targetIndex];

    if (!isAtomicNonTextSegment(target)) {
      return { segments, cursor: normalizedCursor, removed: false };
    }

    const nextSegments = removeAt(segments, targetIndex);
    return {
      segments: nextSegments,
      cursor: {
        segmentIndex: Math.max(0, targetIndex),
        offset: 0,
      },
      removed: true,
    };
  }

  const targetIndex =
    current.type === 'text' && normalizedCursor.offset < current.text.length
      ? normalizedCursor.segmentIndex
      : normalizedCursor.segmentIndex + 1;
  const target = segments[targetIndex];

  if (!isAtomicNonTextSegment(target)) {
    return { segments, cursor: normalizedCursor, removed: false };
  }

  const nextSegments = removeAt(segments, targetIndex);
  return {
    segments: nextSegments,
    cursor: {
      segmentIndex: Math.min(normalizedCursor.segmentIndex, Math.max(0, nextSegments.length - 1)),
      offset: 0,
    },
    removed: true,
  };
}
