import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface PinchState {
  active: boolean;
  initialDist: number;
  startZoom: number;
  focusContentX: number;
  focusContentY: number;
  latestDist: number;
  latestMidX: number;
  latestMidY: number;
}

export function clampZoomValue(z: number): number {
  return Math.max(0.4, Math.min(3.0, Math.round(z * 1000) / 1000));
}

/**
 * Motore unico Pinch-to-Zoom + Pan sincronizzato con requestAnimationFrame.
 * Ancora il punto focale del foglio esattamente sotto il punto medio tra le due dita
 * e riallinea scrollLeft/scrollTop dopo il commit DOM della nuova scala (zero scatti).
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

  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const pinchRef = useRef<PinchState>({
    active: false,
    initialDist: 1,
    startZoom: 1,
    focusContentX: 0,
    focusContentY: 0,
    latestDist: 1,
    latestMidX: 0,
    latestMidY: 0,
  });

  // Sync scroll immediately after React updates scaled sheet dimensions to avoid browser scroll clamping jumps
  useLayoutEffect(() => {
    const el = containerRef.current;
    const pending = pendingScrollRef.current;
    if (el && pending) {
      el.scrollLeft = pending.left;
      el.scrollTop = pending.top;
      pendingScrollRef.current = null;
    }
  }, [zoom, containerRef]);

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

    const beginPinch = (touches: TouchList) => {
      const { dist, midX, midY } = getTouchMetrics(touches);
      const rect = el.getBoundingClientRect();
      const currentZoom = Math.max(0.1, zoomRef.current);
      const midViewportX = midX - rect.left;
      const midViewportY = midY - rect.top;
      pinchRef.current = {
        active: true,
        initialDist: Math.max(dist, 12),
        startZoom: currentZoom,
        focusContentX: (el.scrollLeft + midViewportX) / currentZoom,
        focusContentY: (el.scrollTop + midViewportY) / currentZoom,
        latestDist: Math.max(dist, 12),
        latestMidX: midX,
        latestMidY: midY,
      };
    };

    const flushPinchFrame = () => {
      rafIdRef.current = null;
      const st = pinchRef.current;
      if (!st.active) return;

      const scaleFactor = st.latestDist / Math.max(st.initialDist, 12);
      const newZoom = clampZoomValue(st.startZoom * scaleFactor);
      const rect = el.getBoundingClientRect();
      const midViewportX = st.latestMidX - rect.left;
      const midViewportY = st.latestMidY - rect.top;

      const targetScrollLeft = Math.max(0, st.focusContentX * newZoom - midViewportX);
      const targetScrollTop = Math.max(0, st.focusContentY * newZoom - midViewportY);

      if (Math.abs(newZoom - zoomRef.current) >= 0.001) {
        zoomRef.current = newZoom;
        pendingScrollRef.current = { left: targetScrollLeft, top: targetScrollTop };
        onChangeZoomRef.current(newZoom);
        // Also pre-assign immediately if container shrinks or stays within current bounds
        el.scrollLeft = targetScrollLeft;
        el.scrollTop = targetScrollTop;
      } else {
        el.scrollLeft = targetScrollLeft;
        el.scrollTop = targetScrollTop;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        beginPinch(e.touches);
      } else if (e.touches.length < 2) {
        pinchRef.current.active = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();

      const { dist, midX, midY } = getTouchMetrics(e.touches);
      if (!pinchRef.current.active) {
        beginPinch(e.touches);
        return;
      }

      pinchRef.current.latestDist = Math.max(dist, 12);
      pinchRef.current.latestMidX = midX;
      pinchRef.current.latestMidY = midY;

      if (rafIdRef.current === null) {
        rafIdRef.current = window.requestAnimationFrame(flushPinchFrame);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current.active = false;
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      } else if (e.touches.length === 2) {
        beginPinch(e.touches);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [containerRef]);
}

/**
 * Scorrimento diretto 1:1 con mouse e touch (più inerzia decelerata al rilascio)
 * quando è attivo lo strumento Manina ('pan'). Cede automaticamente il controllo al pinch a 2 dita.
 */
