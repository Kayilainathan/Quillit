export const SWIPE_LOCK_THRESHOLD = 0.82;

/**
 * Computes the clamped [0, 1] normalized swipe ratio from a horizontal drag delta
 * and the available track travel distance (trackInnerWidth - thumbWidth).
 */
export function computeSwipeRatio(deltaX: number, maxTravelPx: number): number {
  if (!Number.isFinite(deltaX) || !Number.isFinite(maxTravelPx) || maxTravelPx <= 0) {
    return 0;
  }
  const raw = deltaX / maxTravelPx;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

/**
 * Returns true once the swipe handle crosses the lock confirmation threshold.
 */
export function shouldTriggerSwipeLock(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio >= SWIPE_LOCK_THRESHOLD;
}
