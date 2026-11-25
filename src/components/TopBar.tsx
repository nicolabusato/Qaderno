import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Baseline,
  Check,
  ChevronDown,
  Download,
  FileArchive,
  FileText,
  Grid3x3,
  History,
  Menu,
  MoreHorizontal,
  Pin,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Type,
} from 'lucide-react';
import {
  ActiveTextSelection,
  NOTE_FONTS,
  NoteDocument,
  NoteFontFamily,
  PaperStyle,
  TEXT_COLORS,
} from '../types/qaderno';
import { CustomColorPicker } from './CustomColorPicker';

interface TopBarProps {
  note: NoteDocument | null;
  sidebarOpen: boolean;
  activeTextSelection: ActiveTextSelection | null;
  typingFont?: NoteFontFamily;
  activeTextColor?: string;
  onToggleSidebar: () => void;
  onApplyFontToSelectionOrBlock: (font: NoteFontFamily) => void;
  onApplyTextColor: (color: string | undefined) => void;
  onChangePaperStyle: (style: PaperStyle) => void;
  onTogglePin: () => void;
  onAddPage?: () => void;
  onOpenSnapshots?: () => void;
  onOpenSearch?: () => void;
  searchOpen?: boolean;
  isSmartphone?: boolean;
  onExportQaderno: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  onPrint: () => void;
  onOpenContextMenu?: (x: number, y: number) => void;
}

const PAPER_OPTIONS: Array<{ id: PaperStyle; label: string }> = [
  { id: 'grid', label: 'Quadretti' },
  { id: 'lined', label: 'Righe' },
  { id: 'dotted', label: 'Puntini' },
  { id: 'blank', label: 'Bianca' },
];

type OpenMenuId = 'font' | 'textcolor' | 'paper' | 'export' | 'more' | null;

