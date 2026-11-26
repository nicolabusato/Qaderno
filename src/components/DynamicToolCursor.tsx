import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { ToolType } from '../types/qaderno';

export interface DynamicToolCursorHandle {
  move: (clientX: number, clientY: number, pointerType?: string) => void;
  hide: () => void;
}

interface DynamicToolCursorProps {
  activeTool: ToolType;
  activeColor: string;
  penWidth: number;
  highlighterWidth: number;
  eraserSize: number;
  zoom: number;
}

export function isDynamicCursorTool(tool: ToolType): boolean {
  return tool === 'pen' || tool === 'fountain' || tool === 'highlighter' || tool === 'eraser';
}

export const DynamicToolCursor = forwardRef<DynamicToolCursorHandle, DynamicToolCursorProps>(
  ({ activeTool, activeColor, penWidth, highlighterWidth, eraserSize, zoom }, ref) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const visibleRef = useRef(false);
    const enabled = isDynamicCursorTool(activeTool);

    useImperativeHandle(
      ref,
      () => ({
        move(clientX: number, clientY: number, pointerType?: string) {
          const el = rootRef.current;
          if (!el) return;
          if (!enabled || pointerType === 'touch') {
            if (visibleRef.current) {
              el.style.opacity = '0';
              visibleRef.current = false;
            }
            return;
          }
          el.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
          if (!visibleRef.current) {
            el.style.opacity = '1';
            visibleRef.current = true;
          }
        },
        hide() {
          const el = rootRef.current;
          if (el && visibleRef.current) {
            el.style.opacity = '0';
            visibleRef.current = false;
          }
        },
      }),
      [enabled]
    );

    useEffect(() => {
      if (!enabled && rootRef.current) {
        rootRef.current.style.opacity = '0';
        visibleRef.current = false;
      }
    }, [enabled]);

    if (!enabled) return null;

    const isEraser = activeTool === 'eraser';
    const isHighlighter = activeTool === 'highlighter';
    const isFountain = activeTool === 'fountain';

    const diameter = isEraser
      ? Math.max(10, eraserSize * 2 * zoom)
      : isHighlighter
        ? Math.max(10, highlighterWidth * zoom)
        : Math.max(5, penWidth * zoom);

    return (
      <div
        ref={rootRef}
        aria-hidden="true"
        style={{
          opacity: 0,
          transform: 'translate3d(-100px, -100px, 0)',
          willChange: 'transform',
        }}
        className="fixed top-0 left-0 z-[75] pointer-events-none no-print"
      >
        {isEraser ? (
          <div
            style={{
              width: diameter,
              height: diameter,
            }}
            className="-translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-neutral-800/75 dark:border-white/85 bg-neutral-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] dark:shadow-[0_0_0_1px_rgba(0,0,0,0.45)] flex items-center justify-center"
          >
            <span className="w-1 h-1 rounded-full bg-neutral-800/60 dark:bg-white/75" />
          </div>
        ) : isHighlighter ? (
          <div
            style={{
              width: diameter,
              height: diameter,
            }}
            className="-translate-x-1/2 -translate-y-1/2 rounded-full relative flex items-center justify-center"
          >
            <span
              style={{ backgroundColor: activeColor, opacity: 0.34 }}
              className="absolute inset-0 rounded-full"
            />
            <span className="absolute inset-0 rounded-full border-[1.5px] border-neutral-900/55 dark:border-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.75)] dark:shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
            <span className="relative w-1 h-1 rounded-full bg-neutral-900/65 dark:bg-white/80" />
          </div>
        ) : (
          <div
            style={{
              width: Math.max(diameter, 6),
              height: Math.max(diameter, 6),
              backgroundColor: activeColor,
              boxShadow:
                '0 0 0 1.25px rgba(255,255,255,0.92), 0 0 0 2.5px rgba(28,28,30,0.68)',
              transform: isFountain
                ? 'translate(-50%, -50%) rotate(-32deg) scaleX(1.35) scaleY(0.76)'
                : 'translate(-50%, -50%)',
            }}
            className="rounded-full"
          />
        )}
      </div>
    );
  }
);

DynamicToolCursor.displayName = 'DynamicToolCursor';
