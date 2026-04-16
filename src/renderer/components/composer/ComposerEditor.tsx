import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEventHandler,
  type CompositionEventHandler,
  type KeyboardEventHandler,
  type Ref,
} from 'react';
import type { ComposerSegment } from './types';
import { segmentToDisplayText } from './composer-serialize';
import { removeSegmentAtCursor } from './composer-model';

interface ComposerEditorProps {
  value: ComposerSegment[];
  onValueChange: (value: ComposerSegment[]) => void;
  onSelectionChange?: (offset: number) => void;
  onPaste?: ClipboardEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onCompositionStart?: CompositionEventHandler<HTMLDivElement>;
  onCompositionEnd?: CompositionEventHandler<HTMLDivElement>;
  placeholder: string;
  disabled?: boolean;
  editorRef: Ref<HTMLDivElement | null>;
  className?: string;
}

export function normalizeSegments(segments: ComposerSegment[]): ComposerSegment[] {
  const normalized: ComposerSegment[] = [];

  for (const segment of segments) {
    if (segment.type === 'text') {
      if (segment.text.length === 0) {
        continue;
      }
      const previous = normalized[normalized.length - 1];
      if (previous?.type === 'text') {
        previous.text += segment.text;
      } else {
        normalized.push({ type: 'text', text: segment.text });
      }
      continue;
    }

    normalized.push(segment);
  }

  return normalized;
}

function serializeSegments(segments: ComposerSegment[]): string {
  return JSON.stringify(normalizeSegments(segments));
}

function createMentionElement(
  documentRef: Document,
  segment: Extract<ComposerSegment, { type: 'file_mention' | 'skill_mention' }>
): HTMLSpanElement {
  const element = documentRef.createElement('span');
  element.contentEditable = 'false';
  element.className =
    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-muted border border-border-muted text-sm text-text-primary align-middle mx-0.5';
  element.dataset.segmentType = segment.type;

  if (segment.type === 'file_mention') {
    element.dataset.path = segment.mention.path;
    element.dataset.name = segment.mention.name;
    element.dataset.workspacePath = segment.mention.workspacePath;
    element.dataset.source = segment.mention.source;
    if (typeof segment.mention.line === 'number') {
      element.dataset.line = String(segment.mention.line);
    }
    if (typeof segment.mention.column === 'number') {
      element.dataset.column = String(segment.mention.column);
    }
    element.textContent = segmentToDisplayText(segment);
    return element;
  }

  element.dataset.skillId = segment.mention.skillId;
  element.dataset.name = segment.mention.name;
  if (segment.mention.description) {
    element.dataset.description = segment.mention.description;
  }
  if (segment.mention.path) {
    element.dataset.path = segment.mention.path;
  }
  element.textContent = segmentToDisplayText(segment);
  return element;
}

function appendBlockSegments(nodes: ChildNode[], segments: ComposerSegment[]): void {
  nodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        segments.push({ type: 'text', text: node.textContent });
      }
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const segmentType = node.dataset.segmentType;
    if (segmentType === 'file_mention') {
      segments.push({
        type: 'file_mention',
        mention: {
          type: 'file_mention',
          path: node.dataset.path ?? '',
          name: node.dataset.name ?? '',
          workspacePath: node.dataset.workspacePath ?? '',
          source: (node.dataset.source as 'workspace' | 'recent' | 'open_tab') ?? 'workspace',
          line: node.dataset.line ? Number(node.dataset.line) : undefined,
          column: node.dataset.column ? Number(node.dataset.column) : undefined,
        },
      });
      return;
    }

    if (segmentType === 'skill_mention') {
      segments.push({
        type: 'skill_mention',
        mention: {
          type: 'skill_mention',
          skillId: node.dataset.skillId ?? '',
          name: node.dataset.name ?? '',
          description: node.dataset.description,
          path: node.dataset.path,
        },
      });
      return;
    }

    if (node.tagName === 'BR') {
      segments.push({ type: 'line_break' });
      return;
    }

    if (node.tagName === 'DIV' || node.tagName === 'P') {
      const beforeLength = segments.length;
      appendBlockSegments(Array.from(node.childNodes), segments);
      if (index < nodes.length - 1 && segments.length >= beforeLength) {
        segments.push({ type: 'line_break' });
      }
      return;
    }

    appendBlockSegments(Array.from(node.childNodes), segments);
  });
}

export function parseSegmentsFromElement(element: HTMLDivElement): ComposerSegment[] {
  const segments: ComposerSegment[] = [];
  appendBlockSegments(Array.from(element.childNodes), segments);
  return normalizeSegments(segments);
}

