import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Baseline,
  ChevronDown,
  Download,
  FileArchive,
  FileText,
  Grid3x3,
  Menu,
  MoreHorizontal,
  Pin,
  Plus,
  Printer,
  RotateCcw,
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

interface TopBarProps {
  note: NoteDocument | null;
  sidebarOpen: boolean;
  activeTextSelection: ActiveTextSelection | null;
  activeTextColor?: string;
  onToggleSidebar: () => void;
  onApplyFontToSelectionOrBlock: (font: NoteFontFamily) => void;
  onApplyTextColor: (color: string | undefined) => void;
  onChangePaperStyle: (style: PaperStyle) => void;
  onTogglePin: () => void;
  onAddPage?: () => void;
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
  activeTextColor,
  onToggleSidebar,
  onApplyFontToSelectionOrBlock,
  onApplyTextColor,
  onChangePaperStyle,
  onTogglePin,
  onAddPage,
  onExportQaderno,
  onExportPdf,
  onExportMarkdown,
  onPrint,
  onOpenContextMenu,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenMenuId>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 16, top: 58 });

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenus = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target) || target.closest('[data-topbar-trigger]')) {
        return;
      }
      setOpenMenu(null);
    };
    window.addEventListener('pointerdown', closeMenus);
    return () => window.removeEventListener('pointerdown', closeMenus);
  }, []);

  const toggleAnchoredMenu = (id: Exclude<OpenMenuId, null>, btnEl: HTMLElement, widthEst = 244) => {
    if (openMenu === id) {
      setOpenMenu(null);
      return;
    }
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
  }, [openMenu, menuPos.left, menuPos.top]);

  const currentFont: NoteFontFamily = activeTextSelection?.fontFamily || note?.fontFamily || 'sans';
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
        className="sticky top-0 z-30 shrink-0 pt-safe pl-safe pr-safe bg-[#F2F2F7]/88 dark:bg-[#1C1C1E]/88 backdrop-blur-xl border-b border-[#3C3C43]/12 dark:border-white/10 no-ios-select no-print"
      >
        <div className="h-[46px] sm:h-[52px] px-2 sm:px-4 w-full flex items-center justify-between flex-nowrap gap-1.5 sm:gap-3">
        {/* Left: Sidebar toggle + Quaderno title & desktop pin */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-8 h-8 rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors shrink-0"
            aria-label={sidebarOpen ? 'Nascondi barra laterale' : 'Mostra barra laterale'}
            title={sidebarOpen ? 'Nascondi barra laterale' : 'Mostra barra laterale'}
          >
            <Menu className="w-4 h-4" />
          </button>

          {note && (
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-[13px] sm:text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] truncate max-w-full sm:max-w-[320px] whitespace-nowrap">
                {note.title || 'Senza titolo'}
              </span>
              <button
                type="button"
                onClick={onTogglePin}
                className={`hidden sm:flex w-7 h-7 rounded-full items-center justify-center transition-colors shrink-0 ${
                  note.pinned
                    ? 'bg-[#1C1C1E]/12 dark:bg-white/15 text-[#1C1C1E] dark:text-[#F5F5F7]'
                    : 'text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/12'
                }`}
                title={note.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}
                aria-label={note.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Font Picker, Text Color, Paper Style (desktop), Mobile More, Export */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {note?.documentType === 'hybrid' && (
            <button
              type="button"
              data-topbar-trigger="font"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => toggleAnchoredMenu('font', e.currentTarget, 244)}
              className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-full ios-control-bg flex items-center justify-center gap-1 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
              title="Grafia / Font per riga o testo selezionato"
            >
              <Type className="w-3.5 h-3.5" />
              <span className="hidden md:inline max-w-[108px] truncate">{currentFontDef.label}</span>
              <ChevronDown
                className={`hidden sm:block w-3 h-3 opacity-60 transition-transform duration-200 ${
                  openMenu === 'font' ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}

          {note && (
            <button
              type="button"
              data-topbar-trigger="textcolor"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => toggleAnchoredMenu('textcolor', e.currentTarget, 244)}
              className="h-8 px-2 sm:px-2.5 rounded-full ios-control-bg flex items-center justify-center gap-1.5 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
              title="Colore del testo"
              aria-label="Colore del testo"
            >
              <span className="flex flex-col items-center justify-center leading-none">
                <Baseline className="w-3.5 h-3.5" />
                <span
                  className="w-3.5 h-[2.5px] rounded-full -mt-0.5"
                  style={{
                    backgroundColor: activeTextColor || activeTextSelection?.color || '#1C1C1E',
                  }}
                />
              </span>
              <span className="hidden lg:inline">Colore</span>
            </button>
          )}

          {note?.documentType === 'hybrid' && (
            <button
              type="button"
              data-topbar-trigger="paper"
              onClick={(e) => toggleAnchoredMenu('paper', e.currentTarget, 160)}
              className="hidden sm:flex h-8 px-2.5 rounded-full ios-control-bg items-center gap-1 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors whitespace-nowrap shrink-0"
              title="Tipo di foglio"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">
                {PAPER_OPTIONS.find((p) => p.id === note.paperStyle)?.label || 'Quadretti'}
              </span>
            </button>
          )}

          {/* Compact Mobile "More" Menu (Pin, Paper style, Add page) */}
          {note && (
            <button
              type="button"
              data-topbar-trigger="more"
              onClick={(e) => toggleAnchoredMenu('more', e.currentTarget, 244)}
              className="sm:hidden w-8 h-8 rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0"
              title="Opzioni documento"
              aria-label="Opzioni documento"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}

          {note && (
            <button
              type="button"
              data-topbar-trigger="export"
              onClick={(e) => toggleAnchoredMenu('export', e.currentTarget, 244)}
              className="h-8 w-8 sm:w-auto sm:px-3 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] hover:opacity-90 flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity whitespace-nowrap shrink-0"
              title="Esporta quaderno"
              aria-label="Esporta quaderno"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Esporta</span>
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
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 460, damping: 32, mass: 0.75 }}
            style={{ left: menuPos.left, top: menuPos.top, transformOrigin: 'top center' }}
            className="fixed z-50 ios-glass rounded-2xl p-2 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-70px)] overflow-y-auto no-print"
          >
          {openMenu === 'font' && (
            <div className="w-56 space-y-0.5" onMouseDown={(e) => e.preventDefault()}>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[#8E8E93]">
                {activeTextSelection &&
                (activeTextSelection.end > activeTextSelection.start ||
                  activeTextSelection.ranges?.some((r) => r.end > r.start))
                  ? 'Grafia per il testo selezionato'
                  : 'Grafia per la riga attiva'}
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
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors flex items-center justify-between font-note-${f.id} ${
                      active
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                        : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{f.label}</div>
                      <div className={`text-[10px] ${active ? 'opacity-75' : 'text-[#8E8E93]'}`}>
                        {f.description}
                      </div>
                    </div>
                    <span className="text-sm opacity-80">{f.sample}</span>
                  </button>
                );
              })}
            </div>
          )}

          {openMenu === 'textcolor' && note && (
            <div className="w-56 space-y-2.5 p-1" onMouseDown={(e) => e.preventDefault()}>
              <div className="px-1 text-[11px] font-medium text-[#8E8E93]">
                {note.documentType === 'pdf'
                  ? 'Colore testo o casella PDF attiva'
                  : activeTextSelection &&
                      (activeTextSelection.end > activeTextSelection.start ||
                        activeTextSelection.ranges?.some((r) => r.end > r.start))
                    ? 'Colore per il testo selezionato'
                    : 'Colore per la riga attiva'}
              </div>

              <div className="flex flex-wrap items-center gap-2 px-1">
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

              <div className="flex items-center gap-1.5 pt-1 border-t border-[#3C3C43]/10 dark:border-white/10">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onApplyTextColor(undefined);
                    setOpenMenu(null);
                  }}
                  className="flex-1 h-8 px-2.5 rounded-xl ios-control-bg text-[11px] font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Predefinito</span>
                </button>

                <label
                  title="Scegli un colore personalizzato"
                  className="h-8 px-2.5 rounded-xl ios-control-bg text-[11px] font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/25"
                    style={{
                      backgroundColor: activeTextColor || activeTextSelection?.color || '#2B4162',
                    }}
                  />
                  <span>Altro</span>
                  <input
                    type="color"
                    value={activeTextColor || activeTextSelection?.color || '#1C1C1E'}
                    onChange={(e) => onApplyTextColor(e.target.value)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          )}

          {openMenu === 'paper' && note && (
            <div className="w-36 space-y-0.5">
              {PAPER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChangePaperStyle(opt.id);
                    setOpenMenu(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    note.paperStyle === opt.id
                      ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                      : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
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
    </>
  );
};