export function useHandPan(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean
): boolean {
  const [isGrabbing, setIsGrabbing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) {
      setIsGrabbing(false);
      return;
    }

    let activePointerId = -1;
    let lastX = 0;
    let lastY = 0;
    let pendingDx = 0;
    let pendingDy = 0;
    let moveRafId: number | null = null;
    let inertiaRafId: number | null = null;
    const touchPointers = new Set<number>();
    const samples: Array<{ t: number; dx: number; dy: number }> = [];

    const stopInertia = () => {
      if (inertiaRafId !== null) {
        window.cancelAnimationFrame(inertiaRafId);
        inertiaRafId = null;
      }
    };

    const stopMoveRaf = () => {
      if (moveRafId !== null) {
        window.cancelAnimationFrame(moveRafId);
        moveRafId = null;
      }
      pendingDx = 0;
      pendingDy = 0;
    };

    const flushPan = () => {
      moveRafId = null;
      if (pendingDx !== 0 || pendingDy !== 0) {
        el.scrollLeft -= pendingDx;
        el.scrollTop -= pendingDy;
        pendingDx = 0;
        pendingDy = 0;
      }
    };

    const startInertia = (initVx: number, initVy: number) => {
      let vx = initVx;
      let vy = initVy;
      let prevTs = performance.now();

      const step = (now: number) => {
        const dt = Math.min(32, Math.max(1, now - prevTs));
        prevTs = now;

        const prevL = el.scrollLeft;
        const prevT = el.scrollTop;
        el.scrollLeft -= vx * dt;
        el.scrollTop -= vy * dt;

        // Zero velocity on axis if scroll hit boundary
        if (Math.abs(el.scrollLeft - prevL) < 0.1 && Math.abs(vx * dt) > 0.4) vx = 0;
        if (Math.abs(el.scrollTop - prevT) < 0.1 && Math.abs(vy * dt) > 0.4) vy = 0;

        const decay = Math.pow(0.935, dt / 16.67);
        vx *= decay;
        vy *= decay;

        if (Math.hypot(vx, vy) < 0.025) {
          inertiaRafId = null;
          return;
        }
        inertiaRafId = window.requestAnimationFrame(step);
      };

      inertiaRafId = window.requestAnimationFrame(step);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.pointerType === 'touch') {
        touchPointers.add(e.pointerId);
        if (touchPointers.size >= 2) {
          // Hand control to 2-finger pinch zoom
          activePointerId = -1;
          stopMoveRaf();
          stopInertia();
          setIsGrabbing(false);
          return;
        }
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, a, [data-pdf-date-popover]')) {
        return;
      }

      if (e.pointerType === 'mouse') {
        e.preventDefault();
      }

      stopInertia();
      stopMoveRaf();
      activePointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      samples.length = 0;
      setIsGrabbing(true);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      if (e.pointerType === 'touch' && touchPointers.size >= 2) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (dx === 0 && dy === 0) return;

      lastX = e.clientX;
      lastY = e.clientY;
      pendingDx += dx;
      pendingDy += dy;

      const now = performance.now();
      samples.push({ t: now, dx, dy });
      while (samples.length > 0 && now - samples[0].t > 90) {
        samples.shift();
      }

      if (moveRafId === null) {
        moveRafId = window.requestAnimationFrame(flushPan);
      }
    };

    const handlePointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touchPointers.delete(e.pointerId);
      }
      if (activePointerId !== e.pointerId) return;

      activePointerId = -1;
      setIsGrabbing(false);
      flushPan();
      stopMoveRaf();

      if (e.type === 'pointerup' && samples.length > 0) {
        const now = performance.now();
        const recent = samples.filter((s) => now - s.t <= 90);
        if (recent.length > 0) {
          const totalDx = recent.reduce((acc, s) => acc + s.dx, 0);
          const totalDy = recent.reduce((acc, s) => acc + s.dy, 0);
          const spanMs = Math.max(16, now - recent[0].t);
          const vx = totalDx / spanMs;
          const vy = totalDy / spanMs;
          if (Math.hypot(vx, vy) > 0.09) {
            startInertia(
              Math.max(-2.8, Math.min(2.8, vx)),
              Math.max(-2.8, Math.min(2.8, vy))
            );
          }
        }
      }
      samples.length = 0;
    };

    el.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUpOrCancel);
    window.addEventListener('pointercancel', handlePointerUpOrCancel);

    return () => {
      stopMoveRaf();
      stopInertia();
      el.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUpOrCancel);
      window.removeEventListener('pointercancel', handlePointerUpOrCancel);
    };
  }, [containerRef, enabled]);

  return isGrabbing;
}
