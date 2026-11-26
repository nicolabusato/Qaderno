import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { DockPosition } from '../types/qaderno';

interface ZoomPillProps {
  zoom: number;
  dockPosition: DockPosition;
  isSmartphone?: boolean;
  searchOpen?: boolean;
  onChangeZoom: (nextZoom: number) => void;
  onFitWidth: () => void;
}

const ZOOM_PRESETS = [0.75, 1, 1.25, 1.5, 2];

export const ZoomPill: React.FC<ZoomPillProps> = ({
  zoom,
  dockPosition,
  isSmartphone = false,
  searchOpen = false,
  onChangeZoom,
  onFitWidth,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recentZoomActivity, setRecentZoomActivity] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevZoomRef = useRef(zoom);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [menuOpen]);

  // Brighten smartphone pill briefly whenever zoom changes
  useEffect(() => {
    if (Math.abs(prevZoomRef.current - zoom) < 0.002) return;
    prevZoomRef.current = zoom;
    if (!isSmartphone) return;
    setRecentZoomActivity(true);
    const id = window.setTimeout(() => setRecentZoomActivity(false), 1800);
    return () => window.clearTimeout(id);
  }, [zoom, isSmartphone]);

  const pct = Math.round(zoom * 100);
  const stepZoom = (delta: number) => {
    const next = Math.max(0.4, Math.min(3, Math.round((zoom + delta) * 100) / 100));
    onChangeZoom(next);
  };

  if (isSmartphone) {
    // Discreet top-right pill below the enlarged smartphone header — never overlaps the bottom dock
    const topClass = searchOpen
      ? 'top-[calc(128px+env(safe-area-inset-top,0px))]'
      : 'top-[calc(72px+env(safe-area-inset-top,0px))]';

    return (
      <div
        ref={containerRef}
        className={`fixed ${topClass} right-[calc(10px+env(safe-area-inset-right,0px))] z-30 no-print no-ios-select transition-all duration-200 ${
          menuOpen || recentZoomActivity ? 'opacity-100' : 'opacity-65 hover:opacity-100'
        }`}
      >
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="absolute top-full right-0 mt-1.5 w-44 ios-glass rounded-2xl p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-1 px-0.5">
                <button
                  type="button"
                  onClick={() => stepZoom(-0.1)}
                  disabled={zoom <= 0.4}
                  className="w-8 h-8 rounded-xl ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] disabled:opacity-30"
                  aria-label="Riduci zoom"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold tabular-nums text-[#1C1C1E] dark:text-[#F5F5F7]">
                  {pct}%
                </span>
                <button
                  type="button"
                  onClick={() => stepZoom(0.1)}
                  disabled={zoom >= 3}
                  className="w-8 h-8 rounded-xl ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] disabled:opacity-30"
                  aria-label="Aumenta zoom"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="h-px bg-[#3C3C43]/12 dark:bg-white/10" />

              <button
                type="button"
                onClick={() => {
                  onFitWidth();
                  setMenuOpen(false);
                }}
                className="w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
              >
                <Maximize2 className="w-3.5 h-3.5 opacity-70" />
                <span>Adatta allo schermo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onChangeZoom(1);
                  setMenuOpen(false);
                }}
                className="w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5 opacity-70" />
                <span>Ripristina 100%</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="ios-pill-glass rounded-full px-1.5 py-1 flex items-center gap-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            onDoubleClick={onFitWidth}
            className="h-7 px-2 rounded-full text-[11.5px] font-semibold tabular-nums text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
            title="Opzioni zoom"
            aria-label={`Livello zoom ${pct}%`}
          >
            {pct}%
          </button>
        </div>
      </div>
    );
  }

  // Desktop & Tablet: original bottom-right ZoomPill untouched
  const bottomOffsetClass =
    dockPosition === 'bottom'
      ? 'bottom-[calc(64px+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(18px+env(safe-area-inset-bottom,0px))]'
      : 'bottom-[calc(14px+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(18px+env(safe-area-inset-bottom,0px))]';

  return (
    <div
      ref={containerRef}
      className={`fixed ${bottomOffsetClass} right-[calc(10px+env(safe-area-inset-right,0px))] sm:right-[calc(18px+env(safe-area-inset-right,0px))] z-40 no-print no-ios-select`}
    >
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-full right-0 mb-2 w-44 ios-glass rounded-2xl p-2 space-y-1.5"
          >
            <div className="px-2 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-[#8E8E93]">
              Livello zoom
            </div>

            <div className="px-2 py-1">
              <input
                type="range"
                min={40}
                max={300}
                step={5}
                value={pct}
                onChange={(e) => onChangeZoom(Number(e.target.value) / 100)}
                className="w-full accent-[#1C1C1E] dark:accent-[#F5F5F7] h-1.5 cursor-pointer"
                aria-label="Livello zoom"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 px-1">
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
                    className={`h-7 rounded-lg text-[11px] font-medium tabular-nums transition-colors ${
                      active
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                        : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                    }`}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  onChangeZoom(3);
                  setMenuOpen(false);
                }}
                className={`h-7 rounded-lg text-[11px] font-medium tabular-nums transition-colors ${
                  Math.abs(zoom - 3) < 0.02
                    ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                    : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                }`}
              >
                300%
              </button>
            </div>

            <div className="h-px bg-[#3C3C43]/12 dark:bg-white/10" />

            <button
              type="button"
              onClick={() => {
                onFitWidth();
                setMenuOpen(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
            >
              <Maximize2 className="w-3.5 h-3.5 opacity-70" />
              <span>Adatta larghezza</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onChangeZoom(1);
                setMenuOpen(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5 opacity-70" />
              <span>Ripristina 100%</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Translucent Zoom Pill */}
      <div className="ios-pill-glass rounded-full px-1 py-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => stepZoom(-0.1)}
          disabled={zoom <= 0.4}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 transition-colors"
          title="Riduci zoom (Ctrl -)"
          aria-label="Riduci zoom"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          onDoubleClick={() => onChangeZoom(1)}
          className="h-7 px-2 rounded-full text-[11px] font-medium tabular-nums text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 transition-colors"
          title="Scegli zoom (doppio clic per 100%)"
          aria-label={`Livello zoom ${pct}%`}
        >
          {pct}%
        </button>

        <button
          type="button"
          onClick={() => stepZoom(0.1)}
          disabled={zoom >= 3}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 disabled:opacity-30 transition-colors"
          title="Aumenta zoom (Ctrl +)"
          aria-label="Aumenta zoom"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
