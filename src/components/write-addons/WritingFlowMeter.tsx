import React from 'react';
import type { TypingFlowMetrics } from '../../utils/typingFlow';

interface WritingFlowMeterProps {
  metrics: TypingFlowMetrics;
  pulseSeq: number;
  wordCount: number;
}

/**
 * Refined editorial WPM & typing-driven cadence indicator for WriteStudio.
 * Uses three hairline vertical ink strokes that rest flat when idle and
 * breathe smoothly with keystrokes, paired with crisp tabular WPM numerals.
 */
export const WritingFlowMeter: React.FC<WritingFlowMeterProps> = ({
  metrics,
  pulseSeq,
  wordCount,
}) => {
  const { wpm, peakWpm, isTypingActive, flowState, flowLabel, cadenceRatio } =
    metrics;

  const isInFlow = flowState === 'flow' || flowState === 'brisk';
  const showFlowWord = isTypingActive && wordCount > 0;
  const showSettledPeak = !isTypingActive && peakWpm > 0 && wordCount > 0;

  // Bar heights respond gently to real cadenceRatio while staying minimal
  const barScales = isTypingActive
    ? [
        0.48 + cadenceRatio * 0.36,
        0.68 + cadenceRatio * 0.32,
        0.4 + cadenceRatio * 0.45,
      ]
    : [0.3, 0.3, 0.3];

  return (
    <div
      data-testid="wpm-flow-meter"
      data-flow-state={flowState}
      data-typing-active={isTypingActive ? 'true' : 'false'}
      data-wpm={wpm}
      title={
        peakWpm > 0
          ? `Typing cadence: ${wpm} WPM · Peak burst: ${peakWpm} WPM`
          : 'Live typing cadence (words per minute)'
      }
      aria-live="off"
      className={`inline-flex items-center gap-2 select-none font-mono-tabular text-[11px] leading-none transition-opacity duration-200 ${
        isTypingActive
          ? 'opacity-100 text-ink-primary'
          : wordCount > 0
            ? 'opacity-70 text-ink-muted'
            : 'opacity-45 text-ink-muted'
      }`}
    >
      {/* 3-Stroke Editorial Ink Cadence Mark + Keystroke Breath Halo */}
      <span
        data-testid="wpm-flow-pulse"
        aria-hidden="true"
        className="relative inline-flex items-end justify-center gap-[2px] w-3.5 h-3 shrink-0"
      >
        {isTypingActive && pulseSeq > 0 && (
          <span
            key={pulseSeq}
            className={`typing-flow-ripple pointer-events-none absolute -inset-1 rounded-full border ${
              isInFlow ? 'border-status-success/45' : 'border-ink-primary/30'
            }`}
          />
        )}
        {barScales.map((scale, idx) => (
          <span
            key={idx}
            style={{ transform: `scaleY(${scale.toFixed(2)})` }}
            className={`wpm-cadence-bar block w-[1.5px] h-2.5 rounded-full ${
              isTypingActive
                ? `wpm-cadence-bar-active ${
                    idx === 1
                      ? 'wpm-cadence-bar-2'
                      : idx === 2
                        ? 'wpm-cadence-bar-3'
                        : ''
                  } ${isInFlow ? 'bg-status-success' : 'bg-ink-primary'}`
                : 'bg-ink-muted/45'
            }`}
          />
        ))}
      </span>

      {/* Crisp Tabular WPM Readout */}
      <span
        data-testid="wpm-counter-value"
        className="inline-flex items-baseline gap-1 tracking-tight"
      >
        <span
          className={`text-[12px] font-semibold ${
            isTypingActive ? 'text-ink-primary' : 'text-ink-secondary'
          }`}
        >
          {wpm}
        </span>
        <span className="text-[10px] font-normal text-ink-muted">wpm</span>
      </span>

      {/* Live Cadence State while typing, or quiet Peak readout at rest */}
      {showFlowWord ? (
        <>
          <span className="text-border-strong" aria-hidden="true">
            /
          </span>
          <span
            data-testid="wpm-flow-label"
            className={`text-[10px] tracking-[0.015em] transition-colors ${
              isInFlow
                ? 'text-status-success font-medium'
                : 'text-ink-secondary'
            }`}
          >
            {flowLabel.toLowerCase()}
          </span>
        </>
      ) : showSettledPeak ? (
        <>
          <span className="text-border-default" aria-hidden="true">
            ·
          </span>
          <span className="text-[10px] text-ink-muted">
            peak {peakWpm}
          </span>
        </>
      ) : null}
    </div>
  );
};
