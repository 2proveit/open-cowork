import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ComposerChipProps {
  label: string;
  onRemove?: () => void;
  removeTitle?: string;
  removeDisabled?: boolean;
  className?: string;
  leading?: ReactNode;
}

export function ComposerChip({
  label,
  onRemove,
  removeTitle,
  removeDisabled = false,
  className = '',
  leading,
}: ComposerChipProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border group ${className}`}
    >
      {leading}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{label}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          className="w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title={removeTitle}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
