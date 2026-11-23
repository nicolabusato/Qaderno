import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, FileText, History, Layers, PenTool, RotateCcw, X } from 'lucide-react';
import { HybridPage, NoteDocument, NoteSnapshot, Stroke, TextBlock } from '../types/qaderno';
import { renderStroke } from '../utils/inkRenderer';

interface SnapshotModalProps {
  open: boolean;
  note: NoteDocument | null;
  snapshots: NoteSnapshot[];
  onRestore: (snapshotIndex: number) => void;
  onClose: () => void;
}

interface SnapshotSummary {
  pagesCount: number;
  strokeCount: number;
  wordCount: number;
  annotationCount: number;
  previewBlocks: TextBlock[];
  previewStrokes: Stroke[];
  previewCanvasWidth: number;
  previewCanvasHeight: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function summarizeHybridPages(pages: HybridPage[]): SnapshotSummary {
  let strokeCount = 0;
  let wordCount = 0;
  for (const p of pages) {
    strokeCount += p.strokes.length;
    for (const b of p.blocks) {
      wordCount += countWords(b.content);
    }
  }
  const first = pages[0];
  return {
    pagesCount: Math.max(1, pages.length),
    strokeCount,
    wordCount,
    annotationCount: 0,
    previewBlocks: first ? first.blocks : [],
    previewStrokes: first ? first.strokes : [],
    previewCanvasWidth: 820,
    previewCanvasHeight: 1060,
  };
}

function summarizeSnapshot(snap: NoteSnapshot, documentType: 'hybrid' | 'pdf'): SnapshotSummary {
  if (documentType === 'pdf') {
    const pdfPages = snap.pdfPages || [];
    let strokeCount = 0;
    let annotationCount = 0;
    let wordCount = 0;
    for (const p of pdfPages) {
      strokeCount += p.strokes.length;
      annotationCount +=
        p.textBoxes.length +
        (p.textEdits?.length || 0) +
        (p.formFields?.filter((f) => f.isEdited).length || 0);
      for (const tb of p.textBoxes) {
        wordCount += countWords(tb.content);
      }
    }
    const first = pdfPages[0];
    return {
      pagesCount: Math.max(1, pdfPages.length),
      strokeCount,
      wordCount,
      annotationCount,
      previewBlocks: [],
      previewStrokes: first ? first.strokes : [],
      previewCanvasWidth: first?.width || 820,
      previewCanvasHeight: first?.height || 1060,
    };
  }

  const pages: HybridPage[] =
    snap.pages && snap.pages.length > 0
      ? snap.pages
      : [{ id: 'p0', blocks: snap.blocks || [], strokes: snap.strokes || [] }];
  return summarizeHybridPages(pages);
}

function formatClockTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

function formatRelativeAge(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 15) return 'Pochi istanti fa';
  if (diffSec < 60) return `${diffSec} sec fa`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return '1 min fa';
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return '1 ora fa';
  return `${diffHours} ore fa`;
}

const StrokePreviewCanvas: React.FC<{
  strokes: Stroke[];
  logicalWidth: number;
  logicalHeight: number;
}> = ({ strokes, logicalWidth, logicalHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = canvas.clientWidth || 300;
    const displayH = canvas.clientHeight || 170;
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW, displayH);

    if (strokes.length === 0) return;

    const isDark = document.documentElement.classList.contains('dark');
    const scale = Math.min(displayW / Math.max(logicalWidth, 1), displayH / Math.max(logicalHeight, 1));
    const offsetX = (displayW - logicalWidth * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, 6);
    ctx.scale(scale, scale);

    for (const s of strokes) {
      const displayColor =
        isDark && s.tool === 'pen' && s.color.toLowerCase() === '#1c1c1e' ? '#ECECEF' : s.color;
      renderStroke(ctx, { ...s, color: displayColor }, { yOffset: 0, selected: false });
    }
    ctx.restore();
  }, [strokes, logicalWidth, logicalHeight]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="w-full h-full pointer-events-none"
    />
  );
};

