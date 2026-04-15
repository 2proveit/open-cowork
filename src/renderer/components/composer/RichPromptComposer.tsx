import { useEffect, useRef, useState } from 'react';
import { Plus, Send, Square, X } from 'lucide-react';
import type { ContentBlock } from '../../types';
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
import { ComposerEditor } from './ComposerEditor';

interface RichPromptComposerProps {
  isElectron: boolean;
  canStop: boolean;
  modelLabel: string;
  placeholder: string;
  attachFilesTitle: string;
  sendTitle: string;
  stopTitle: string;
  disclaimer: string;
  getPastedImageAlt: (index: number) => string;
  focusKey?: string | null;
  shellClassName?: string;
  onImageProcessError: () => void;
  onSubmit: (contentBlocks: ContentBlock[]) => Promise<void>;
  onStop?: () => void;
  onClick?: () => void;
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
  focusKey,
  shellClassName,
  onImageProcessError,
  onSubmit,
  onStop,
  onClick,
}: RichPromptComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedImages, setPastedImages] = useState<ComposerImageAttachment[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<ComposerFileAttachment[]>([]);
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stopHandler = onStop ?? onClick;

  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    return () => revokeImageUrls(pastedImages);
  }, [pastedImages]);

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) {
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
    if (!isElectron || !window.electronAPI) {
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
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    try {
      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length === 0) {
        return;
      }
      const { images, files } = await processDroppedFiles(droppedFiles);
      if (images.length > 0) {
        setPastedImages((prev) => [...prev, ...images]);
      }
      if (files.length > 0) {
        setAttachedFiles((prev) => [...prev, ...files]);
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

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (isSubmitting) {
      return;
    }

    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt && pastedImages.length === 0 && attachedFiles.length === 0) {
      return;
    }

    const contentBlocks: ContentBlock[] = [
      ...pastedImages.map(toImageContent),
      ...attachedFiles.map(toFileAttachmentContent),
    ];
    if (normalizedPrompt) {
      contentBlocks.push({ type: 'text', text: normalizedPrompt });
    }

    setIsSubmitting(true);
    try {
      await onSubmit(contentBlocks);
      setPrompt('');
      clearAttachments();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !isSubmitting &&
    (prompt.trim().length > 0 || pastedImages.length > 0 || attachedFiles.length > 0);

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full"
    >
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
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title={attachFilesTitle}
        >
          <Plus className="w-5 h-5" />
        </button>

        <ComposerEditor
          value={prompt}
          onValueChange={setPrompt}
          textareaRef={textareaRef}
          onPaste={handlePaste}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(event) => {
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
          <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full border border-border-subtle bg-background/60 text-xs text-text-muted">
            {modelLabel}
          </span>
          {canStop && stopHandler && (
            <button
              type="button"
              onClick={stopHandler}
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

      <p className="text-[11px] text-text-muted/60 text-center mt-2.5">{disclaimer}</p>
    </form>
  );
}
