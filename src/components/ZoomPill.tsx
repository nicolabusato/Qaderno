import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { DockPosition } from '../types/qaderno';

interface ZoomPillProps {
  zoom: number;
  dockPosition?: DockPosition;
  onChangeZoom: (next: number) => void;
  onFitWidth: () => void;
}

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5];

export const ZoomPill: React.FC<ZoomPillProps> = ({
  zoom,
  dockPosition = 'bottom',
  onChangeZoom,
  onFitWidth,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, []);

  const pct = Math.round(zoom * 100);
  const clampZoom = (val: number) => Math.max(0.4, Math.min(3, Math.round(val * 100) / 100));

  // Keep ZoomPill cleanly outside FloatingToolDock footprint on all 4 dock positions & viewports
  const positionClass =
    dockPosition === 'bottom'
      ? 'bottom-[62px] sm:bottom-[76px] right-2.5 sm:right-4'
      : dockPosition === 'right'
        ? 'bottom-3 sm:bottom-4 right-[58px] sm:right-[74px]'
        : 'bottom-3 sm:bottom-4 right-2.5 sm:right-4';

  const popoverDirectionClass = 'bottom-10 sm:bottom-12 right-0 mb-1';

  return (
    <div ref={containerRef} className={`absolute ${positionClass} z-40 pb-safe no-print`}>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.93 }}
            transition={{ type: 'spring', stiffness: 460, damping: 32, mass: 0.75 }}
            style={{ transformOrigin: 'bottom right' }}
            className={`absolute ${popoverDirectionClass} w-56 ${
              dockPosition === 'right' ? 'max-w-[calc(100vw-74px)]' : 'max-w-[calc(100vw-20px)]'
            } max-h-[60dvh] overflow-y-auto ios-glass rounded-2xl p-1.5 space-y-1`}
          >
            {/* Quick - / + row visible on compact mobile */}
            <div className="flex sm:hidden items-center justify-between gap-1 px-1 pb-0.5">
              <button
                type="button"
                onClick={() => onChangeZoom(clampZoom(zoom - 0.1))}
                disabled={zoom <= 0.401}
                className="flex-1 h-8 rounded-xl ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] disabled:opacity-30"
                aria-label="Zoom indietro"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-semibold tabular-nums text-[#1C1C1E] dark:text-[#F5F5F7]">
                {pct}%
              </span>
              <button
                type="button"
                onClick={() => onChangeZoom(clampZoom(zoom + 0.1))}
                disabled={zoom >= 2.999}
                className="flex-1 h-8 rounded-xl ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] disabled:opacity-30"
                aria-label="Zoom avanti"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onChangeZoom(1);
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reimposta al 100%</span>
              </span>
              <span className="text-[11px] text-[#8E8E93] tabular-nums">100%</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onFitWidth();
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Adatta alla larghezza</span>
            </button>

            <div className="h-px bg-[#3C3C43]/10 dark:bg-white/10 my-1" />

            <div className="grid grid-cols-5 gap-1 px-1 pb-1">
              {ZOOM_PRESETS.map((preset) => {
                const active = Math.abs(zoom - preset) < 0.02;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onChangeZoom(preset);
                      setMenuOpen(false);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-medium tabular-nums transition-colors ${
                      active
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                        : 'text-[#48484A] dark:text-[#C7C7CC] hover:bg-[#787880]/15'
                    }`}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="ios-pill-glass rounded-full px-1 py-0.5 sm:py-1 flex items-center gap-0.5 select-none"
        role="group"
        aria-label="Controllo zoom"
      >
        <button
          type="button"
          onClick={() => onChangeZoom(clampZoom(zoom - 0.1))}
          disabled={zoom <= 0.401}
          title="Zoom indietro (Ctrl/Cmd + -)"
          aria-label="Zoom indietro"
          className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="Opzioni zoom (pizzica per ingrandire)"
          aria-label={`Zoom corrente ${pct}%`}
          className="h-7 sm:h-8 px-2.5 rounded-full text-[11px] sm:text-xs font-medium tabular-nums text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 transition-colors whitespace-nowrap"
        >
          {pct}%
        </button>

        <button
          type="button"
          onClick={() => onChangeZoom(clampZoom(zoom + 0.1))}
          disabled={zoom >= 2.999}
          title="Zoom avanti (Ctrl/Cmd + +)"
          aria-label="Zoom avanti"
          className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