export const SnapshotModal: React.FC<SnapshotModalProps> = ({
  open,
  note,
  snapshots,
  onRestore,
  onClose,
}) => {
  // Selected index inside `snapshots` array (newest = snapshots.length - 1), or null when empty
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNowTick(Date.now());
    setSelectedIdx(snapshots.length > 0 ? snapshots.length - 1 : null);
  }, [open, snapshots.length]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const docType = note?.documentType || 'hybrid';

  const reversedEntries = useMemo(() => {
    return snapshots
      .map((snap, originalIndex) => ({
        snap,
        originalIndex,
        versionNumber: originalIndex + 1,
        summary: summarizeSnapshot(snap, docType),
      }))
      .reverse();
  }, [snapshots, docType]);

  const currentSummary = useMemo(() => {
    if (!note) return null;
    const currentSnap: NoteSnapshot = {
      id: 'current',
      timestamp: note.updatedAt,
      title: note.title,
      blocks: note.blocks,
      strokes: note.strokes,
      pages: note.pages,
      pdfPages: note.pdfPages,
    };
    return summarizeSnapshot(currentSnap, docType);
  }, [note, docType]);

  if (!open || !note) return null;

  const activeEntry =
    selectedIdx !== null
      ? reversedEntries.find((entry) => entry.originalIndex === selectedIdx) || reversedEntries[0] || null
      : reversedEntries[0] || null;

  const nonEmptyBlocks = activeEntry
    ? activeEntry.summary.previewBlocks.filter((b) => b.content.trim().length > 0).slice(0, 8)
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-3 sm:p-4 no-print"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{ contain: 'layout paint', transform: 'translateZ(0)' }}
        className="w-full max-w-2xl max-h-[86dvh] rounded-3xl bg-[#F2F2F7]/98 dark:bg-[#1C1C1E]/98 border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden flex flex-col no-ios-select"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qaderno-snapshot-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#2C2C2E] border border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="qaderno-snapshot-title"
                className="text-base font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] leading-tight"
              >
                Qaderno Snapshot
              </h2>
              <p className="text-xs text-[#8E8E93] truncate mt-0.5">
                {note.title || 'Senza titolo'} ·{' '}
                {snapshots.length === 0
                  ? 'Nessuna versione precedente'
                  : snapshots.length === 1
                    ? '1 versione salvata nella sessione'
                    : `${snapshots.length} versioni salvate nella sessione`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:opacity-80 shrink-0"
            aria-label="Chiudi Qaderno Snapshot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {snapshots.length === 0 ? (
          <div className="p-6 sm:p-10 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#2C2C2E] border border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-center text-[#8E8E93]">
              <History className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                Nessuno snapshot ancora disponibile
              </p>
              <p className="text-xs leading-relaxed text-[#8E8E93]">
                Ogni modifica al quaderno registra automaticamente una versione precedente durante questa sessione, così potrai tornare indietro in qualsiasi momento.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-[#3C3C43]/10 dark:divide-white/10 overflow-hidden">
            {/* Left Column: Snapshot Timeline */}
            <div className="sm:w-[248px] shrink-0 overflow-y-auto p-3 space-y-1.5 max-h-[30dvh] sm:max-h-none">
              <div className="px-2 pb-1 text-[11px] font-medium text-[#8E8E93]">
                Cronologia sessione
              </div>

              {/* Current state indicator */}
              {currentSummary && (
                <div className="px-3 py-2 rounded-xl bg-white/60 dark:bg-[#2C2C2E]/60 border border-[#3C3C43]/10 dark:border-white/8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                      Versione attuale
                    </span>
                    <span className="text-[10px] font-medium text-[#8E8E93] tabular-nums">
                      Ora
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8E8E93] mt-0.5 tabular-nums">
                    {currentSummary.pagesCount} {currentSummary.pagesCount === 1 ? 'pag.' : 'pagg.'} ·{' '}
                    {currentSummary.strokeCount} {currentSummary.strokeCount === 1 ? 'tratto' : 'tratti'}
                    {docType === 'hybrid'
                      ? ` · ${currentSummary.wordCount} ${currentSummary.wordCount === 1 ? 'parola' : 'parole'}`
                      : ''}
                  </p>
                </div>
              )}

              {/* Snapshot entries (newest first) */}
              {reversedEntries.map((entry) => {
                const isSelected = activeEntry?.originalIndex === entry.originalIndex;
                return (
                  <button
                    key={entry.snap.id}
                    type="button"
                    onClick={() => setSelectedIdx(entry.originalIndex)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors border ${
                      isSelected
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] border-[#1C1C1E] dark:bg-[#F5F5F7] dark:text-[#1C1C1E] dark:border-[#F5F5F7]'
                        : 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-[#F5F5F7] border-[#3C3C43]/10 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-[#323234]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">
                        Snapshot #{entry.versionNumber}
                      </span>
                      <span
                        className={`text-[10px] font-medium tabular-nums shrink-0 ${
                          isSelected ? 'opacity-75' : 'text-[#8E8E93]'
                        }`}
                      >
                        {formatClockTime(entry.snap.timestamp)}
                      </span>
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 flex items-center justify-between gap-2 tabular-nums ${
                        isSelected ? 'opacity-80' : 'text-[#8E8E93]'
                      }`}
                    >
                      <span className="truncate">{formatRelativeAge(entry.snap.timestamp, nowTick)}</span>
                      <span className="shrink-0">
                        {entry.summary.strokeCount}t
                        {docType === 'hybrid' ? ` · ${entry.summary.wordCount}p` : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Column: Lightweight Visual Preview */}
            {activeEntry && (
              <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] truncate">
                      {activeEntry.snap.title || 'Senza titolo'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8E8E93] mt-0.5 tabular-nums">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>
                        Snapshot #{activeEntry.versionNumber} · {formatClockTime(activeEntry.snap.timestamp)} (
                        {formatRelativeAge(activeEntry.snap.timestamp, nowTick)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compact Metrics Strip */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white dark:bg-[#2C2C2E] rounded-xl border border-[#3C3C43]/10 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#8E8E93]">
                      <Layers className="w-3 h-3" />
                      <span>Pagine</span>
                    </div>
                    <div className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] tabular-nums mt-0.5">
                      {activeEntry.summary.pagesCount}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-[#2C2C2E] rounded-xl border border-[#3C3C43]/10 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#8E8E93]">
                      <PenTool className="w-3 h-3" />
                      <span>Tratti</span>
                    </div>
                    <div className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] tabular-nums mt-0.5">
                      {activeEntry.summary.strokeCount}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-[#2C2C2E] rounded-xl border border-[#3C3C43]/10 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#8E8E93]">
                      <FileText className="w-3 h-3" />
                      <span>{docType === 'pdf' ? 'Note PDF' : 'Parole'}</span>
                    </div>
                    <div className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] tabular-nums mt-0.5">
                      {docType === 'pdf' ? activeEntry.summary.annotationCount : activeEntry.summary.wordCount}
                    </div>
                  </div>
                </div>

                {/* Miniature Sheet Preview */}
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[#3C3C43]/8 dark:border-white/8 flex items-center justify-between text-[11px] text-[#8E8E93]">
                    <span>Anteprima Pagina 1</span>
                    {activeEntry.summary.pagesCount > 1 && (
                      <span className="tabular-nums">+{activeEntry.summary.pagesCount - 1} altre</span>
                    )}
                  </div>

                  <div className="relative min-h-[175px] max-h-[240px] overflow-hidden p-4 bg-[#FBFBFD] dark:bg-[#161618]">
                    {/* Text preview for hybrid sheets */}
                    {docType === 'hybrid' && (
                      <div className="relative z-10 space-y-1.5 pointer-events-none">
                        <div className="text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] truncate pb-1 border-b border-[#3C3C43]/8 dark:border-white/8">
                          {activeEntry.snap.title || 'Senza titolo'}
                        </div>
                        {nonEmptyBlocks.length > 0 ? (
                          nonEmptyBlocks.map((b) => (
                            <p
                              key={b.id}
                              className={`truncate ${
                                b.type === 'h1'
                                  ? 'text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]'
                                  : b.type === 'h2'
                                    ? 'text-[11px] font-semibold text-[#3A3A3C] dark:text-[#D1D1D6]'
                                    : b.type === 'code'
                                      ? 'font-mono text-[10px] text-[#48484A] dark:text-[#AEAEB2]'
                                      : 'text-[11px] text-[#48484A] dark:text-[#C7C7CC]'
                              }`}
                            >
                              {b.type === 'bullet'
                                ? `• ${b.content}`
                                : b.type === 'todo'
                                  ? `${b.checked ? '☑' : '☐'} ${b.content}`
                                  : b.content}
                            </p>
                          ))
                        ) : activeEntry.summary.previewStrokes.length === 0 ? (
                          <p className="text-[11px] italic text-[#8E8E93] pt-2">
                            Foglio vuoto in questa versione
                          </p>
                        ) : null}
                      </div>
                    )}

                    {/* PDF summary inside preview */}
                    {docType === 'pdf' && activeEntry.summary.previewStrokes.length === 0 && (
                      <div className="relative z-10 flex flex-col items-center justify-center h-[140px] text-center space-y-1">
                        <FileText className="w-5 h-5 text-[#8E8E93]" />
                        <p className="text-xs font-medium text-[#48484A] dark:text-[#C7C7CC]">
                          Documento PDF · {activeEntry.summary.pagesCount}{' '}
                          {activeEntry.summary.pagesCount === 1 ? 'pagina' : 'pagine'}
                        </p>
                        <p className="text-[11px] text-[#8E8E93]">
                          {activeEntry.summary.annotationCount} annotazioni di testo/moduli
                        </p>
                      </div>
                    )}

                    {/* Scaled ink strokes layer */}
                    {activeEntry.summary.previewStrokes.length > 0 && (
                      <div className="absolute inset-0 z-20 opacity-90">
                        <StrokePreviewCanvas
                          strokes={activeEntry.summary.previewStrokes}
                          logicalWidth={activeEntry.summary.previewCanvasWidth}
                          logicalHeight={activeEntry.summary.previewCanvasHeight}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#3C3C43]/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <span className="text-[11px] text-[#8E8E93]">
            {snapshots.length > 0
              ? 'La versione attuale verrà conservata nello storico.'
              : 'Lo storico viene mantenuto per tutta la sessione.'}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7]"
            >
              Chiudi
            </button>
            {activeEntry && (
              <button
                type="button"
                onClick={() => onRestore(activeEntry.originalIndex)}
                className="h-9 px-4 rounded-xl bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ripristina versione</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
