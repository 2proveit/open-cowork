import type {
  ClipboardEventHandler,
  CompositionEventHandler,
  KeyboardEventHandler,
  RefObject,
} from 'react';

interface ComposerEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  onCompositionStart?: CompositionEventHandler<HTMLTextAreaElement>;
  onCompositionEnd?: CompositionEventHandler<HTMLTextAreaElement>;
  placeholder: string;
  disabled?: boolean;
  rows?: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

export function ComposerEditor({
  value,
  onValueChange,
  onPaste,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  placeholder,
  disabled = false,
  rows = 1,
  textareaRef,
  className = '',
}: ComposerEditorProps) {
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className={`flex-1 resize-none bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-[15px] py-2 ${className}`}
    />
  );
}
