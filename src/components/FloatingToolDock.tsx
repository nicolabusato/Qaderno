import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, AnimatePresence, LayoutGroup, motion, useMotionValue } from 'motion/react';
import {
  ArrowRight,
  ChevronDown,
  Circle,
  Diamond,
  Eraser,
  GripHorizontal,
  GripVertical,
  Hand,
  Hexagon,
  Highlighter,
  Lasso,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  PenLine,
  PenTool,
  Redo2,
  Shapes,
  SlidersHorizontal,
  Square,
  Star,
  Triangle,
  Type,
  Undo2,
} from 'lucide-react';
import {
  DockPosition,
  EraserMode,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  INK_COLORS,
  PdfTextMode,
  PEN_WIDTHS,
  RecognizedShapeKind,
  ToolType,
} from '../types/qaderno';

interface FloatingToolDockProps {
  dockPosition: DockPosition;
  sidebarOpen?: boolean;
  isPdfDocument?: boolean;
  activeTool: ToolType;
  pdfTextMode?: PdfTextMode;
  selectedInsertShape: RecognizedShapeKind;
  eraserMode: EraserMode;
  eraserSize: number;
  activeColor: string;
  penWidth: number;
  highlighterWidth: number;
  holdToSnap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onChangeDockPosition: (pos: DockPosition) => void;
  onSelectTool: (tool: ToolType) => void;
  onChangePdfTextMode?: (mode: PdfTextMode) => void;
  onSelectInsertShape: (kind: RecognizedShapeKind) => void;
  onChangeEraserMode: (mode: EraserMode) => void;
  onChangeEraserSize: (size: number) => void;
  onChangeColor: (hex: string) => void;
  onChangePenWidth: (w: number) => void;
  onChangeHighlighterWidth: (w: number) => void;
  onToggleHoldToSnap: () => void;
  onBeautifyHandwriting: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const SHAPE_CATALOG: Array<{
  kind: RecognizedShapeKind;
  label: string;
  icon: React.ReactNode;
}> = [
  { kind: 'line', label: 'Linea', icon: <Minus className="w-4 h-4 -rotate-45" /> },
  { kind: 'arrow', label: 'Freccia', icon: <ArrowRight className="w-4 h-4" /> },
  { kind: 'doubleArrow', label: 'Doppia', icon: <MoveHorizontal className="w-4 h-4" /> },
  { kind: 'square', label: 'Quadrato', icon: <Square className="w-4 h-4" /> },
  { kind: 'rectangle', label: 'Rettangolo', icon: <Square className="w-4 h-3.5 scale-x-125" /> },
  { kind: 'circle', label: 'Cerchio', icon: <Circle className="w-4 h-4" /> },
  {
    kind: 'ellipse',
    label: 'Ellisse',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="12" rx="9" ry="5.5" />
      </svg>
    ),
  },
  { kind: 'triangle', label: 'Triangolo', icon: <Triangle className="w-4 h-4" /> },
  { kind: 'diamond', label: 'Rombo', icon: <Diamond className="w-4 h-4" /> },
  { kind: 'hexagon', label: 'Esagono', icon: <Hexagon className="w-4 h-4" /> },
  { kind: 'star', label: 'Stella', icon: <Star className="w-4 h-4" /> },
];

type DockPopoverId = 'text' | 'eraser' | 'shape' | 'style' | 'ink' | null;

const DOCK_CYCLE_ORDER: DockPosition[] = ['bottom', 'right', 'top', 'left'];

const SPRING_MORPH = { type: 'spring' as const, stiffness: 460, damping: 32, mass: 0.75 };
const SPRING_RELEASE = { type: 'spring' as const, stiffness: 420, damping: 32 };
const SPRING_PILL = { type: 'spring' as const, stiffness: 500, damping: 35 };
const POPOVER_TRANSITION = { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const };

