import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  FileText,
  FolderSync,
  Hand,
  Highlighter,
  PenTool,
  Shapes,
  ShieldCheck,
  Type,
} from 'lucide-react';
import { QadernoLogo } from './QadernoLogo';

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const TOTAL_STEPS = 5;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction >= 0 ? 18 : -18,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction >= 0 ? -18 : 18,
    opacity: 0,
  }),
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onComplete }) => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (open) {
      setStep(0);
      setDirection(1);
    }
  }, [open]);

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      onComplete();
      return;
    }
    setDirection(1);
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, [step, onComplete]);

  const goPrev = useCallback(() => {
    if (step <= 0) return;
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  }, [step]);

  const goTo = useCallback(
    (target: number) => {
      if (target === step) return;
      setDirection(target > step ? 1 : -1);
      setStep(target);
    },
    [step]
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onComplete();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, goNext, goPrev, onComplete]);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 dark:bg-black/60 p-3 sm:p-5 no-print"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-step-title"
        className="w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden rounded-3xl bg-[#F2F2F7]/98 dark:bg-[#1C1C1E]/98 border border-black/10 dark:border-white/12 shadow-2xl no-ios-select"
      >
        {/* Top bar: quiet step counter + always-available Skip button */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-2 shrink-0">
          <span className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] tabular-nums">
            {isFirst ? 'Benvenuto' : `Guida · ${step + 1} di ${TOTAL_STEPS}`}
          </span>
          <button
            type="button"
            onClick={onComplete}
            className="min-h-[40px] px-3 -mr-2 rounded-xl text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1C1E]/30 dark:focus-visible:ring-white/30"
          >
            Salta
          </button>
        </div>

        {/* Scrollable step content */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-3">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              {step === 0 && (
                <>
                  <div className="flex flex-col items-center text-center pt-2 space-y-3">
                    <QadernoLogo size={68} zoomedTail />
                    <div className="space-y-1.5 max-w-sm">
                      <h2
                        id="onboarding-step-title"
                        className="text-2xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] [text-wrap:balance]"
                      >
                        Benvenuto in Qaderno
                      </h2>
                      <p className="text-[14px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                        Il tuo quaderno digitale a quadretti che unisce scrittura con tastiera, disegno
                        con stilo e annotazione diretta dei PDF.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
                    <div className="flex items-start gap-3.5 px-4 py-3.5">
                      <Type className="w-4 h-4 text-[#1C1C1E] dark:text-[#F5F5F7] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                          Testo e inchiostro sullo stesso foglio
                        </p>
                        <p className="text-[13px] leading-relaxed text-[#6E6E73] dark:text-[#A1A1A6]">
                          Scrivi, disegna e organizza gli appunti senza separare documenti e schizzi.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3.5 px-4 py-3.5">
                      <FileText className="w-4 h-4 text-[#1C1C1E] dark:text-[#F5F5F7] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                          PDF modificabili e moduli compilabili
                        </p>
                        <p className="text-[13px] leading-relaxed text-[#6E6E73] dark:text-[#A1A1A6]">
                          Modifica testi, compila tabelle AcroForm ed esporta in alta nitidezza.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3.5 px-4 py-3.5">
                      <ShieldCheck className="w-4 h-4 text-[#1C1C1E] dark:text-[#F5F5F7] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                          100% locale, offline e gratuito
                        </p>
                        <p className="text-[13px] leading-relaxed text-[#6E6E73] dark:text-[#A1A1A6]">
                          Parte del Progetto BZero: nessun account, nessun server esterno, i tuoi dati
                          restano sul dispositivo.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  {/* Minimal paper-grid writing preview */}
                  <div
                    aria-hidden="true"
                    className="relative overflow-hidden rounded-2xl bg-[#FBFBFD] dark:bg-[#242428] border border-[#3C3C43]/12 dark:border-white/10 p-5"
                  >
                    <svg
                      className="absolute inset-0 w-full h-full opacity-55 dark:opacity-15 pointer-events-none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <pattern id="onb-grid-1" width="22" height="22" patternUnits="userSpaceOnUse">
                          <path
                            d="M 22 0 L 0 0 0 22"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="0.7"
                            className="text-[#D1D1D6] dark:text-white/30"
                          />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#onb-grid-1)" />
                    </svg>
                    <div className="relative space-y-2.5 text-left">
                      <div className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Appunti di Fisica · Capitolo 3
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#48484A] dark:text-[#C7C7CC]">
                        <span className="w-3.5 h-3.5 rounded-[4px] bg-[#1C1C1E] dark:bg-[#F5F5F7] text-white dark:text-[#1C1C1E] inline-flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                        <span className="line-through opacity-65">Ripassare le formule del moto</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#48484A] dark:text-[#C7C7CC]">
                        <span className="w-3.5 h-3.5 rounded-[4px] border border-[#8E8E93] inline-block shrink-0" />
                        <span>
                          Digita <span className="font-mono text-[11px] font-semibold">#</span>,{' '}
                          <span className="font-mono text-[11px] font-semibold">- []</span> o{' '}
                          <span className="font-mono text-[11px] font-semibold">**grassetto**</span>
                        </span>
                      </div>
                      <div className="pt-1 flex items-center gap-3 text-[11px] text-[#6E6E73] dark:text-[#A1A1A6]">
                        <span>Titoli</span>
                        <span aria-hidden="true">·</span>
                        <span>Checklist</span>
                        <span aria-hidden="true">·</span>
                        <span>Font e colori per selezione</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2
                      id="onboarding-step-title"
                      className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] [text-wrap:balance]"
                    >
                      Scrittura ibrida e formattazione rapida
                    </h2>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Scrivi direttamente sul foglio e usa scorciatoie Markdown mentre digiti:{' '}
                      <span className="font-mono text-xs text-[#1C1C1E] dark:text-[#F5F5F7]"># </span>
                      per i titoli,{' '}
                      <span className="font-mono text-xs text-[#1C1C1E] dark:text-[#F5F5F7]">- </span>
                      per gli elenchi,{' '}
                      <span className="font-mono text-xs text-[#1C1C1E] dark:text-[#F5F5F7]">- [] </span>
                      per le checklist e{' '}
                      <span className="font-mono text-xs text-[#1C1C1E] dark:text-[#F5F5F7]">```</span>{' '}
                      per il codice.
                    </p>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Seleziona qualsiasi parola per cambiare font o colore dalla barra superiore: ogni
                      tratto disegnato resta ancorato al paragrafo più vicino anche quando aggiungi
                      righe sopra.
                    </p>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  {/* Minimal geometric ink + dock preview */}
                  <div
                    aria-hidden="true"
                    className="rounded-2xl bg-[#FBFBFD] dark:bg-[#242428] border border-[#3C3C43]/12 dark:border-white/10 p-5 space-y-4"
                  >
                    <svg viewBox="0 0 320 72" className="w-full h-[64px]" fill="none">
                      <circle
                        cx="68"
                        cy="36"
                        r="22"
                        className="stroke-[#2B4162] dark:stroke-[#9DB7DF]"
                        strokeWidth="2.4"
                      />
                      <line
                        x1="108"
                        y1="36"
                        x2="196"
                        y2="36"
                        className="stroke-[#9A463D] dark:stroke-[#E39B93]"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 186 28 L 198 36 L 186 44"
                        className="stroke-[#9A463D] dark:stroke-[#E39B93]"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <rect
                        x="216"
                        y="16"
                        width="68"
                        height="40"
                        rx="4"
                        className="stroke-[#3D5A45] dark:stroke-[#9CC4A6]"
                        strokeWidth="2.4"
                      />
                    </svg>

                    <div className="flex items-center justify-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#3C3C43]/12 dark:border-white/10 text-[#48484A] dark:text-[#C7C7CC]">
                        <Hand className="w-3.5 h-3.5" />
                        <Type className="w-3.5 h-3.5" />
                        <span className="w-6 h-6 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-white dark:text-[#1C1C1E] inline-flex items-center justify-center">
                          <PenTool className="w-3.5 h-3.5" />
                        </span>
                        <Highlighter className="w-3.5 h-3.5" />
                        <Shapes className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2
                      id="onboarding-step-title"
                      className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] [text-wrap:balance]"
                    >
                      Inchiostro, forme intelligenti e stilo
                    </h2>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Sposta la barra flottante su qualsiasi lato o comprimila quando non ti serve. Con{' '}
                      <strong className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Hold-to-Snap
                      </strong>
                      , tieni fermo il tratto un istante per trasformare schizzi in cerchi, frecce,
                      linee o rettangoli precisi.
                    </p>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Usa la{' '}
                      <strong className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Manina
                      </strong>{' '}
                      per muoverti liberamente sul foglio. Con una stilo, attiva nelle Impostazioni la
                      spunta per spostare il foglio con il dito ed eseguire gli strumenti solo con la
                      penna.
                    </p>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  {/* Minimal PDF & AcroForm preview */}
                  <div
                    aria-hidden="true"
                    className="rounded-2xl bg-[#FBFBFD] dark:bg-[#242428] border border-[#3C3C43]/12 dark:border-white/10 p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                      <span className="font-medium text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Modulo_Iscrizione.pdf
                      </span>
                      <span className="tabular-nums">HiDPI · Pag. 1</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#3C3C43]/12 dark:border-white/10 px-3 py-2 text-left">
                        <div className="text-[10px] text-[#8E8E93]">Campo AcroForm</div>
                        <div className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] mt-0.5">
                          Compilazione diretta
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#3C3C43]/12 dark:border-white/10 px-3 py-2 text-left flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] text-[#8E8E93]">Data modulo</div>
                          <div className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] mt-0.5 tabular-nums">
                            22/11/2026
                          </div>
                        </div>
                        <Calendar className="w-4 h-4 text-[#48484A] dark:text-[#C7C7CC] shrink-0" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2
                      id="onboarding-step-title"
                      className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] [text-wrap:balance]"
                    >
                      Modifica PDF, tabelle e moduli interattivi
                    </h2>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Trascina qualsiasi file PDF nell&apos;app o importalo dalla barra laterale: puoi
                      evidenziare, disegnare con la penna, aggiungere note libere e modificare
                      direttamente il testo originale del documento.
                    </p>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      I moduli compilabili (AcroForm), le caselle di spunta e i campi data con
                      calendario integrato sono riconosciuti in automatico ed esportabili in PDF
                      vettoriale.
                    </p>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  {/* Minimal privacy & export preview */}
                  <div
                    aria-hidden="true"
                    className="rounded-2xl bg-[#FBFBFD] dark:bg-[#242428] border border-[#3C3C43]/12 dark:border-white/10 p-5"
                  >
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="space-y-1.5">
                        <div className="w-10 h-10 mx-auto rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7]">
                          Solo locale
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="w-10 h-10 mx-auto rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]">
                          <FolderSync className="w-4 h-4" />
                        </div>
                        <div className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7]">
                          Cartella &amp; JSON
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="w-10 h-10 mx-auto rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7]">
                          .qaderno / PDF
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2
                      id="onboarding-step-title"
                      className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] [text-wrap:balance]"
                    >
                      Tutto resta sul tuo dispositivo
                    </h2>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Quaderni, disegni e PDF vengono salvati istantaneamente nella memoria locale del
                      browser e funzionano anche offline. Quando vuoi, esportali in formato{' '}
                      <span className="font-mono text-xs text-[#1C1C1E] dark:text-[#F5F5F7]">
                        .qaderno
                      </span>{' '}
                      o PDF oppure sincronizzali con una cartella del tuo computer.
                    </p>
                    <p className="text-[13.5px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
                      Nelle{' '}
                      <strong className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Impostazioni
                      </strong>{' '}
                      puoi personalizzare tema, carta, scorciatoie da tastiera e rivedere questa guida
                      in qualsiasi momento.
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer: clickable progress bars + navigation buttons */}
        <div className="px-5 sm:px-6 pt-3 pb-5 border-t border-[#3C3C43]/10 dark:border-white/10 bg-[#FBFBFD]/70 dark:bg-[#242428]/70 space-y-3.5 shrink-0">
          <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Passaggi della guida">
            {Array.from({ length: TOTAL_STEPS }).map((_, idx) => {
              const active = idx === step;
              return (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Passaggio ${idx + 1} di ${TOTAL_STEPS}`}
                  onClick={() => goTo(idx)}
                  className="py-2 px-0.5 focus-visible:outline-none group"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-200 ${
                      active
                        ? 'w-7 bg-[#1C1C1E] dark:bg-[#F5F5F7]'
                        : 'w-2 bg-[#C7C7CC] dark:bg-[#48484A] group-hover:bg-[#8E8E93]'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2.5">
            {isFirst ? (
              <button
                type="button"
                onClick={onComplete}
                className="min-h-[44px] px-4 rounded-2xl text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
              >
                Salta tour
              </button>
            ) : (
              <button
                type="button"
                onClick={goPrev}
                className="min-h-[44px] px-4 rounded-2xl ios-control-bg text-sm font-medium text-[#1C1C1E] dark:text-[#F5F5F7] inline-flex items-center gap-1.5 transition-opacity hover:opacity-85 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Indietro</span>
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              className="flex-1 sm:flex-initial min-h-[44px] px-5 rounded-2xl bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all whitespace-nowrap"
            >
              <span>
                {isFirst ? 'Inizia il tour' : isLast ? 'Inizia a usare Qaderno' : 'Avanti'}
              </span>
              {isLast ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowRight className="w-4 h-4 shrink-0" />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
