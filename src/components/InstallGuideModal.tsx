import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PlusSquare, Share, X } from 'lucide-react';
import { QadernoLogo } from './QadernoLogo';

interface InstallGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ open, onClose }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1C1E]/30 dark:bg-black/55 backdrop-blur-xs p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 440, damping: 32, mass: 0.8 }}
            className="w-full max-w-sm bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-2xl border border-white/60 dark:border-white/10 shadow-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-guide-title"
          >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <QadernoLogo size={36} zoomedTail />
            <div>
              <h2 id="install-guide-title" className="text-base font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                Usa Qaderno a schermo intero
              </h2>
              <p className="text-xs text-[#8E8E93]">iPadOS e iPhone (Safari)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-4 space-y-3 text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full ios-control-bg flex items-center justify-center shrink-0">
              <Share className="w-4 h-4" />
            </div>
            <p className="text-xs leading-relaxed">
              1. Tocca il pulsante <span className="font-semibold">Condividi</span> nella barra di Safari.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full ios-control-bg flex items-center justify-center shrink-0">
              <PlusSquare className="w-4 h-4" />
            </div>
            <p className="text-xs leading-relaxed">
              2. Scorri e seleziona <span className="font-semibold">Aggiungi alla schermata Home</span>.
            </p>
          </div>
        </div>

        <p className="text-xs text-[#8E8E93] leading-relaxed">
          Una volta aggiunta, Qaderno si aprirà come app nativa senza barra degli indirizzi e funzionerà anche offline.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[42px] rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Ho capito
        </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
