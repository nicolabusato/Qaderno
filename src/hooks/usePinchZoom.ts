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

// Global stylus / Apple Pencil activity tracker for 350ms palm rejection
const activePenPointerIds = new Set<number>();
let lastPenActivityTs = 0;
const PALM_REJECTION_GRACE_MS = 350;

export function notifyStylusPointerEvent(e: {
  pointerType: string;
  pointerId: number;
  type?: string;
}): void {
  if (e.pointerType !== 'pen') return;
  lastPenActivityTs = performance.now();
  if (e.type === 'pointerdown') {
    activePenPointerIds.add(e.pointerId);
  } else if (e.type === 'pointerup' || e.type === 'pointercancel' || e.type === 'pointerleave') {
    activePenPointerIds.delete(e.pointerId);
  }
}

export function isPalmRejectionActive(): boolean {
  if (activePenPointerIds.size > 0) return true;
  if (lastPenActivityTs === 0) return false;
  return performance.now() - lastPenActivityTs < PALM_REJECTION_GRACE_MS;
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

    const trackGlobalPen = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        notifyStylusPointerEvent(e);
      }
    };

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
        el.scrollLeft = targetScrollLeft;
        el.scrollTop = targetScrollTop;
      } else {
        el.scrollLeft = targetScrollLeft;
        el.scrollTop = targetScrollTop;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isPalmRejectionActive()) {
        pinchRef.current.active = false;
        return;
      }
      if (e.touches.length === 2) {
        beginPinch(e.touches);
      } else if (e.touches.length < 2) {
        pinchRef.current.active = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isPalmRejectionActive()) {
        pinchRef.current.active = false;
        return;
      }
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
      } else if (e.touches.length === 2 && !isPalmRejectionActive()) {
        beginPinch(e.touches);
      }
    };

    window.addEventListener('pointerdown', trackGlobalPen, true);
    window.addEventListener('pointermove', trackGlobalPen, true);
    window.addEventListener('pointerup', trackGlobalPen, true);
    window.addEventListener('pointercancel', trackGlobalPen, true);

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
      window.removeEventListener('pointerdown', trackGlobalPen, true);
      window.removeEventListener('pointermove', trackGlobalPen, true);
      window.removeEventListener('pointerup', trackGlobalPen, true);
      window.removeEventListener('pointercancel', trackGlobalPen, true);

      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [containerRef]);
}

export interface HandPanOptions {
  panToolActive: boolean;
  fingerPanOnly: boolean;
  isTextTool?: boolean;
}

/**
 * Scorrimento diretto 1:1 con mouse/stilo (se Manina attiva) e con il dito
 * (se Manina attiva OPPURE se fingerPanOnly è attivo), con inerzia decelerata al rilascio.
 * In modalità Testo con fingerPanOnly, i tocchi brevi (< 6px) restano clic per scrivere,
 * mentre il trascinamento (>= 6px) sposta il foglio in tutte le direzioni.
 * Integra palm-rejection di 350ms quando la stilo è attiva o appena sollevata.
 */
export function useHandPan(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: boolean | HandPanOptions
): boolean {
  const panToolActive = typeof options === 'boolean' ? options : options.panToolActive;
  const fingerPanOnly = typeof options === 'boolean' ? false : options.fingerPanOnly;
  const isTextTool = typeof options === 'boolean' ? false : Boolean(options.isTextTool);
  const enabled = panToolActive || fingerPanOnly;

  const [isGrabbing, setIsGrabbing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) {
      setIsGrabbing(false);
      return;
    }

    let activePointerId = -1;
    let activePointerType = '';
    let dragConfirmed = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let pendingDx = 0;
    let pendingDy = 0;
    let moveRafId: number | null = null;
    let inertiaRafId: number | null = null;
    let suppressClickTimer: number | null = null;
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

    const suppressNextTapClick = () => {
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      el.addEventListener('click', swallow, { capture: true, once: true });
      if (suppressClickTimer !== null) window.clearTimeout(suppressClickTimer);
      suppressClickTimer = window.setTimeout(() => {
        el.removeEventListener('click', swallow, true);
        suppressClickTimer = null;
      }, 120);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        notifyStylusPointerEvent(e);
        if (activePointerType === 'touch') {
          activePointerId = -1;
          activePointerType = '';
          dragConfirmed = false;
          stopMoveRaf();
          stopInertia();
          setIsGrabbing(false);
        }
      }

      if (e.button !== 0) return;

      // Determine whether this pointerType is handled by pan
      if (e.pointerType === 'touch') {
        if (isPalmRejectionActive()) return;
        touchPointers.add(e.pointerId);
        if (touchPointers.size >= 2) {
          activePointerId = -1;
          activePointerType = '';
          dragConfirmed = false;
          stopMoveRaf();
          stopInertia();
          setIsGrabbing(false);
          return;
        }
      } else if (!panToolActive) {
        // Mouse & Pen only pan when Manina tool ('pan') is selected
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-pdf-date-popover], select, a')) {
        return;
      }

      const requireDragThreshold = !panToolActive && fingerPanOnly && e.pointerType === 'touch';
      if (!requireDragThreshold && target?.closest('button, input, textarea')) {
        return;
      }

      if (e.pointerType === 'mouse') {
        e.preventDefault();
      }

      stopInertia();
      stopMoveRaf();
      activePointerId = e.pointerId;
      activePointerType = e.pointerType;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      samples.length = 0;

      // In fingerPanOnly mode on text tool (or over controls), wait for 6px movement so taps (< 6px) focus cleanly
      const deferForTap = requireDragThreshold && (isTextTool || Boolean(target?.closest('button, input, textarea')));
      dragConfirmed = !deferForTap;
      if (dragConfirmed) {
        setIsGrabbing(true);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      if (e.pointerType === 'touch') {
        if (touchPointers.size >= 2 || isPalmRejectionActive()) {
          activePointerId = -1;
          activePointerType = '';
          dragConfirmed = false;
          stopMoveRaf();
          stopInertia();
          setIsGrabbing(false);
          return;
        }
      }

      if (!dragConfirmed) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) {
          return;
        }
        dragConfirmed = true;
        setIsGrabbing(true);
        lastX = e.clientX;
        lastY = e.clientY;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          sel.removeAllRanges();
        }
      }

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

      const wasConfirmedDrag = dragConfirmed && Math.hypot(e.clientX - startX, e.clientY - startY) >= 6;
      const wasTouchThresholdPan = !panToolActive && fingerPanOnly && activePointerType === 'touch';

      activePointerId = -1;
      activePointerType = '';
      dragConfirmed = false;
      setIsGrabbing(false);
      flushPan();
      stopMoveRaf();

      if (wasTouchThresholdPan && wasConfirmedDrag) {
        suppressNextTapClick();
      }

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
      if (suppressClickTimer !== null) window.clearTimeout(suppressClickTimer);
      el.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUpOrCancel);
      window.removeEventListener('pointercancel', handlePointerUpOrCancel);
    };
  }, [containerRef, enabled, panToolActive, fingerPanOnly, isTextTool]);

  return isGrabbing;
}