export const TopBar: React.FC<TopBarProps> = ({
  note,
  sidebarOpen,
  activeTextSelection,
  typingFont,
  activeTextColor,
  onToggleSidebar,
  onApplyFontToSelectionOrBlock,
  onApplyTextColor,
  onChangePaperStyle,
  onTogglePin,
  onAddPage,
  onOpenSnapshots,
  onOpenSearch,
  searchOpen = false,
  isSmartphone = false,
  onExportQaderno,
  onExportPdf,
  onExportMarkdown,
  onPrint,
  onOpenContextMenu,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenMenuId>(null);
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 16, top: 58 });
  const [planeFlight, setPlaneFlight] = useState<{
    id: number;
    pathD: string;
    xs: number[];
    ys: number[];
    rotates: number[];
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const planeTimerRef = useRef<number | null>(null);
  const titleTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });

  useEffect(() => {
    return () => {
      if (planeTimerRef.current !== null) {
        window.clearTimeout(planeTimerRef.current);
      }
    };
  }, []);

  const triggerPaperPlane = () => {
    if (planeFlight || !titleRef.current) return;
    const rect = titleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    const p0 = { x: rect.left + Math.min(rect.width * 0.45, 72), y: rect.top + rect.height * 0.5 };
    const p3 = { x: vw + 54, y: Math.max(20, p0.y + 18) };
    const dx = Math.max(240, p3.x - p0.x);
    const p1 = { x: p0.x + dx * 0.28, y: Math.max(8, p0.y - 34) };
    const p2 = { x: p0.x + dx * 0.72, y: p0.y + 44 };

    const steps = 16;
    const xs: number[] = [];
    const ys: number[] = [];
    const rotates: number[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x;
      const y =
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y;

      const dxdt =
        3 * mt * mt * (p1.x - p0.x) +
        6 * mt * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
      const dydt =
        3 * mt * mt * (p1.y - p0.y) +
        6 * mt * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);

      xs.push(x);
      ys.push(y);
      rotates.push((Math.atan2(dydt, dxdt) * 180) / Math.PI);
    }

    const pathD = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} C ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}, ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`;
    setPlaneFlight({ id: Date.now(), pathD, xs, ys, rotates });

    if (planeTimerRef.current !== null) {
      window.clearTimeout(planeTimerRef.current);
    }
    planeTimerRef.current = window.setTimeout(() => {
      setPlaneFlight(null);
      planeTimerRef.current = null;
    }, 1380);
  };

  useEffect(() => {
    const closeMenus = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target) || target.closest('[data-topbar-trigger]')) {
        return;
      }
      setOpenMenu(null);
      setCustomColorOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setCustomColorOpen(false);
      }
    };
    window.addEventListener('pointerdown', closeMenus);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('pointerdown', closeMenus);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const toggleAnchoredMenu = (id: Exclude<OpenMenuId, null>, btnEl: HTMLElement, widthEst = 244) => {
    if (openMenu === id) {
      setOpenMenu(null);
      setCustomColorOpen(false);
      return;
    }
    setCustomColorOpen(false);
    const r = btnEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const effectiveWidth = Math.min(widthEst, vw - 16);
    const preferRightAlign = r.left + r.width / 2 > vw / 2;
    const rawLeft = preferRightAlign ? r.right - effectiveWidth : r.left;
    const left = Math.max(8, Math.min(vw - effectiveWidth - 8, rawLeft));
    setMenuPos({ left, top: r.bottom + 8 });
    setOpenMenu(id);
  };

  useLayoutEffect(() => {
    if (!openMenu || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextLeft = menuPos.left;
    let nextTop = menuPos.top;
    if (rect.right > vw - 8) {
      nextLeft = Math.max(8, vw - rect.width - 8);
    }
    if (rect.left < 8) {
      nextLeft = 8;
    }
    if (rect.bottom > vh - 8) {
      nextTop = Math.max(52, vh - rect.height - 8);
    }
    if (Math.abs(nextLeft - menuPos.left) > 0.5 || Math.abs(nextTop - menuPos.top) > 0.5) {
      setMenuPos({ left: nextLeft, top: nextTop });
    }
  }, [openMenu, customColorOpen, menuPos.left, menuPos.top]);

  const hasRangeSelection = Boolean(
    activeTextSelection &&
      (activeTextSelection.end > activeTextSelection.start ||
        activeTextSelection.ranges?.some((r) => r.end > r.start))
  );
  const currentFont: NoteFontFamily = hasRangeSelection
    ? activeTextSelection?.fontFamily || typingFont || note?.fontFamily || 'sans'
    : typingFont || note?.fontFamily || 'sans';
  const currentFontDef = NOTE_FONTS.find((f) => f.id === currentFont) || NOTE_FONTS[0];

  return (
    <>
      <header
        onContextMenu={(e) => {
          if (onOpenContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onOpenContextMenu(e.clientX, e.clientY);
          }
        }}
        className="titlebar-drag sticky top-0 z-30 shrink-0 pt-safe pl-safe pr-safe bg-[#F2F2F7]/88 dark:bg-[#1C1C1E]/88 backdrop-blur-xl border-b border-[#3C3C43]/12 dark:border-white/10 no-ios-select no-print"
      >
        <div
          className={`w-full flex items-center justify-between flex-nowrap ${
            isSmartphone
              ? 'min-h-[64px] px-2.5 py-1.5 gap-1.5'
              : 'min-h-[56px] h-14 pl-2 sm:pl-4 titlebar-wco-pr gap-1.5 sm:gap-3'
          }`}
        >
        {/* Left: Sidebar toggle + Quaderno title & desktop pin */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`titlebar-no-drag ${
              isSmartphone ? 'w-[42px] h-[42px]' : 'w-8 h-8'
            } rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors shrink-0`}
            aria-label={sidebarOpen ? 'Nascondi barra laterale' : 'Mostra barra laterale'}
            title={sidebarOpen ? 'Nascondi barra laterale' : 'Mostra barra laterale'}
          >
            <Menu className={isSmartphone ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>

          {note && (
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span
                ref={titleRef}
                onClick={(e) => {
                  const now = performance.now();
                  if (now - titleTapRef.current.lastAt > 650) {
                    titleTapRef.current = { count: 1, lastAt: now };
                  } else {
                    titleTapRef.current = { count: titleTapRef.current.count + 1, lastAt: now };
                  }
                  if (e.detail === 3 || titleTapRef.current.count >= 3) {
                    e.preventDefault();
                    titleTapRef.current = { count: 0, lastAt: 0 };
                    triggerPaperPlane();
                  }
                }}
                className={`titlebar-no-drag ${
                  isSmartphone ? 'text-[17px]' : 'text-[13px] sm:text-sm'
                } font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] truncate max-w-full sm:max-w-[320px] whitespace-nowrap transition-[opacity,transform] duration-300 ${
                  planeFlight ? 'opacity-0 scale-[0.96]' : 'opacity-100 scale-100'
                }`}
              >
                {note.title || 'Senza titolo'}
              </span>
              {!isSmartphone && (
                <button
                  type="button"
                  onClick={onTogglePin}
                  className={`titlebar-no-drag hidden sm:flex w-7 h-7 rounded-full items-center justify-center transition-colors shrink-0 ${
                    note.pinned
                      ? 'bg-[#1C1C1E]/12 dark:bg-white/15 text-[#1C1C1E] dark:text-[#F5F5F7]'
                      : 'text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/12'
                  }`}
                  title={note.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}
                  aria-label={note.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Font Picker, Text Color, Paper Style (desktop), Search, Cronologia, Mobile More, Export */}
        <div
          className={`titlebar-no-drag flex items-center shrink-0 ${
            isSmartphone ? 'gap-1.5' : 'gap-1 sm:gap-1.5'
          }`}
        >
          {note?.documentType === 'hybrid' && (
            <button
              type="button"
              data-topbar-trigger="font"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => toggleAnchoredMenu('font', e.currentTarget, 244)}
              className={`titlebar-no-drag ${
                isSmartphone ? 'w-[42px] h-[42px]' : 'h-8 w-8 sm:w-auto sm:px-2.5'
              } rounded-full ios-control-bg flex items-center justify-center gap-1 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0`}
              title="Grafia / Font per riga o testo selezionato"
            >
              <Type className={isSmartphone ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
              {!isSmartphone && (
                <>
                  <span className="hidden md:inline max-w-[108px] truncate">{currentFontDef.label}</span>
                  <ChevronDown
                    className={`hidden sm:block w-3 h-3 opacity-60 transition-transform duration-200 ${
                      openMenu === 'font' ? 'rotate-180' : ''
                    }`}
                  />
                </>
              )}
            </button>
          )}

          {note && (
            <button
              type="button"
              data-topbar-trigger="textcolor"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => toggleAnchoredMenu('textcolor', e.currentTarget, 244)}
              className={`titlebar-no-drag ${
                isSmartphone ? 'w-[42px] h-[42px]' : 'h-8 px-2 sm:px-2.5'
              } rounded-full ios-control-bg flex items-center justify-center gap-1.5 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0`}
              title="Colore del testo"
              aria-label="Colore del testo"
            >
              <span className="flex flex-col items-center justify-center leading-none">
                <Baseline className={isSmartphone ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
                <span
                  className={`${isSmartphone ? 'w-4 h-[3px]' : 'w-3.5 h-[2.5px]'} rounded-full -mt-0.5`}
                  style={{
                    backgroundColor: activeTextColor || activeTextSelection?.color || '#1C1C1E',
                  }}
                />
              </span>
              {!isSmartphone && <span className="hidden lg:inline">Colore</span>}
            </button>
          )}

          {!isSmartphone && note?.documentType === 'hybrid' && (
            <button
              type="button"
              data-topbar-trigger="paper"
              onClick={(e) => toggleAnchoredMenu('paper', e.currentTarget, 176)}
              className="titlebar-no-drag hidden sm:flex h-8 px-2.5 rounded-full ios-control-bg items-center gap-1 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
              title="Tipo di foglio"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">
                {PAPER_OPTIONS.find((p) => p.id === note.paperStyle)?.label || 'Quadretti'}
              </span>
            </button>
          )}

          {note && onOpenSearch && (
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                setCustomColorOpen(false);
                onOpenSearch();
              }}
              className={`titlebar-no-drag ${
                isSmartphone ? 'w-[42px] h-[42px]' : 'h-8 w-8'
              } rounded-full flex items-center justify-center transition-colors shrink-0 ${
                searchOpen
                  ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                  : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
              }`}
              title="Cerca nel testo (Ctrl+F / Cmd+F)"
              aria-label="Cerca nel testo"
              aria-pressed={searchOpen}
            >
              <Search className={isSmartphone ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
            </button>
          )}

          {!isSmartphone && note && onOpenSnapshots && (
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                setCustomColorOpen(false);
                onOpenSnapshots();
              }}
              className="titlebar-no-drag h-8 w-8 sm:w-auto sm:px-2.5 rounded-full ios-control-bg flex items-center justify-center gap-1.5 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
              title="Cronologia — Qaderno Snapshot"
              aria-label="Cronologia"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Cronologia</span>
            </button>
          )}

          {/* Compact Mobile "More" Menu (Cronologia, Pin, Paper style, Add page) */}
          {note && (
            <button
              type="button"
              data-topbar-trigger="more"
              onClick={(e) => toggleAnchoredMenu('more', e.currentTarget, 244)}
              className={`titlebar-no-drag ${
                isSmartphone ? 'w-[42px] h-[42px] flex' : 'sm:hidden w-8 h-8 flex'
              } rounded-full ios-control-bg items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0`}
              title="Opzioni documento"
              aria-label="Opzioni documento"
            >
              <MoreHorizontal className={isSmartphone ? 'w-5 h-5' : 'w-4 h-4'} />
            </button>
          )}

          {note && (
            <button
              type="button"
              data-topbar-trigger="export"
              onClick={(e) => toggleAnchoredMenu('export', e.currentTarget, 244)}
              className={`titlebar-no-drag ${
                isSmartphone ? 'w-[42px] h-[42px]' : 'h-8 w-8 sm:w-auto sm:px-3'
              } rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] hover:opacity-90 flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity whitespace-nowrap shrink-0`}
              title="Esporta quaderno"
              aria-label="Esporta quaderno"
            >
              <Download className={isSmartphone ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
              {!isSmartphone && <span className="hidden sm:inline">Esporta</span>}
            </button>
          )}
        </div>
        </div>
      </header>

      {/* Unclipped Fixed Popovers anchored below header */}
      <AnimatePresence>
        {openMenu && (
          <motion.div
            key={openMenu}
            ref={popoverRef}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{ left: menuPos.left, top: menuPos.top, transformOrigin: 'top center' }}
            className="fixed z-50 bg-white/95 dark:bg-[#2C2C2E]/95 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 shadow-xl p-1.5 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-70px)] overflow-y-auto no-print"
          >
          {openMenu === 'font' && (
            <div className="w-60 space-y-0.5" onMouseDown={(e) => e.preventDefault()}>
              <div className="px-3 py-1 text-[11px] font-medium text-[#8E8E93]">
                {hasRangeSelection
                  ? 'Grafia per il testo selezionato'
                  : 'Grafia per il nuovo testo'}
              </div>
              {NOTE_FONTS.map((f) => {
                const active = currentFont === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onApplyFontToSelectionOrBlock(f.id);
                      setOpenMenu(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-black/6 dark:bg-white/12 text-[#1C1C1E] dark:text-[#F5F5F7]'
                        : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`font-medium leading-snug truncate font-note-${f.id}`}>{f.label}</div>
                      <div className="text-[11px] text-[#8E8E93] truncate">{f.description}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm opacity-70 font-note-${f.id}`}>{f.sample}</span>
                      {active && <Check className="w-3.5 h-3.5 text-[#1C1C1E] dark:text-[#F5F5F7]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {openMenu === 'textcolor' && note && (
            <div
              className="w-60 space-y-2.5 p-1.5"
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                  e.preventDefault();
                }
              }}
            >
              <div className="px-0.5 text-[11px] font-medium text-[#8E8E93]">
                {note.documentType === 'pdf'
                  ? 'Colore testo o casella PDF attiva'
                  : activeTextSelection &&
                      (activeTextSelection.end > activeTextSelection.start ||
                        activeTextSelection.ranges?.some((r) => r.end > r.start))
                    ? 'Colore per il testo selezionato'
                    : 'Colore per la riga attiva'}
              </div>

              <div className="flex flex-wrap items-center gap-2 px-0.5">
                {TEXT_COLORS.map((c) => {
                  const currentCol = activeTextColor || activeTextSelection?.color;
                  const active = currentCol?.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onApplyTextColor(c.hex);
                        setCustomColorOpen(false);
                        setOpenMenu(null);
                      }}
                      title={c.label}
                      aria-label={`Colore testo ${c.label}`}
                      className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                        active
                          ? 'ring-2 ring-offset-2 ring-[#1C1C1E] dark:ring-[#F5F5F7] scale-110'
                          : 'border border-black/15 dark:border-white/25'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 pt-1.5 border-t border-[#3C3C43]/10 dark:border-white/10">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onApplyTextColor(undefined);
                    setCustomColorOpen(false);
                    setOpenMenu(null);
                  }}
                  className="flex-1 h-8 px-2.5 rounded-xl ios-control-bg text-[11px] font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Predefinito</span>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCustomColorOpen((v) => !v)}
                  aria-expanded={customColorOpen}
                  title="Scegli un colore personalizzato"
                  className={`h-8 px-2.5 rounded-xl text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                    customColorOpen
                      ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                      : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/25 shrink-0"
                    style={{
                      backgroundColor: activeTextColor || activeTextSelection?.color || '#2B4162',
                    }}
                  />
                  <span>Altro</span>
                </button>
              </div>

              {customColorOpen && (
                <div className="pt-1.5 border-t border-[#3C3C43]/10 dark:border-white/10">
                  <CustomColorPicker
                    value={activeTextColor || activeTextSelection?.color || '#1C1C1E'}
                    onChange={(hex) => onApplyTextColor(hex)}
                    onApply={(hex) => {
                      onApplyTextColor(hex);
                      setCustomColorOpen(false);
                      setOpenMenu(null);
                    }}
                    onReset={() => {
                      onApplyTextColor(undefined);
                      setCustomColorOpen(false);
                      setOpenMenu(null);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {openMenu === 'paper' && note && (
            <div className="w-40 space-y-0.5">
              {PAPER_OPTIONS.map((opt) => {
                const active = note.paperStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChangePaperStyle(opt.id);
                      setOpenMenu(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-black/6 dark:bg-white/12 text-[#1C1C1E] dark:text-[#F5F5F7] font-semibold'
                        : 'text-[#1C1C1E] dark:text-[#F5F5F7] font-medium hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {openMenu === 'export' && (
            <div className="w-56 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportQaderno();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2 transition-colors"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>Esporta file .qaderno</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportPdf();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Esporta PDF vettoriale</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onExportMarkdown();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Esporta Markdown (.md)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onPrint();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Stampa pulita</span>
              </button>
            </div>
          )}

          {openMenu === 'more' && note && (
            <div className="w-56 space-y-2 p-0.5">
              {onOpenSnapshots && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSnapshots();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Cronologia (Snapshot)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onTogglePin();
                  setOpenMenu(null);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
              >
                <Pin className="w-3.5 h-3.5" />
                <span>{note.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}</span>
              </button>

              {note.documentType === 'hybrid' && (
                <>
                  <div className="px-2 pt-1">
                    <div className="text-[11px] font-medium text-[#8E8E93] mb-1.5">Tipo di foglio</div>
                    <div className="grid grid-cols-2 gap-1">
                      {PAPER_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onChangePaperStyle(opt.id);
                            setOpenMenu(null);
                          }}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium ${
                            note.paperStyle === opt.id
                              ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                              : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {onAddPage && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddPage();
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15 flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuova pagina</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Monochrome Paper Airplane Easter Egg Flight Overlay */}
      <AnimatePresence>
        {planeFlight && (
          <motion.div
            key={planeFlight.id}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden="true"
            className="fixed inset-0 z-[75] pointer-events-none overflow-hidden no-print"
          >
            <svg className="w-full h-full">
              <motion.path
                d={planeFlight.pathD}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeDasharray="4 4"
                strokeLinecap="round"
                className="text-[#8E8E93]/65 dark:text-[#AEAEB2]/55"
                initial={{ pathLength: 0, opacity: 0.8 }}
                animate={{ pathLength: 1, opacity: [0.2, 0.75, 0.55, 0] }}
                transition={{ duration: 1.25, ease: [0.22, 0.61, 0.36, 1] }}
              />
            </svg>

            <motion.div
              className="fixed top-0 left-0 text-[#1C1C1E] dark:text-[#F5F5F7]"
              style={{ marginLeft: -12, marginTop: -12 }}
              initial={{
                x: planeFlight.xs[0],
                y: planeFlight.ys[0],
                rotate: planeFlight.rotates[0],
                scale: 0.72,
                opacity: 0,
              }}
              animate={{
                x: planeFlight.xs,
                y: planeFlight.ys,
                rotate: planeFlight.rotates,
                scale: [0.72, 1.05, 1, 0.94],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.22,
                ease: [0.22, 0.61, 0.36, 1],
                opacity: { duration: 1.22, times: [0, 0.08, 0.84, 1] },
                scale: { duration: 1.22, times: [0, 0.14, 0.75, 1] },
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21.5 12L3.2 4.6L6.8 12L3.2 19.4L21.5 12Z"
                  fill="currentColor"
                  fillOpacity="0.12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.8 12H21.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
