import { useEffect, useRef } from 'react';

interface PinchState {
  active: boolean;
  initialDist: number;
  startZoom: number;
  lastMidX: number;
  lastMidY: number;
}

export function clampZoomValue(z: number): number {
  return Math.max(0.4, Math.min(3.0, Math.round(z * 100) / 100));
}

/**
 * Enables native-feeling 2-finger pinch-in / pinch-out zoom (and simultaneous 2-finger pan)
 * plus Ctrl/Cmd + mouse wheel / trackpad pinch on scrollable canvas containers.
 */
export function usePinchZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  zoom: number,
  onChangeZoom: (nextZoom: number) => void,
  onZoomWheel: (deltaY: number) => void
) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const onChangeZoomRef = useRef(onChangeZoom);
  onChangeZoomRef.current = onChangeZoom;

  const onZoomWheelRef = useRef(onZoomWheel);
  onZoomWheelRef.current = onZoomWheel;

  const pinchRef = useRef<PinchState>({
    active: false,
    initialDist: 0,
    startZoom: 1,
    lastMidX: 0,
    lastMidY: 0,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onZoomWheelRef.current(e.deltaY);
      }
    };

    const getTouchMetrics = (touches: TouchList) => {
      const t1 = touches[0];
      const t2 = touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      return { dist, midX, midY };
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const { dist, midX, midY } = getTouchMetrics(e.touches);
        pinchRef.current = {
          active: true,
          initialDist: Math.max(dist, 12),
          startZoom: zoomRef.current,
          lastMidX: midX,
          lastMidY: midY,
        };
      } else if (e.touches.length < 2) {
        pinchRef.current.active = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      const { dist, midX, midY } = getTouchMetrics(e.touches);
      if (!pinchRef.current.active) {
        pinchRef.current = {
          active: true,
          initialDist: Math.max(dist, 12),
          startZoom: zoomRef.current,
          lastMidX: midX,
          lastMidY: midY,
        };
        return;
      }

      const prevZoom = zoomRef.current;
      const scaleFactor = dist / Math.max(pinchRef.current.initialDist, 12);
      const nextZoom = clampZoomValue(pinchRef.current.startZoom * scaleFactor);

      const dx = midX - pinchRef.current.lastMidX;
      const dy = midY - pinchRef.current.lastMidY;
      pinchRef.current.lastMidX = midX;
      pinchRef.current.lastMidY = midY;

      const rect = el.getBoundingClientRect();
      const relX = midX - rect.left;
      const relY = midY - rect.top;

      if (Math.abs(nextZoom - prevZoom) >= 0.005) {
        const ratio = nextZoom / Math.max(prevZoom, 0.1);
        zoomRef.current = nextZoom;
        onChangeZoomRef.current(nextZoom);

        // Anchor scroll around pinch focal point + apply 2-finger pan delta
        requestAnimationFrame(() => {
          el.scrollLeft = (el.scrollLeft + relX) * ratio - relX - dx;
          el.scrollTop = (el.scrollTop + relY) * ratio - relY - dy;
        });
      } else if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
        el.scrollLeft -= dx;
        el.scrollTop -= dy;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current.active = false;
      } else if (e.touches.length === 2) {
        const { dist, midX, midY } = getTouchMetrics(e.touches);
        pinchRef.current = {
          active: true,
          initialDist: Math.max(dist, 12),
          startZoom: zoomRef.current,
          lastMidX: midX,
          lastMidY: midY,
        };
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [containerRef]);
}
