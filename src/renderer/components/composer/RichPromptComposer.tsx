import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Send, Square, X } from 'lucide-react';
import type { ContentBlock, Skill } from '../../types';
import type { ActiveMentionQuery, ComposerCandidate, ComposerSegment } from './types';
import { ComposerSuggestionPanel } from './ComposerSuggestionPanel';
import { segmentToDisplayText, serializeComposerValue } from './composer-serialize';
import {
  applySuggestionNavigation,
  buildFileCandidates,
  buildSkillCandidates,
  extractActiveMentionQuery,
} from './composer-query';
import {
  filesFromPaths,
  processDroppedFiles,
  revokeImageUrls,
  toFileAttachmentContent,
  toImageAttachment,
  toImageContent,
  type ComposerFileAttachment,
  type ComposerImageAttachment,
} from './composer-attachments';
import { ComposerChip } from './ComposerChip';
import { ComposerEditor, setSelectionOffset as setEditorSelectionOffset } from './ComposerEditor';

interface RichPromptComposerSubmitPayload {
  displayText: string;
  contentBlocks: ContentBlock[];
}

interface RichPromptComposerProps {
  isElectron: boolean;
  canStop: boolean;
  modelLabel?: string;
  placeholder: string;
  attachFilesTitle: string;
  sendTitle: string;
  stopTitle: string;
  disclaimer?: string;
  getPastedImageAlt: (index: number) => string;
  workspacePath?: string;
  initialSkills?: Skill[];
  seedText?: string;
  seedKey?: string | number;
  focusKey?: string | null;
  shellClassName?: string;
  onImageProcessError: () => void;
  onSubmit: (payload: RichPromptComposerSubmitPayload) => Promise<boolean | void> | boolean | void;
  onStop?: () => void;
}