export const FloatingToolDock: React.FC<FloatingToolDockProps> = ({
  dockPosition,
  sidebarOpen = false,
  isPdfDocument = false,
  activeTool,
  pdfTextMode = 'edit',
  selectedInsertShape,
  eraserMode,
  eraserSize,
  activeColor,
  penWidth,
  highlighterWidth,
  holdToSnap,
  canUndo,
  canRedo,
  containerRef,
  onChangeDockPosition,
  onSelectTool,
  onChangePdfTextMode,
  onSelectInsertShape,
  onChangeEraserMode,
  onChangeEraserSize,
  onChangeColor,
  onChangePenWidth,
  onChangeHighlighterWidth,
  onToggleHoldToSnap,
  onBeautifyHandwriting,
  onUndo,
  onRedo,
}) => {
  const [minimized, setMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('qaderno_dock_minimized_v1') === '1';
    } catch {
      return false;
    }
  });

  const [openPopover, setOpenPopover] = useState<DockPopoverId>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 16 });

  const [isTrackingPointer, setIsTrackingPointer] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [hoverZone, setHoverZone] = useState<DockPosition>(dockPosition);

  // Relative offset from the centered flex slot (resting position is ALWAYS x = 0, y = 0)
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const hoverZoneRef = useRef<DockPosition>(dockPosition);
  const slotRef = useRef<HTMLDivElement>(null);
  const dragWrapperRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const dragMetaRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    restCenterX: number;
    restCenterY: number;
    moved: boolean;
    lockedToPointer: boolean;
  }>({
    pointerId: -1,
    startX: 0,
    startY: 0,
    restCenterX: 0,
    restCenterY: 0,
    moved: false,
    lockedToPointer: false,
  });

  const pendingDropCenterRef = useRef<{
    cx: number;
    cy: number;
  } | null>(null);

  const isVertical = dockPosition === 'left' || dockPosition === 'right';

  const toggleMinimized = (next?: boolean) => {
    const val = next !== undefined ? next : !minimized;
    setMinimized(val);
    setOpenPopover(null);
    try {
      localStorage.setItem('qaderno_dock_minimized_v1', val ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (sidebarOpen) {
      setOpenPopover(null);
    }
  }, [sidebarOpen]);

  useEffect(() => {
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target) || target.closest('[data-dock-trigger]')) {
        return;
      }
      setOpenPopover(null);
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, []);

  const resolveDropZone = useCallback(
    (clientX: number, clientY: number): DockPosition => {
      const rect = containerRef.current?.getBoundingClientRect();
      const leftBound = rect ? rect.left : 0;
      const rightBound = rect ? rect.right : window.innerWidth;
      const topBound = rect ? rect.top + 52 : 52;
      const bottomBound = rect ? rect.bottom : window.innerHeight;

      const availW = Math.max(rightBound - leftBound, 280);
      const availH = Math.max(bottomBound - topBound, 280);

      const candidates: Array<{ pos: DockPosition; ratio: number }> = [
        { pos: 'top', ratio: Math.max(0, clientY - topBound) / availH },
        { pos: 'bottom', ratio: Math.max(0, bottomBound - clientY) / availH },
        { pos: 'left', ratio: Math.max(0, clientX - leftBound) / availW },
        { pos: 'right', ratio: Math.max(0, rightBound - clientX) / availW },
      ];

      candidates.sort((a, b) => a.ratio - b.ratio);
      return candidates[0].pos;
    },
    [containerRef]
  );

  // Clear any leftover transform / will-change when resting so Backdrop Root never blocks frosted glass sampling
  useEffect(() => {
    if (!isDragging && !isReleasing && dragWrapperRef.current) {
      dragWrapperRef.current.style.transform = 'none';
      dragWrapperRef.current.style.willChange = 'auto';
    }
  }, [isDragging, isReleasing]);

  // Anchor release start position right at dropCenter before paint using .jump(), then spring smoothly to (0, 0)
  useLayoutEffect(() => {
    if (isDragging) return;
    const dropCenter = pendingDropCenterRef.current;
    if (!dropCenter || !dragWrapperRef.current || !dockRef.current) return;
    pendingDropCenterRef.current = null;

    const targetRect = dragWrapperRef.current.getBoundingClientRect();
    const restCx = targetRect.left + targetRect.width / 2 - x.get();
    const restCy = targetRect.top + targetRect.height / 2 - y.get();

    const startOffsetX = dropCenter.cx - restCx;
    const startOffsetY = dropCenter.cy - restCy;

    if (Math.abs(startOffsetX) < 0.5 && Math.abs(startOffsetY) < 0.5) {
      x.jump(0);
      y.jump(0);
      dragWrapperRef.current.style.transform = 'none';
      dragWrapperRef.current.style.willChange = 'auto';
      setIsReleasing(false);
      return;
    }

    setIsReleasing(true);
    x.jump(startOffsetX);
    y.jump(startOffsetY);
    dragWrapperRef.current.style.transform = `translate3d(${startOffsetX}px, ${startOffsetY}px, 0)`;

    const animX = animate(x, 0, SPRING_RELEASE);
    const animY = animate(y, 0, SPRING_RELEASE);
    Promise.all([animX.finished, animY.finished]).then(() => {
      setIsReleasing(false);
      if (dragWrapperRef.current) {
        dragWrapperRef.current.style.transform = 'none';
        dragWrapperRef.current.style.willChange = 'auto';
      }
    });
  }, [isDragging, dockPosition, x, y]);

  // Global window pointer listeners during handle interaction
  useEffect(() => {
    if (!isTrackingPointer) return;

    const getClampedTarget = (clientX: number, clientY: number) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      const minX = (bounds ? bounds.left : 0) + 30;
      const maxX = (bounds ? bounds.right : window.innerWidth) - 30;
      const minY = (bounds ? bounds.top : 0) + 30;
      const maxY = (bounds ? bounds.bottom : window.innerHeight) - 30;
      const clampedX = Math.max(minX, Math.min(maxX, clientX));
      const clampedY = Math.max(minY, Math.min(maxY, clientY));
      return {
        targetX: clampedX - dragMetaRef.current.restCenterX,
        targetY: clampedY - dragMetaRef.current.restCenterY,
      };
    };

    const handleWindowMove = (e: PointerEvent) => {
      const meta = dragMetaRef.current;
      if (meta.pointerId !== -1 && e.pointerId !== meta.pointerId) return;

      if (!meta.moved) {
        if (Math.hypot(e.clientX - meta.startX, e.clientY - meta.startY) <= 4) {
          return;
        }
        meta.moved = true;
        meta.lockedToPointer = false;

        const { targetX, targetY } = getClampedTarget(e.clientX, e.clientY);
        x.stop();
        y.stop();
        animate(x, targetX, SPRING_MORPH);
        animate(y, targetY, SPRING_MORPH);

        const nextZone = resolveDropZone(e.clientX, e.clientY);
        hoverZoneRef.current = nextZone;
        setHoverZone(nextZone);
        setIsDragging(true);
        return;
      }

      const { targetX, targetY } = getClampedTarget(e.clientX, e.clientY);
      if (meta.lockedToPointer) {
        x.set(targetX);
        y.set(targetY);
      } else {
        if (Math.hypot(x.get() - targetX, y.get() - targetY) <= 3.5) {
          meta.lockedToPointer = true;
          x.stop();
          y.stop();
          x.set(targetX);
          y.set(targetY);
        } else {
          animate(x, targetX, SPRING_MORPH);
          animate(y, targetY, SPRING_MORPH);
        }
      }

      const nextZone = resolveDropZone(e.clientX, e.clientY);
      if (nextZone !== hoverZoneRef.current) {
        hoverZoneRef.current = nextZone;
        setHoverZone(nextZone);
      }
    };

    const finishDrag = (clientX?: number, clientY?: number) => {
      const moved = dragMetaRef.current.moved;
      dragMetaRef.current.pointerId = -1;
      dragMetaRef.current.moved = false;
      dragMetaRef.current.lockedToPointer = false;

      if (dockRef.current && clientX !== undefined && clientY !== undefined) {
        const dropRect = dockRef.current.getBoundingClientRect();
        pendingDropCenterRef.current = {
          cx: dropRect.left + dropRect.width / 2,
          cy: dropRect.top + dropRect.height / 2,
        };
      }

      setIsTrackingPointer(false);
      setIsDragging(false);

      if (clientX !== undefined && clientY !== undefined) {
        if (moved) {
          const nextPos = resolveDropZone(clientX, clientY);
          if (nextPos !== dockPosition) {
            onChangeDockPosition(nextPos);
          }
        } else {
          const idx = DOCK_CYCLE_ORDER.indexOf(dockPosition);
          const nextPos = DOCK_CYCLE_ORDER[(idx + 1) % DOCK_CYCLE_ORDER.length];
          onChangeDockPosition(nextPos);
        }
      } else {
        x.stop();
        y.stop();
        if (Math.abs(x.get()) >= 0.5 || Math.abs(y.get()) >= 0.5) {
          setIsReleasing(true);
          const animX = animate(x, 0, SPRING_RELEASE);
          const animY = animate(y, 0, SPRING_RELEASE);
          Promise.all([animX.finished, animY.finished]).then(() => {
            setIsReleasing(false);
            if (dragWrapperRef.current) {
              dragWrapperRef.current.style.transform = 'none';
              dragWrapperRef.current.style.willChange = 'auto';
            }
          });
        } else {
          x.set(0);
          y.set(0);
          setIsReleasing(false);
        }
      }
    };

    const handleWindowUp = (e: PointerEvent) => {
      if (dragMetaRef.current.pointerId !== -1 && e.pointerId !== dragMetaRef.current.pointerId) return;
      finishDrag(e.clientX, e.clientY);
    };

    const handleWindowCancel = () => {
      finishDrag(undefined, undefined);
    };

    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowUp);
    window.addEventListener('pointercancel', handleWindowCancel);
    window.addEventListener('blur', handleWindowCancel);

    return () => {
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
      window.removeEventListener('pointercancel', handleWindowCancel);
      window.removeEventListener('blur', handleWindowCancel);
    };
  }, [isTrackingPointer, dockPosition, onChangeDockPosition, resolveDropZone, x, y]);

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenPopover(null);

    x.stop();
    y.stop();
    x.set(0);
    y.set(0);

    const startRect = dockRef.current?.getBoundingClientRect();
    const restCenterX = startRect ? startRect.left + startRect.width / 2 : e.clientX;
    const restCenterY = startRect ? startRect.top + startRect.height / 2 : e.clientY;

    const initialZone = resolveDropZone(e.clientX, e.clientY);
    hoverZoneRef.current = initialZone;
    setHoverZone(initialZone);

    dragMetaRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      restCenterX,
      restCenterY,
      moved: false,
      lockedToPointer: false,
    };

    setIsTrackingPointer(true);
  };

  const togglePopover = (id: Exclude<DockPopoverId, null>, btnEl: HTMLElement, widthEst = 244, heightEst = 220) => {
    if (openPopover === id) {
      setOpenPopover(null);
      return;
    }
    const r = btnEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const effectiveW = Math.min(widthEst, vw - 20);
    if (dockPosition === 'left') {
      const left = Math.max(10, Math.min(vw - effectiveW - 10, r.right + 12));
      const top = Math.max(54, Math.min(vh - heightEst - 12, r.top - 12));
      setPopoverPos({ left, top });
    } else if (dockPosition === 'right') {
      const left = Math.max(10, Math.min(vw - effectiveW - 10, r.left - effectiveW - 12));
      const top = Math.max(54, Math.min(vh - heightEst - 12, r.top - 12));
      setPopoverPos({ left, top });
    } else if (dockPosition === 'bottom') {
      const left = Math.max(10, Math.min(vw - effectiveW - 10, r.left - 16));
      const bottom = Math.max(12, Math.min(vh - 80, vh - r.top + 12));
      setPopoverPos({ left, bottom });
    } else {
      const left = Math.max(10, Math.min(vw - effectiveW - 10, r.left - 16));
      const top = Math.max(54, Math.min(vh - heightEst - 12, r.bottom + 12));
      setPopoverPos({ left, top });
    }
    setOpenPopover(id);
  };

  useLayoutEffect(() => {
    if (!openPopover || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const marginX = 10;
    const marginTop = 52;
    const marginBottom = 12;

    setPopoverPos((prev) => {
      let nextLeft = prev.left;
      if (rect.right > vw - marginX) {
        nextLeft = Math.max(marginX, prev.left - (rect.right - (vw - marginX)));
      }
      if (rect.left < marginX) {
        nextLeft = marginX;
      }

      if (prev.bottom !== undefined) {
        let nextBottom = prev.bottom;
        if (rect.top < marginTop) {
          nextBottom = Math.max(marginBottom, prev.bottom - (marginTop - rect.top));
        }
        if (rect.bottom > vh - marginBottom) {
          nextBottom = Math.max(marginBottom, vh - marginBottom - rect.height);
        }
        if (Math.abs(nextLeft - prev.left) < 1 && Math.abs(nextBottom - prev.bottom) < 1) {
          return prev;
        }
        return { left: nextLeft, bottom: nextBottom };
      }

      const curTop = prev.top ?? marginTop;
      let nextTop = curTop;
      if (rect.bottom > vh - marginBottom) {
        nextTop = Math.max(marginTop, vh - marginBottom - rect.height);
      }
      if (rect.top < marginTop) {
        nextTop = marginTop;
      }
      if (Math.abs(nextLeft - prev.left) < 1 && Math.abs(nextTop - curTop) < 1) {
        return prev;
      }
      return { left: nextLeft, top: nextTop };
    });
  }, [openPopover, dockPosition]);

  const showStrokeThickness = activeTool !== 'eraser' && activeTool !== 'text';

  useEffect(() => {
    if (!showStrokeThickness && openPopover === 'style') {
      setOpenPopover(null);
    }
  }, [showStrokeThickness, openPopover]);

  useEffect(() => {
    if (!isPdfDocument && openPopover === 'text') {
      setOpenPopover(null);
    }
  }, [isPdfDocument, openPopover]);

  const currentWidths = activeTool === 'highlighter' ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS;
  const activeWidthValue = activeTool === 'highlighter' ? highlighterWidth : penWidth;
  const paletteColors = activeTool === 'highlighter' ? HIGHLIGHTER_COLORS : INK_COLORS;

  const mainTools: Array<{ id: ToolType; label: string; icon: React.ReactNode }> = [
    { id: 'pan', label: 'Manina — Sposta foglio (M)', icon: <Hand className="w-4 h-4" /> },
    { id: 'text', label: 'Testo — Scrivi e seleziona (T)', icon: <Type className="w-4 h-4" /> },
    { id: 'pen', label: 'Penna (P)', icon: <PenTool className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Evidenziatore (H)', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'eraser', label: 'Gomma (E)', icon: <Eraser className="w-4 h-4" /> },
    { id: 'lasso', label: 'Lazo (L)', icon: <Lasso className="w-4 h-4" /> },
  ];

  const activeToolDef =
    activeTool === 'shape'
      ? { label: 'Forme', icon: <Shapes className="w-4 h-4" /> }
      : mainTools.find((t) => t.id === activeTool) || mainTools[1];

  // Flexbox-centered slot (ZERO translateX(-50%) / translateY(-50%) conflicts with Motion x/y!)
  const slotContainerClass =
    dockPosition === 'top'
      ? 'absolute inset-x-0 top-[54px] sm:top-[64px] flex justify-center px-1.5 sm:px-2.5'
      : dockPosition === 'bottom'
        ? 'absolute inset-x-0 bottom-2.5 sm:bottom-5 pb-safe flex justify-center px-1.5 sm:px-2.5'
        : dockPosition === 'left'
          ? 'absolute inset-y-0 left-2 sm:left-4 pt-[52px] pb-3 flex items-center'
          : 'absolute inset-y-0 right-2 sm:right-4 pt-[52px] pb-[76px] flex items-center';

  const popoverInitialOffset =
    dockPosition === 'left'
      ? { opacity: 0, x: -6, y: 0, scale: 0.92 }
      : dockPosition === 'right'
        ? { opacity: 0, x: 6, y: 0, scale: 0.92 }
        : dockPosition === 'top'
          ? { opacity: 0, x: 0, y: -6, scale: 0.92 }
          : { opacity: 0, x: 0, y: 6, scale: 0.92 };

  const dropGuides: Array<{ pos: DockPosition; label: string; wrapperClass: string; pillClass: string }> = [
    {
      pos: 'top',
      label: 'Ancora in alto',
      wrapperClass: 'inset-x-0 top-[64px] flex justify-center',
      pillClass: 'px-6 py-2',
    },
    {
      pos: 'bottom',
      label: 'Ancora in basso',
      wrapperClass: 'inset-x-0 bottom-4 pb-safe flex justify-center',
      pillClass: 'px-6 py-2',
    },
    {
      pos: 'left',
      label: 'Sinistra',
      wrapperClass: 'inset-y-0 left-3.5 pt-[44px] flex items-center',
      pillClass: 'px-3.5 py-2',
    },
    {
      pos: 'right',
      label: 'Destra',
      wrapperClass: 'inset-y-0 right-3.5 pt-[44px] flex items-center',
      pillClass: 'px-3.5 py-2',
    },
  ];

  const compactVertical = isVertical && !isDragging;
  const dockShellRadius = isDragging ? 26 : minimized || !isVertical ? 24 : 28;
  const dockLayoutKey = `${isDragging}-${minimized}-${dockPosition}`;

  return (
    <>
      {/* Magnetic Ghost Drop Pills while Dragging */}
      <AnimatePresence>
        {isDragging &&
          dropGuides.map((guide) => {
            const active = hoverZone === guide.pos;
            return (
              <div
                key={guide.pos}
                className={`absolute ${guide.wrapperClass} z-30 pointer-events-none no-print`}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: active ? 1 : 0.65,
                    scale: active ? 1.04 : 0.96,
                  }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={SPRING_MORPH}
                  className={`${guide.pillClass} ios-glass rounded-full text-[11px] font-medium whitespace-nowrap transition-shadow ${
                    active
                      ? 'text-[#1C1C1E] dark:text-[#F5F5F7] border border-dashed border-[#1C1C1E]/45 dark:border-white/50 ring-2 ring-[#1C1C1E]/12 dark:ring-white/15 shadow-lg'
                      : 'text-[#8E8E93] border border-dashed border-[#3C3C43]/25 dark:border-white/25'
                  }`}
                >
                  {guide.label}
                </motion.div>
              </div>
            );
          })}
      </AnimatePresence>

      {/* Pure Flexbox Centered Slot (resting dock is always at x=0, y=0; zero opacity<1 / filter / transform ancestors) */}
      <div
        ref={slotRef}
        className={`${slotContainerClass} ${isDragging ? 'z-50' : 'z-40'} pointer-events-none no-print select-none ${
          sidebarOpen ? 'max-lg:opacity-0 max-lg:pointer-events-none' : ''
        }`}
      >
        {/* Outer Motion Translation Layer: strictly handles x / y pointer offset and resets transform: none at rest */}
        <motion.div
          ref={dragWrapperRef}
          style={{ x, y }}
          transformTemplate={(_, generated) => (!isDragging && !isReleasing ? 'none' : generated)}
          className={`pointer-events-auto max-w-full max-h-full ${isDragging ? 'cursor-grabbing' : ''}`}
        >
          <LayoutGroup id="qaderno-tool-dock">
            {/* Inner Motion Size Layer: applies ios-dock-glass directly on the pill container */}
            <motion.div
              ref={dockRef}
              layout="size"
              layoutDependency={dockLayoutKey}
              transition={SPRING_MORPH}
              transformTemplate={(_, generated) =>
                !isDragging &&
                (generated === 'none' ||
                  generated === 'translateZ(0)' ||
                  generated === 'translate3d(0px, 0px, 0px)' ||
                  generated === 'scale(1, 1)')
                  ? 'none'
                  : generated
              }
              onLayoutAnimationComplete={() => {
                if (!isDragging && dockRef.current) {
                  dockRef.current.style.transform = 'none';
                  dockRef.current.style.willChange = 'auto';
                }
              }}
              style={{ borderRadius: dockShellRadius }}
              className={`ios-dock-glass relative flex flex-nowrap items-center no-scrollbar ${
                isDragging
                  ? 'w-[52px] h-[52px] justify-center shadow-xl ring-1 ring-[#1C1C1E]/12 dark:ring-white/20 overflow-hidden cursor-grabbing'
                  : minimized
                    ? compactVertical
                      ? 'flex-col py-1.5 px-1 gap-1.5 overflow-hidden'
                      : 'flex-row px-1.5 py-1 gap-1.5 overflow-hidden'
                    : isVertical
                      ? 'py-1.5 px-1 flex-col gap-1 max-h-[calc(100vh-180px)] overflow-y-auto'
                      : 'px-1.5 py-1 flex-row gap-1 max-w-full overflow-x-auto'
              }`}
            >
              {/* Persistent Drag Handle: stays mounted in DOM so mobile touch tracking never breaks */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onPointerDown={startDrag}
                title={
                  isDragging
                    ? 'Trascina sui 4 lati per spostare'
                    : 'Trascina sui 4 lati per spostare (o tocca per cambiare lato)'
                }
                aria-label="Sposta barra strumenti volante"
                className={
                  isDragging
                    ? 'no-press-scale absolute inset-0 z-20 opacity-0 cursor-grabbing touch-none'
                    : `no-press-scale rounded-full flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 cursor-grab active:cursor-grabbing touch-none shrink-0 ${
                        compactVertical || (isVertical && !minimized) ? 'w-8 h-7' : 'w-7 h-8'
                      }`
                }
              >
                {compactVertical || (isVertical && !minimized) ? (
                  <GripHorizontal className="w-4 h-4" />
                ) : (
                  <GripVertical className="w-4 h-4" />
                )}
              </motion.button>

              {isDragging ? (
                /* 52x52 Translucent Circular Mini-Capsule centered under cursor/finger */
                <motion.span
                  key="drag-active-icon"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.14 }}
                  className="pointer-events-none flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]"
                >
                  {activeToolDef.icon}
                </motion.span>
              ) : minimized ? (
                /* Minimized Compact Pill (unchanged) */
                <motion.div
                  key="minimized-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className={`flex items-center gap-1.5 ${compactVertical ? 'flex-col' : 'flex-row'}`}
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => toggleMinimized(false)}
                    title="Espandi barra strumenti"
                    className={`no-press-scale rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-2 shadow-xs ${
                      compactVertical ? 'w-8 py-2 flex-col' : 'h-8 px-2 flex-row'
                    }`}
                  >
                    {activeToolDef.icon}
                    <span
                      className="w-3 h-3 rounded-full border border-black/15 dark:border-white/25 shrink-0"
                      style={{ backgroundColor: activeColor }}
                    />
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => toggleMinimized(false)}
                    title="Espandi barra strumenti"
                    aria-label="Espandi barra strumenti"
                    className="no-press-scale w-8 h-8 rounded-full flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 shrink-0"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </motion.button>
                </motion.div>
              ) : (
                /* Expanded Floating Tool Dock */
                <motion.div
                  key="expanded-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className={`flex flex-nowrap items-center gap-1 ${
                    isVertical ? 'flex-col' : 'flex-row'
                  }`}
                >
                  {/* Primary Writing & Drawing Tools */}
                  <div
                    className={`flex flex-nowrap items-center gap-0.5 shrink-0 ${
                      isVertical ? 'flex-col' : 'flex-row'
                    }`}
                  >
                    {mainTools.map((t) => {
                      const isActive = activeTool === t.id;
                      const isEraser = t.id === 'eraser';
                      const isTextSubmenu = t.id === 'text' && isPdfDocument;
                      const hasSubmenu = isEraser || isTextSubmenu;
                      return (
                        <motion.button
                          key={t.id}
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          data-dock-trigger={isEraser ? 'eraser' : isTextSubmenu ? 'text' : undefined}
                          onClick={(e) => {
                            if (isEraser) {
                              onSelectTool('eraser');
                              togglePopover('eraser', e.currentTarget, 244, 185);
                            } else if (isTextSubmenu) {
                              onSelectTool('text');
                              togglePopover('text', e.currentTarget, 244, 150);
                            } else {
                              setOpenPopover(null);
                              onSelectTool(t.id);
                            }
                          }}
                          title={t.label}
                          aria-label={t.label}
                          aria-pressed={isActive}
                          className={`no-press-scale relative rounded-full flex items-center justify-center gap-0.5 whitespace-nowrap shrink-0 ${
                            isVertical ? 'w-8 h-8' : 'w-7 h-7 sm:w-auto sm:h-8 sm:px-2.5'
                          } ${
                            isActive
                              ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                              : 'text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/12'
                          }`}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="activeToolPill"
                              transition={SPRING_PILL}
                              className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                            />
                          )}
                          <span className="relative z-10 flex items-center gap-0.5">
                            {t.icon}
                            {hasSubmenu && !isVertical && (
                              <ChevronDown className="hidden sm:block w-2.5 h-2.5 opacity-60" />
                            )}
                          </span>
                        </motion.button>
                      );
                    })}

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      data-dock-trigger="shape"
                      onClick={(e) => {
                        onSelectTool('shape');
                        togglePopover('shape', e.currentTarget, 260, 225);
                      }}
                      title="Forme geometriche"
                      aria-label="Forme geometriche"
                      aria-pressed={activeTool === 'shape'}
                      className={`no-press-scale relative rounded-full flex items-center justify-center gap-0.5 whitespace-nowrap shrink-0 ${
                        isVertical ? 'w-8 h-8' : 'w-7 h-7 sm:w-auto sm:h-8 sm:px-2.5'
                      } ${
                        activeTool === 'shape'
                          ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                          : 'text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/12'
                      }`}
                    >
                      {activeTool === 'shape' && (
                        <motion.span
                          layoutId="activeToolPill"
                          transition={SPRING_PILL}
                          className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-0.5">
                        <Shapes className="w-4 h-4" />
                        {!isVertical && <ChevronDown className="hidden sm:block w-2.5 h-2.5 opacity-60" />}
                      </span>
                    </motion.button>
                  </div>

                  <div
                    className={`bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                      isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                    }`}
                    aria-hidden="true"
                  />

                  {/* Compact Mobile Ink / Style Trigger (<640px horizontal only) */}
                  {!isVertical && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      data-dock-trigger="ink"
                      onClick={(e) => togglePopover('ink', e.currentTarget, 244, 240)}
                      title="Colori, spessore e grafia"
                      aria-label="Colori, spessore e grafia"
                      className="no-press-scale sm:hidden w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#787880]/15 shrink-0"
                    >
                      <span
                        className="w-4.5 h-4.5 rounded-full ring-2 ring-white/80 dark:ring-white/25 shadow-xs"
                        style={{ backgroundColor: activeColor }}
                      />
                    </motion.button>
                  )}

                  {/* Ink / Highlighter Colors (primary inline palette on vertical & sm:+) */}
                  <div
                    className={`${
                      isVertical ? 'flex flex-col gap-1.5 py-1' : 'hidden sm:flex flex-row gap-1.5 px-1'
                    } items-center shrink-0`}
                  >
                    {paletteColors.map((color) => {
                      const selected = activeColor.toLowerCase() === color.hex.toLowerCase();
                      return (
                        <motion.button
                          key={color.id}
                          type="button"
                          whileHover={{ scale: 1.12 }}
                          whileTap={{ scale: 0.92 }}
                          animate={{ scale: selected ? 1.12 : 1 }}
                          transition={SPRING_MORPH}
                          onClick={() => onChangeColor(color.hex)}
                          title={color.label}
                          aria-label={`Colore ${color.label}`}
                          className={`no-press-scale w-4.5 h-4.5 rounded-full shrink-0 ${
                            selected
                              ? 'ring-2 ring-offset-1 ring-[#1C1C1E] dark:ring-[#F5F5F7]'
                              : 'border border-white/75 dark:border-white/25'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        />
                      );
                    })}
                  </div>

                  {/* Contextual Popover Trigger for Secondary Pen Options (Spessori, Rifinisci, Snap) — hidden on Gomma & Testo */}
                  {showStrokeThickness && (
                    <>
                      <div
                        className={`${isVertical ? 'block' : 'hidden sm:block'} bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                          isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                        }`}
                        aria-hidden="true"
                      />

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        data-dock-trigger="style"
                        onClick={(e) => togglePopover('style', e.currentTarget, 244, 185)}
                        title="Opzioni tratto: spessore, Rifinisci e Snap"
                        aria-label="Opzioni tratto"
                        aria-expanded={openPopover === 'style'}
                        className={`no-press-scale ${isVertical ? 'flex' : 'hidden sm:flex'} relative rounded-full items-center justify-center gap-1 whitespace-nowrap shrink-0 ${
                          isVertical ? 'w-8 h-8' : 'h-8 px-2'
                        } ${
                          openPopover === 'style'
                            ? 'bg-[#FBFBFD] dark:bg-[#2C2C30] text-[#1C1C1E] dark:text-[#F5F5F7] shadow-xs'
                            : 'text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15'
                        }`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        {!isVertical && (
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              width: Math.max(
                                4,
                                Math.min(8, activeWidthValue * (activeTool === 'highlighter' ? 0.36 : 1.4))
                              ),
                              height: Math.max(
                                4,
                                Math.min(8, activeWidthValue * (activeTool === 'highlighter' ? 0.36 : 1.4))
                              ),
                              backgroundColor: activeColor,
                              opacity: activeTool === 'highlighter' ? 0.6 : 1,
                            }}
                          />
                        )}
                      </motion.button>
                    </>
                  )}

                  <div
                    className={`bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                      isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                    }`}
                    aria-hidden="true"
                  />

                  {/* Undo / Redo */}
                  <div className={`flex items-center gap-0.5 shrink-0 ${isVertical ? 'flex-col' : 'flex-row'}`}>
                    <motion.button
                      type="button"
                      whileTap={canUndo ? { scale: 0.92 } : undefined}
                      onClick={onUndo}
                      disabled={!canUndo}
                      className={`no-press-scale ${isVertical ? 'w-8 h-8' : 'w-7 h-7 sm:w-8 sm:h-8'} rounded-full flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 shrink-0`}
                      title="Annulla"
                      aria-label="Annulla"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={canRedo ? { scale: 0.92 } : undefined}
                      onClick={onRedo}
                      disabled={!canRedo}
                      className={`no-press-scale ${isVertical ? 'w-8 h-8' : 'w-7 h-7 sm:w-8 sm:h-8'} rounded-full flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 shrink-0`}
                      title="Ripristina"
                      aria-label="Ripristina"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>

                  <div
                    className={`bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                      isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                    }`}
                    aria-hidden="true"
                  />

                  {/* Shrink / Minimize Floating Dock Button */}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => toggleMinimized(true)}
                    title="Rimpicciolisci barra strumenti"
                    aria-label="Rimpicciolisci barra strumenti"
                    className={`no-press-scale ${isVertical ? 'w-8 h-8' : 'w-7 h-7 sm:w-8 sm:h-8'} rounded-full flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 shrink-0`}
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          </LayoutGroup>
        </motion.div>
      </div>

      {/* Unclipped Animated Fixed Popovers for Eraser, Shapes, Style & Mobile Ink */}
      <AnimatePresence>
        {openPopover && !isDragging && !minimized && (
          <motion.div
            key={openPopover}
            ref={popoverRef}
            initial={popoverInitialOffset}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={popoverInitialOffset}
            transition={POPOVER_TRANSITION}
            style={{
              left: popoverPos.left,
              ...(popoverPos.top !== undefined ? { top: popoverPos.top } : {}),
              ...(popoverPos.bottom !== undefined ? { bottom: popoverPos.bottom } : {}),
            }}
            className="fixed z-50 ios-glass rounded-2xl p-2 max-w-[calc(100vw-20px)] max-h-[65dvh] overflow-y-auto no-print"
          >
            {openPopover === 'text' && (
              <div className="w-56 max-w-full space-y-2 p-1">
                <div className="text-[11px] font-medium text-[#8E8E93]">Modalità testo PDF</div>
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-[#787880]/12 dark:bg-white/8">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onChangePdfTextMode?.('edit')}
                    className={`no-press-scale relative py-1.5 rounded-full text-xs font-medium ${
                      pdfTextMode === 'edit'
                        ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#48484A] dark:text-[#A1A1A6]'
                    }`}
                  >
                    {pdfTextMode === 'edit' && (
                      <motion.span
                        layoutId="dock-text-mode"
                        transition={SPRING_PILL}
                        className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">Scrivi su PDF</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onChangePdfTextMode?.('note')}
                    className={`no-press-scale relative py-1.5 rounded-full text-xs font-medium ${
                      pdfTextMode === 'note'
                        ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#48484A] dark:text-[#A1A1A6]'
                    }`}
                  >
                    {pdfTextMode === 'note' && (
                      <motion.span
                        layoutId="dock-text-mode"
                        transition={SPRING_PILL}
                        className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">Casella nota</span>
                  </motion.button>
                </div>
                <p className="text-[11px] leading-snug text-[#8E8E93] px-0.5">
                  {pdfTextMode === 'edit'
                    ? 'Tocca righe, date o campi del PDF per modificarli direttamente.'
                    : 'Tocca un punto qualsiasi del foglio per aggiungere una nota in riquadro.'}
                </p>
              </div>
            )}

            {openPopover === 'eraser' && (
              <div className="w-56 max-w-full space-y-2.5 p-1">
                <div className="text-[11px] font-medium text-[#8E8E93]">Modalità gomma</div>
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-[#787880]/12 dark:bg-white/8">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onChangeEraserMode('stroke')}
                    className={`no-press-scale relative py-1.5 rounded-full text-xs font-medium ${
                      eraserMode === 'stroke'
                        ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#48484A] dark:text-[#A1A1A6]'
                    }`}
                  >
                    {eraserMode === 'stroke' && (
                      <motion.span
                        layoutId="dock-eraser-mode"
                        transition={SPRING_PILL}
                        className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">A tratto</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onChangeEraserMode('precision')}
                    className={`no-press-scale relative py-1.5 rounded-full text-xs font-medium ${
                      eraserMode === 'precision'
                        ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#48484A] dark:text-[#A1A1A6]'
                    }`}
                  >
                    {eraserMode === 'precision' && (
                      <motion.span
                        layoutId="dock-eraser-mode"
                        transition={SPRING_PILL}
                        className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">Precisione</span>
                  </motion.button>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#8E8E93]">
                    <span>Dimensione</span>
                    <span className="font-mono tabular-nums text-[#1C1C1E] dark:text-[#F5F5F7]">
                      {eraserSize} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={40}
                    value={eraserSize}
                    onChange={(e) => onChangeEraserSize(Number(e.target.value))}
                    aria-label="Dimensione gomma"
                    className="w-full accent-[#1C1C1E] dark:accent-[#F5F5F7] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {openPopover === 'shape' && (
              <div className="w-60 max-w-full p-0.5">
                <div className="text-[11px] font-medium text-[#8E8E93] px-1.5 mb-2">
                  Scegli forma e trascina sul foglio
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {SHAPE_CATALOG.map((item) => {
                    const selected = selectedInsertShape === item.kind && activeTool === 'shape';
                    return (
                      <motion.button
                        key={item.kind}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => {
                          onSelectInsertShape(item.kind);
                          onSelectTool('shape');
                          setOpenPopover(null);
                        }}
                        className={`no-press-scale flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-[10px] font-medium ${
                          selected
                            ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                            : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15'
                        }`}
                      >
                        {item.icon}
                        <span className="truncate w-full text-center">{item.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {openPopover === 'style' && (
              <div className="w-56 max-w-full space-y-3 p-1">
                <div>
                  <div className="text-[11px] font-medium text-[#8E8E93] mb-1.5">
                    {activeTool === 'highlighter' ? 'Spessore evidenziatore' : 'Spessore tratto'}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {currentWidths.map((w, idx) => {
                      const selected = Math.abs(activeWidthValue - w.value) < 0.5;
                      const dotSize = idx === 0 ? 5 : idx === 1 ? 7.5 : 10;
                      return (
                        <motion.button
                          key={w.id}
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          onClick={() =>
                            activeTool === 'highlighter'
                              ? onChangeHighlighterWidth(w.value)
                              : onChangePenWidth(w.value)
                          }
                          className={`no-press-scale h-8 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium whitespace-nowrap ${
                            selected
                              ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                              : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                          }`}
                        >
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              width: dotSize,
                              height: dotSize,
                              backgroundColor: selected ? 'currentColor' : activeColor,
                            }}
                          />
                          <span>{w.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-[#3C3C43]/10 dark:border-white/10">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      onBeautifyHandwriting();
                      setOpenPopover(null);
                    }}
                    className="no-press-scale h-8 rounded-xl ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-1 whitespace-nowrap"
                    title="Migliora grafia e raddrizza righe scritte a mano"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>Rifinisci</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={onToggleHoldToSnap}
                    title={holdToSnap ? 'Hold-to-Snap attivo (S)' : 'Hold-to-Snap disattivato (S)'}
                    className={`no-press-scale h-8 rounded-xl text-xs font-medium flex items-center justify-center whitespace-nowrap ${
                      holdToSnap
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                        : 'ios-control-bg text-[#48484A] dark:text-[#C7C7CC]'
                    }`}
                  >
                    {holdToSnap ? 'Snap: ON' : 'Snap: OFF'}
                  </motion.button>
                </div>
              </div>
            )}

            {openPopover === 'ink' && (
              <div className="w-56 max-w-full space-y-3 p-1">
                <div>
                  <div className="text-[11px] font-medium text-[#8E8E93] mb-1.5">
                    {activeTool === 'highlighter' ? 'Colore evidenziatore' : 'Colore inchiostro'}
                  </div>
                  <div className="flex items-center justify-around gap-2 px-1">
                    {paletteColors.map((color) => {
                      const selected = activeColor.toLowerCase() === color.hex.toLowerCase();
                      return (
                        <motion.button
                          key={color.id}
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          animate={{ scale: selected ? 1.1 : 1 }}
                          transition={SPRING_MORPH}
                          onClick={() => {
                            onChangeColor(color.hex);
                            setOpenPopover(null);
                          }}
                          title={color.label}
                          aria-label={`Colore ${color.label}`}
                          className={`no-press-scale w-6 h-6 rounded-full shrink-0 ${
                            selected
                              ? 'ring-2 ring-offset-2 ring-[#1C1C1E] dark:ring-[#F5F5F7]'
                              : 'border border-white/75 dark:border-white/25'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        />
                      );
                    })}
                  </div>
                </div>

                {showStrokeThickness && (
                  <>
                    <div>
                      <div className="text-[11px] font-medium text-[#8E8E93] mb-1.5">Spessore tratto</div>
                      <div className="grid grid-cols-3 gap-1">
                        {currentWidths.map((w, idx) => {
                          const selected = Math.abs(activeWidthValue - w.value) < 0.5;
                          const dotSize = idx === 0 ? 5 : idx === 1 ? 7.5 : 10;
                          return (
                            <motion.button
                              key={w.id}
                              type="button"
                              whileTap={{ scale: 0.92 }}
                              onClick={() =>
                                activeTool === 'highlighter'
                                  ? onChangeHighlighterWidth(w.value)
                                  : onChangePenWidth(w.value)
                              }
                              className={`no-press-scale h-8 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium ${
                                selected
                                  ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                                  : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                              }`}
                            >
                              <span
                                className="rounded-full"
                                style={{
                                  width: dotSize,
                                  height: dotSize,
                                  backgroundColor: selected ? 'currentColor' : activeColor,
                                }}
                              />
                              <span>{w.label}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#3C3C43]/10 dark:border-white/10">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => {
                          onBeautifyHandwriting();
                          setOpenPopover(null);
                        }}
                        className="no-press-scale h-8 rounded-xl ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-1"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        <span>Rifinisci</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={onToggleHoldToSnap}
                        className={`no-press-scale h-8 rounded-xl text-xs font-medium flex items-center justify-center ${
                          holdToSnap
                            ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                            : 'ios-control-bg text-[#48484A] dark:text-[#C7C7CC]'
                        }`}
                      >
                        {holdToSnap ? 'Snap: ON' : 'Snap: OFF'}
                      </motion.button>
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
