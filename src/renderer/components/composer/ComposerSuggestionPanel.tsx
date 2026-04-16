import type { ComposerCandidate } from './types';

interface ComposerSuggestionPanelProps {
  candidates: ComposerCandidate[];
  highlightedIndex: number;
  onSelect: (candidate: ComposerCandidate) => void;
  onHover?: (index: number) => void;
  className?: string;
}

export function ComposerSuggestionPanel({
  candidates,
  highlightedIndex,
  onSelect,
  onHover,
  className = '',
}: ComposerSuggestionPanelProps) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div
      className={`absolute bottom-full mb-2 w-full rounded-2xl border border-border-muted bg-background/95 backdrop-blur-md shadow-soft overflow-hidden ${className}`}
    >
      <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
        {candidates.map((candidate, index) => (
          <li key={candidate.id}>
            <button
              type="button"
              role="option"
              aria-selected={highlightedIndex === index}
              onMouseEnter={() => onHover?.(index)}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => onSelect(candidate)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                highlightedIndex === index
                  ? 'bg-accent/12 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {candidate.type === 'file_mention' ? '@' : '/'}
              {candidate.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
