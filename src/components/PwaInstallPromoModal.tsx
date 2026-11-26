import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, MoreVertical, PlusSquare, Share } from 'lucide-react';
import { QadernoLogo } from './QadernoLogo';

export const PWA_PROMO_DISMISSED_SESSION_KEY = 'qaderno_pwa_promo_dismissed_v1';

interface PwaInstallPromoModalProps {
  open: boolean;
  defaultPlatform: 'ios' | 'android';
  isInstallable: boolean;
  onInstall: () => Promise<boolean>;
  onDismiss: () => void;
}

export const PwaInstallPromoModal: React.FC<PwaInstallPromoModalProps> = ({
  open,
  defaultPlatform,
  isInstallable,
  onInstall,
  onDismiss,
}) => {
  const [platformTab, setPlatformTab] = useState<'ios' | 'android'>(defaultPlatform);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (open) {
      setPlatformTab(defaultPlatform);
    }
  }, [open, defaultPlatform]);

  if (!open) return null;

  const handleDirectInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await onInstall();
      if (accepted) {
        onDismiss();
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 no-print"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl p-6 sm:p-8 space-y-5 no-ios-select"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-promo-title"
      >
        {/* Header with Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <QadernoLogo size={58} zoomedTail />
          <h2
            id="pwa-promo-title"
            className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] leading-snug"
          >
            Installa la Web App per un&apos;esperienza ottimale
          </h2>
          <p className="text-[14px] leading-relaxed text-[#48484A] dark:text-[#C7C7CC]">
            Su smartphone e tablet l&apos;interfaccia del browser riduce l&apos;area di scrittura e
            può interferire con i gesti e lo stilo. Aggiungi Qaderno alla schermata Home per usarlo
            a tutto schermo, senza barre del browser e con la massima reattività.
          </p>
        </div>

        {/* Direct Install Button when beforeinstallprompt is available */}
        {isInstallable && (
          <button
            type="button"
            disabled={installing}
            onClick={handleDirectInstall}
            className="w-full min-h-[48px] px-5 rounded-2xl bg-[#1C1C1E] text-white dark:bg-[#F5F5F7] dark:text-[#1C1C1E] text-[15px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>{installing ? 'Installazione…' : 'Installa subito la Web App'}</span>
          </button>
        )}

        {/* iOS-style Segmented Switcher for Platform Instructions */}
        <div className="space-y-3">
          <div
            role="tablist"
            aria-label="Scegli il sistema operativo"
            className="p-1 rounded-2xl bg-neutral-100/90 dark:bg-white/8 flex items-center gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={platformTab === 'ios'}
              onClick={() => setPlatformTab('ios')}
              className={`flex-1 h-9 rounded-xl text-[13px] font-semibold transition-all ${
                platformTab === 'ios'
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-[#F5F5F7] shadow-xs'
                  : 'text-[#636366] dark:text-[#AEAEB2]'
              }`}
            >
              iPhone / iPad
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={platformTab === 'android'}
              onClick={() => setPlatformTab('android')}
              className={`flex-1 h-9 rounded-xl text-[13px] font-semibold transition-all ${
                platformTab === 'android'
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-[#F5F5F7] shadow-xs'
                  : 'text-[#636366] dark:text-[#AEAEB2]'
              }`}
            >
              Android
            </button>
          </div>

          {platformTab === 'ios' ? (
            <div className="rounded-2xl bg-neutral-100/80 dark:bg-white/5 p-4 space-y-3 border border-black/5 dark:border-white/8">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#636366] dark:text-[#AEAEB2]">
                Guida rapida su Safari
              </p>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/8 dark:border-white/10 flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  1
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1C1C1E] dark:text-[#F5F5F7]">
                  Tocca il pulsante{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-[#2C2C2E] border border-black/10 dark:border-white/10 font-semibold text-xs align-middle">
                    <Share className="w-3.5 h-3.5" />
                    Condividi
                  </span>{' '}
                  nella barra di Safari.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/8 dark:border-white/10 flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  2
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1C1C1E] dark:text-[#F5F5F7]">
                  Scorri il menu e tocca{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-[#2C2C2E] border border-black/10 dark:border-white/10 font-semibold text-xs align-middle">
                    <PlusSquare className="w-3.5 h-3.5" />
                    Aggiungi alla schermata Home
                  </span>
                  .
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/8 dark:border-white/10 flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  3
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1C1C1E] dark:text-[#F5F5F7]">
                  Premi <strong>&ldquo;Aggiungi&rdquo;</strong> in alto a destra e apri{' '}
                  <strong>Qaderno</strong> direttamente dalla schermata Home.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-neutral-100/80 dark:bg-white/5 p-4 space-y-3 border border-black/5 dark:border-white/8">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#636366] dark:text-[#AEAEB2]">
                Guida rapida su Chrome
              </p>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/8 dark:border-white/10 flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  1
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1C1C1E] dark:text-[#F5F5F7]">
                  Tocca il menu con i{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-[#2C2C2E] border border-black/10 dark:border-white/10 font-semibold text-xs align-middle">
                    <MoreVertical className="w-3.5 h-3.5" />
                    tre puntini
                  </span>{' '}
                  in alto a destra.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/8 dark:border-white/10 flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  2
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1C1C1E] dark:text-[#F5F5F7]">
                  Seleziona{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-[#2C2C2E] border border-black/10 dark:border-white/10 font-semibold text-xs align-middle">
                    <Download className="w-3.5 h-3.5" />
                    Installa app
                  </span>{' '}
                  oppure <strong>&ldquo;Aggiungi a schermata Home&rdquo;</strong>.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/8 dark:border-white/10 flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  3
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1C1C1E] dark:text-[#F5F5F7]">
                  Conferma <strong>&ldquo;Installa&rdquo;</strong> e avvia <strong>Qaderno</strong>{' '}
                  dalla schermata Home.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Discreet Secondary Continue-in-Browser Action */}
        <div className="pt-1 flex justify-center">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[40px] px-4 py-2 rounded-xl text-[13px] font-medium text-[#636366] dark:text-[#AEAEB2] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/8 transition-colors text-center"
          >
            Continua comunque nel browser (sconsigliato)
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
