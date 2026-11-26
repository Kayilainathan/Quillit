import { useLayoutEffect, useState, type RefObject } from 'react';

export interface InkIndicatorRect {
  left: number;
  width: number;
  ready: boolean;
}

/**
 * Measures the active `[data-active="true"]` tab inside a scrollable or
 * horizontal container so a compositor-accelerated ink underline or foil
 * glides smoothly between tabs with zero external runtime dependencies.
 */
export function useSlidingInkIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string
): InkIndicatorRect {
  const [rect, setRect] = useState<InkIndicatorRect>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const activeEl = container.querySelector<HTMLElement>(
        '[data-active="true"]'
      );
      if (!activeEl) {
        setRect((prev) => (prev.ready ? { ...prev, ready: false } : prev));
        return;
      }
      const nextLeft = activeEl.offsetLeft;
      const nextWidth = activeEl.offsetWidth;
      setRect((prev) => {
        if (
          prev.ready &&
          Math.abs(prev.left - nextLeft) < 0.5 &&
          Math.abs(prev.width - nextWidth) < 0.5
        ) {
          return prev;
        }
        return { left: nextLeft, width: nextWidth, ready: nextWidth > 0 };
      });
    };

    measure();

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null;
    ro?.observe(container);
    window.addEventListener('resize', measure);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, activeKey]);

  return rect;
}
