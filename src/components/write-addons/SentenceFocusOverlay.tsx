import React from 'react';
import { splitParagraphFocusSegments } from '../../utils/sentenceFocus';

interface SentenceFocusOverlayProps {
  text: string;
  caretIndex: number;
  scrollTop: number;
}

/**
 * Synchronized typographic backdrop for Sentence/Paragraph Focus Mode.
 * Renders directly behind a transparent-text textarea (preserving native caret,
 * selection, and IME behavior) while softly dimming non-active paragraphs.
 */
export const SentenceFocusOverlay: React.FC<SentenceFocusOverlayProps> = ({
  text,
  caretIndex,
  scrollTop,
}) => {
  const segments = splitParagraphFocusSegments(text, caretIndex);

  return (
    <div
      aria-hidden="true"
      data-testid="sentence-focus-overlay"
      className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-[16px] sm:text-base leading-[1.82] sm:leading-[1.85]"
    >
      <div style={{ transform: `translateY(-${scrollTop}px)` }}>
        {segments.map((seg, idx) => (
          <span
            key={idx}
            className={`transition-opacity duration-200 text-ink-primary ${
              seg.active ? 'opacity-100' : 'opacity-25'
            }`}
          >
            {seg.text}
          </span>
        ))}
      </div>
    </div>
  );
};