export function replaceEditorContents(element: HTMLDivElement, value: ComposerSegment[]): void {
  const documentRef = element.ownerDocument;
  const fragment = documentRef.createDocumentFragment();

  for (const segment of normalizeSegments(value)) {
    if (segment.type === 'text') {
      fragment.append(documentRef.createTextNode(segment.text));
      continue;
    }

    if (segment.type === 'line_break') {
      fragment.append(documentRef.createElement('br'));
      continue;
    }

    fragment.append(createMentionElement(documentRef, segment));
  }

  element.replaceChildren(fragment);
}

function insertLineBreakAtSelection(element: HTMLDivElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return;
  }

  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);

  const caretAnchor = document.createTextNode('');
  if (br.parentNode) {
    br.parentNode.insertBefore(caretAnchor, br.nextSibling);
  }

  const nextRange = document.createRange();
  nextRange.setStart(caretAnchor, 0);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function getCursorFromSelectionOffset(
  segments: ComposerSegment[],
  selectionOffset: number
): { segmentIndex: number; offset: number } {
  const normalizedOffset = Math.max(0, selectionOffset);
  let runningOffset = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentText = segmentToDisplayText(segment);
    const segmentLength = segmentText.length;

    if (segment.type === 'text') {
      if (normalizedOffset <= runningOffset + segmentLength) {
        return {
          segmentIndex: index,
          offset: normalizedOffset - runningOffset,
        };
      }
      runningOffset += segmentLength;
      continue;
    }

    if (normalizedOffset <= runningOffset) {
      return { segmentIndex: index, offset: 0 };
    }
    if (normalizedOffset < runningOffset + segmentLength) {
      return { segmentIndex: index + 1, offset: 0 };
    }

    runningOffset += segmentLength;
  }

  return { segmentIndex: segments.length, offset: 0 };
}

function getSelectionOffsetFromCursor(
  segments: ComposerSegment[],
  cursor: { segmentIndex: number; offset: number }
): number {
  let offset = 0;

  for (let index = 0; index < Math.min(cursor.segmentIndex, segments.length); index += 1) {
    offset += segmentToDisplayText(segments[index]).length;
  }

  if (cursor.segmentIndex < segments.length && segments[cursor.segmentIndex]?.type === 'text') {
    offset += cursor.offset;
  }

  return offset;
}

function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0;
  }

  if (!(node instanceof HTMLElement)) {
    return 0;
  }

  if (node.dataset.segmentType === 'file_mention' || node.dataset.segmentType === 'skill_mention') {
    return node.textContent?.length ?? 0;
  }

  if (node.tagName === 'BR') {
    return 1;
  }

  return Array.from(node.childNodes).reduce((total, child) => total + getNodeTextLength(child), 0);
}

function getOffsetFromPoint(root: Node, target: Node, targetOffset: number): number | null {
  if (root === target) {
    if (root.nodeType === Node.TEXT_NODE) {
      return targetOffset;
    }
    if (root instanceof HTMLElement) {
      return Array.from(root.childNodes)
        .slice(0, targetOffset)
        .reduce((total, child) => total + getNodeTextLength(child), 0);
    }
  }

  let runningOffset = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === target) {
      if (child.nodeType === Node.TEXT_NODE) {
        return runningOffset + targetOffset;
      }
      if (child instanceof HTMLElement) {
        return (
          runningOffset +
          Array.from(child.childNodes)
            .slice(0, targetOffset)
            .reduce((total, grandChild) => total + getNodeTextLength(grandChild), 0)
        );
      }
    }

    const nestedOffset = getOffsetFromPoint(child, target, targetOffset);
    if (nestedOffset !== null) {
      return runningOffset + nestedOffset;
    }

    runningOffset += getNodeTextLength(child);
  }

  return null;
}

export function getSelectionOffset(element: HTMLDivElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) && range.startContainer !== element) {
    return 0;
  }

  return getOffsetFromPoint(element, range.startContainer, range.startOffset) ?? 0;
}

function locateSelectionPoint(
  root: Node,
  offset: number
): { container: Node; offset: number } | null {
  if (root.nodeType === Node.TEXT_NODE) {
    const textLength = root.textContent?.length ?? 0;
    return {
      container: root,
      offset: Math.max(0, Math.min(offset, textLength)),
    };
  }

  if (!(root instanceof HTMLElement)) {
    return null;
  }

  if (root.dataset.segmentType === 'file_mention' || root.dataset.segmentType === 'skill_mention') {
    const parent = root.parentNode;
    if (!parent) {
      return null;
    }
    const index = Array.from(parent.childNodes).indexOf(root);
    return {
      container: parent,
      offset: offset <= 0 ? index : index + 1,
    };
  }

  if (root.tagName === 'BR') {
    const parent = root.parentNode;
    if (!parent) {
      return null;
    }
    const index = Array.from(parent.childNodes).indexOf(root);
    return {
      container: parent,
      offset: index + (offset <= 0 ? 0 : 1),
    };
  }

  let remaining = offset;
  const children = Array.from(root.childNodes);
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const childLength = getNodeTextLength(child);
    if (remaining <= childLength) {
      return locateSelectionPoint(child, remaining);
    }
    remaining -= childLength;
  }

  return {
    container: root,
    offset: children.length,
  };
}

