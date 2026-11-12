import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ChevronDown,
  Circle,
  Diamond,
  Eraser,
  GripHorizontal,
  GripVertical,
  Hexagon,
  Highlighter,
  Lasso,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  MoveHorizontal,
  PenLine,
  PenTool,
  Redo2,
  Shapes,
  Square,
  Star,
  Triangle,
  Undo2,
} from 'lucide-react';
import {
  DockPosition,
  EraserMode,
  HIGHLIGHTER_WIDTHS,
  INK_COLORS,
  PEN_WIDTHS,
  RecognizedShapeKind,
  ToolType,
} from '../types/qaderno';

interface FloatingToolDockProps {
  dockPosition: DockPosition;
  activeTool: ToolType;
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

type DockPopoverId = 'eraser' | 'shape' | 'ink' | null;

const DOCK_CYCLE_ORDER: DockPosition[] = ['bottom', 'right', 'top', 'left'];

const HOVER_LABELS: Record<DockPosition, string> = {
  top: 'In alto',
  bottom: 'In basso',
  left: 'A sinistra',
  right: 'A destra',
};

const SPRING_FAST = { type: 'spring' as const, stiffness: 480, damping: 34, mass: 0.75 };
const SPRING_POP = { type: 'spring' as const, stiffness: 440, damping: 30, mass: 0.75 };

export const FloatingToolDock: React.FC<FloatingToolDockProps> = ({
  dockPosition,
  activeTool,
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

  const [isDragging, setIsDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverZone, setHoverZone] = useState<DockPosition>(dockPosition);

  const dragMetaRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({ pointerId: -1, startX: 0, startY: 0, moved: false });

  const dockRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  // Global window pointer listeners during drag so pointer tracking NEVER breaks on DOM updates
  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMove = (e: PointerEvent) => {
      if (dragMetaRef.current.pointerId !== -1 && e.pointerId !== dragMetaRef.current.pointerId) return;
      if (Math.hypot(e.clientX - dragMetaRef.current.startX, e.clientY - dragMetaRef.current.startY) > 6) {
        dragMetaRef.current.moved = true;
      }
      const clampedX = Math.max(76, Math.min(window.innerWidth - 76, e.clientX));
      const clampedY = Math.max(36, Math.min(window.innerHeight - 36, e.clientY));
      setDragCoords({ x: clampedX, y: clampedY });
      setHoverZone(resolveDropZone(e.clientX, e.clientY));
    };

    const finishDrag = (clientX?: number, clientY?: number) => {
      const moved = dragMetaRef.current.moved;
      dragMetaRef.current.pointerId = -1;
      setIsDragging(false);
      if (clientX !== undefined && clientY !== undefined) {
        if (moved) {
          onChangeDockPosition(resolveDropZone(clientX, clientY));
        } else {
          const idx = DOCK_CYCLE_ORDER.indexOf(dockPosition);
          const nextPos = DOCK_CYCLE_ORDER[(idx + 1) % DOCK_CYCLE_ORDER.length];
          onChangeDockPosition(nextPos);
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
  }, [isDragging, dockPosition, onChangeDockPosition, resolveDropZone]);

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenPopover(null);
    dragMetaRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragCoords({
      x: Math.max(76, Math.min(window.innerWidth - 76, e.clientX)),
      y: Math.max(36, Math.min(window.innerHeight - 36, e.clientY)),
    });
    setHoverZone(resolveDropZone(e.clientX, e.clientY));
    setIsDragging(true);
  };

  const togglePopover = (id: Exclude<DockPopoverId, null>, btnEl: HTMLElement, widthEst = 240, heightEst = 210) => {
    if (openPopover === id) {
      setOpenPopover(null);
      return;
    }
    const r = btnEl.getBoundingClientRect();
    if (dockPosition === 'left') {
      const left = Math.min(window.innerWidth - widthEst - 12, r.right + 12);
      const top = Math.max(64, Math.min(window.innerHeight - heightEst - 12, r.top - 12));
      setPopoverPos({ left, top });
    } else if (dockPosition === 'right') {
      const left = Math.max(12, r.left - widthEst - 12);
      const top = Math.max(64, Math.min(window.innerHeight - heightEst - 12, r.top - 12));
      setPopoverPos({ left, top });
    } else if (dockPosition === 'bottom') {
      const left = Math.max(10, Math.min(window.innerWidth - widthEst - 10, r.left - 16));
      setPopoverPos({ left, bottom: window.innerHeight - r.top + 12 });
    } else {
      const left = Math.max(10, Math.min(window.innerWidth - widthEst - 10, r.left - 16));
      setPopoverPos({ left, top: r.bottom + 12 });
    }
    setOpenPopover(id);
  };

  const currentWidths = activeTool === 'highlighter' ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS;
  const activeWidthValue = activeTool === 'highlighter' ? highlighterWidth : penWidth;

  const mainTools: Array<{ id: ToolType; label: string; icon: React.ReactNode }> = [
    { id: 'text', label: 'Cursore / Testo (T)', icon: <MousePointer2 className="w-4 h-4" /> },
    { id: 'pen', label: 'Penna (P)', icon: <PenTool className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Evidenziatore (H)', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'eraser', label: 'Gomma (E)', icon: <Eraser className="w-4 h-4" /> },
    { id: 'lasso', label: 'Lazo (L)', icon: <Lasso className="w-4 h-4" /> },
  ];

  const activeToolDef =
    activeTool === 'shape'
      ? { label: 'Forme', icon: <Shapes className="w-4 h-4" /> }
      : mainTools.find((t) => t.id === activeTool) || mainTools[1];

  const anchoredContainerClass =
    dockPosition === 'top'
      ? 'top-[54px] sm:top-[64px] left-1/2 -translate-x-1/2 max-w-[calc(100%-12px)] sm:max-w-[calc(100%-20px)]'
      : dockPosition === 'bottom'
        ? 'bottom-2.5 sm:bottom-5 pb-safe left-1/2 -translate-x-1/2 max-w-[calc(100%-12px)] sm:max-w-[calc(100%-20px)]'
        : dockPosition === 'left'
          ? 'left-2 sm:left-4 top-[calc(50%+22px)] -translate-y-1/2 max-h-[calc(100%-96px)]'
          : 'right-2 sm:right-4 top-[calc(50%+10px)] -translate-y-1/2 max-h-[calc(100%-148px)]';

  const popoverInitialOffset =
    dockPosition === 'left'
      ? { opacity: 0, x: -10, scale: 0.94 }
      : dockPosition === 'right'
        ? { opacity: 0, x: 10, scale: 0.94 }
        : dockPosition === 'top'
          ? { opacity: 0, y: -10, scale: 0.94 }
          : { opacity: 0, y: 10, scale: 0.94 };

  const dropGuides: Array<{ pos: DockPosition; label: string; className: string }> = [
    { pos: 'top', label: 'Ancora in alto', className: 'left-1/2 -translate-x-1/2 top-[68px]' },
    { pos: 'bottom', label: 'Ancora in basso', className: 'left-1/2 -translate-x-1/2 bottom-5 pb-safe' },
    { pos: 'left', label: 'Ancora a sinistra', className: 'left-3.5 top-[calc(50%+22px)] -translate-y-1/2' },
    { pos: 'right', label: 'Ancora a destra', className: 'right-3.5 top-[calc(50%+22px)] -translate-y-1/2' },
  ];

  const compactVertical = isVertical && !isDragging;

  return (
    <>
      {/* 4-Side Magnetic Drop Guides while Dragging */}
      <AnimatePresence>
        {isDragging &&
          dropGuides.map((guide) => {
            const active = hoverZone === guide.pos;
            return (
              <div
                key={guide.pos}
                className={`absolute ${guide.className} z-30 pointer-events-none`}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{
                    opacity: active ? 1 : 0.72,
                    scale: active ? 1.07 : 0.96,
                  }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={SPRING_FAST}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                    active
                      ? 'ios-glass text-[#1C1C1E] dark:text-[#F5F5F7] ring-1 ring-[#1C1C1E]/25 dark:ring-white/30 shadow-md'
                      : 'bg-[#787880]/14 dark:bg-white/10 text-[#8E8E93]'
                  }`}
                >
                  {guide.label}
                </motion.div>
              </div>
            );
          })}
      </AnimatePresence>

      {/* Outer Positioning Wrapper (kept pure so Tailwind centering transforms never clash with Motion transforms) */}
      <div
        ref={dockRef}
        style={
          isDragging
            ? {
                position: 'fixed',
                left: dragCoords.x,
                top: dragCoords.y,
                transform: 'translate(-50%, -50%)',
              }
            : undefined
        }
        className={`z-40 no-print select-none ${
          isDragging ? 'cursor-grabbing' : `absolute ${anchoredContainerClass}`
        }`}
      >
        <motion.div
          key={isDragging ? 'dragging' : minimized ? 'minimized' : isVertical ? 'vertical' : 'horizontal'}
          initial={{ opacity: 0.88, scale: isDragging ? 0.92 : 0.95 }}
          animate={{ opacity: 1, scale: isDragging ? 0.88 : 1 }}
          transition={SPRING_FAST}
        >
          {isDragging || minimized ? (
            /* Compact / Minimized Pill Bubble (adapts horizontally or vertically to side) */
            <div
              className={`ios-pill-glass rounded-full flex items-center gap-1.5 shadow-md ${
                compactVertical ? 'flex-col py-1.5 px-1' : 'flex-row px-1.5 py-1'
              }`}
            >
              <button
                type="button"
                onPointerDown={startDrag}
                title="Trascina sui 4 lati per spostare (o tocca per ruotare)"
                aria-label="Sposta barra strumenti volante"
                className={`no-press-scale rounded-full flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 cursor-grab active:cursor-grabbing touch-none shrink-0 ${
                  compactVertical ? 'w-8 h-7' : 'w-7 h-8'
                }`}
              >
                {compactVertical ? (
                  <GripHorizontal className="w-4 h-4" />
                ) : (
                  <GripVertical className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => !isDragging && toggleMinimized(false)}
                title="Espandi barra strumenti"
                className={`rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-2 shadow-xs ${
                  compactVertical ? 'w-8 py-2 flex-col' : 'h-8 px-2 flex-row'
                }`}
              >
                {activeToolDef.icon}
                <span
                  className="w-3 h-3 rounded-full border border-black/15 dark:border-white/25 shrink-0"
                  style={{ backgroundColor: activeColor }}
                />
              </button>

              {isDragging ? (
                <span className="text-[11px] font-medium text-[#48484A] dark:text-[#C7C7CC] pr-2 whitespace-nowrap">
                  {HOVER_LABELS[hoverZone]}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleMinimized(false)}
                  title="Espandi barra strumenti"
                  aria-label="Espandi barra strumenti"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 shrink-0"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            /* Expanded Floating Tool Bubble (Horizontal on top/bottom, Sleek Vertical on left/right) */
            <div
              className={`ios-pill-glass flex flex-nowrap items-center gap-1 no-scrollbar ${
                isVertical
                  ? 'rounded-[28px] py-1.5 px-1 flex-col max-h-[calc(100vh-180px)] overflow-y-auto'
                  : 'rounded-full px-1.5 py-1 flex-row overflow-x-auto'
              }`}
            >
              {/* Drag Handle */}
              <button
                type="button"
                onPointerDown={startDrag}
                title="Trascina su uno dei 4 lati (o tocca per cambiare lato)"
                aria-label="Sposta barra strumenti volante"
                className={`no-press-scale rounded-full flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 cursor-grab active:cursor-grabbing touch-none shrink-0 ${
                  isVertical ? 'w-8 h-7' : 'h-8 w-7'
                }`}
              >
                {isVertical ? (
                  <GripHorizontal className="w-4 h-4" />
                ) : (
                  <GripVertical className="w-4 h-4" />
                )}
              </button>

              {/* Primary Writing & Drawing Tools */}
              <div
                className={`flex flex-nowrap items-center gap-0.5 shrink-0 ${
                  isVertical ? 'flex-col' : 'flex-row'
                }`}
              >
                {mainTools.map((t) => {
                  const isActive = activeTool === t.id;
                  const isEraser = t.id === 'eraser';
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-dock-trigger={isEraser ? 'eraser' : undefined}
                      onClick={(e) => {
                        if (isEraser) {
                          if (activeTool === 'eraser') {
                            togglePopover('eraser', e.currentTarget, 236, 175);
                          } else {
                            onSelectTool('eraser');
                            togglePopover('eraser', e.currentTarget, 236, 175);
                          }
                        } else {
                          setOpenPopover(null);
                          onSelectTool(t.id);
                        }
                      }}
                      title={t.label}
                      aria-label={t.label}
                      aria-pressed={isActive}
                      className={`relative rounded-full flex items-center justify-center gap-0.5 whitespace-nowrap shrink-0 ${
                        isVertical ? 'w-8 h-8' : 'w-8 h-8 sm:w-auto sm:px-2.5'
                      } ${
                        isActive
                          ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                          : 'text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/12'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="dock-active-tool"
                          transition={SPRING_FAST}
                          className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-0.5">
                        {t.icon}
                        {isEraser && !isVertical && (
                          <ChevronDown className="hidden sm:block w-2.5 h-2.5 opacity-60" />
                        )}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  data-dock-trigger="shape"
                  onClick={(e) => {
                    onSelectTool('shape');
                    togglePopover('shape', e.currentTarget, 256, 215);
                  }}
                  title="Forme geometriche"
                  aria-label="Forme geometriche"
                  aria-pressed={activeTool === 'shape'}
                  className={`relative rounded-full flex items-center justify-center gap-0.5 whitespace-nowrap shrink-0 ${
                    isVertical ? 'w-8 h-8' : 'w-8 h-8 sm:w-auto sm:px-2.5'
                  } ${
                    activeTool === 'shape'
                      ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                      : 'text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/12'
                  }`}
                >
                  {activeTool === 'shape' && (
                    <motion.span
                      layoutId="dock-active-tool"
                      transition={SPRING_FAST}
                      className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-0.5">
                    <Shapes className="w-4 h-4" />
                    {!isVertical && <ChevronDown className="hidden sm:block w-2.5 h-2.5 opacity-60" />}
                  </span>
                </button>
              </div>

              <div
                className={`bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                  isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                }`}
                aria-hidden="true"
              />

              {/* Compact Mobile Ink / Style Trigger (<640px horizontal only) */}
              {!isVertical && (
                <button
                  type="button"
                  data-dock-trigger="ink"
                  onClick={(e) => togglePopover('ink', e.currentTarget, 240, 210)}
                  title="Colore, spessore e grafia"
                  aria-label="Colore, spessore e grafia"
                  className="sm:hidden w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#787880]/15 shrink-0"
                >
                  <span
                    className="w-4.5 h-4.5 rounded-full ring-2 ring-white/80 dark:ring-white/25 shadow-xs"
                    style={{ backgroundColor: activeColor }}
                  />
                </button>
              )}

              {/* Rifinisci & Hold-to-Snap (always visible on vertical dock & sm:+ horizontal) */}
              <button
                type="button"
                onClick={onBeautifyHandwriting}
                title="Migliora grafia e raddrizza righe scritte a mano"
                aria-label="Rifinisci grafia"
                className={`${isVertical ? 'flex' : 'hidden sm:flex'} rounded-full items-center justify-center gap-1 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 whitespace-nowrap shrink-0 ${
                  isVertical ? 'w-8 h-8' : 'h-8 px-2.5'
                }`}
              >
                <PenLine className="w-3.5 h-3.5" />
                {!isVertical && <span className="hidden md:inline">Rifinisci</span>}
              </button>

              <button
                type="button"
                onClick={onToggleHoldToSnap}
                title={holdToSnap ? 'Hold-to-Snap attivo (S)' : 'Hold-to-Snap disattivato (S)'}
                aria-pressed={holdToSnap}
                className={`${isVertical ? 'block' : 'hidden sm:block'} rounded-full font-medium whitespace-nowrap shrink-0 ${
                  isVertical ? 'w-8 h-7 text-[10px]' : 'h-8 px-2 text-[11px]'
                } ${
                  holdToSnap
                    ? 'bg-[#FBFBFD] dark:bg-[#2C2C30] text-[#1C1C1E] dark:text-[#F5F5F7] shadow-xs'
                    : 'text-[#8E8E93] hover:bg-[#787880]/12'
                }`}
              >
                Snap
              </button>

              <div
                className={`${isVertical ? 'block' : 'hidden sm:block'} bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                  isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                }`}
                aria-hidden="true"
              />

              {/* Stroke Widths (inline on vertical & sm:+) */}
              <div
                className={`${
                  isVertical ? 'flex flex-col' : 'hidden sm:flex flex-row'
                } items-center gap-0.5 shrink-0`}
              >
                {currentWidths.map((w, idx) => {
                  const selected = Math.abs(activeWidthValue - w.value) < 0.5;
                  const dotSize = idx === 0 ? 4.5 : idx === 1 ? 7 : 9.5;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        activeTool === 'highlighter'
                          ? onChangeHighlighterWidth(w.value)
                          : onChangePenWidth(w.value)
                      }
                      title={`Spessore ${w.label}`}
                      aria-label={`Spessore ${w.label}`}
                      className={`relative w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        selected ? '' : 'hover:bg-[#787880]/15'
                      }`}
                    >
                      {selected && (
                        <motion.span
                          layoutId="dock-active-width"
                          transition={SPRING_FAST}
                          className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs ring-1 ring-[#3C3C43]/15 dark:ring-white/20"
                        />
                      )}
                      <span
                        className="relative z-10 rounded-full transition-transform duration-150"
                        style={{
                          width: dotSize,
                          height: dotSize,
                          backgroundColor: activeColor,
                          opacity: activeTool === 'highlighter' ? 0.55 : 1,
                        }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Ink Colors (inline on vertical & sm:+) */}
              <div
                className={`${
                  isVertical ? 'flex flex-col gap-1.5 py-1' : 'hidden sm:flex flex-row gap-1 px-1'
                } items-center shrink-0`}
              >
                {INK_COLORS.map((color) => {
                  const selected = activeColor.toLowerCase() === color.hex.toLowerCase();
                  return (
                    <motion.button
                      key={color.id}
                      type="button"
                      whileHover={{ scale: 1.12 }}
                      whileTap={{ scale: 0.88 }}
                      animate={{ scale: selected ? 1.12 : 1 }}
                      transition={SPRING_FAST}
                      onClick={() => onChangeColor(color.hex)}
                      title={color.label}
                      aria-label={`Colore ${color.label}`}
                      className={`w-4.5 h-4.5 rounded-full shrink-0 ${
                        selected
                          ? 'ring-2 ring-offset-1 ring-[#1C1C1E] dark:ring-[#F5F5F7]'
                          : 'border border-white/75 dark:border-white/25'
                      }`}
                      style={{ backgroundColor: color.hex }}
                    />
                  );
                })}
              </div>

              <div
                className={`bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                  isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                }`}
                aria-hidden="true"
              />

              {/* Undo / Redo */}
              <div className={`flex items-center gap-0.5 shrink-0 ${isVertical ? 'flex-col' : 'flex-row'}`}>
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 shrink-0"
                  title="Annulla"
                  aria-label="Annulla"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 shrink-0"
                  title="Ripristina"
                  aria-label="Ripristina"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div
                className={`bg-[#3C3C43]/15 dark:bg-white/15 shrink-0 ${
                  isVertical ? 'h-px w-4 my-0.5' : 'w-px h-4 mx-0.5'
                }`}
                aria-hidden="true"
              />

              {/* Shrink / Minimize Floating Dock Button */}
              <button
                type="button"
                onClick={() => toggleMinimized(true)}
                title="Rimpicciolisci barra strumenti"
                aria-label="Rimpicciolisci barra strumenti"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 shrink-0"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Unclipped Animated Fixed Popovers for Eraser & Shapes */}
      <AnimatePresence>
        {openPopover && !isDragging && !minimized && (
          <motion.div
            key={openPopover}
            ref={popoverRef}
            initial={popoverInitialOffset}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={popoverInitialOffset}
            transition={SPRING_POP}
            style={{
              left: popoverPos.left,
              ...(popoverPos.top !== undefined ? { top: popoverPos.top } : {}),
              ...(popoverPos.bottom !== undefined ? { bottom: popoverPos.bottom } : {}),
            }}
            className="fixed z-50 ios-glass rounded-2xl p-2 no-print"
          >
            {openPopover === 'eraser' && (
              <div className="w-56 space-y-2.5 p-1">
                <div className="text-[11px] font-medium text-[#8E8E93]">Modalità gomma</div>
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-[#787880]/12 dark:bg-white/8">
                  <button
                    type="button"
                    onClick={() => onChangeEraserMode('stroke')}
                    className={`relative py-1.5 rounded-full text-xs font-medium ${
                      eraserMode === 'stroke'
                        ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#48484A] dark:text-[#A1A1A6]'
                    }`}
                  >
                    {eraserMode === 'stroke' && (
                      <motion.span
                        layoutId="dock-eraser-mode"
                        transition={SPRING_FAST}
                        className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">A tratto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeEraserMode('precision')}
                    className={`relative py-1.5 rounded-full text-xs font-medium ${
                      eraserMode === 'precision'
                        ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#48484A] dark:text-[#A1A1A6]'
                    }`}
                  >
                    {eraserMode === 'precision' && (
                      <motion.span
                        layoutId="dock-eraser-mode"
                        transition={SPRING_FAST}
                        className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">Precisione</span>
                  </button>
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
              <div className="w-60 p-0.5">
                <div className="text-[11px] font-medium text-[#8E8E93] px-1.5 mb-2">
                  Scegli forma e trascina sul foglio
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {SHAPE_CATALOG.map((item) => {
                    const selected = selectedInsertShape === item.kind && activeTool === 'shape';
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => {
                          onSelectInsertShape(item.kind);
                          onSelectTool('shape');
                          setOpenPopover(null);
                        }}
                        className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-[10px] font-medium ${
                          selected
                            ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                            : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15'
                        }`}
                      >
                        {item.icon}
                        <span className="truncate w-full text-center">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {openPopover === 'ink' && (
              <div className="w-56 space-y-3 p-1">
                <div>
                  <div className="text-[11px] font-medium text-[#8E8E93] mb-1.5">Colore inchiostro</div>
                  <div className="flex items-center justify-between gap-2 px-1">
                    {INK_COLORS.map((color) => {
                      const selected = activeColor.toLowerCase() === color.hex.toLowerCase();
                      return (
                        <button
                          key={color.id}
                          type="button"
                          onClick={() => {
                            onChangeColor(color.hex);
                            setOpenPopover(null);
                          }}
                          title={color.label}
                          aria-label={`Colore ${color.label}`}
                          className={`w-6 h-6 rounded-full shrink-0 ${
                            selected
                              ? 'ring-2 ring-offset-2 ring-[#1C1C1E] dark:ring-[#F5F5F7] scale-110'
                              : 'border border-white/75 dark:border-white/25'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-[#8E8E93] mb-1.5">Spessore tratto</div>
                  <div className="grid grid-cols-3 gap-1">
                    {currentWidths.map((w, idx) => {
                      const selected = Math.abs(activeWidthValue - w.value) < 0.5;
                      const dotSize = idx === 0 ? 5 : idx === 1 ? 7.5 : 10;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() =>
                            activeTool === 'highlighter'
                              ? onChangeHighlighterWidth(w.value)
                              : onChangePenWidth(w.value)
                          }
                          className={`h-8 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium ${
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
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#3C3C43]/10 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      onBeautifyHandwriting();
                      setOpenPopover(null);
                    }}
                    className="h-8 rounded-xl ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-1"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>Rifinisci</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleHoldToSnap}
                    className={`h-8 rounded-xl text-xs font-medium flex items-center justify-center ${
                      holdToSnap
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                        : 'ios-control-bg text-[#48484A] dark:text-[#C7C7CC]'
                    }`}
                  >
                    {holdToSnap ? 'Snap: ON' : 'Snap: OFF'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
