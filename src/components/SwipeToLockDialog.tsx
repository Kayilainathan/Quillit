import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Lock, X } from 'lucide-react';
import {
  computeSwipeRatio,
  shouldTriggerSwipeLock,
} from '../utils/swipeLock';

interface SwipeToLockDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirmLock: () => void;
}

const THUMB_SIZE_PX = 44;
const TRACK_PADDING_PX = 4;

export function SwipeToLockDialog({
  open,
  onClose,
  onConfirmLock,
}: SwipeToLockDialogProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLButtonElement | null>(null);
  const dragOriginRef = useRef<{
    pointerId: number;
    startX: number;
    maxTravel: number;
  } | null>(null);
  const lockTimerRef = useRef<number | null>(null);

  const [ratio, setRatio] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [locked, setLocked] = useState(false);
  const [maxTravelPx, setMaxTravelPx] = useState(240);

  const measureTravel = useCallback(() => {
    const el = trackRef.current;
    if (!el) return 240;
    const travel = Math.max(
      1,
      el.clientWidth - THUMB_SIZE_PX - TRACK_PADDING_PX * 2
    );
    setMaxTravelPx(travel);
    return travel;
  }, []);

  useEffect(() => {
    if (!open) {
      setRatio(0);
      setDragging(false);
      setLocked(false);
      dragOriginRef.current = null;
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      measureTravel();
      thumbRef.current?.focus();
    });

    function handleResize() {
      measureTravel();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !locked) {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, locked, measureTravel, onClose]);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
      }
    };
  }, []);

  const commitLock = useCallback(() => {
    if (locked) return;
    setLocked(true);
    setDragging(false);
    setRatio(1);
    dragOriginRef.current = null;
    lockTimerRef.current = window.setTimeout(() => {
      onClose();
      onConfirmLock();
    }, 150);
  }, [locked, onClose, onConfirmLock]);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (locked) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const travel = measureTravel();
    dragOriginRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      maxTravel: travel,
    };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events may not support capture
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== e.pointerId || locked) return;
    const next = computeSwipeRatio(e.clientX - origin.startX, origin.maxTravel);
    setRatio(next);
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLButtonElement>) {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== e.pointerId || locked) return;
    const finalRatio = computeSwipeRatio(
      e.clientX - origin.startX,
      origin.maxTravel
    );
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
    dragOriginRef.current = null;
    setDragging(false);

    if (shouldTriggerSwipeLock(finalRatio)) {
      commitLock();
    } else {
      setRatio(0);
    }
  }

  function handleThumbKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (locked) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(1, ratio + 0.25);
      if (shouldTriggerSwipeLock(next)) {
        commitLock();
      } else {
        setRatio(next);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setRatio((prev) => Math.max(0, prev - 0.25));
    } else if (e.key === 'End' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commitLock();
    }
  }

  if (!open) return null;

  const readyToLock = shouldTriggerSwipeLock(ratio);
  const translateX = Math.round(ratio * maxTravelPx);
  const labelOpacity = locked ? 1 : Math.max(0.18, 1 - ratio * 1.15);

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="swipe-lock-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) {
          onClose();
        }
      }}
    >
      <div className="modal-panel w-full max-w-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg border border-border-default bg-subtle flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-ink-primary" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="swipe-lock-title"
                className="font-display text-lg font-medium tracking-tight text-ink-primary"
              >
                Lock Studio
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                Your drafts stay encrypted on this device. Slide to lock this session.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Cancel studio lock"
            className="btn-ghost p-1.5 -mt-1 -mr-1"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Interactive Swipe-to-Lock Track */}
        <div className="space-y-2">
          <div
            ref={trackRef}
            data-testid="swipe-lock-track"
            className={`relative h-[52px] rounded-full border p-1 select-none overflow-hidden touch-none transition-colors ${
              locked || readyToLock
                ? 'border-border-strong bg-accent-soft'
                : 'border-border-default bg-subtle'
            }`}
          >
            {/* Expanding subtle fill bar */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-full bg-accent-soft origin-left pointer-events-none"
              style={{
                transform: `scaleX(${Math.max(0, Math.min(1, ratio))})`,
                transition: dragging
                  ? 'none'
                  : 'transform 220ms var(--ease-out-expo)',
              }}
            />

            {/* Centered track cue */}
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center pointer-events-none pl-7 pr-4"
              style={{
                opacity: readyToLock || locked ? 1 : labelOpacity,
                transition: dragging ? 'none' : 'opacity 180ms ease',
              }}
            >
              <span className="text-xs font-medium tracking-tight text-ink-secondary">
                {locked
                  ? 'Studio locked'
                  : readyToLock
                    ? 'Release to lock'
                    : 'Swipe right to lock'}
              </span>
            </div>

            {/* Draggable circular handle */}
            <button
              ref={thumbRef}
              type="button"
              role="slider"
              data-testid="swipe-lock-handle"
              aria-label="Slide right to lock studio"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
              aria-valuetext={
                locked
                  ? 'Locked'
                  : readyToLock
                    ? 'Ready to lock'
                    : 'Slide right to confirm lock'
              }
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onKeyDown={handleThumbKeyDown}
              style={{
                transform: `translate3d(${translateX}px, 0, 0)`,
                transition: dragging
                  ? 'none'
                  : 'transform 220ms var(--ease-out-expo)',
              }}
              className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                locked
                  ? 'bg-status-success text-ink-inverse'
                  : 'bg-accent text-ink-inverse shadow-sm'
              }`}
            >
              {locked ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : readyToLock ? (
                <Lock className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <p className="text-[11px] text-ink-muted text-center">
            Drag slider or press Enter to confirm
          </p>
        </div>

        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="btn-ghost px-3 py-1.5 text-xs font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