function textToSegments(text: string): ComposerSegment[] {
  if (!text) {
    return [];
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const segments: ComposerSegment[] = [];

  lines.forEach((line, index) => {
    if (line.length > 0) {
      segments.push({ type: 'text', text: line });
    }
    if (index < lines.length - 1) {
      segments.push({ type: 'line_break' });
    }
  });

  return segments;
}

function compactSegments(segments: ComposerSegment[]): ComposerSegment[] {
  const next: ComposerSegment[] = [];

  for (const segment of segments) {
    if (segment.type === 'text') {
      if (!segment.text) {
        continue;
      }
      const previous = next[next.length - 1];
      if (previous?.type === 'text') {
        previous.text += segment.text;
      } else {
        next.push({ type: 'text', text: segment.text });
      }
      continue;
    }

    next.push(segment);
  }

  return next;
}

function trimTrailingSubmissionWhitespace(segments: ComposerSegment[]): ComposerSegment[] {
  const next = compactSegments(segments.map((segment) => ({ ...segment })) as ComposerSegment[]);
  const lastSegment = next[next.length - 1];
  if (lastSegment?.type !== 'text') {
    return next;
  }

  const trimmedText = lastSegment.text.replace(/[ \t]+$/g, '');
  if (trimmedText.length === 0) {
    return next.slice(0, -1);
  }

  lastSegment.text = trimmedText;
  return next;
}

function replaceMentionQuery(
  segments: ComposerSegment[],
  query: ActiveMentionQuery,
  candidate: ComposerCandidate
): ComposerSegment[] {
  const insertionSegment: ComposerSegment =
    candidate.type === 'file_mention'
      ? { type: 'file_mention', mention: candidate.mention }
      : { type: 'skill_mention', mention: candidate.mention };

  const nextSegments: ComposerSegment[] = [];
  let displayOffset = 0;
  let inserted = false;

  for (const segment of segments) {
    const displayText = segmentToDisplayText(segment);
    const segmentStart = displayOffset;
    const segmentEnd = displayOffset + displayText.length;
    const overlaps = segmentEnd > query.replaceFrom && segmentStart < query.replaceTo;

    if (!overlaps) {
      if (!inserted && query.replaceFrom === query.replaceTo && segmentStart >= query.replaceFrom) {
        nextSegments.push(insertionSegment, { type: 'text', text: ' ' });
        inserted = true;
      }
      nextSegments.push(segment);
      displayOffset = segmentEnd;
      continue;
    }

    if (segment.type === 'text' || segment.type === 'line_break') {
      const rawText = segment.type === 'line_break' ? '\n' : segment.text;
      const localStart = Math.max(0, query.replaceFrom - segmentStart);
      const localEnd = Math.max(0, Math.min(rawText.length, query.replaceTo - segmentStart));
      nextSegments.push(...textToSegments(rawText.slice(0, localStart)));
      if (!inserted) {
        nextSegments.push(insertionSegment, { type: 'text', text: ' ' });
        inserted = true;
      }
      nextSegments.push(...textToSegments(rawText.slice(localEnd)));
    } else if (!inserted) {
      nextSegments.push(insertionSegment, { type: 'text', text: ' ' });
      inserted = true;
    }

    displayOffset = segmentEnd;
  }

  if (!inserted) {
    nextSegments.push(insertionSegment, { type: 'text', text: ' ' });
  }

  return compactSegments(nextSegments);
}

export function RichPromptComposer({
  isElectron,
  canStop,
  modelLabel,
  placeholder,
  attachFilesTitle,
  sendTitle,
  stopTitle,
  disclaimer,
  getPastedImageAlt,
  workspacePath,
  initialSkills = [],
  seedText,
  seedKey,
  focusKey,
  shellClassName,
  onImageProcessError,
  onSubmit,
  onStop,
}: RichPromptComposerProps) {
  const [segments, setSegments] = useState<ComposerSegment[]>(() => textToSegments(seedText ?? ''));
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [selectionOffset, setCursorOffset] = useState(0);
  const [queryState, setQueryState] = useState<ActiveMentionQuery | null>(null);
  const [candidates, setCandidates] = useState<ComposerCandidate[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedImages, setPastedImages] = useState<ComposerImageAttachment[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<ComposerFileAttachment[]>([]);
  const isComposingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const latestImagesRef = useRef<ComposerImageAttachment[]>([]);
  const candidateRequestIdRef = useRef(0);
  const pendingSelectionOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    editorRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    latestImagesRef.current = pastedImages;
  }, [pastedImages]);

  useEffect(() => {
    return () => {
      revokeImageUrls(latestImagesRef.current);
    };
  }, []);

  useEffect(() => {
    if (seedKey === undefined) {
      return;
    }

    const nextSegments = textToSegments(seedText ?? '');
    setSegments(nextSegments);
    setCandidates([]);
    setHighlightedIndex(-1);
    pendingSelectionOffsetRef.current = (seedText ?? '').length;
  }, [seedKey, seedText]);

  useEffect(() => {
    if (pendingSelectionOffsetRef.current === null || !editorRef.current) {
      return;
    }

    setEditorSelectionOffset(editorRef.current, pendingSelectionOffsetRef.current);
    setCursorOffset(pendingSelectionOffsetRef.current);
    pendingSelectionOffsetRef.current = null;
  }, [segments]);

  const submissionSegments = useMemo(() => trimTrailingSubmissionWhitespace(segments), [segments]);

  const serializedValue = useMemo(
    () =>
      serializeComposerValue({
        segments: submissionSegments,
        imageBlocks: pastedImages.map(toImageContent),
        attachmentBlocks: attachedFiles.map(toFileAttachmentContent),
      }),
    [attachedFiles, pastedImages, submissionSegments]
  );

  const composerDisplayText = useMemo(
    () =>
      serializeComposerValue({
        segments,
      }).displayText,
    [segments]
  );

  useEffect(() => {
    const nextQuery = extractActiveMentionQuery(composerDisplayText, selectionOffset);
    setQueryState(nextQuery);

    if (!nextQuery) {
      candidateRequestIdRef.current += 1;
      setCandidates([]);
      setHighlightedIndex(-1);
      return;
    }

    const requestId = candidateRequestIdRef.current + 1;
    candidateRequestIdRef.current = requestId;

    const loadCandidates = async () => {
      if (nextQuery.marker === '@') {
        if (!workspacePath || !isElectron || !window.electronAPI?.workspace?.searchFiles) {
          setCandidates([]);
          setHighlightedIndex(-1);
          return;
        }

        const files = await window.electronAPI.workspace.searchFiles(nextQuery.query);
        if (candidateRequestIdRef.current !== requestId) {
          return;
        }

        const nextCandidates = buildFileCandidates(files, workspacePath);
        setCandidates(nextCandidates);
        setHighlightedIndex(nextCandidates.length > 0 ? 0 : -1);
        return;
      }

      let availableSkills = skills;
      if (availableSkills.length === 0 && isElectron && window.electronAPI?.skills?.getAll) {
        availableSkills = await window.electronAPI.skills.getAll();
        if (candidateRequestIdRef.current !== requestId) {
          return;
        }
        setSkills(availableSkills);
      }

      const nextCandidates = buildSkillCandidates(availableSkills).filter((candidate) =>
        candidate.label.toLowerCase().includes(nextQuery.query.toLowerCase())
      );
      setCandidates(nextCandidates);
      setHighlightedIndex(nextCandidates.length > 0 ? 0 : -1);
    };

    void loadCandidates().catch((error) => {
      console.error('[RichPromptComposer] Failed to refresh mention candidates:', error);
      if (candidateRequestIdRef.current === requestId) {
        setCandidates([]);
        setHighlightedIndex(-1);
      }
    });
  }, [composerDisplayText, isElectron, selectionOffset, skills, workspacePath]);

  const hasPromptText = serializedValue.displayText.trim().length > 0;

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items || isSubmitting) {
      return;
    }

    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) {
      return;
    }

    event.preventDefault();
    const nextImages: ComposerImageAttachment[] = [];
    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (!blob) {
        continue;
      }
      try {
        nextImages.push(await toImageAttachment(blob));
      } catch {
        onImageProcessError();
      }
    }

    if (nextImages.length > 0) {
      setPastedImages((prev) => [...prev, ...nextImages]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setPastedImages((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(index, 1);
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
      return updated;
    });
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleFileSelect = async () => {
    if (isSubmitting || !isElectron || !window.electronAPI) {
      return;
    }

    try {
      const selectedPaths = await window.electronAPI.selectFiles();
      if (selectedPaths.length === 0) {
        return;
      }
      setAttachedFiles((prev) => [...prev, ...filesFromPaths(selectedPaths)]);
    } catch (error) {
      console.error('[RichPromptComposer] Error selecting files:', error);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isSubmitting) {
      return;
    }
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isSubmitting) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (isSubmitting) {
      return;
    }

    try {
      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length === 0) {
        return;
      }
      const { images, files, imageFailureCount } = await processDroppedFiles(droppedFiles);
      if (images.length > 0) {
        setPastedImages((prev) => [...prev, ...images]);
      }
      if (files.length > 0) {
        setAttachedFiles((prev) => [...prev, ...files]);
      }
      for (let i = 0; i < imageFailureCount; i += 1) {
        onImageProcessError();
      }
    } catch {
      onImageProcessError();
    }
  };

  const clearAttachments = () => {
    revokeImageUrls(pastedImages);
    setPastedImages([]);
    setAttachedFiles([]);
  };

  const insertCandidate = (candidate: ComposerCandidate) => {
    if (!queryState) {
      return;
    }

    const nextSegments = replaceMentionQuery(segments, queryState, candidate);
    const insertedLength =
      segmentToDisplayText(
        candidate.type === 'file_mention'
          ? { type: 'file_mention', mention: candidate.mention }
          : { type: 'skill_mention', mention: candidate.mention }
      ).length + 1;

    pendingSelectionOffsetRef.current = queryState.replaceFrom + insertedLength;
    setSegments(nextSegments);
    setCandidates([]);
    setHighlightedIndex(-1);
    setQueryState(null);
    editorRef.current?.focus();
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (!hasPromptText && pastedImages.length === 0 && attachedFiles.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const shouldClear = await onSubmit(serializedValue);
      if (shouldClear !== false) {
        setSegments([]);
        setCandidates([]);
        setHighlightedIndex(-1);
        setQueryState(null);
        pendingSelectionOffsetRef.current = 0;
        clearAttachments();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !isSubmitting && (hasPromptText || pastedImages.length > 0 || attachedFiles.length > 0);

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full"
    >
      <ComposerSuggestionPanel
        candidates={candidates}
        highlightedIndex={highlightedIndex}
        onHover={setHighlightedIndex}
        onSelect={insertCandidate}
      />

      {pastedImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
          {pastedImages.map((image, index) => (
            <div key={image.url || `pasted-image-${index}`} className="relative group">
              <img
                src={image.url}
                alt={getPastedImageAlt(index)}
                className="w-full aspect-square object-cover rounded-lg border border-border block"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                disabled={isSubmitting}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className="space-y-2 mb-3">
          {attachedFiles.map((file, index) => (
            <ComposerChip
              key={file.path || `attached-file-${index}`}
              label={file.name}
              onRemove={() => handleRemoveFile(index)}
              removeDisabled={isSubmitting}
            />
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 p-3.5 border border-border-muted transition-colors ${
          isDragging ? 'ring-2 ring-accent bg-accent/5' : ''
        } ${shellClassName ?? 'rounded-[1.75rem] bg-background/88 shadow-soft'}`}
      >
        <button
          type="button"
          onClick={handleFileSelect}
          disabled={isSubmitting}
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
          title={attachFilesTitle}
        >
          <Plus className="w-5 h-5" />
        </button>

        <ComposerEditor
          value={segments}
          onValueChange={setSegments}
          onSelectionChange={setCursorOffset}
          editorRef={editorRef}
          onPaste={handlePaste}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(event) => {
            const suggestionsOpen = queryState !== null && candidates.length > 0;
            if (suggestionsOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              setHighlightedIndex((current) =>
                applySuggestionNavigation(
                  current,
                  event.key as 'ArrowDown' | 'ArrowUp',
                  candidates.length
                )
              );
              return;
            }

            const canAcceptSuggestion =
              suggestionsOpen &&
              (event.key === 'Tab' ||
                (event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  !isComposingRef.current &&
                  event.keyCode !== 229));
            if (canAcceptSuggestion) {
              event.preventDefault();
              const nextIndex = highlightedIndex >= 0 ? highlightedIndex : 0;
              const candidate = candidates[nextIndex];
              if (candidate) {
                insertCandidate(candidate);
              }
              return;
            }

            if (event.key !== 'Enter' || event.shiftKey) {
              return;
            }
            if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) {
              return;
            }
            event.preventDefault();
            void handleSubmit();
          }}
          placeholder={placeholder}
          disabled={isSubmitting}
        />

        <div className="flex items-center gap-2">
          {modelLabel ? (
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full border border-border-subtle bg-background/60 text-xs text-text-muted">
              {modelLabel}
            </span>
          ) : null}
          {canStop && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="w-9 h-9 rounded-2xl flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors"
              title={stopTitle}
            >
              <Square className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-9 h-9 rounded-2xl flex items-center justify-center bg-accent text-background disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
            title={sendTitle}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {disclaimer ? (
        <p className="text-[11px] text-text-muted/60 text-center mt-2.5">{disclaimer}</p>
      ) : null}
    </form>
  );
}