export function setSelectionOffset(element: HTMLDivElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const point = locateSelectionPoint(element, Math.max(0, offset));
  if (!point) {
    return;
  }

  const range = document.createRange();
  range.setStart(point.container, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertPlainTextAtSelection(element: HTMLDivElement, text: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return;
  }

  range.deleteContents();
  const fragment = document.createDocumentFragment();
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  lines.forEach((line, index) => {
    if (line.length > 0) {
      fragment.append(document.createTextNode(line));
    }
    if (index < lines.length - 1) {
      fragment.append(document.createElement('br'));
    }
  });

  const caretAnchor = document.createTextNode('');
  fragment.append(caretAnchor);
  range.insertNode(fragment);

  const nextRange = document.createRange();
  nextRange.setStart(caretAnchor, 0);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

export function ComposerEditor({
  value,
  onValueChange,
  onSelectionChange,
  onPaste,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  placeholder,
  disabled = false,
  editorRef,
  className = '',
}: ComposerEditorProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const lastDomValueRef = useRef('');

  useImperativeHandle(editorRef, () => internalRef.current, []);

  useEffect(() => {
    const element = internalRef.current;
    if (!element) {
      return;
    }

    const nextSignature = serializeSegments(value);
    if (nextSignature === lastDomValueRef.current) {
      return;
    }

    replaceEditorContents(element, value);
    lastDomValueRef.current = nextSignature;
  }, [value]);

  return (
    <div
      ref={internalRef}
      role="textbox"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`min-h-[44px] flex-1 whitespace-pre-wrap break-words bg-transparent outline-none text-text-primary text-[15px] py-2 empty:before:content-[attr(data-placeholder)] empty:before:text-text-muted empty:before:pointer-events-none ${className}`}
      onInput={(event) => {
        const nextValue = parseSegmentsFromElement(event.currentTarget);
        lastDomValueRef.current = serializeSegments(nextValue);
        onValueChange(nextValue);
        onSelectionChange?.(getSelectionOffset(event.currentTarget));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.shiftKey) {
          event.preventDefault();
          insertLineBreakAtSelection(event.currentTarget);
          const nextValue = parseSegmentsFromElement(event.currentTarget);
          lastDomValueRef.current = serializeSegments(nextValue);
          onValueChange(nextValue);
          onSelectionChange?.(getSelectionOffset(event.currentTarget));
          return;
        }

        if ((event.key === 'Backspace' || event.key === 'Delete') && !event.defaultPrevented) {
          const selection = window.getSelection();
          if (selection?.rangeCount && selection.isCollapsed) {
            const direction = event.key === 'Backspace' ? 'backward' : 'forward';
            const cursor = getCursorFromSelectionOffset(
              value,
              getSelectionOffset(event.currentTarget)
            );
            const result = removeSegmentAtCursor(value, cursor, direction);

            if (result.removed) {
              event.preventDefault();
              replaceEditorContents(event.currentTarget, result.segments);
              lastDomValueRef.current = serializeSegments(result.segments);
              onValueChange(result.segments);
              const nextSelectionOffset = getSelectionOffsetFromCursor(
                result.segments,
                result.cursor
              );
              setSelectionOffset(event.currentTarget, nextSelectionOffset);
              onSelectionChange?.(nextSelectionOffset);
              return;
            }
          }
        }

        onKeyDown?.(event);
      }}
      onPaste={(event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const hasImageItem = items.some((item) => item.type.startsWith('image/'));

        if (hasImageItem) {
          onPaste?.(event);
          return;
        }

        const plainText = event.clipboardData?.getData('text/plain') ?? '';
        event.preventDefault();
        insertPlainTextAtSelection(event.currentTarget, plainText);
        const nextValue = parseSegmentsFromElement(event.currentTarget);
        lastDomValueRef.current = serializeSegments(nextValue);
        onValueChange(nextValue);
        onSelectionChange?.(getSelectionOffset(event.currentTarget));
      }}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onKeyUp={(event) => {
        onSelectionChange?.(getSelectionOffset(event.currentTarget));
      }}
      onMouseUp={(event) => {
        onSelectionChange?.(getSelectionOffset(event.currentTarget));
      }}
      onFocus={(event) => {
        onSelectionChange?.(getSelectionOffset(event.currentTarget));
      }}
    />
  );
}
