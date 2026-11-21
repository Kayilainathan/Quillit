import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookmarkPlus, X } from 'lucide-react';
import type { VocabEntry, WritingMode } from '../types';
import {
  MAX_QUICK_DEFINITION_LENGTH,
  MAX_QUICK_WORD_LENGTH,
  buildQuickAddVocabEntry,
} from '../utils/vocabQuickAdd';

interface QuickAddVocabModalProps {
  open: boolean;
  mode: WritingMode;
  todayISO: string;
  existingVocabulary: VocabEntry[];
  onAdd: (entry: VocabEntry) => void;
  onClose: () => void;
}

export function QuickAddVocabModal({
  open,
  mode,
  todayISO,
  existingVocabulary,
  onAdd,
  onClose,
}: QuickAddVocabModalProps) {
  const [word, setWord] = useState('');
  const [definition, setDefinition] = useState('');
  const [error, setError] = useState<string | null>(null);
  const wordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const focusTimer = window.setTimeout(() => {
      wordInputRef.current?.focus();
    }, 30);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = buildQuickAddVocabEntry({
      word,
      definition,
      mode,
      todayISO,
      existingVocabulary,
    });
    if (!result.ok || !result.entry) {
      setError(result.error || 'Please check both fields and try again.');
      return;
    }
    onAdd(result.entry);
    setWord('');
    setDefinition('');
    setError(null);
    onClose();
  }

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-vocab-title"
      data-testid="quick-add-vocab-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-panel w-full max-w-[420px] overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BookmarkPlus
              className="w-4 h-4 text-ink-secondary shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2
                id="quick-add-vocab-title"
                className="font-display text-lg font-medium tracking-tight text-ink-primary leading-tight"
              >
                Quick Add Vocabulary
              </h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Save a word to your library without leaving your draft.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quick Add vocabulary modal"
            className="btn-ghost p-1.5 -mr-1 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="quick-vocab-word"
              className="block text-xs font-medium text-ink-secondary mb-1.5"
            >
              Word
            </label>
            <input
              ref={wordInputRef}
              id="quick-vocab-word"
              type="text"
              value={word}
              maxLength={MAX_QUICK_WORD_LENGTH}
              onChange={(e) => {
                setWord(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g., attenuate, incisive, candid"
              className="input-tactile w-full px-3.5 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="quick-vocab-definition"
              className="block text-xs font-medium text-ink-secondary mb-1.5"
            >
              Definition
            </label>
            <textarea
              id="quick-vocab-definition"
              rows={3}
              value={definition}
              maxLength={MAX_QUICK_DEFINITION_LENGTH}
              onChange={(e) => {
                setDefinition(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  const syntheticEvent = e as unknown as FormEvent;
                  handleSubmit(syntheticEvent);
                }
              }}
              placeholder="Short plain-English meaning or how you want to use it..."
              className="input-tactile w-full px-3.5 py-2 text-sm leading-relaxed resize-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              data-testid="quick-vocab-error"
              className="px-3 py-2 rounded-md border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
            >
              {error}
            </div>
          )}

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-3.5 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="quick-vocab-submit"
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium"
            >
              <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Word</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
