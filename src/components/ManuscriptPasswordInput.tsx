import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Feather } from 'lucide-react';

// Classic antique bookbinder & calligraphic printer ornaments
// Each typed character stamps a distinct vintage writing mark that settles like drying ink
const MANUSCRIPT_GLYPHS = ['✦', '❦', '❖', '✧', '❧', '✻', '§', '◈'] as const;
// Brief wet-ink nib-stroke preview while a character is freshly stamped
const WET_INK_GLYPHS = ['✎', '✒', '✧', '✦'] as const;

interface ManuscriptPasswordInputProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoComplete?: string;
  showValue: boolean;
  onToggleShow?: () => void;
  showToggleButton?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function ManuscriptPasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  showValue,
  onToggleShow,
  showToggleButton = true,
  autoFocus = false,
  ariaLabel,
  className = '',
}: ManuscriptPasswordInputProps) {
  const [focused, setFocused] = useState(false);
  const [freshIdx, setFreshIdx] = useState<number | null>(null);
  const prevLenRef = useRef(value.length);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (value.length > prevLenRef.current) {
      const newest = value.length - 1;
      setFreshIdx(newest);
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        setFreshIdx(null);
      }, 240);
    } else if (value.length < prevLenRef.current) {
      setFreshIdx(null);
    }
    prevLenRef.current = value.length;
  }, [value.length]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const showManuscriptOverlay = !showValue && value.length > 0;
  // Cap visible ornaments cleanly to the most recent 26 characters so long passphrases never overflow
  const visibleCount = Math.min(value.length, 26);
  const startOffset = Math.max(0, value.length - visibleCount);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type={showValue ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={`input-tactile w-full px-3.5 py-2.5 ${
          showToggleButton ? 'pr-10' : 'pr-3.5'
        } text-sm ${
          showManuscriptOverlay
            ? 'manuscript-masked-input selection:bg-accent-soft'
            : ''
        }`}
      />

      {/* Vintage Manuscript Ink-Glyph Overlay (replaces generic browser dots) */}
      {showManuscriptOverlay && (
        <div
          aria-hidden="true"
          data-testid={`${id}-manuscript-glyphs`}
          className={`pointer-events-none absolute inset-y-0 left-3.5 ${
            showToggleButton ? 'right-10' : 'right-3.5'
          } flex items-center gap-[5px] overflow-hidden select-none`}
        >
          {startOffset > 0 && (
            <span className="text-[11px] font-mono-tabular text-ink-muted shrink-0">
              …
            </span>
          )}
          {Array.from({ length: visibleCount }).map((_, idx) => {
            const charPosition = startOffset + idx;
            const isFresh = freshIdx === charPosition;
            const glyph = isFresh
              ? WET_INK_GLYPHS[charPosition % WET_INK_GLYPHS.length]
              : MANUSCRIPT_GLYPHS[charPosition % MANUSCRIPT_GLYPHS.length];

            return (
              <span
                key={`${charPosition}-${isFresh ? 'wet' : 'dry'}`}
                className={`manuscript-glyph text-[13px] leading-none shrink-0 ${
                  isFresh ? 'text-ink-primary' : 'text-ink-primary/85'
                }`}
              >
                {glyph}
              </span>
            );
          })}

          {focused && (
            <Feather
              className="manuscript-quill-caret w-3.5 h-3.5 ml-0.5 text-ink-muted shrink-0 -rotate-12"
              aria-hidden="true"
            />
          )}
        </div>
      )}

      {showToggleButton && onToggleShow && (
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={showValue ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
        >
          {showValue ? (
            <EyeOff className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Eye className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
